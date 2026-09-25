/**
 * Servicio de Contribuyentes — Búsqueda y resolución de datos de contribuyentes.
 * 
 * Centraliza la lógica de búsqueda que antes vivía inline en caja/page.tsx
 * y contribuyentes/page.tsx.
 */

import type { Contribuyente, Inmueble } from '@/types';

/**
 * Busca un contribuyente en la lista local por identidad, código o nombre.
 */
export function buscarContribuyenteLocal(
  contribuyentes: Contribuyente[],
  docType: string,
  docNumber: string
): Contribuyente | undefined {
  const idLimpioSearch = docNumber.replace(/-/g, '').toUpperCase();
  const cleanFullDoc = `${docType}${idLimpioSearch}`;

  return contribuyentes.find((c) => {
    if (!c.Identidad) return false;
    const idClean = String(c.Identidad).replace(/-/g, '').toUpperCase();
    const codMatch = c.CodCont && c.CodCont.toUpperCase() === docNumber.toUpperCase();
    const codContMatch = c.cod_cont && c.cod_cont.toUpperCase() === docNumber.toUpperCase();
    const nombreMatch = c.Contribuyente && c.Contribuyente.toUpperCase().includes(docNumber.toUpperCase());
    return idClean === cleanFullDoc || idClean === idLimpioSearch || codMatch || codContMatch || nombreMatch;
  });
}

/**
 * Normaliza una identidad para comparación (quita guiones, mayúsculas).
 */
export function normalizarIdentidad(identidad: string): string {
  return (identidad || '').replace(/-/g, '').toUpperCase();
}

/**
 * Filtra los inmuebles que pertenecen a un contribuyente.
 */
export function getInmueblesContribuyente(
  inmuebles: Inmueble[],
  identidad: string
): Inmueble[] {
  const idNorm = normalizarIdentidad(identidad);
  return inmuebles.filter((i) =>
    normalizarIdentidad(i.identidad) === idNorm
  );
}

/**
 * Determina si un contribuyente es comercial basándose en su identidad y propiedades.
 */
export function esComercial(
  identidad: string,
  inmuebles: Inmueble[]
): boolean {
  const userInms = getInmueblesContribuyente(inmuebles, identidad);
  
  // Verificar por tipo de inmueble
  const tieneInmComercial = userInms.some(p => 
    (p.tipo || '').toLowerCase().includes('comercial') || 
    (p.tipo || '').toLowerCase().includes('industrial') ||
    (p.actividad_principal || '').toLowerCase().includes('comercial') ||
    (p.actividad_principal || '').toLowerCase().includes('industrial')
  );
  
  if (tieneInmComercial) return true;
  
  // Fallback: identidad J o G = comercial
  const idNorm = normalizarIdentidad(identidad);
  if (idNorm.startsWith('J') || idNorm.startsWith('G')) return true;
  
  return false;
}

/**
 * Calcula el saldo a favor total de un contribuyente.
 */
export function calcularSaldoFavor(
  inmuebles: Inmueble[],
  identidad: string
): number {
  const userInms = getInmueblesContribuyente(inmuebles, identidad);
  return userInms.reduce((sum, i) => sum + (parseFloat(String(i.saldo_favor_bs || '0')) || 0), 0);
}
