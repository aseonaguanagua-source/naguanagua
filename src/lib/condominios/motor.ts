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
}

export interface Unidad {
  inmueble?: string | null;
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
  const ocupadas = declarada - desoc;
  const total = tUnit * ocupadas + tDesoc * desoc;
  return {
    condominioBs: r2(total), unidadesCobradas: declarada, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
    detalle: `${ocupadas} unidad(es) × Bs ${r2(tUnit)}${desoc ? ` + ${desoc} desocupada(s) × Bs ${r2(tDesoc)}` : ''}`,
  };
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

/**
 * ¿Es un condominio real? Un mismo dueño con varias actividades NO es condominio
 * (es un local con varias actividades económicas → se queda en Contribuyentes).
 */
export function esCondominioReal(padre: { identidad?: string | null }, unidadesActivas: { identidad?: string | null }[]): boolean {
  const norm = (s: any) => String(s || '').replace(/^[VEJPG]-?/i, '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
  if (unidadesActivas.length === 0) return true; // condominio declarado sin unidades cargadas
  const p = norm(padre.identidad);
  return unidadesActivas.some(u => norm(u.identidad) !== p);
}

export { isResidencialInm };
