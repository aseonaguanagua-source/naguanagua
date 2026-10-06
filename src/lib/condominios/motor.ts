/**
 * MOTOR ÚNICO DE CONDOMINIOS — el único lugar con las reglas de cobro de condominios.
 * Funciones puras (sin base de datos) para que Caja, ficha, estados de cuenta, portal y reportes
 * calculen EXACTAMENTE lo mismo.
 *
 * Reglas aprobadas por el municipio (06/10/2026):
 *  - Se cobra la CANTIDAD DECLARADA de unidades del condominio.
 *  - Unidades desocupadas: tarifa de "inmuebles y locales desocupados" (1,98 MMV).
 *  - Deuda recalculada con la tarifa vigente.
 *  - Modalidad INDIVIDUAL (Centro Cristal, Chirikayen, Hospital Metropolitano, Centro Científico):
 *    cada unidad paga su aseo y su multa; el condominio no genera cargo propio.
 *  - Multa por mora: 10% residencial / 12% comercial, sobre todos los meses menos el último.
 *  - IVA 16% solo comercial; retención del 75% del IVA solo para agentes de retención.
 */
import { calcularMensualidad, isResidencialInm } from '@/lib/calculos';

export type Modalidad = 'CENTRALIZADO' | 'MIXTO_COMERCIAL' | 'INDIVIDUAL' | 'TARIFA_FIJA';
export type TipoCondominio = 'RESIDENCIAL' | 'COMERCIAL' | 'MIXTO';
export type EstadoUnidad = 'Activa' | 'Desocupada' | 'Eliminada';

export interface Condominio {
  codigo: string;
  tipo: TipoCondominio;
  modalidad: Modalidad;
  cant_declarada: number;
  actividad?: string | null;
  tarifa_mmv?: number | null;
  tarifa_fija_bs?: number | null;
  agente_retencion?: boolean;
  /** Puede cancelar sus inmuebles por separado (escoger unidades) */
  permite_pago_por_unidad?: boolean;
  /** Acepta abonos (pagos parciales) */
  permite_abonos?: boolean;
  /** Paga la suma de la tarifa propia de cada unidad (en vez de declarada × tarifa del condominio) */
  cobro_tarifa_por_unidad?: boolean;
}

export interface Unidad {
  id?: string;
  inmueble?: string | null;
  identidad?: string | null;
  actividad?: string | null;
  tarifa_mmv?: number | null;
  estado: EstadoUnidad;
  tipo?: string | null;
}

export const FO_DESOCUPADO = 1.98;
export const FAC_COMERCIAL = 0.128;
export const TASA_MULTA_RES = 0.10;
export const TASA_MULTA_COM = 0.12;
export const IVA = 0.16;
export const RETENCION_IVA = 0.75;
export const CONDOMINIOS_PAGO_INDIVIDUAL = ['URB014903', 'URB030783', 'URB029866', 'URB015503'];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const esResidencial = (c: Pick<Condominio, 'tipo'>) => c.tipo === 'RESIDENCIAL';

/** Mensualidad de UNA unidad con la tarifa del condominio (o de la unidad si la tiene). */
export function tarifaUnidadBs(c: Condominio, tasa: number, u?: Unidad): number {
  return calcularMensualidad({
    tipo: u?.tipo || c.tipo,
    actividad_principal: u?.actividad || c.actividad || '',
    mmv_mes: u?.tarifa_mmv ?? c.tarifa_mmv ?? undefined,
    cant_inmuebles: 1,
  }, tasa);
}

/** Mensualidad de una unidad desocupada (1,98 MMV con FAC comercial). */
export const tarifaDesocupadaBs = (tasa: number) => FO_DESOCUPADO * 57 * tasa * FAC_COMERCIAL;

export interface CargoMensual {
  /** Lo que paga el CONDOMINIO por mes (0 en modalidad INDIVIDUAL) */
  condominioBs: number;
  unidadesCobradas: number;
  unidadesDesocupadas: number;
  tarifaUnidadBs: number;
  tarifaDesocupadaBs: number;
  detalle: string;
}

/** Cargo mensual del condominio según su modalidad. */
export function cargoMensual(c: Condominio, unidades: Unidad[], tasa: number): CargoMensual {
  const declarada = Math.max(1, Math.floor(c.cant_declarada || 1));
  const desoc = Math.min(unidades.filter(u => u.estado === 'Desocupada').length, declarada);
  const tUnit = tarifaUnidadBs(c, tasa);
  const tDesoc = tarifaDesocupadaBs(tasa);

  if (c.modalidad === 'INDIVIDUAL') {
    return { condominioBs: 0, unidadesCobradas: 0, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
      detalle: 'Pago individual: cada unidad paga su aseo y su multa' };
  }
  if (c.modalidad === 'TARIFA_FIJA' && (c.tarifa_fija_bs || 0) > 0) {
    return { condominioBs: r2(c.tarifa_fija_bs!), unidadesCobradas: declarada, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
      detalle: 'Tarifa fija acordada' };
  }
  if (c.cobro_tarifa_por_unidad) {
    const reparto = cargosPorUnidad(c, unidades, tasa);
    const total = reparto.reduce((s, r) => s + r.montoBs, 0);
    return { condominioBs: r2(total), unidadesCobradas: reparto.length, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
      detalle: 'Suma de la tarifa propia de cada unidad' };
  }
  const ocupadas = declarada - desoc;
  const total = tUnit * ocupadas + tDesoc * desoc;
  return {
    condominioBs: r2(total), unidadesCobradas: declarada, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
    detalle: `${ocupadas} unidad(es) × Bs ${r2(tUnit)}${desoc ? ` + ${desoc} desocupada(s) × Bs ${r2(tDesoc)}` : ''}`,
  };
}

/** Clave del grupo de unidades declaradas que no están registradas una por una */
export const SIN_REGISTRAR = '__SIN_REGISTRAR__';

export interface CargoUnidad {
  /** id de la unidad, o SIN_REGISTRAR para las declaradas que no están cargadas, o '__CONDOMINIO__' (tarifa fija) */
  clave: string;
  inmueble?: string | null;
  cantidad: number;
  montoBs: number;
}

/**
 * Reparte el cargo mensual del condominio entre sus unidades. La deuda se lleva POR UNIDAD:
 * así se puede pagar el condominio completo, solo algunas unidades, o abonar.
 * La suma de los cargos = cargoMensual().condominioBs (salvo INDIVIDUAL, donde cada unidad paga lo suyo).
 */
export function cargosPorUnidad(c: Condominio, unidades: Unidad[], tasa: number): CargoUnidad[] {
  const vivas = unidades.filter(u => u.estado !== 'Eliminada');
  const declarada = Math.max(1, Math.floor(c.cant_declarada || 1));
  const tUnit = tarifaUnidadBs(c, tasa);
  const tDesoc = tarifaDesocupadaBs(tasa);
  const clave = (u: Unidad, i: number) => u.id || u.inmueble || `U${i}`;

  if (c.modalidad === 'TARIFA_FIJA' && (c.tarifa_fija_bs || 0) > 0) {
    return [{ clave: '__CONDOMINIO__', cantidad: declarada, montoBs: r2(c.tarifa_fija_bs!) }];
  }
  if (c.modalidad === 'INDIVIDUAL' || c.cobro_tarifa_por_unidad) {
    const propios = vivas.map((u, i) => ({
      clave: clave(u, i), inmueble: u.inmueble, cantidad: 1,
      montoBs: r2(u.estado === 'Desocupada' ? tDesoc : tarifaUnidadBs(c, tasa, u)),
    }));
    const faltan = Math.max(0, declarada - vivas.length);
    if (faltan > 0) propios.push({ clave: SIN_REGISTRAR, inmueble: null, cantidad: faltan, montoBs: r2(tUnit * faltan) });
    return propios;
  }

  // CENTRALIZADO / MIXTO_COMERCIAL: tarifa del condominio por unidad, se cobra la DECLARADA
  if (vivas.length >= declarada) {
    // Más (o igual) registradas que declaradas: el total sigue siendo la declarada, repartido entre las registradas
    const total = cargoMensual(c, vivas, tasa).condominioBs;
    const cuota = total / vivas.length;
    const out = vivas.map((u, i) => ({ clave: clave(u, i), inmueble: u.inmueble, cantidad: 1, montoBs: r2(cuota) }));
    const dif = r2(total - out.reduce((s, o) => s + o.montoBs, 0));
    if (out.length && dif !== 0) out[out.length - 1].montoBs = r2(out[out.length - 1].montoBs + dif); // cuadre de céntimos
    return out;
  }
  const out: CargoUnidad[] = vivas.map((u, i) => ({
    clave: clave(u, i), inmueble: u.inmueble, cantidad: 1, montoBs: r2(u.estado === 'Desocupada' ? tDesoc : tUnit),
  }));
  out.push({ clave: SIN_REGISTRAR, inmueble: null, cantidad: declarada - vivas.length, montoBs: r2(tUnit * (declarada - vivas.length)) });
  // Cuadre de céntimos: la suma por unidad debe ser exactamente el cargo del condominio
  const total = cargoMensual(c, vivas, tasa).condominioBs;
  const dif = r2(total - out.reduce((s, o) => s + o.montoBs, 0));
  if (dif !== 0) out[out.length - 1].montoBs = r2(out[out.length - 1].montoBs + dif);
  return out;
}

/** Cargo mensual de UNA unidad (solo modalidad INDIVIDUAL; en las demás la unidad no paga aseo propio). */
export function cargoMensualUnidad(c: Condominio, u: Unidad, tasa: number): number {
  if (c.modalidad !== 'INDIVIDUAL' || u.estado === 'Eliminada') return 0;
  return r2(u.estado === 'Desocupada' ? tarifaDesocupadaBs(tasa) : tarifaUnidadBs(c, tasa, u));
}

export interface DeudaPeriodos {
  meses: number;
  mensualBs: number;
  baseBs: number;
  multaBs: number;
  ivaBs: number;
  retencionBs: number;
  totalBs: number;
  /** Desglose por mes (del más viejo al más reciente) */
  porMes: { n: number; baseBs: number; multaBs: number; ivaBs: number; retencionBs: number; totalBs: number }[];
}

/**
 * Deuda de N meses con la mensualidad dada. El último mes (el más reciente) no lleva multa.
 * Mismo criterio que Caja: multa = mensual × tasa × (meses − 1).
 */
export function deudaPorMeses(meses: number, mensualBs: number, residencial: boolean, agenteRetencion = false): DeudaPeriodos {
  const n = Math.max(0, Math.floor(meses));
  const tMulta = residencial ? TASA_MULTA_RES : TASA_MULTA_COM;
  const porMes = Array.from({ length: n }, (_, i) => {
    const base = r2(mensualBs);
    const multa = i < n - 1 ? r2(mensualBs * tMulta) : 0;
    const iva = residencial ? 0 : r2(mensualBs * IVA);
    const ret = agenteRetencion && !residencial ? r2(iva * RETENCION_IVA) : 0;
    return { n: i + 1, baseBs: base, multaBs: multa, ivaBs: iva, retencionBs: ret, totalBs: r2(base + multa + iva - ret) };
  });
  const sum = (k: 'baseBs' | 'multaBs' | 'ivaBs' | 'retencionBs' | 'totalBs') => r2(porMes.reduce((s, m) => s + m[k], 0));
  return { meses: n, mensualBs: r2(mensualBs), baseBs: sum('baseBs'), multaBs: sum('multaBs'), ivaBs: sum('ivaBs'), retencionBs: sum('retencionBs'), totalBs: sum('totalBs'), porMes };
}

/** Modalidad sugerida al migrar desde `inmuebles`. */
export function modalidadSugerida(codigo: string, residencial: boolean): Modalidad {
  if (CONDOMINIOS_PAGO_INDIVIDUAL.includes(String(codigo).toUpperCase())) return 'INDIVIDUAL';
  return residencial ? 'CENTRALIZADO' : 'MIXTO_COMERCIAL';
}

export interface RenglonDeuda {
  /** unidad (clave de cargosPorUnidad) */
  clave: string;
  /** 'YYYY-MM' */
  periodo: string;
  /** pendiente de este renglón */
  montoBs: number;
  concepto?: 'ASEO' | 'MULTA' | 'IVA';
}

export interface ResultadoAbono {
  aplicado: (RenglonDeuda & { pagadoBs: number; completo: boolean })[];
  sobranteBs: number;
  mesesCompletos: string[];
}

/**
 * Aplica un abono a la deuda: primero los MESES MÁS VIEJOS; dentro de un mismo mes, aseo e IVA
 * antes que la multa. Lo que no alcanza a cubrir un renglón queda como abono parcial de ese renglón.
 */
export function aplicarAbono(montoBs: number, deuda: RenglonDeuda[]): ResultadoAbono {
  const orden = { ASEO: 0, IVA: 1, MULTA: 2 } as const;
  const pend = deuda
    .filter(d => d.montoBs > 0)
    .slice()
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || orden[a.concepto || 'ASEO'] - orden[b.concepto || 'ASEO'] || a.clave.localeCompare(b.clave));
  let resto = r2(montoBs);
  const aplicado: ResultadoAbono['aplicado'] = [];
  for (const d of pend) {
    if (resto <= 0) break;
    const pagado = r2(Math.min(resto, d.montoBs));
    aplicado.push({ ...d, pagadoBs: pagado, completo: pagado >= d.montoBs });
    resto = r2(resto - pagado);
  }
  const porMes = new Map<string, boolean>();
  for (const d of pend) {
    const a = aplicado.find(x => x.clave === d.clave && x.periodo === d.periodo && x.concepto === d.concepto);
    porMes.set(d.periodo, (porMes.get(d.periodo) ?? true) && !!a?.completo);
  }
  return { aplicado, sobranteBs: resto, mesesCompletos: [...porMes].filter(([, c]) => c).map(([p]) => p) };
}

/** Normaliza una cédula/RIF para comparar (V-12.345.678 → 12345678). */
export const normId = (s: any) => String(s || '').replace(/^[VEJPG]-?/i, '').replace(/[^0-9A-Z]/gi, '').toUpperCase();

/**
 * ¿Quién paga la multa de una unidad? En MIXTO_COMERCIAL e INDIVIDUAL la paga el dueño de la unidad
 * (se le busca por su cédula/RIF en la Caja de Condominios); en CENTRALIZADO y TARIFA_FIJA, el condominio.
 */
export const multaLaPagaLaUnidad = (c: Condominio) => c.modalidad === 'MIXTO_COMERCIAL' || c.modalidad === 'INDIVIDUAL';

/** ¿El aseo de la unidad lo paga la propia unidad? Solo en INDIVIDUAL. */
export const aseoLoPagaLaUnidad = (c: Condominio) => c.modalidad === 'INDIVIDUAL';

/**
 * ¿Es un condominio real? Un mismo dueño con varias actividades NO es condominio
 * (es un local con varias actividades económicas → se queda en Contribuyentes).
 * Excepciones confirmadas por el municipio (p. ej. HMR, Free Market) se fuerzan en la migración.
 */
export function esCondominioReal(padre: { identidad?: string | null }, unidadesActivas: { identidad?: string | null }[]): boolean {
  if (unidadesActivas.length === 0) return true; // condominio declarado sin unidades cargadas
  const p = normId(padre.identidad);
  return unidadesActivas.some(u => normId(u.identidad) !== p);
}

export { isResidencialInm };
