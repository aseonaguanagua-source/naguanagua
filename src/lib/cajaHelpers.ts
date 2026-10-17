/**
 * cajaHelpers.ts
 * Helpers centralizados para el módulo de Caja.
 * Eliminan lógica duplicada que aparecía 4-5 veces en caja/page.tsx.
 */

import { isResidencialInm } from './calculos';

// ─── Tipos mínimos para evitar `any` en los helpers ───────────────────────────

export interface InmuebleBasic {
  id?: string;
  identidad?: string;
  inmueble?: string;
  contribuyente?: string;
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
  area?: string | number;
  es_condominio?: boolean;
  condominio_padre_id?: string;
  padre_id?: string;
  cod_cont?: string;
  [key: string]: any;
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
  const specificCode = (foundUser as any).CodCont || (foundUser as any).cod_cont;
  const sCode = specificCode ? String(specificCode).toUpperCase() : '';

  const isActivo = (i: any) => {
    const est = (i.estado || 'Activo').trim().toLowerCase();
    return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
  };

  return source.filter((i) => {
    if (!isActivo(i)) return false;
    if (isTrueCondo) return true;
    const itemFid = (i.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();
    // Coincidencia por RIF / Cédula del contribuyente
    if (fid && itemFid === fid) return true;
    // O coincidencia por código directo o sus actividades / contenedores
    if (sCode) {
      const iCode = String(i.inmueble || '').toUpperCase();
      const pCode = String((i as any).condominio_padre_id || '').toUpperCase();
      const nCode = String((i as any).padre_id || '').toUpperCase();
      if (iCode === sCode || pCode === sCode || nCode === sCode) return true;
    }
    return false;
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
  isCondominio?: boolean;
  condominioPadreId?: string | null;
}

/**
 * Agrupa los inmuebles de un mismo contribuyente por local físico.
 * Para que dos actividades pertenezcan al mismo local, deben tener:
 * 1. Misma cédula/RIF (garantizado al ser del mismo contribuyente)
 * 2. Y misma dirección física o mismo condominio_padre_id
 */
export function clusterInmueblesByLocal(userInms: InmuebleBasic[]): Map<string, LocalClusterInfo> {
  const result = new Map<string, LocalClusterInfo>();
  const isActivo = (i: any) => {
    const est = (i.estado || 'Activo').trim().toLowerCase();
    return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
  };
  const activeInms = (userInms || []).filter(isActivo);
  const clusters: Array<{ localId: string; label: string; direccion: string; inms: InmuebleBasic[] }> = [];

  for (const inm of activeInms) {
    const rawDir = (inm.direccion || '').trim();
    // El contenedor local de actividades (N/A) SIEMPRE es padre_id (NO condominio_padre_id)
    const localPadreId = (inm as any).padre_id;
    const isNA = (inm.actividad_principal || '').trim().toUpperCase() === 'N/A';

    const matchedCluster = clusters.find((c) => {
      // 1. Si este inm tiene un contenedor padre (padre_id), asociar al cluster que tenga a ese padre o a sus hermanos
      if (localPadreId && c.inms.some((i: any) => i.inmueble === localPadreId || i.padre_id === localPadreId)) {
        return true;
      }
      // 2. Si este inm es el contenedor padre N/A de alguno que ya está en el cluster
      if (inm.inmueble && c.inms.some((i: any) => i.padre_id === inm.inmueble)) {
        return true;
      }
      // 3. Coincidencia por dirección física SOLO si NINGUNO pertenece a un contenedor padre N/A
      const cHasPadre = c.inms.some((i: any) => i.padre_id || (i.actividad_principal || '').toUpperCase() === 'N/A');
      if (!localPadreId && !isNA && !cHasPadre && rawDir && rawDir !== '0 0' && c.direccion && c.direccion !== '0 0' && isSameLocal(rawDir, c.direccion)) {
        return true;
      }
      return false;
    });

    if (matchedCluster) {
      matchedCluster.inms.push(inm);
      if (isNA && inm.inmueble) {
        matchedCluster.localId = inm.inmueble;
      }
      if ((!matchedCluster.direccion || matchedCluster.direccion === '0 0') && rawDir && rawDir !== '0 0') {
        matchedCluster.direccion = rawDir;
        matchedCluster.label = getShortAddress(rawDir);
      }
    } else {
      const canonicalId = localPadreId || inm.inmueble || `LOCAL-${clusters.length + 1}`;
      const label = rawDir && rawDir !== '0 0' ? getShortAddress(rawDir) : (canonicalId || 'Local');
      clusters.push({
        localId: canonicalId,
        label,
        direccion: rawDir,
        inms: [inm],
      });
    }
  }

  for (const cluster of clusters) {
    const parentInm = cluster.inms.find(i => 
      (i.actividad_principal || '').toUpperCase() === 'N/A' || 
      (i.actividad_principal || '').toLowerCase().includes('padre en sigyr') ||
      i.inmueble === cluster.localId ||
      cluster.inms.some(other => other.padre_id === i.inmueble)
    );
    const hasChildren = cluster.inms.some(i => i.padre_id === cluster.localId || (parentInm && i.inmueble !== parentInm.inmueble));
    const effectiveInms = (hasChildren && parentInm)
      ? cluster.inms.filter(i => i.inmueble !== parentInm.inmueble && isActivo(i))
      : cluster.inms.filter(isActivo);
    const billableCount = effectiveInms.length;
    const isCondoInm = (i: any) =>
      Boolean(
        i?.es_condominio ||
        i?.condominio_padre_id ||
        (i?.actividad_principal || '').toLowerCase().includes('condominio') ||
        (i?.actividad_principal || '').toLowerCase().includes('padre en sigyr: urb')
      );
    const esCondominio = cluster.inms.some(isCondoInm);
    const condoPadreInm = cluster.inms.find(isCondoInm);
    const condominioPadreId = (condoPadreInm as any)?.condominio_padre_id ||
      ((condoPadreInm as any)?.actividad_principal?.match(/Padre en SIGYR:\s*(URB\d+)/i)?.[1]) ||
      ((condoPadreInm as any)?.es_condominio ? condoPadreInm?.inmueble : null);

    for (const inm of cluster.inms) {
      if (inm.inmueble) {
        result.set(inm.inmueble, {
          localId: cluster.localId,
          label: cluster.label,
          direccion: cluster.direccion,
          count: billableCount,
          isCondominio: esCondominio,
          condominioPadreId
        });
      }
    }
  }

  return result;
}

export interface InmuebleClusterGroup {
  localId: string;
  label: string;
  direccion: string;
  tipo: string;
  clasificacion: string;
  count: number;
  totalMmv: number;
  mesesDeudaMax: number;
  tieneDeuda: boolean;
  esCondominio: boolean;
  condominioPadreId?: string | null;
  inms: InmuebleBasic[];
  parentInm?: InmuebleBasic;
}

/**
 * Agrupa los inmuebles y actividades de un contribuyente por inmueble / local físico (idéntico a Caja).
 * Si un local posee múltiples actividades (ej: N/A o actividades bajo la misma dirección/código),
 * las consolida en un solo inmueble con sus actividades adentro.
 */
export function groupInmueblesByLocal(userInms: InmuebleBasic[]): InmuebleClusterGroup[] {
  const isActivo = (i: any) => {
    const est = (i.estado || 'Activo').trim().toLowerCase();
    return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
  };
  const activeInms = (userInms || []).filter(isActivo);
  const clusters: Array<{ localId: string; label: string; direccion: string; inms: InmuebleBasic[] }> = [];

  for (const inm of activeInms) {
    const rawDir = (inm.direccion || '').trim();
    // El contenedor local de actividades (N/A) SIEMPRE es padre_id (NO condominio_padre_id)
    const localPadreId = (inm as any).padre_id;
    const isNA = (inm.actividad_principal || '').trim().toUpperCase() === 'N/A' ||
                 (inm.actividad_principal || '').toLowerCase().includes('padre en sigyr');

    const matchedCluster = clusters.find((c) => {
      // 1. Si este inm tiene un contenedor padre (padre_id), asociar al cluster que tenga a ese padre o a sus hermanos
      if (localPadreId && c.inms.some((i: any) => i.inmueble === localPadreId || i.padre_id === localPadreId)) {
        return true;
      }
      // 2. Si este inm es el contenedor padre N/A de alguno que ya está en el cluster
      if (inm.inmueble && c.inms.some((i: any) => i.padre_id === inm.inmueble)) {
        return true;
      }
      // 3. Coincidencia por dirección física SOLO si NINGUNO pertenece a un contenedor padre N/A
      const cHasPadre = c.inms.some((i: any) => i.padre_id || (i.actividad_principal || '').toUpperCase() === 'N/A' || (i.actividad_principal || '').toLowerCase().includes('padre en sigyr'));
      if (!localPadreId && !isNA && !cHasPadre && rawDir && rawDir !== '0 0' && c.direccion && c.direccion !== '0 0' && isSameLocal(rawDir, c.direccion)) {
        return true;
      }
      return false;
    });

    if (matchedCluster) {
      matchedCluster.inms.push(inm);
      if (isNA && inm.inmueble) {
        matchedCluster.localId = inm.inmueble;
      }
      if ((!matchedCluster.direccion || matchedCluster.direccion === '0 0') && rawDir && rawDir !== '0 0') {
        matchedCluster.direccion = rawDir;
        matchedCluster.label = getShortAddress(rawDir);
      }
    } else {
      const canonicalId = localPadreId || inm.inmueble || `LOCAL-${clusters.length + 1}`;
      const label = rawDir && rawDir !== '0 0' ? getShortAddress(rawDir) : (canonicalId || 'Local');
      clusters.push({
        localId: canonicalId,
        label,
        direccion: rawDir,
        inms: [inm],
      });
    }
  }

  return clusters.map(c => {
    const parentInm = c.inms.find(i => 
      (i.actividad_principal || '').toUpperCase() === 'N/A' || 
      (i.actividad_principal || '').toLowerCase().includes('padre en sigyr') ||
      i.inmueble === c.localId ||
      c.inms.some(other => other.padre_id === i.inmueble)
    );

    const hasChildren = c.inms.some(i => i.padre_id === c.localId || (parentInm && i.inmueble !== parentInm.inmueble));
    let displayInms: InmuebleBasic[];

    if (hasChildren && parentInm) {
      // NUNCA incluir el inmueble padre contenedor adentro de la lista de actividades hijas
      displayInms = c.inms.filter(i => i.inmueble !== parentInm.inmueble && isActivo(i));
      if (displayInms.length === 0) displayInms = [parentInm];
    } else {
      displayInms = c.inms.filter(isActivo);
    }

    const esRes = displayInms.every(i => isResidencialInm(i));
    const totalMmv = displayInms.reduce((sum, i) => {
      const mmv = parseFloat(String(i.mmv_mes || 0)) || 0;
      const cant = parseInt(String(i.cant_inmuebles || 1), 10) || 1;
      return sum + (mmv * cant);
    }, 0);

    const isCondoInm = (i: any) =>
      Boolean(
        i?.es_condominio ||
        i?.condominio_padre_id ||
        (i?.actividad_principal || '').toLowerCase().includes('condominio') ||
        (i?.actividad_principal || '').toLowerCase().includes('padre en sigyr: urb')
      );
    const esCondominio = c.inms.some(isCondoInm);
    const condoPadreInm = c.inms.find(isCondoInm);
    const condominioPadreId = (condoPadreInm as any)?.condominio_padre_id ||
      ((condoPadreInm as any)?.actividad_principal?.match(/Padre en SIGYR:\s*(URB\d+)/i)?.[1]) ||
      ((condoPadreInm as any)?.es_condominio ? condoPadreInm?.inmueble : null);

    const mesesDeudaMax = Math.max(0, ...displayInms.map(i => parseInt(String(i.meses_deuda || 0), 10) || 0));
    // Los inmuebles en condominio cancelan a través de la administración del condominio, no generan deudas individuales
    const tieneDeuda = !esCondominio && (mesesDeudaMax > 0 || displayInms.some(i => parseFloat(String(i.deuda_mmv || 0)) > 0 || parseFloat(String(i.multa_bs || 0)) > 0));

    return {
      localId: c.localId,
      label: c.label,
      direccion: c.direccion || parentInm?.direccion || displayInms[0]?.direccion || 'Sin dirección registrada',
      tipo: esRes ? 'RESIDENCIAL' : 'COMERCIAL',
      clasificacion: displayInms[0]?.clasificacion || (esRes ? 'Residencial' : 'Comercial'),
      count: displayInms.length,
      totalMmv: Math.round(totalMmv * 100) / 100,
      mesesDeudaMax: esCondominio ? 0 : mesesDeudaMax,
      tieneDeuda,
      esCondominio,
      condominioPadreId,
      inms: displayInms,
      parentInm
    };
  });
}

export { formatPhoneNumber, isFictitiousEmail, formatMonthYear, formatActividad } from './formatters';
