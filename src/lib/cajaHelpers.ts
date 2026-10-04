/**
 * cajaHelpers.ts
 * Helpers centralizados para el módulo de Caja.
 * Eliminan lógica duplicada que aparecía 4-5 veces en caja/page.tsx.
 */

// ─── Tipos mínimos para evitar `any` en los helpers ───────────────────────────

export interface InmuebleBasic {
  id?: string;
  identidad?: string;
  inmueble?: string;
  clasificacion?: string;
  actividad_principal?: string;
  mmv_mes?: string | number;
  cant_inmuebles?: string | number;
  deuda_mmv?: string | number;
  deuda_congelada_bs?: string | number;
  saldo_favor_bs?: string | number;
  meses_deuda?: string | number;
  tipo?: string;
  multa_bs?: string | number;
  direccion?: string;
  estado?: string;
}

export interface ContribuyenteBasic {
  Identidad?: string;
  Contribuyente?: string;
  SaldoFavor?: number;
  DeudaTotal?: number;
}

// ─── getUserInmuebles ──────────────────────────────────────────────────────────
/**
 * Retorna los inmuebles que pertenecen al usuario actualmente buscado.
 * Consolida la lógica que antes aparecía copiada 5 veces en caja/page.tsx.
 */
export const getUserInmuebles = (
  freshInmuebles: InmuebleBasic[],
  condominioHijos: InmuebleBasic[],
  contextInmuebles: InmuebleBasic[],
  foundUser: ContribuyenteBasic | null
): InmuebleBasic[] => {
  if (!foundUser) return [];
  const source: InmuebleBasic[] =
    freshInmuebles.length > 0
      ? [...freshInmuebles, ...condominioHijos]
      : contextInmuebles || [];
  const fid = (foundUser.Identidad || '').replace(/-/g, '').toUpperCase();
  return source.filter((i) => {
    if (freshInmuebles.length > 0) return true;
    return (i.identidad || '').replace(/-/g, '').toUpperCase() === fid;
  });
};

// ─── getCajeroId ───────────────────────────────────────────────────────────────
/**
 * Lee la sesión del cajero actual desde localStorage.
 * Consolida la lógica que antes aparecía copiada 4 veces en caja/page.tsx.
 */
export const getCajeroId = (): string => {
  if (typeof window === 'undefined') return 'Sistema';
  const cajero = localStorage.getItem('adminUser') || 'Administrador';
  const letra = localStorage.getItem('adminLetra');
  return letra && cajero !== 'Administrador' ? `${letra}-${cajero}` : cajero;
};

// ─── addressSimilarity / isSameLocal ──────────────────────────────────────────
/**
 * Calcula el índice de similitud Jaccard entre dos cadenas de dirección.
 * Normaliza: minúsculas, sin caracteres especiales, palabras > 3 letras.
 */
export const addressSimilarity = (a: string, b: string): number => {
  const normalize = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(' ')
      .filter((x) => x.length > 3);
  const w1 = normalize(a);
  const w2 = normalize(b);
  if (w1.length === 0 || w2.length === 0) return 0;
  return w1.filter((w) => w2.includes(w)).length / Math.min(w1.length, w2.length);
};

/**
 * Retorna true si dos direcciones son suficientemente similares para
 * considerarse el mismo local físico (default 75% de similitud).
 */
export const isSameLocal = (
  dir1: string,
  dir2: string,
  threshold = 0.75
): boolean => addressSimilarity(dir1, dir2) > threshold;

export { formatPhoneNumber, isFictitiousEmail, formatMonthYear } from './formatters';
