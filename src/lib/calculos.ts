import { ordenanzaData } from '@/data/ordenanza';

const todasLasActividades = [...ordenanzaData.actividadesComerciales, ...(ordenanzaData.actividadesIndustriales || [])];

export const getFO = (actividadFull: string, esResidencial: boolean) => {
  const act = (actividadFull || "").toLowerCase().trim();
  
  if (esResidencial) {
    if (act.includes("quinta (a)") || act.includes("quinta (b)")) return 1.06;
    if (act.includes("apartamento (a)") || act.includes("apartamento (b)")) return 0.91;
    if (act.includes("casa (c)")) return 0.618;
    if (act.includes("apartamento (c)")) return 0.3;
    if (act.includes("casa (d)")) return 0.22;
    // Default fallback
    if (act.includes("apartamento")) return 0.91;
    if (act.includes("quinta") || act.includes("villa") || act.includes("town house")) return 1.06;
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
  if (act.includes("quinta (a)")) return 0.020366;
  if (act.includes("apartamento (a)")) return 0.023723;
  if (act.includes("quinta (b)")) return 0.016298;
  if (act.includes("apartamento (b)")) return 0.018985;
  if (act.includes("casa (c)")) return 0.014;
  if (act.includes("apartamento (c)")) return 0.028839;
  if (act.includes("casa (d)")) return 0.02673;
  return 0.02673;
};

export const calcularMensualidad = (
  clasificacion: string,
  actividadFull: string,
  cant: number,
  tasaBCV: number
) => {
  const esRes = (clasificacion || '').toLowerCase().includes('residencial');
  const fo = getFO(actividadFull, esRes);
  const far = esRes ? getFAR(actividadFull) : 1; // FAR only applies to Residencial
  
  // Formulas
  // Residencial: F.O. * 57 * TasaBCV * FAR
  // Comercial:   F.O. * TasaBCV * 0.1280 (1 UCD = 1 EURO = TasaBCV)
  
  let baseCalculada = 0;
  if (esRes) {
    baseCalculada = fo * 57 * tasaBCV * far;
  } else {
    baseCalculada = fo * tasaBCV * 0.1280;
  }
  
  // Multiplicamos por la cantidad de inmuebles
  return (baseCalculada * Math.max(1, cant));
};
