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
}

export function construirRecibosContribuyente(params: {
  inmuebles: any[]; facturas: any[]; identidad: string; contribuyente?: string; hoy?: Date;
}): RecibosContribuyente {
  const hoy = params.hoy || new Date();
  const todos = params.inmuebles || [];
  const naCodes = codigosContenedoresNA(todos);

  // Inmuebles directos (no condominios, no filiales, activos y no terrenos)
  const activos = todos.filter(i => {
    const est = (i.estado || 'Activo').trim().toLowerCase();
    if (est === 'eliminado' || est === 'inactivo') return false;
    if (isTerrenoInm(i)) return false;
    if (i.condominio_padre_id || i.es_condominio) return false;
    return true;
  });

  // Inmuebles pertenecientes a condominios (activos y no terrenos)
  const condoInms = todos.filter(i => {
    const est = (i.estado || 'Activo').trim().toLowerCase();
    if (est === 'eliminado' || est === 'inactivo') return false;
    if (isTerrenoInm(i)) return false;
    return (i.condominio_padre_id || i.es_condominio);
  });

  const tieneCondominio = condoInms.length > 0;
  const soloCondominio = activos.length === 0 && tieneCondominio;
  const billables = activos.filter(i => !naCodes.includes(i.inmueble));

  const recibos: any[] = (params.facturas || []).filter(f => ESTADOS_RECIBO_PENDIENTE.includes(f.estado));

  // 1. REGLA DE CONDOMINIOS: Ninguna información de meses de condominios sale por sistema
  // (el aseo mensual lo gestiona y paga la oficina/administración del condominio).
  // Los usuarios de condominios SOLO pueden ver y cancelar las multas de ese inmueble.
  // Y si tiene varios meses de multa, DEBEN SALIR POR MES SEPARADAS, NO TODAS JUNTAS.
  // Los contenedores N/A (padres de actividades) no cobran multa aquí.
  const condoConMulta: any[] = [];
  condoInms.filter(i => !naCodes.includes(i.inmueble)).forEach(inm => {
    const multa = num(inm.multa_bs), congelada = num(inm.deuda_congelada_bs);
    const totalMulta = multa + congelada;
    if (totalMulta > 0) {
      condoConMulta.push(inm);
      const mesesMulta = parseInt(String(inm.meses_deuda || 0)) || 1;
      const n = Math.max(1, mesesMulta);

      if (n === 1) {
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
          monto: totalMulta.toFixed(2),
          descripcion: `Multa Municipal (${inm.inmueble})`
        });
      } else {
        // Distribuir el total de la multa mes a mes de forma exacta
        const montoBasePorMes = Math.floor((totalMulta / n) * 100) / 100;
        let acumulado = 0;
        for (let i = 1; i <= n; i++) {
          const d = new Date(hoy.getFullYear(), hoy.getMonth() - n + i - 1, 1, 12, 0, 0).toISOString();
          const montoMes = (i === n) ? (totalMulta - acumulado) : montoBasePorMes;
          acumulado += montoMes;
          recibos.push({
            id: `multa-${inm.inmueble}-${i}`,
            referencia: `MULTA-${inm.inmueble}-M${i}`,
            inmueble: inm.inmueble,
            identidad: params.identidad,
            contribuyente: params.contribuyente || inm.contribuyente || '',
            emision: d,
            vencimiento: d,
            estado: 'Pendiente',
            monto: Math.max(0, montoMes).toFixed(2),
            descripcion: `Multa Municipal (${inm.inmueble}) - Período ${i} de ${n}`
          });
        }
      }
    }
  });

  // 2. INMUEBLES DIRECTOS (No condominio): La multa va unida con cada mes correspondiente.
  // Si tiene más locales o residencia fuera del condominio, los meses y sus multas se cancelan normalmente.
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

  // Solo se bloquea si TODOS sus inmuebles son de condominio Y NO tienen multas pendientes por pagar.
  // Si tiene locales o residencias fuera del condominio, o si su condominio tiene multas, SÍ puede cancelar.
  const soloCondominioSinMulta = soloCondominio && condoConMulta.length === 0;

  return { 
    billables: [...billables, ...condoConMulta], 
    naCodes, 
    recibos, 
    soloCondominio: soloCondominioSinMulta, 
    tieneCondominio 
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
