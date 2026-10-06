'use client';
/**
 * Reconocer pagos de condominios (para Conciliación Bancaria y Facturación Electrónica).
 *
 * Un pago es de condominio si:
 *  - se registró en la Caja de Condominios (`modulo = 'condominios'`), o
 *  - viene marcado como condominio en sus detalles (pagos viejos de la Caja normal), o
 *  - la cédula/RIF del pago es la de un condominio.
 *
 * A quién va la factura digital:
 *  - pagó el condominio completo → al condominio;
 *  - pagó cada contribuyente/local por separado → a cada dueño (una fila por dueño, mismo `grupo_pago`).
 */
import { useEffect, useState } from 'react';

export type CondoLigero = { codigo: string; identidad: string; nombre: string; tipo: string };
export type FiltroModulo = 'Todos' | 'Contribuyentes' | 'Condominios' | 'Condominios residenciales' | 'Condominios comerciales';
export const FILTROS_MODULO: FiltroModulo[] = ['Todos', 'Contribuyentes', 'Condominios', 'Condominios residenciales', 'Condominios comerciales'];

export const normId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const det = (raw: any) => { if (!raw) return {}; if (typeof raw === 'object') return raw; try { return JSON.parse(raw); } catch { return {}; } };

/** Carga (una vez) la lista ligera de condominios, indexada por RIF normalizado. */
let cache: Promise<Map<string, CondoLigero>> | null = null;
export function cargarCondominiosLigero(): Promise<Map<string, CondoLigero>> {
  if (!cache) cache = fetch('/api/admin/condominios?ligero=1').then(r => r.json()).then(j => {
    const m = new Map<string, CondoLigero>();
    (j.condominios || []).forEach((c: CondoLigero) => { if (c.identidad) m.set(normId(c.identidad), c); });
    return m;
  }).catch(() => { cache = null; return new Map(); });
  return cache;
}
export function useCondominiosLigero() {
  const [mapa, setMapa] = useState<Map<string, CondoLigero>>(new Map());
  useEffect(() => { cargarCondominiosLigero().then(setMapa); }, []);
  return mapa;
}

export interface InfoCondominioPago {
  codigo: string | null;
  nombre: string;
  tipo: string | null;
  residencial: boolean | null;
  /** A quién va la factura digital */
  facturaA: 'CONDOMINIO' | 'CONTRIBUYENTE';
  /** Pago repartido entre varios dueños */
  grupo: { id: string; parte: number; partes: number; montoTotal: number; referencia: string } | null;
  /** Locales/unidades que cubre */
  lineas: { inmueble: string | null; numero: string | null; actividad: string | null; totalBs: number }[];
}

/** Devuelve la información de condominio de un pago, o null si es un pago normal de Contribuyentes. */
export function infoCondominioPago(p: any, mapa: Map<string, CondoLigero>): InfoCondominioPago | null {
  const d: any = det(p?.detalles);
  const porRif = mapa.get(normId(p?.identidad));
  const esModulo = p?.modulo === 'condominios' || d.modulo === 'condominios';
  const marcado = d.isCondominio === true || d.es_condominio === true;
  if (!esModulo && !marcado && !porRif) return null;
  const c = d.condominio || {};
  const tipo = c.tipo || porRif?.tipo || null;
  const g = d.grupo_pago;
  return {
    codigo: c.codigo || porRif?.codigo || d.cod_inmueble || null,
    nombre: c.nombre || porRif?.nombre || d.contribuyente || 'Condominio',
    tipo, residencial: tipo ? String(tipo).toUpperCase() === 'RESIDENCIAL' : null,
    facturaA: d.modo === 'CONTRIBUYENTE' ? 'CONTRIBUYENTE' : 'CONDOMINIO',
    grupo: g ? { id: g.id || p.grupo_pago, parte: g.parte, partes: g.partes, montoTotal: Number(g.monto_total) || 0, referencia: g.referencia } : null,
    lineas: Array.isArray(c.lineas) ? c.lineas : [],
  };
}

/** ¿El pago pasa el filtro de módulo? */
export function pasaFiltroModulo(p: any, filtro: FiltroModulo, mapa: Map<string, CondoLigero>): boolean {
  if (filtro === 'Todos') return true;
  const info = infoCondominioPago(p, mapa);
  if (filtro === 'Contribuyentes') return !info;
  if (!info) return false;
  if (filtro === 'Condominios residenciales') return info.residencial === true;
  if (filtro === 'Condominios comerciales') return info.residencial === false;
  return true;
}

/** Filtro PostgREST `.or(...)`: pagos del módulo o marcados como condominio en sus detalles. */
export const OR_CONDOMINIOS = 'modulo.eq.condominios,detalles->>isCondominio.eq.true,detalles->>es_condominio.eq.true';

/** RIFs de los condominios en las formas en que pueden venir en un pago (con y sin guion). Para consultar en lotes. */
export function rifsCondominios(mapa: Map<string, CondoLigero>): string[] {
  const rifs = new Set<string>();
  for (const c of mapa.values()) {
    const raw = String(c.identidad || '').toUpperCase().trim();
    const n = normId(raw);
    if (!n) continue;
    rifs.add(raw); rifs.add(n);
    if (/^[A-Z]\d+$/.test(n)) rifs.add(`${n[0]}-${n.slice(1)}`);
  }
  return [...rifs].filter(x => !/[",()]/.test(x));
}
