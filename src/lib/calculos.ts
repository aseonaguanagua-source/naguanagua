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

  // Comercial
  // Parse something like "AREPERAS (ALTA)"
  let labelToSearch = act.replace(/\(alta\)|\(media\)|\(baja\)/g, '').replace(/\[hijo_de:[^\]]+\]/g, '').replace(/\[hijo\]/g, '').replace(/\[condominio\]/g, '').trim();
  let nivel = 'BAJA'; // Default
  if (act.includes('(alta)')) nivel = 'ALTA';
  if (act.includes('(media)')) nivel = 'MEDIA';
  
  let found = todasLasActividades.find(a => a.label.toLowerCase() === labelToSearch);
  if (!found) {
    found = todasLasActividades.find(a => a.label.toLowerCase().includes(labelToSearch) || labelToSearch.includes(a.label.toLowerCase()));
  }
  
  if (found && found.factores) {
    const idx = nivel === 'BAJA' ? 0 : (nivel === 'MEDIA' ? 1 : 2);
    // Terrenos y Servicios con factor 0 en el array causan En Verificacion
    if (found.factores[idx] === 0) return 1.98;
    return found.factores[idx] || 1.98;
  }
  
  return 1.98; // Default fallback for Comercial (matches lowest common rate) to prevent 0 division/verification loops
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
    // Todos los Factores de Ordenanza F.O. según Tabla "B" de la Ordenanza Municipal de Naguanagua
    // deben resolverse prioritariamente mediante getFO(actividad, false).
    // Si mmv en BD es 1.00 (valor dummy residual de importación) o < 1.54 (no existe F.O. comercial menor a 1.54),
    // se aplica el F.O. oficial de la Ordenanza (ej: Depósitos Alta = 22.49).
    const foOficial = getFO(actividad, false);
    if (foOficial && foOficial > 1.00) {
      fo = foOficial;
    } else if (mmv !== undefined && mmv > 1.00) {
      fo = mmv;
    } else {
      fo = 1.98;
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
