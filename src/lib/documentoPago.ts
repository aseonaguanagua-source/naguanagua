import { isResidencialInm } from './calculos';

/**
 * Clasificación del documento que corresponde a un pago de caja:
 *  - FACTURA fiscal (TFHKA): el pago incluye servicio de aseo de un inmueble COMERCIAL.
 *  - RECIBO (correo, no fiscal): residenciales, o comerciales que solo pagaron MULTA.
 */
export type TipoDocumentoPago = 'factura' | 'recibo';

export interface ClasificacionPago {
  documento: TipoDocumentoPago;
  /** Recibo residencial / Recibo multa comercial / Factura comercial */
  subtipo: 'factura_comercial' | 'recibo_residencial' | 'recibo_multa_comercial';
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
  let servicioComercial = false;
  let multaComercial = false;
  let residencial = false;
  let desconocido = false;
  let mesesServicio = 0;
  let tieneMulta = false;
  const inmuebles = new Set<string>();

  for (const r of recibos || []) {
    const ref = String(r || '');
    const esMulta = /^MULTA-/i.test(ref);
    if (esMulta) tieneMulta = true;
    else if (/^(RECIB-HIST|CM)-/i.test(ref)) mesesServicio++;

    const cod = extraerCodigoInmueble(ref);
    if (cod) inmuebles.add(cod);
    const inm = cod ? inmMap.get(cod) : null;
    if (!inm) { desconocido = true; continue; }

    if (isResidencialInm(inm)) residencial = true;
    else if (esMulta) multaComercial = true;
    else servicioComercial = true;
  }

  // Referencias sin inmueble identificable: si caja cobró IVA, es servicio comercial.
  if (!servicioComercial && desconocido && (parseFloat(String(det?.iva_percent || 0)) || 0) > 0) {
    servicioComercial = true;
  }

  const documento: TipoDocumentoPago = servicioComercial ? 'factura' : 'recibo';
  const subtipo = servicioComercial
    ? 'factura_comercial'
    : (multaComercial && !residencial ? 'recibo_multa_comercial' : 'recibo_residencial');

  return {
    documento,
    subtipo,
    mixto: servicioComercial && residencial,
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
