import { calcularDeudaInmueble, r2, PORCENTAJE_RETENCION_AGENTE } from './deudaMensual';
import { extraerCodigoInmueble, parseDetalles } from './documentoPago';
import { isResidencialInm } from './calculos';

/**
 * Desglose de un pago de Caja por período: base, IVA y multa de cada mes pagado, y multas sueltas (MULTA-*).
 * Se reconstruye con la deuda que el contribuyente tenía AL PAGAR (detalles.deuda_previa) y la tasa del pago,
 * usando la misma fórmula única de Caja (calcularDeudaInmueble).
 */

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const etiqueta = (d: Date) => `${MESES[d.getMonth()]} ${d.getFullYear()}`;

export interface LineaDesglose {
  codigo: string;
  /** "SEPTIEMBRE 2026" o "MULTA POR MORA" */
  periodo: string;
  tipo: 'mes' | 'multa' | 'otro';
  esResidencial: boolean;
  base: number;
  iva: number;
  multa: number;
  retencion: number;
  total: number;
}

export interface DesglosePago {
  lineas: LineaDesglose[];
  /** "DESDE AGOSTO 2026 HASTA SEPTIEMBRE 2026 (2 MESES)" */
  periodoTexto?: string;
  /** La suma del desglose coincide con el monto pagado (tolerancia de redondeo) */
  cuadra: boolean;
  totalCalculado: number;
  esAbono: boolean;
}

/** Fecha del pago en hora de Venezuela (mediodía, para evitar saltos de mes por zona horaria). */
function fechaPagoVE(pago: any, det: any): Date {
  const iso = String(det?.fecha_transaccion || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  const t = new Date(new Date(pago.created_at).getTime() - 4 * 3600 * 1000);
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12, 0, 0);
}

/**
 * @param inmMap inmuebles por código (necesita: inmueble, tipo, clasificacion, actividad_principal, mmv_mes,
 *               cant_inmuebles, notas, agente_retencion, meses_deuda, multa_bs, deuda_congelada_bs)
 */
export function desglosarPago(pago: any, inmMap: Map<string, any>): DesglosePago {
  const det = parseDetalles(pago.detalles);
  const refs: string[] = Array.isArray(det.recibos) ? det.recibos : [];
  const montos: Record<string, any> = det.montos && typeof det.montos === 'object' ? det.montos : {};
  const tasa = parseFloat(String(det.tasa_bcv_aplicada || det.tasa_bcv || 0)) || 0;
  const monto = r2(parseFloat(String(pago.monto || 0)));
  const hoy = fechaPagoVE(pago, det);
  const esAbono = !!det.es_abono;

  const previa = new Map<string, any>();
  (Array.isArray(det.deuda_previa) ? det.deuda_previa : []).forEach((d: any) => { if (d?.inmueble) previa.set(String(d.inmueble), d); });

  const lineas: LineaDesglose[] = [];
  const fechasMeses: Date[] = [];

  // Agrupar referencias por inmueble
  const porCodigo = new Map<string, string[]>();
  for (const ref of refs) {
    const cod = extraerCodigoInmueble(ref) || '__';
    if (!porCodigo.has(cod)) porCodigo.set(cod, []);
    porCodigo.get(cod)!.push(ref);
  }

  for (const [codigo, refsCod] of porCodigo) {
    const inmActual = inmMap.get(codigo);
    const prev = previa.get(codigo);
    const inm = { ...(inmActual || {}), ...(prev ? { meses_deuda: prev.meses_deuda, multa_bs: prev.multa_bs, deuda_congelada_bs: prev.deuda_congelada_bs } : {}) };
    const esRes = inmActual ? isResidencialInm(inmActual) : true;
    const retiene = !esRes && inmActual?.agente_retencion === true;

    // Multas sueltas (locales de condominio / condominios especiales)
    for (const ref of refsCod.filter(r => /^MULTA-/i.test(r))) {
      const m = r2(parseFloat(String(montos[ref] ?? 0)) || ((parseFloat(String(inm.multa_bs || 0)) || 0) + (parseFloat(String(inm.deuda_congelada_bs || 0)) || 0)));
      if (m > 0) lineas.push({ codigo, periodo: 'MULTA POR MORA', tipo: 'multa', esResidencial: esRes, base: 0, iva: 0, multa: m, retencion: 0, total: m });
    }

    // Meses históricos RECIB-HIST-{COD}-M{i}
    const hist = refsCod
      .map(r => ({ r, n: parseInt(r.match(/^RECIB-HIST-.+-M(\d+)$/i)?.[1] || '0') }))
      .filter(x => x.n > 0)
      .sort((a, b) => a.n - b.n);
    if (hist.length > 0 && inmActual && tasa > 0) {
      // Meses que debía al pagar: snapshot; si no hay (pagos viejos), deuda actual + meses pagados (o abonados)
      let total = parseInt(String(prev?.meses_deuda ?? '')) || 0;
      if (!total) total = Math.max(hist[hist.length - 1].n, (parseInt(String(inmActual.meses_deuda || 0)) || 0) + (esAbono ? 0 : hist.length));
      const sel = esAbono ? [] : hist.filter(x => x.n <= total);
      const meses = sel.map(x => ({
        emision: new Date(hoy.getFullYear(), hoy.getMonth() - total + x.n - 1, 1, 12, 0, 0),
        esUltimo: x.n >= total,
      }));
      if (meses.length > 0) {
        const d = calcularDeudaInmueble(inm, tasa, meses, hoy);
        d.porMes.forEach((p, i) => {
          const f = meses[i].emision as Date;
          fechasMeses.push(f);
          const ret = retiene ? r2(p.iva * PORCENTAJE_RETENCION_AGENTE) : 0;
          lineas.push({ codigo, periodo: etiqueta(f), tipo: 'mes', esResidencial: esRes, base: p.base, iva: p.iva, multa: p.multa, retencion: ret, total: r2(p.total - ret) });
        });
      } else if (esAbono) {
        // Abono: los meses cubiertos dependen del monto; se listan los meses adeudados en el período
        hist.slice(0, total).forEach(x => fechasMeses.push(new Date(hoy.getFullYear(), hoy.getMonth() - total + x.n - 1, 1, 12, 0, 0)));
      }
    }

    // Otras referencias (facturas formales CM-, E-, etc.) con monto guardado
    for (const ref of refsCod.filter(r => !/^MULTA-|^RECIB-HIST-/i.test(r))) {
      const m = r2(parseFloat(String(montos[ref] ?? 0)));
      if (m > 0) lineas.push({ codigo, periodo: ref, tipo: 'otro', esResidencial: esRes, base: m, iva: 0, multa: 0, retencion: 0, total: m });
    }
  }

  const totalCalculado = r2(lineas.reduce((s, l) => s + l.total, 0));
  // Tolerancia: diferencias de redondeo/tasa (≤ 1% o Bs 1)
  const tol = Math.max(1, monto * 0.01);
  const cuadra = !esAbono && lineas.length > 0 && Math.abs(totalCalculado - monto) <= tol;
  if (cuadra && totalCalculado !== monto) {
    // Ajustar el redondeo en la última línea para que el recibo sume exactamente lo pagado
    const last = lineas[lineas.length - 1];
    const diff = r2(monto - totalCalculado);
    last.base = r2(last.base + diff);
    last.total = r2(last.total + diff);
  }

  const orden = [...fechasMeses].sort((a, b) => a.getTime() - b.getTime());
  const periodoTexto = orden.length === 0 ? undefined
    : orden.length === 1 ? etiqueta(orden[0])
    : `DESDE ${etiqueta(orden[0])} HASTA ${etiqueta(orden[orden.length - 1])} (${orden.length} MESES)`;

  return { lineas, periodoTexto, cuadra, totalCalculado, esAbono };
}

/** Columnas de inmueble necesarias para desglosarPago. */
export const COLS_INMUEBLE_DESGLOSE =
  'inmueble, contribuyente, direccion, tipo, clasificacion, actividad_principal, mmv_mes, cant_inmuebles, notas, agente_retencion, meses_deuda, multa_bs, deuda_congelada_bs, correo_electronico, identidad, condominio_padre_id';
