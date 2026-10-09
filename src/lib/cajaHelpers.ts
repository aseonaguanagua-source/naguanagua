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

  const isTrueCondo = 
    ((foundUser as any).Contribuyente || '').toLowerCase().includes('condominio') ||
    ((foundUser as any).Clasificacion || '').toLowerCase().includes('condominio') ||
    (((foundUser as any).Tipo || '').toUpperCase().includes('RESIDENCIAL') && (foundUser as any).es_condominio);

  const source: InmuebleBasic[] =
    freshInmuebles.length > 0
      ? (isTrueCondo ? [...freshInmuebles, ...condominioHijos] : freshInmuebles)
      : contextInmuebles || [];

  const fid = (foundUser.Identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();

  // Si se buscó por código específico, filtrar estrictamente para devolver únicamente ese inmueble y sus hijos
  const specificCode = (foundUser as any).CodCont || (foundUser as any).cod_cont;
  const isSearchByCode = (foundUser as any).isSearchByCode;
  if (isSearchByCode && specificCode) {
    const sCode = String(specificCode).toUpperCase();
    return source.filter((i) => {
      const iCode = String(i.inmueble || '').toUpperCase();
      const pCode = String((i as any).condominio_padre_id || '').toUpperCase();
      const nCode = String((i as any).padre_id || '').toUpperCase();
      return iCode === sCode || pCode === sCode || nCode === sCode;
    });
  }

  return source.filter((i) => {
    if (isTrueCondo) return true;
    const itemFid = (i.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();
    return itemFid === fid;
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

export const getShortAddress = (addr?: string | null): string => {
  if (!addr || addr.trim() === '0 0' || addr.trim() === '') return 'Local Principal';
  let s = addr.replace(/^(\d+\s+)+/, '').trim();
  if (s.length > 50) return s.slice(0, 48) + '...';
  return s;
};

export interface LocalClusterInfo {
  localId: string;
  label: string;
  direccion: string;
  count: number;
}

/**
 * Agrupa los inmuebles de un mismo contribuyente por local físico.
 * Para que dos actividades pertenezcan al mismo local, deben tener:
 * 1. Misma cédula/RIF (garantizado al ser del mismo contribuyente)
 * 2. Y misma dirección física o mismo condominio_padre_id
 */
export function clusterInmueblesByLocal(userInms: InmuebleBasic[]): Map<string, LocalClusterInfo> {
  const result = new Map<string, LocalClusterInfo>();
  const clusters: Array<{ localId: string; label: string; direccion: string; inms: InmuebleBasic[] }> = [];

  for (const inm of userInms) {
    const rawDir = (inm.direccion || '').trim();
    const padreId = (inm as any).condominio_padre_id || (inm as any).padre_id;

    // Buscar si ya pertenece a un cluster existente por mismo padre o misma dirección
    const matchedCluster = clusters.find((c) => {
      if (padreId && c.inms.some((i: any) => i.condominio_padre_id === padreId || i.padre_id === padreId || i.inmueble === padreId)) {
        return true;
      }
      if (rawDir && rawDir !== '0 0' && c.direccion && c.direccion !== '0 0') {
        return isSameLocal(rawDir, c.direccion, 0.70);
      }
      return false;
    });

    if (matchedCluster) {
      matchedCluster.inms.push(inm);
      if ((!matchedCluster.direccion || matchedCluster.direccion === '0 0') && rawDir && rawDir !== '0 0') {
        matchedCluster.direccion = rawDir;
        matchedCluster.label = getShortAddress(rawDir);
      }
    } else {
      const label = rawDir && rawDir !== '0 0' ? getShortAddress(rawDir) : (inm.inmueble || 'Local');
      clusters.push({
        localId: inm.inmueble || `LOCAL-${clusters.length + 1}`,
        label,
        direccion: rawDir,
        inms: [inm],
      });
    }
  }

  for (const cluster of clusters) {
    const billableCount = cluster.inms.filter(
      (i) => (i.actividad_principal || '').toUpperCase() !== 'N/A'
    ).length;
    for (const inm of cluster.inms) {
      if (inm.inmueble) {
        result.set(inm.inmueble, {
          localId: cluster.localId,
          label: cluster.label,
          direccion: cluster.direccion,
          count: billableCount,
        });
      }
    }
  }

  return result;
}

export { formatPhoneNumber, isFictitiousEmail, formatMonthYear } from './formatters';
