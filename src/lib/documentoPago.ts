import { isResidencialInm } from './calculos';

/**
 * Clasificación del documento que corresponde a un pago de caja:
 *  - FACTURA fiscal (TFHKA): TODO pago de un inmueble COMERCIAL (servicio de aseo y/o multas),
 *    incluido el local de un condominio comercial que solo paga su multa.
 *  - RECIBO (correo, no fiscal): SOLO residenciales.
 */
export type TipoDocumentoPago = 'factura' | 'recibo';

export interface ClasificacionPago {
  documento: TipoDocumentoPago;
  /** Factura comercial (servicio) / Factura de multa comercial / Recibo residencial */
  subtipo: 'factura_comercial' | 'factura_multa_comercial' | 'recibo_residencial';
  /** Pago con inmuebles residenciales y comerciales a la vez (va a factura; la factura solo toma la porción comercial) */
  mixto: boolean;
  inmuebles: string[];
  mesesServicio: number;
  tieneMulta: boolean;
}

/** Extrae el código de inmueble de una referencia de recibo (RECIB-HIST-COD-M1, MULTA-COD, CM-COD-PERIODO). */
export function extraerCodigoInmueble(ref: string): string | null {
  const s = String(ref || '').trim().toUpperCase();
  let m = s.match(/^RECIB-HIST-(.+)-M\d+$/);
  if (m) return m[1];
  m = s.match(/^MULTA-(.+?)(?:-M\d+)?$/);
  if (m) return m[1];
  m = s.match(/^CM-(?:C-)?([A-Z]+\d+)-/);
  if (m) return m[1];
  m = s.match(/^CONDO-(.+?)(?:-\d+)?$/);
  if (m) return m[1];
  return null;
}

export function parseDetalles(det: any): any {
  if (typeof det === 'string') {
    try { return JSON.parse(det) || {}; } catch { return {}; }
  }
  return det || {};
}

/**
 * @param recibos referencias pagadas (detalles.recibos)
 * @param inmMap  mapa código → inmueble (tipo, clasificacion, actividad_principal)
 * @param det     detalles del pago (para heurística de IVA cuando no hay código)
 */
export function clasificarPago(recibos: string[], inmMap: Map<string, any>, det: any = {}): ClasificacionPago {
  // Caja de Condominios: se clasifica por los renglones guardados en el pago (cada local / actividad)
  const lineasCondo: any[] | null = det?.modulo === 'condominios' && Array.isArray(det?.condominio?.lineas) ? det.condominio.lineas : null;
  if (lineasCondo) {
    const com = lineasCondo.filter(l => !l.residencial);
    const servicio = com.some(l => (Number(l.aseoBs) || 0) > 0);
    const multa = com.some(l => (Number(l.multaBs) || 0) > 0);
    const comercial = servicio || multa;
    return {
      documento: comercial ? 'factura' : 'recibo',
      subtipo: servicio ? 'factura_comercial' : multa ? 'factura_multa_comercial' : 'recibo_residencial',
      mixto: comercial && lineasCondo.some(l => l.residencial),
      inmuebles: [...new Set(lineasCondo.map(l => l.inmueble).filter(Boolean))] as string[],
      mesesServicio: Math.max(0, ...lineasCondo.map(l => Number(l.meses) || 0)),
      tieneMulta: lineasCondo.some(l => (Number(l.multaBs) || 0) > 0),
    };
  }
  let servicioComercial = false;
  let multaComercial = false;
  let residencial = false;
  let desconocido = false;
  let mesesServicio = 0;
  let tieneMulta = false;
  const inmuebles = new Set<string>();
  const mesesPorInmueble: Record<string, number> = {};

  for (const r of recibos || []) {
    const ref = String(r || '');
    const esMulta = /^MULTA-/i.test(ref);
    if (esMulta) tieneMulta = true;

    const mMatch = ref.match(/^(?:RECIB-HIST|CM)-([A-Za-z0-9]+)-M(\d+)$/i);
    if (mMatch) {
      const c = mMatch[1].toUpperCase();
      const idx = parseInt(mMatch[2], 10) || 1;
      mesesPorInmueble[c] = Math.max(mesesPorInmueble[c] || 0, idx);
    } else if (/^(RECIB-HIST|CM)-/i.test(ref)) {
      const c = extraerCodigoInmueble(ref) || 'GEN';
      mesesPorInmueble[c] = (mesesPorInmueble[c] || 0) + 1;
    }

    const cod = extraerCodigoInmueble(ref);
    if (cod) inmuebles.add(cod);
    const inm = cod ? inmMap.get(cod) : null;
    if (!inm) { desconocido = true; continue; }

    if (isResidencialInm(inm)) residencial = true;
    else if (esMulta) multaComercial = true;
    else servicioComercial = true;
  }

  const valoresMeses = Object.values(mesesPorInmueble);
  if (valoresMeses.length > 0) {
    mesesServicio = Math.max(...valoresMeses);
  }

  // Referencias sin inmueble identificable: si caja cobró IVA, es servicio comercial.
  if (!servicioComercial && desconocido && (parseFloat(String(det?.iva_percent || 0)) || 0) > 0) {
    servicioComercial = true;
  }

  const comercial = servicioComercial || multaComercial;
  const documento: TipoDocumentoPago = comercial ? 'factura' : 'recibo';
  const subtipo = servicioComercial
    ? 'factura_comercial'
    : (multaComercial ? 'factura_multa_comercial' : 'recibo_residencial');

  return {
    documento,
    subtipo,
    mixto: comercial && residencial,
    inmuebles: [...inmuebles],
    mesesServicio,
    tieneMulta,
  };
}

/** Rango UTC de un día calendario en hora de Venezuela (UTC-4). */
export function rangoDiaCaracas(fecha: string): { desde: string; hasta: string } {
  const inicio = new Date(`${fecha}T00:00:00-04:00`);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}
