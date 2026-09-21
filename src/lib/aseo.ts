// src/lib/aseo.ts

export type TipoUsuario = 'residencial' | 'comercial' | 'industrial' | 'institucional';
export type ClasificadorResidencial = 'I' | 'II' | 'III' | 'IV';
export type NivelArea = 'I' | 'II' | 'III' | 'IV';

// TABLA 1: Tarifas Residenciales (en TCMMV-BCV)
export const TARIFAS_RESIDENCIALES: Record<ClasificadorResidencial, number> = {
  'I': 0.50, // Viviendas en zonas populares
  'II': 3.00, // Apartamentos
  'III': 2.50, // Casas
  'IV': 5.00, // Penthouse, Town House, Quintas, Villas
};

// TABLA 2: Tarifas Comerciales, Institucionales e Industriales (Ejemplo)
// La estructura es { 'Actividad': { 'I': tarifa, 'II': tarifa, 'III': tarifa, 'IV': tarifa } }
export const TARIFAS_COMERCIALES: Record<string, Record<NivelArea, number>> = {
  'Academias varias Privadas': { 'I': 10.00, 'II': 15.00, 'III': 20.00, 'IV': 50.00 },
  'Colegios Privados': { 'I': 20.00, 'II': 30.00, 'III': 40.00, 'IV': 150.00 },
  'Centro comercial': { 'I': 228.00, 'II': 400.00, 'III': 500.00, 'IV': 800.00 },
  'Clínica': { 'I': 50.00, 'II': 60.00, 'III': 100.00, 'IV': 150.00 },
  'Automercado (Hipermercado)': { 'I': 50.00, 'II': 150.00, 'III': 300.00, 'IV': 700.00 },
  'Supermercados y Bodegones': { 'I': 30.00, 'II': 70.00, 'III': 120.00, 'IV': 180.00 },
  'Bar-restaurant': { 'I': 30.00, 'II': 50.00, 'III': 80.00, 'IV': 150.00 },
  // ... más actividades pueden ser añadidas
  'default': { 'I': 10.00, 'II': 15.00, 'III': 20.00, 'IV': 50.00 }
};

export interface DeudaMensual {
  mes: number; // 1-12
  anio: number; // Ej: 2023, 2024, 2025
  capitalFacturado_TCMMV: number;
  multas_TCMMV: number;
  intereses_TCMMV: number;
}

export interface ResultadoSaneamiento {
  capitalOriginal: number;
  capitalSaneado: number;
  multasOriginales: number;
  multasSaneadas: number;
  interesesOriginales: number;
  interesesSaneados: number;
  totalOriginal: number;
  totalSaneado: number;
}

/**
 * Calcula la deuda saneada aplicando los decretos de exoneración (Gacetas 19, 23 y 31).
 */
export function calcularDeudaSaneada(
  tipoUsuario: TipoUsuario,
  deudasMensuales: DeudaMensual[],
  tcmmvActual: number,
  esConjuntoResidencial: boolean = false
): ResultadoSaneamiento {
  let res: ResultadoSaneamiento = {
    capitalOriginal: 0,
    capitalSaneado: 0,
    multasOriginales: 0,
    multasSaneadas: 0,
    interesesOriginales: 0,
    interesesSaneados: 0,
    totalOriginal: 0,
    totalSaneado: 0,
  };

  for (const deuda of deudasMensuales) {
    const capitalBs = deuda.capitalFacturado_TCMMV * tcmmvActual;
    const multasBs = deuda.multas_TCMMV * tcmmvActual;
    const interesesBs = deuda.intereses_TCMMV * tcmmvActual;

    res.capitalOriginal += capitalBs;
    res.multasOriginales += multasBs;
    res.interesesOriginales += interesesBs;

    // DECRETO 005 (Gaceta 23): Condonación 100% de capital, multas e intereses hasta 31/12/2023
    if (deuda.anio <= 2023) {
      // Todo saneado = 0
      continue;
    }

    // DECRETO 006 (Gaceta 23) y 002 (Gaceta 19): Condonación 100% multas e intereses 2024 y 2025
    if (deuda.anio === 2024 || deuda.anio === 2025 || deuda.anio === 2026) {
      // Multas e intereses saneados = 0
    } else {
      res.multasSaneadas += multasBs;
      res.interesesSaneados += interesesBs;
    }

    // DECRETO 004 y 007 (Descuento del 50% al Capital Principal)
    let capitalAplicable = capitalBs;

    if (esConjuntoResidencial && (deuda.anio === 2024 || deuda.anio === 2025)) {
      // Decreto 004: 50% de descuento a conjuntos residenciales (Ene 2024 - Dic 2025)
      capitalAplicable = capitalBs * 0.50;
    } else if (
      (tipoUsuario === 'comercial' || tipoUsuario === 'industrial') && 
      (deuda.anio === 2024 || deuda.anio === 2025 || (deuda.anio === 2026 && deuda.mes === 1))
    ) {
      // Decreto 007: 50% de descuento a comercios e industrias (Ene 2024 - Ene 2026)
      capitalAplicable = capitalBs * 0.50;
    }

    res.capitalSaneado += capitalAplicable;
  }

  res.totalOriginal = res.capitalOriginal + res.multasOriginales + res.interesesOriginales;
  res.totalSaneado = res.capitalSaneado + res.multasSaneadas + res.interesesSaneados;

  return res;
}
