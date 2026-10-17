/**
 * RECIBOS DE UN CONTRIBUYENTE — FUENTE ÚNICA (idéntica a Caja).
 * La usan Caja (referencia), Cobro Móvil y Soy Contribuyente (Pagos y Estado de Cuenta)
 * para que los tres muestren exactamente los mismos inmuebles, meses y montos.
 *
 * Reglas (las de Caja):
 *  - Solo inmuebles individuales: se excluyen los Eliminados, las unidades de condominio y los condominios
 *    (esas deudas se cobran por Caja Condominios).
 *  - Los contenedores N/A con actividades (por cant_inmuebles, padre_id o condominio_padre_id) no cobran:
 *    su tarifa es la suma de sus actividades.
 *  - Facturas pendientes (Pendiente / Por Verificar / Abonado) + meses históricos RECIB-HIST-{COD}-M{i}
 *    por inmueble: meses_deuda (o 1 si solo tiene deuda_mmv) menos sus recibos formales (CM-…).
 *  - Un inmueble sin deuda NO genera meses.
 */
import { calcularMensualidad, isResidencialInm, isTerrenoInm, isCondominioPagoIndividual, isMesExoneradoMulta } from './calculos';
import { codigosContenedoresNA, mesesTranscurridos, r2 } from './deudaMensual';

const num = (v: any) => parseFloat(String(v ?? 0).replace(/[^\d.-]/g, '')) || 0;
export const ESTADOS_RECIBO_PENDIENTE = ['Pendiente', 'Por Verificar', 'Abonado'];

export const tieneDeudaInm = (i: any) =>
  num(i?.deuda_mmv) > 0 || num(i?.deuda_congelada_bs) > 0 || (parseInt(String(i?.meses_deuda || 0)) || 0) > 0;

export interface RecibosContribuyente {
  /** Inmuebles que se cobran aquí (sin contenedores N/A, sin condominios, sin eliminados) */
  billables: any[];
  naCodes: string[];
  /** Recibos: facturas pendientes + MULTA- + RECIB-HIST- generados */
  recibos: any[];
  /** Todos sus inmuebles son de condominio → se cobra por Caja Condominios */
  soloCondominio: boolean;
  /** Tiene además inmuebles en condominios (se cobran aparte) */
  tieneCondominio: boolean;
  /** Códigos de inmuebles que pertenecen a condominio */
  condoInmCodes: string[];
}

/**
 * Determina si un inmueble pertenece al régimen de condominio (individual o filial).
 */
export function isCondominioInm(inm: any, allInms: any[] = []): boolean {
  if (!inm) return false;
  if (isCondominioPagoIndividual(inm)) return false;
  if (inm.condominio_padre_id && isCondominioPagoIndividual(inm.condominio_padre_id)) return false;
  if (inm.condominio_padre_id && String(inm.condominio_padre_id).trim() !== '') return true;
  if (inm.es_condominio === true) return true;
  const act = String(inm.actividad_principal || '').toLowerCase();
  if (act.includes('condominio')) return true;
  if (inm.padre_id) {
    if (String(inm.padre_id).startsWith('CONDO-')) return true;
    const parent = allInms.find(p => p.inmueble === inm.padre_id);
    if (parent && (isCondominioPagoIndividual(parent) || (parent.condominio_padre_id && isCondominioPagoIndividual(parent.condominio_padre_id)))) {
      return false;
    }
    if (parent && (parent.condominio_padre_id || parent.es_condominio || String(parent.actividad_principal || '').toLowerCase().includes('condominio'))) {
      return true;
    }
  }
  return false;
}

export function construirRecibosContribuyente(params: {
  inmuebles: any[]; facturas: any[]; identidad: string; contribuyente?: string; hoy?: Date;
}): RecibosContribuyente {
  const hoy = params.hoy || new Date();
  const todos = params.inmuebles || [];
  const naCodes = codigosContenedoresNA(todos);

  const isActivo = (i: any) => {
    const est = (i.estado || 'Activo').trim().toLowerCase();
    return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
  };

  // Inmuebles directos y filiales (activos y no terrenos)
  const activos = todos.filter(i => isActivo(i) && !isTerrenoInm(i));

  // Inmuebles de condominio: cancelan por condominio, se excluyen de la pasarela individual
  const esCondo = (i: any) => isCondominioInm(i, activos);
  const condoInms = activos.filter(esCondo);
  const tieneCondominio = condoInms.length > 0;
  const soloCondominio = activos.length > 0 && activos.every(esCondo);

  // Inmuebles cobrables aquí (excluye contenedores N/A y unidades de condominio)
  const billables = activos.filter(i => !naCodes.includes(i.inmueble) && !esCondo(i));

  const recibos: any[] = (params.facturas || []).filter(f => ESTADOS_RECIBO_PENDIENTE.includes(f.estado));

  // Generar meses históricos y multas para todos los inmuebles facturables con deuda
  if (billables.some(tieneDeudaInm)) {
    billables.forEach(inm => {
      const meses = parseInt(String(inm.meses_deuda || 0)) || 0;
      const formales = recibos.filter(r => String(r.referencia || '').includes(inm.inmueble) &&
        !String(r.referencia).startsWith('RECIB-HIST-') && !String(r.referencia).startsWith('MULTA-')).length;
      const n = Math.max(0, (meses > 0 ? meses : (num(inm.deuda_mmv) > 0 ? 1 : 0)) - formales);
      
      // Si NO tiene meses históricos pendientes pero sí tiene una multa administrativa específica aislada, se emite MULTA-
      if (n === 0) {
        const multa = num(inm.multa_bs), congelada = num(inm.deuda_congelada_bs);
        if (multa > 0 || congelada > 0) {
          const f = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1, 12, 0, 0).toISOString();
          recibos.push({
            id: `multa-${inm.inmueble}`,
            referencia: `MULTA-${inm.inmueble}`,
            inmueble: inm.inmueble,
            identidad: params.identidad,
            contribuyente: params.contribuyente || inm.contribuyente || '',
            emision: f,
            vencimiento: f,
            estado: 'Pendiente',
            monto: (multa + congelada).toFixed(2),
            descripcion: `Multa Municipal (${inm.inmueble})`
          });
        }
      } else {
        // La multa por mora se une a cada mes correspondiente dentro de cada RECIB-HIST-
        for (let i = 1; i <= n; i++) {
          const d = new Date(hoy.getFullYear(), hoy.getMonth() - n + i - 1, 1, 12, 0, 0).toISOString();
          recibos.push({
            id: `dummy-hist-${inm.inmueble}-${i}`,
            referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
            inmueble: inm.inmueble,
            identidad: params.identidad,
            contribuyente: params.contribuyente || inm.contribuyente || '',
            emision: d,
            vencimiento: d,
            estado: 'Pendiente',
            monto: '0'
          });
        }
      }
    });
  }
  recibos.sort((a, b) => {
    const aC = String(a.referencia || '').startsWith('CM-'), bC = String(b.referencia || '').startsWith('CM-');
    if (!aC && bC) return -1; if (aC && !bC) return 1;
    return String(a.emision || '').localeCompare(String(b.emision || ''));
  });

  return { 
    billables, 
    naCodes, 
    recibos, 
    soloCondominio, 
    tieneCondominio,
    condoInmCodes: condoInms.map(i => i.inmueble)
  };
}

/** Desglose de un recibo mensual CM- (igual a Caja: base + IVA + multa si tiene más de 1 mes vencido). */
export function desgloseReciboCM(r: any, billables: any[], tasa: number, hoy: Date = new Date()) {
  const ref = String(r?.referencia || '');
  let ti = billables.filter(i => i.inmueble && ref.includes(i.inmueble));
  if (!ti.length) ti = billables;
  let base = 0, iva = 0, multa = 0, ivaRetenible = 0;
  const emision = r?.emision ? new Date(r.emision) : hoy;
  const md = mesesTranscurridos(emision, hoy);
  ti.forEach(i => {
    const es = isResidencialInm(i);
    const bm = r2(calcularMensualidad(i, tasa));
    const ivaI = es ? 0 : r2(bm * 0.16);
    const mora = md > 1 && !isMesExoneradoMulta(i.notas, emision);
    base += bm; iva += ivaI; multa += mora ? r2(bm * (es ? 0.10 : 0.12)) : 0;
    if (!es && i.agente_retencion === true) ivaRetenible += ivaI;
  });
  return { base: r2(base), iva: r2(iva), multa: r2(multa), total: r2(base + iva + multa), ivaRetenible: r2(ivaRetenible) };
}
