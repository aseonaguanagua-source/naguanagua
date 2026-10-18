import { calcularMensualidad, isResidencialInm, isTerrenoInm, isMesExoneradoMulta, isCondominioPagoIndividual } from './calculos';

/**
 * CÁLCULO ÚNICO DE DEUDA MENSUAL (referencia: Caja).
 * Lo usan Caja, Cobro Móvil, Portal (Soy Contribuyente: estado de cuenta y pagos) y Estado de Cuenta admin,
 * para que un mismo contribuyente vea exactamente el mismo monto en todos los módulos.
 *
 *  - Mensualidad (bMes) = calcularMensualidad(inmueble, tasa)  → tarifa guardada en el inmueble.
 *  - Base   = round2(bMes × meses)
 *  - IVA    = round2(bMes × 16% × meses)            (solo comercial; residencial exento)
 *  - Multa  = round2(bMes × 10%|12% × mesesConMora)  (10% residencial, 12% comercial)
 *  - Un mes tiene mora si: NO es el último mes adeudado, tiene más de 1 mes de vencido
 *    y no está exonerado ([EXONERADO:YYYY-MM] o exoneración total en notas).
 *  - Agentes de retención: se retiene el 75% del IVA (solo comerciales con agente_retencion).
 */

export const r2 = (n: number) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
export const r4 = (n: number) => Math.round(((Number(n) || 0) + Number.EPSILON) * 10000) / 10000;

export const PORCENTAJE_RETENCION_AGENTE = 0.75;

export const mesesTranscurridos = (emision: string | Date, hoy: Date = new Date()): number => {
  const e = emision instanceof Date ? emision : new Date(emision);
  if (isNaN(e.getTime())) return 0;
  return (hoy.getFullYear() - e.getFullYear()) * 12 + (hoy.getMonth() - e.getMonth());
};

/** ¿El mes genera multa por mora? (misma regla de Caja) */
export const tieneMoraMes = (inm: any, emision: string | Date, esUltimoMes: boolean, hoy: Date = new Date()): boolean => {
  if (isTerrenoInm(inm)) return false;
  if (esUltimoMes) return false;
  if (mesesTranscurridos(emision, hoy) <= 1) return false;
  const e = emision instanceof Date ? emision : new Date(emision);
  return !isMesExoneradoMulta(inm?.notas, e);
};

export interface MesDeuda {
  emision: string | Date;
  esUltimo: boolean;
}

export interface DesgloseMes {
  base: number;
  iva: number;
  multa: number;
  total: number;
  base4?: number;
  iva4?: number;
  multa4?: number;
}

export interface DeudaInmueble {
  esResidencial: boolean;
  mensualidad: number;
  base: number;
  iva: number;
  multa: number;
  total: number;
  mesesConMora: number;
  /** IVA sujeto a retención (comercial con agente_retencion, precisión 4 decimales) */
  ivaRetenible: number;
  /** Desglose por mes; la suma cuadra exactamente con los totales (el redondeo se ajusta en el último mes) */
  porMes: DesgloseMes[];
}

export function calcularDeudaInmueble(inm: any, tasa: number, meses: MesDeuda[], hoy: Date = new Date()): DeudaInmueble {
  if (isTerrenoInm(inm)) {
    return {
      esResidencial: false,
      mensualidad: 0,
      base: 0,
      iva: 0,
      multa: 0,
      total: 0,
      mesesConMora: 0,
      ivaRetenible: 0,
      porMes: meses.map(m => ({
        base: 0,
        iva: 0,
        multa: 0,
        total: 0,
        periodo: typeof m.emision === 'string' ? m.emision.slice(0, 7) : '',
        tieneMora: false,
        esUltimo: m.esUltimo
      }))
    };
  }

  const esRes = isResidencialInm(inm);
  let jNotas: any = null;
  try { if (inm?.notas) jNotas = typeof inm.notas === 'string' ? JSON.parse(inm.notas) : inm.notas; } catch {}

  const bMesDefault = calcularMensualidad(inm, tasa);
  const tasaMora = esRes ? 0.10 : 0.12;
  const flags = meses.map(m => tieneMoraMes(inm, m.emision, m.esUltimo, hoy));
  const n = meses.length;
  const nMora = flags.filter(Boolean).length;

  const porMes: DesgloseMes[] = meses.map((m, i) => {
    let bMes = bMesDefault;
    const perStr = m.emision ? (typeof m.emision === 'string' ? m.emision.slice(0, 7) : (m.emision.toISOString ? m.emision.toISOString().slice(0, 7) : '')) : '';
    let tieneMoraMesActual = flags[i];
    const custom = jNotas?.periodos_custom?.[perStr];
    if (custom) {
      const mmv = custom.tarifa_mmv !== null && custom.tarifa_mmv !== undefined ? Number(custom.tarifa_mmv) : (jNotas.tarifa_activa_mmv || 3.77);
      bMes = mmv * 57 * tasa * (esRes ? 1 : 0.128);
      if (custom.lleva_multa === false) {
        tieneMoraMesActual = false;
      }
    } else if (jNotas?.desocupada_desde) {
      const esDesoc = perStr >= jNotas.desocupada_desde && (!jNotas.desocupada_hasta || perStr <= jNotas.desocupada_hasta);
      if (esDesoc) {
        bMes = (jNotas.tarifa_desocupada_mmv || 1.98) * 57 * tasa * 0.128;
      } else if (jNotas.tarifa_activa_mmv) {
        bMes = jNotas.tarifa_activa_mmv * 57 * tasa * 0.128;
      }
    }
    const base4 = r4(bMes);
    const iva4 = esRes ? 0 : r4(bMes * 0.16);
    const multa4 = tieneMoraMesActual ? r4(bMes * tasaMora) : 0;
    return {
      base: r2(base4),
      iva: r2(iva4),
      multa: r2(multa4),
      total: r2(base4 + iva4 + multa4),
      base4,
      iva4,
      multa4,
    };
  });

  const base4Total = porMes.reduce((s, p) => s + (p.base4 ?? p.base), 0);
  const iva4Total = porMes.reduce((s, p) => s + (p.iva4 ?? p.iva), 0);
  const multa4Total = porMes.reduce((s, p) => s + (p.multa4 ?? p.multa), 0);

  const base = r2(base4Total);
  const iva = r2(iva4Total);
  const multa = r2(multa4Total);

  return {
    esResidencial: esRes,
    mensualidad: n > 0 ? r2(base / n) : r2(bMesDefault),
    base,
    iva,
    multa,
    total: r2(base + iva + multa),
    mesesConMora: nMora,
    ivaRetenible: !esRes && inm?.agente_retencion === true ? r4(iva4Total) : 0,
    porMes,
  };
}

/**
 * Desglose por mes con la retención de IVA del agente de retención (75%) ya descontada.
 * La retención total = round2(IVA_4_decimales × 75%) igual que Caja; el redondeo se ajusta en el último mes.
 */
export function porMesConRetencion(d: DeudaInmueble): (DesgloseMes & { retencion: number; ivaNeto: number; totalNeto: number })[] {
  const totalRet = d.ivaRetenible > 0 ? r2(d.ivaRetenible * PORCENTAJE_RETENCION_AGENTE) : 0;
  const out = d.porMes.map(p => {
    const pIva = (p as any).iva4 ?? p.iva;
    const retencion = totalRet > 0 ? r2(pIva * PORCENTAJE_RETENCION_AGENTE) : 0;
    return { ...p, retencion, ivaNeto: 0, totalNeto: 0 };
  });
  if (out.length > 0 && totalRet > 0) {
    const last = out[out.length - 1];
    last.retencion = r2(last.retencion + (totalRet - out.reduce((s, p) => s + p.retencion, 0)));
  }
  out.forEach(p => { p.ivaNeto = r2(p.iva - p.retencion); p.totalNeto = r2(p.base + p.multa + p.ivaNeto); });
  return out;
}

/**
 * Meses adeudados de un inmueble con la MISMA fecha de emisión que genera Caja
 * (RECIB-HIST-{COD}-M{i}: el mes i de los últimos `meses_deuda` meses).
 */
export function mesesHistoricos(inm: any, hoy: Date = new Date()): { ref: string; emision: string; mes: number; esUltimo: boolean }[] {
  const numMeses = Math.max(1, parseInt(String(inm?.meses_deuda || 0)) || 0);
  const out = [];
  for (let i = 1; i <= numMeses; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - numMeses + i - 1, 1, 12, 0, 0);
    out.push({ ref: `RECIB-HIST-${inm.inmueble}-M${i}`, emision: d.toISOString(), mes: i, esUltimo: i >= numMeses });
  }
  return out;
}

/** ¿Es último mes? para una referencia RECIB-HIST-{COD}-M{n} */
export function esUltimoMesHist(ref: string, inm: any, totalRecibosInm?: number): boolean {
  const parts = String(ref || '').split('-');
  const mNum = parseInt(parts[parts.length - 1]?.replace('M', '') || '0');
  const total = Math.max(1, totalRecibosInm || parseInt(String(inm?.meses_deuda || '1')) || 1);
  return mNum > 0 ? mNum >= total : false;
}

/** Contenedores "N/A" que solo agrupan actividades (no se cobran ellos mismos; son padres y su total es la suma de los hijos). */
export function codigosContenedoresNA(inms: any[]): string[] {
  return (inms || [])
    .filter((i: any) => {
      const act = String(i.actividad_principal || i.actividad || '').trim().toUpperCase();
      const esNA = act === 'N/A' || act.startsWith('PADRE') || i.es_grupo === true;
      const tieneHijos = (parseInt(String(i.cant_inmuebles || '0')) > 1) || 
        (inms || []).some((c: any) => c.condominio_padre_id === i.inmueble || c.padre_id === i.inmueble || c.padre_unidad_id === i.id);
      return esNA || tieneHijos;
    })
    .map((i: any) => i.inmueble);
}

const sinPrefijo = (s: string) => String(s || '').replace(/^[VEJPG]-?/i, '').trim().toUpperCase();

/**
 * Regla de cobro por inmueble (idéntica a Caja):
 *  - 'solo_multa': local comercial hijo de un condominio comercial ORDINARIO con distintos propietarios
 *    (el aseo lo paga el condominio padre; el local solo paga sus multas).
 *  - 'completo': todo lo demás, incluidos los CONDOMINIOS ESPECIALES de pago individual
 *    (URB014903, URB030783, URB029866, URB015503), hijos de contenedores N/A,
 *    locales del mismo contribuyente que el padre y residenciales.
 */
export function reglaCobroInmueble(inm: any, naParentCodes: string[], identidadUsuario: string): 'completo' | 'solo_multa' {
  if (!inm?.condominio_padre_id) return 'completo';
  if (isResidencialInm(inm)) return 'completo';
  if (isCondominioPagoIndividual(inm)) return 'completo';
  if (inm.padre_id && naParentCodes.includes(inm.padre_id)) return 'completo';
  if (naParentCodes.includes(inm.condominio_padre_id)) return 'completo';
  if (sinPrefijo(inm.identidad) && sinPrefijo(inm.identidad) === sinPrefijo(identidadUsuario)) return 'completo';
  return 'solo_multa';
}

/**
 * Deuda total de un contribuyente (todos sus inmuebles) igual que la muestra Caja:
 * meses históricos con la fórmula única, regla de condominios y retención 75% para agentes.
 */
export function deudaTotalContribuyente(inms: any[], tasa: number, identidad: string, hoy: Date = new Date()) {
  const isActivo = (i: any) => {
    const est = (i.estado || 'Activo').trim().toLowerCase();
    return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
  };
  const na = codigosContenedoresNA(inms);
  let base = 0, iva = 0, multa = 0, retencion = 0;
  for (const inm of inms.filter(i => !na.includes(i.inmueble) && isActivo(i))) {
    if (isTerrenoInm(inm)) continue;
    const mesesDeuda = parseInt(String(inm.meses_deuda || 0)) || 0;
    const multaFija = (parseFloat(String(inm.multa_bs || 0)) || 0) + (parseFloat(String(inm.deuda_congelada_bs || 0)) || 0);
    const regla = reglaCobroInmueble(inm, na, identidad);
    if (regla === 'solo_multa' || isCondominioPagoIndividual(inm)) multa += multaFija;
    if (regla === 'solo_multa' || mesesDeuda <= 0) continue;
    const d = calcularDeudaInmueble(inm, tasa, mesesHistoricos(inm, hoy), hoy);
    base += d.base; iva += d.iva; multa += d.multa;
    if (d.ivaRetenible > 0) retencion += r2(d.ivaRetenible * PORCENTAJE_RETENCION_AGENTE);
  }
  base = r2(base); iva = r2(iva); multa = r2(multa); retencion = r2(retencion);
  return { base, iva, multa, retencion, total: r2(base + iva + multa), totalNeto: r2(base + iva + multa - retencion) };
}
