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
  /** Local que agrupa actividades (sus actividades cuelgan de él): no cobra por sí mismo */
  es_grupo?: boolean;
}

/** Actividad vacía o "N/A": el local no tiene actividad propia (sus actividades están en otros registros). */
export const esSinActividad = (a: any) => !a || /^(N\/?A|NA|NINGUNA|SIN ACTIVIDAD|-)$/i.test(String(a).trim());

/**
 * ¿Se cobra por la actividad económica de cada unidad? Sí en comerciales y mixtos (cada local según su
 * actividad), en pago individual y cuando el condominio tiene "tarifa por local". Solo el residencial
 * centralizado cobra declaradas × tarifa del condominio.
 */
export const porActividad = (c: Pick<Condominio, 'tipo' | 'modalidad' | 'cobro_tarifa_por_unidad'>) =>
  c.modalidad === 'INDIVIDUAL' || !!c.cobro_tarifa_por_unidad || c.tipo !== 'RESIDENCIAL';

/** ¿La unidad es residencial? (en un condominio MIXTO depende de su actividad) */
export function unidadResidencial(c: Pick<Condominio, 'tipo'>, u?: Unidad | null): boolean {
  if (c.tipo === 'RESIDENCIAL') return true;
  if (c.tipo === 'COMERCIAL' || !u) return false;
  return isResidencialInm({ tipo: u.tipo || '', actividad_principal: u.actividad || '' });
}

/** ¿Esta unidad no cobra por sí misma? (contenedor de actividades, o comercial sin actividad; la desocupada paga 1,98 MMV) */
export const unidadNoCobra = (c: Condominio, u: Unidad) => !!u.es_grupo || (u.estado !== 'Desocupada' && !unidadResidencial(c, u) && esSinActividad(u.actividad));

export const FO_DESOCUPADO = 1.98;
export const FAC_COMERCIAL = 0.128;
export const TASA_MULTA_RES = 0.10;
export const TASA_MULTA_COM = 0.12;
export const IVA = 0.16;
export const RETENCION_IVA = 0.75;
export const CONDOMINIOS_PAGO_INDIVIDUAL = ['URB014903', 'URB030783', 'URB029866', 'URB015503'];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const esResidencial = (c: Pick<Condominio, 'tipo'>) => c.tipo === 'RESIDENCIAL';

/** Mensualidad de UNA unidad con su propia tarifa/actividad (o la del condominio si la unidad no la tiene). */
export function tarifaUnidadBs(c: Condominio, tasa: number, u?: Unidad): number {
  const conAct = !!u && !esSinActividad(u.actividad);
  const act = conAct ? u!.actividad : c.actividad;
  const res = u ? unidadResidencial(c, u) : c.tipo === 'RESIDENCIAL';
  const tipo = res ? 'RESIDENCIAL' : 'COMERCIAL';
  // Residencial con tipo y zona (APARTAMENTO (ZONA A), QUINTA (ZONA B)…) y sin tarifa propia: el F.O. sale de
  // la ordenanza por su actividad, NO de la tarifa genérica del condominio (así lo cobra SIGYR).
  const mmv = u?.tarifa_mmv ?? (res && conAct ? undefined : c.tarifa_mmv ?? undefined);
  return calcularMensualidad({ tipo, actividad_principal: act || '', mmv_mes: mmv, cant_inmuebles: 1 }, tasa);
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

  if (c.modalidad === 'TARIFA_FIJA' && (c.tarifa_fija_bs || 0) > 0) {
    return { condominioBs: r2(c.tarifa_fija_bs!), unidadesCobradas: declarada, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
      detalle: 'Tarifa fija acordada' };
  }
  if (porActividad(c)) {
    const reparto = cargosPorUnidad(c, unidades, tasa);
    const total = reparto.reduce((s, r) => s + r.montoBs, 0);
    return { condominioBs: r2(total), unidadesCobradas: reparto.filter(r => r.montoBs > 0).length, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
      detalle: c.modalidad === 'INDIVIDUAL' ? 'Cada unidad paga lo suyo (suma de todas)' : 'Suma de la actividad económica de cada local' };
  }
  const reparto = cargosPorUnidad(c, unidades, tasa);
  const total = reparto.reduce((s, r) => s + r.montoBs, 0);
  const registradas = reparto.filter(r => r.clave !== SIN_REGISTRAR && r.montoBs > 0).length;
  const sinReg = reparto.find(r => r.clave === SIN_REGISTRAR)?.cantidad || 0;
  return {
    condominioBs: r2(total), unidadesCobradas: registradas + sinReg, unidadesDesocupadas: desoc, tarifaUnidadBs: tUnit, tarifaDesocupadaBs: tDesoc,
    detalle: `${registradas} unidad(es) según su tipo y zona${sinReg ? ` + ${sinReg} declarada(s) sin registrar` : ''}${desoc ? ` (${desoc} desocupada(s))` : ''}`,
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
  if (porActividad(c)) {
    // Cada local según su actividad económica. Solo se cobran las unidades registradas (de las no
    // registradas no se conoce la actividad). Los locales contenedor (con actividades debajo) o sin
    // actividad no cobran por sí mismos: cobran sus actividades.
    return vivas.map((u, i) => ({
      clave: clave(u, i), inmueble: u.inmueble, cantidad: 1,
      montoBs: unidadNoCobra(c, u) ? 0 : r2(u.estado === 'Desocupada' ? tDesoc : tarifaUnidadBs(c, tasa, u)),
    }));
  }

  // CENTRALIZADO: lo paga el condominio, pero cada unidad registrada vale según su propio tipo y zona
  // (APARTAMENTO ZONA A ≠ ZONA B), igual que SIGYR. Las declaradas que no están registradas se cobran con
  // la tarifa más común de las registradas (o la del condominio si no hay ninguna).
  const out: CargoUnidad[] = vivas.map((u, i) => ({
    clave: clave(u, i), inmueble: u.inmueble, cantidad: 1,
    montoBs: unidadNoCobra(c, u) ? 0 : r2(u.estado === 'Desocupada' ? tDesoc : tarifaUnidadBs(c, tasa, u)),
  }));
  const cobran = vivas.filter(u => !unidadNoCobra(c, u)).length;
  // Como SIGYR: si hay unidades registradas se cobran solo ellas; la cantidad declarada se usa
  // únicamente cuando el condominio todavía no tiene ninguna unidad registrada.
  if (cobran === 0) {
    out.push({ clave: SIN_REGISTRAR, inmueble: null, cantidad: declarada, montoBs: r2(tUnit * declarada) });
  }
  return out;
}

/** Cargo mensual de UNA unidad cuando se cobra por actividad (en el residencial centralizado la unidad no paga aseo propio). */
export function cargoMensualUnidad(c: Condominio, u: Unidad, tasa: number): number {
  if (!porActividad(c) || u.estado === 'Eliminada' || unidadNoCobra(c, u)) return 0;
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
 * `sinMultaPrimeros`: los primeros N meses (los más viejos) no llevan multa porque se exoneraron.
 */
export function deudaPorMeses(meses: number, mensualBs: number, residencial: boolean, agenteRetencion = false, sinMultaPrimeros = 0): DeudaPeriodos {
  const n = Math.max(0, Math.floor(meses));
  const tMulta = residencial ? TASA_MULTA_RES : TASA_MULTA_COM;
  const porMes = Array.from({ length: n }, (_, i) => {
    const base = r2(mensualBs);
    const multa = i < n - 1 && i >= sinMultaPrimeros ? r2(mensualBs * tMulta) : 0;
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
 * ¿Quién paga la multa de una unidad? Cuando se cobra por actividad, la paga cada contribuyente (se le busca
 * por su cédula/RIF en la Caja de Condominios); en el residencial centralizado y tarifa fija, el condominio.
 */
export const multaLaPagaLaUnidad = (c: Condominio) => porActividad(c);

/** ¿El aseo de la unidad lo paga la propia unidad? Cuando se cobra por actividad. */
export const aseoLoPagaLaUnidad = (c: Condominio) => porActividad(c);

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

/** Mes actual en Caracas como {y, m} (m: 1–12). */
export function mesActualCaracas(hoy: Date = new Date()): { y: number; m: number } {
  const t = new Date(hoy.getTime() - 4 * 3600 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
}

const aIndice = (y: number, m: number) => y * 12 + (m - 1);
const deIndice = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;

/**
 * Primer mes pendiente para N meses de deuda. El último mes facturado es el MES ANTERIOR
 * (igual que Caja: un pago del 06/10 con 1 mes cubre septiembre). 0 meses → null (al día).
 */
export function pendienteDesdeParaMeses(meses: number, hoy: Date = new Date()): string | null {
  const n = Math.max(0, Math.floor(meses || 0));
  if (n === 0) return null;
  const { y, m } = mesActualCaracas(hoy);
  return deIndice(aIndice(y, m) - n);
}

/** Meses pendientes desde `desde` ('YYYY-MM-DD') hasta el mes anterior, inclusive. */
export function mesesPendientes(desde: string | null | undefined, hoy: Date = new Date()): number {
  if (!desde) return 0;
  const [y, m] = desde.split('-').map(Number);
  const { y: ya, m: ma } = mesActualCaracas(hoy);
  return Math.max(0, aIndice(ya, ma) - aIndice(y, m));
}

/** Lista de períodos 'YYYY-MM' pendientes desde `desde` hasta el mes anterior. */
export function periodosPendientes(desde: string | null | undefined, hoy: Date = new Date()): string[] {
  const n = mesesPendientes(desde, hoy);
  if (!desde || n === 0) return [];
  const [y, m] = desde.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => deIndice(aIndice(y, m) + i).slice(0, 7));
}

/** Nuevo `aseo_pendiente_desde` después de pagar `n` meses (null = queda al día). */
export function avanzarPendiente(desde: string | null | undefined, n: number, hoy: Date = new Date()): string | null {
  if (!desde) return null;
  const restantes = mesesPendientes(desde, hoy) - Math.max(0, Math.floor(n));
  if (restantes <= 0) return null;
  const [y, m] = desde.split('-').map(Number);
  return deIndice(aIndice(y, m) + Math.floor(n));
}
