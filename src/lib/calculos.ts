import { ordenanzaData } from '@/data/ordenanza';

const todasLasActividades = [...ordenanzaData.actividadesComerciales, ...(ordenanzaData.actividadesIndustriales || [])];

/**
 * Determina si un inmueble o registro es de uso RESIDENCIAL.
 * Evalúa tipo, actividad_principal y clasificacion.
 * En la BD Supabase / SIGYR:
 * - `tipo` contiene 'RESIDENCIAL', 'COMERCIAL', 'INDUSTRIAL', etc.
 * - `clasificacion` contiene 'Individual', 'Condominio', 'Otro'.
 * - `actividad_principal` contiene 'CASA (ZONA D)', 'APARTAMENTO (ZONA A)', 'QUINTA', etc.
 * Esta función garantiza que ningún residencial sea clasificado erróneamente como comercial.
 */
export const isResidencialInm = (item: any): boolean => {
  if (!item) return false;
  if (typeof item === 'string') {
    const s = item.toUpperCase();
    if (
      s.includes('RESIDENCIAL') ||
      s.includes('CASA') ||
      s.includes('APARTAMENTO') ||
      s.includes('QUINTA') ||
      s.includes('TOWNHOUSE') ||
      s.includes('TOWN HOUSE') ||
      s.includes('ZONA A') ||
      s.includes('ZONA B') ||
      s.includes('ZONA C') ||
      s.includes('ZONA D')
    ) {
      return true;
    }
    return false;
  }

  const tipo = String(item.tipo || item.Tipo || '').toUpperCase();
  if (tipo.includes('RESIDENCIAL')) return true;
  if (tipo.includes('COMERCIAL') || tipo.includes('INDUSTRIAL') || tipo.includes('GUBERNAMENTAL')) return false;

  const name = String(item.contribuyente || item.Contribuyente || item.nombre || '').toUpperCase();
  if (
    name.includes('CONJUNTO RESIDENCIAL') ||
    name.includes('RESIDENCIAS') ||
    name.includes('RES.') ||
    name.includes('EDIFICIO')
  ) {
    if (!name.includes('CENTRO COMERCIAL') && !name.includes('C.C.')) {
      return true;
    }
  }

  const act = String(item.actividad_principal || item.actividad || item['Actividad Principal'] || item.Actividad || '').toUpperCase();
  if (
    act.includes('CASA') ||
    act.includes('APARTAMENTO') ||
    act.includes('QUINTA') ||
    act.includes('TOWNHOUSE') ||
    act.includes('TOWN HOUSE') ||
    act.includes('VILLA') ||
    act.includes('RESIDENCIAL') ||
    act.includes('ZONA A') ||
    act.includes('ZONA B') ||
    act.includes('ZONA C') ||
    act.includes('ZONA D')
  ) {
    return true;
  }

  const clasif = String(item.clasificacion || item.Clasificacion || '').toUpperCase();
  if (clasif.includes('RESIDENCIAL')) return true;
  if (clasif.includes('COMERCIAL') || clasif.includes('INDUSTRIAL')) return false;

  return false;
};

// --- Búsqueda tolerante de actividades en la ordenanza ---------------------------------
// Los textos de SIGYR y de la ordenanza tienen variaciones ("PARQUES ATRACCIONES" vs
// "PARQUES DE ATRACCIONES", "REPUESTOS" vs "RESPUESTOS", "COMPAÑIAS" vs "COMPANIAS").
const STOPWORDS = new Set(['DE', 'DEL', 'Y', 'LA', 'EL', 'LOS', 'LAS', 'E', 'O', 'PARA', 'CON', 'EN', 'A']);
const tokensActividad = (s: string): string[] =>
  String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\uFFFD/g, 'N')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t && !STOPWORDS.has(t));
const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
};
const tokensEquivalentes = (a: string[], b: string[]): boolean => {
  if (a.length === 0 || a.length !== b.length) return false;
  return a.every((t, i) => {
    const u = b[i];
    if (t === u) return true;
    const max = Math.max(t.length, u.length);
    return max >= 5 && levenshtein(t, u) <= (max >= 8 ? 2 : 1);
  });
};

/** Nivel (0 BAJA, 1 MEDIA, 2 ALTA) indicado en el texto de la actividad. */
export const nivelActividad = (actividadFull: string): number => {
  const act = (actividadFull || '').toLowerCase();
  if (act.includes('(alta)')) return 2;
  if (act.includes('(media)')) return 1;
  return 0;
};

/** Busca la actividad en la ordenanza (exacta, contenida o equivalente con errores de escritura). */
export const buscarActividadOrdenanza = (actividadFull: string): any | null => {
  const act = (actividadFull || '').toLowerCase().trim();
  const labelToSearch = act.replace(/\(alta\)|\(media\)|\(baja\)/g, '').replace(/\[hijo_de:[^\]]+\]/g, '').replace(/\[hijo\]/g, '').replace(/\[condominio\]/g, '').trim();
  if (!labelToSearch) return null;
  let found = todasLasActividades.find(a => a.label.toLowerCase() === labelToSearch);
  if (!found) {
    found = todasLasActividades.find(a => a.label.toLowerCase().includes(labelToSearch) || labelToSearch.includes(a.label.toLowerCase()));
  }
  if (!found) {
    const t = tokensActividad(labelToSearch);
    found = todasLasActividades.find(a => tokensEquivalentes(t, tokensActividad(a.label)));
  }
  return found || null;
};

/** Conjunto de todos los F.O. comerciales/industriales válidos de la ordenanza. */
const FACTORES_ORDENANZA = new Set<number>(
  todasLasActividades.flatMap((a: any) => (a.factores || []) as number[]).filter((f: number) => f > 0).map((f: number) => Math.round(f * 100) / 100)
);

/**
 * F.O. comercial REAL de un inmueble (Tabla "B" de la Ordenanza):
 *  1. Si la actividad está en la ordenanza → factor del nivel (si es 0, p.ej. terrenos → 1.98).
 *  2. Si no está, pero la tarifa guardada es un F.O. válido de la ordenanza → la guardada.
 *  3. Si no → 1.98 (tarifa mínima).
 */
export const resolverFOComercial = (actividadFull: string, mmvGuardado?: number | null): number => {
  const found = buscarActividadOrdenanza(actividadFull);
  if (found && found.factores) {
    const f = found.factores[nivelActividad(actividadFull)];
    return f && f > 0 ? f : 1.98;
  }
  const m = Number(mmvGuardado) || 0;
  if (m >= 1.54 && [...FACTORES_ORDENANZA].some(f => Math.abs(f - m) < 0.0005)) return m;
  return 1.98;
};

export const getFO = (actividadFull: string, esResidencial: boolean) => {
  const act = (actividadFull || "").toLowerCase().trim();
  
  if (esResidencial) {
    if (act.includes("quinta (zona a)") || act.includes("quinta (zona b)")) return 1.06;
    if (act.includes("apartamento (zona a)") || act.includes("apartamento (zona b)")) return 0.91;
    if (act.includes("casa (zona a)") || act.includes("casa (zona b)")) return 0.80;
    if (act.includes("casa (zona c)")) return 0.618;
    if (act.includes("apartamento (zona c)")) return 0.30;
    if (act.includes("casa (zona d)") || act.includes("apartamento (zona d)")) return 0.22;
    // Default fallback
    if (act.includes("apartamento") || act.includes("apto")) return 0.91;
    if (act.includes("quinta") || act.includes("villa") || act.includes("town house") || act.includes("townhouse")) return 1.06;
    return 0.80; // Default Casa
  }

  // Comercial: F.O. de la ordenanza según actividad y nivel (ALTA/MEDIA/BAJA)
  // Terrenos y Servicios con factor 0 en el array causan En Verificacion → 1.98
  return resolverFOComercial(actividadFull);
};

export const getFAR = (actividadFull: string) => {
  const act = (actividadFull || "").toLowerCase().trim();
  
  // Factor de Ajuste Residencial (FAR) según Tabla "A" de la Ordenanza Municipal de Naguanagua
  // ZONA A
  if (act.includes("zona a") || act.includes("(zona a)") || act.includes("(a)") || act.endsWith(" a")) {
    if (act.includes("apartamento") || act.includes("apto")) return 0.023723;
    if (act.includes("casa")) return 0.026985;
    return 0.020366; // Quinta (Zona A)
  }

  // ZONA B
  if (act.includes("zona b") || act.includes("(zona b)") || act.includes("(b)") || act.endsWith(" b")) {
    if (act.includes("apartamento") || act.includes("apto")) return 0.018985;
    if (act.includes("casa")) return 0.021595;
    return 0.016298; // Quinta (Zona B)
  }

  // ZONA C
  if (act.includes("zona c") || act.includes("(zona c)") || act.includes("(c)") || act.endsWith(" c")) {
    if (act.includes("apartamento") || act.includes("apto")) return 0.028839;
    return 0.014000; // Casa (Zona C)
  }

  // ZONA D
  if (act.includes("zona d") || act.includes("(zona d)") || act.includes("(d)") || act.endsWith(" d")) {
    return 0.026730; // Casa y/o Apartamento (Zona D)
  }

  // Fallbacks generales
  if (act.includes("apartamento") || act.includes("apto")) return 0.023723;
  if (act.includes("casa")) return 0.026985;
  return 0.020366;
};

export const calcularMensualidad = (
  clasificacionOrInm: any,
  actividadFull?: string | number,
  cant?: number,
  tasaBCV?: number,
  mmv_mes?: number,
  tipo?: string
) => {
  let clasificacion = '';
  let actividad = '';
  let cantidad = 1;
  let tasa = 0;
  let mmv: number | undefined = undefined;
  let esRes = false;

  if (typeof clasificacionOrInm === 'object' && clasificacionOrInm !== null) {
    const inm = clasificacionOrInm;
    clasificacion = inm.clasificacion || inm.Clasificacion || '';
    actividad = inm.actividad_principal || inm.actividad || '';
    cantidad = parseInt(String(inm.cant_inmuebles || inm['Cant Inmuebles'] || 1));
    tasa = typeof actividadFull === 'number' ? actividadFull : (tasaBCV || 0);
    mmv = inm.mmv_mes ? parseFloat(String(inm.mmv_mes)) : undefined;
    esRes = isResidencialInm(inm);
  } else {
    clasificacion = String(clasificacionOrInm || '');
    actividad = String(actividadFull || '');
    cantidad = cant || 1;
    tasa = tasaBCV || 0;
    mmv = mmv_mes;
    esRes = isResidencialInm({ tipo, clasificacion, actividad_principal: actividad });
  }

  let fo = 1.98;
  if (esRes) {
    // Residencial: F.O. oficial según Tabla "A" (rango 0.22 a 1.06)
    // Si mmv en BD es menor a 0.22 (residuo corrupto como 0.021588) o mayor a 1.50, se calcula con getFO oficial
    if (mmv !== undefined && mmv >= 0.22 && mmv <= 1.50) {
      fo = mmv;
    } else {
      fo = getFO(actividad, true);
    }
  } else {
    // Comercial / Industrial / Institucional:
    // DECISIÓN DEL MUNICIPIO: se cobra SIEMPRE la tarifa guardada en el inmueble (mmv_mes),
    // para que el sistema nunca cambie la tarifa de un usuario por el texto de la actividad.
    // La tarifa guardada fue normalizada al F.O. real de la ordenanza (resolverFOComercial).
    // Solo si no hay tarifa válida guardada (< 1.54, no existe F.O. comercial menor) se resuelve por ordenanza.
    if (mmv !== undefined && mmv >= 1.54) {
      fo = mmv;
    } else {
      fo = resolverFOComercial(actividad, mmv);
    }
  }

  const far = esRes ? getFAR(actividad) : 0.1280; // FAC = 0.1280 para Comercial/Industrial

  // Fórmulas oficiales Art. 61 de la Ordenanza Municipal de Naguanagua:
  // Residencial: TR = F.O. * 57 * TasaBCV * FAR
  // Comercial:   TC = F.O. * 57 * TasaBCV * FAC (FAC = 0.1280)
  let baseCalculada = 0;
  if (esRes) {
    baseCalculada = fo * 57 * tasa * far;
  } else {
    baseCalculada = fo * 57 * tasa * 0.1280;
  }

  // Multiplicamos por la cantidad de inmuebles
  return baseCalculada * Math.max(1, cantidad);
};

/**
 * Condominios especiales donde los usuarios pueden pagar de forma individual
 * tanto sus meses de aseo como sus multas, a pesar de pertenecer a condominios comerciales:
 * - URB014903: CONDOMINIO CENTRO CRISTAL
 * - URB030783: CONDOMINIO CHIRIKAYEN
 * - URB029866: CONDOMINIO HOSPITAL METROPOLITANO DEL NORTE
 * - URB015503: CENTRO CIENTIFICO METROPOLITANO DEL NORTE
 */
export const CONDOMINIOS_PAGO_INDIVIDUAL = [
  'URB014903',
  'URB030783',
  'URB029866',
  'URB015503'
];

export const isCondominioPagoIndividual = (itemOrCode: any): boolean => {
  if (!itemOrCode) return false;
  let code = '';
  if (typeof itemOrCode === 'string') {
    code = itemOrCode;
  } else {
    code = itemOrCode.condominio_padre_id || itemOrCode.inmueble || itemOrCode.cod_cont || '';
  }
  const cleanCode = code.trim().toUpperCase();
  return CONDOMINIOS_PAGO_INDIVIDUAL.includes(cleanCode);
};

/**
 * Determina si las multas están totalmente exoneradas para un inmueble.
 */
export const isExoneradoTotalMultas = (notas?: string | null): boolean => {
  if (!notas) return false;
  const upper = notas.toUpperCase();
  return (
    upper.includes('CASO ESPECIAL: EXONERADO') ||
    upper.includes('EXONERADO SEGUN GACETA') ||
    upper.includes('EXONERADO SEGUN ORDENANZA') ||
    upper.includes('EXONERACION TOTAL') ||
    upper.includes('EXONERADO TOTAL') ||
    upper.includes('SIN MULTAS') ||
    upper.includes('SIN MULTA')
  );
};

/**
 * Determina si la multa de un mes específico (YYYY-MM o Date) está exonerada.
 */
export const isMesExoneradoMulta = (notas?: string | null, dateOrMonthKey?: string | Date | null): boolean => {
  if (!notas) return false;
  if (isExoneradoTotalMultas(notas)) return true;
  if (!dateOrMonthKey) return false;

  let key = '';
  if (dateOrMonthKey instanceof Date) {
    const y = dateOrMonthKey.getFullYear();
    const m = String(dateOrMonthKey.getMonth() + 1).padStart(2, '0');
    key = `${y}-${m}`;
  } else if (typeof dateOrMonthKey === 'string') {
    const match = dateOrMonthKey.match(/(\d{4})-(\d{2})/);
    if (match) {
      key = `${match[1]}-${match[2]}`;
    } else {
      const d = new Date(dateOrMonthKey);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        key = `${y}-${m}`;
      } else {
        key = dateOrMonthKey;
      }
    }
  }

  if (!key) return false;
  return (notas.toUpperCase()).includes(`[EXONERADO:${key}]`);
};

/**
 * Cuenta la cantidad de meses individuales que han sido exonerados con tag [EXONERADO:YYYY-MM].
 */
export const getMesesExoneradosCount = (notas?: string | null): number => {
  if (!notas) return 0;
  const matches = (notas.toUpperCase()).match(/\[EXONERADO:\d{4}-\d{2}\]/g);
  return matches ? matches.length : 0;
};

/**
 * Limpia y normaliza la descripción de una actividad o inmueble para Estados de Cuenta:
 * Elimina completamente clasificaciones como (ALTA), (MEDIA), (BAJA), zonas (ZONA A, B, C, D),
 * sufijos como CASA A, B y términos de "Residencial" / "Comercial".
 */
export const cleanClasificacionActividad = (str?: string | null): string => {
  if (!str) return '';
  let cleaned = str
    // Quitar tags entre corchetes tipo [hijo_de:...] o [condominio] o [hijo]
    .replace(/\[[^\]]+\]/g, '')
    // Quitar zonas entre paréntesis: (ZONA A), (ZONA B), (ZONA C), (ZONA D), (ZONA 1), (A), (B), (C), (D)
    .replace(/\s*\((ZONA\s+[A-Z0-9]+|[A-D])\)/gi, '')
    // Quitar niveles entre paréntesis: (ALTA), (MEDIA), (BAJA), (RESIDENCIAL), (COMERCIAL)
    .replace(/\s*\((ALTA|MEDIA|BAJA|RESIDENCIAL|COMERCIAL)\)/gi, '')
    // Quitar palabras de nivel si van con guión o sueltas: - ALTA, - MEDIA, - BAJA
    .replace(/\s*-\s*(ALTA|MEDIA|BAJA)\b/gi, '')
    .replace(/\b(ALTA|MEDIA|BAJA)\b/gi, '')
    // Quitar ZONA A, ZONA B, ZONA C, ZONA D aunque no tengan paréntesis: "CASA ZONA A", "QUINTA ZONA B"
    .replace(/\bZONA\s+[A-D]\b/gi, '')
    // Quitar sufijos tipo "CASA A", "CASA B", "QUINTA A", "APARTAMENTO B", "TOWNHOUSE C"
    .replace(/\b(CASA|QUINTA|APARTAMENTO|TOWNHOUSE)\s+([A-D])\b/gi, '$1')
    .replace(/\s+-\s+[A-D]\b/gi, '')
    // Quitar términos de tipo/uso: "USO RESIDENCIAL", "USO COMERCIAL", "LOCAL COMERCIAL", "ACTIVIDAD COMERCIAL", "INMUEBLE RESIDENCIAL"
    .replace(/\b(USO\s+RESIDENCIAL|USO\s+COMERCIAL|ACTIVIDAD\s+COMERCIAL|LOCAL\s+COMERCIAL|INMUEBLE\s+RESIDENCIAL)\b/gi, '')
    // Quitar palabras sueltas RESIDENCIAL, RESIDENCIALES, COMERCIAL, COMERCIALES
    .replace(/\b(RESIDENCIALES|RESIDENCIAL|COMERCIALES|COMERCIAL)\b/gi, '')
    // Limpiar espacios dobles y signos residuales al inicio/fin
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-\s,./]+|[-\s,./]+$/g, '')
    .trim();

  return cleaned || 'Servicio de Aseo Urbano';
};

