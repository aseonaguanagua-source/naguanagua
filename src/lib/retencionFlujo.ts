import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient, DEFAULT_RESEND_FROM } from '@/lib/emailClient';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { isFictitiousEmail } from '@/lib/formatters';

/**
 * FLUJO DE PAGOS CON RETENCIÓN DE IVA (agentes de retención, 75%)
 *
 *  1. Caja cobra con retención  → detalles.monto_retencion_iva > 0
 *  2. Se emite la factura en TFHKA SIN enviarla al contribuyente     → retencion.estado = 'esperando_planilla'
 *     y se le envían por correo SOLO los datos de la factura para que llene su planilla.
 *  3. El contribuyente sube la planilla en Soy Contribuyente → Retenciones → retencion.estado = 'planilla_recibida'
 *  4. Hacienda verifica:  Aprobar → se envía la factura por correo  → retencion.estado = 'aprobada'
 *                         Rechazar → se avisa y puede subirla de nuevo → retencion.estado = 'rechazada'
 *
 * El estado vive en pagos_reportados.detalles.factura_digital.retencion
 */

export type EstadoRetencion = 'esperando_planilla' | 'planilla_recibida' | 'aprobada' | 'rechazada';

export interface RetencionPago {
  estado: EstadoRetencion;
  base: number;
  iva: number;
  retenido: number;
  total: number;
  /** total - retenido (lo que efectivamente pagó en caja) */
  pagado: number;
  retencion_id?: string;
  datos_enviados_at?: string;
  datos_enviados_a?: string;
  planilla_recibida_at?: string;
  revisado_at?: string;
  revisado_por?: string;
  motivo_rechazo?: string;
  factura_enviada_at?: string;
  factura_enviada_a?: string;
}

export const PORC_RETENCION = 0.75;
export const RIF_IAMEC = 'G-20000147-3';
export const NOMBRE_IAMEC = 'Instituto Autónomo Municipal de Ecosocialismo Naguanagua (IAMEC)';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export const parseDet = (d: any): any => {
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
  return d;
};

export const pagoTieneRetencion = (det: any): boolean => (parseFloat(String(det?.monto_retencion_iva || 0)) || 0) > 0;

/** Correo real del contribuyente (null si no tiene o es ficticio / comodín). */
export async function correoContribuyente(identidad: string, det?: any): Promise<string | null> {
  const fallback = TheFactoryHKA.getFallbackEmail().toLowerCase();
  const backup = TheFactoryHKA.getBackupEmail().toLowerCase();
  const { data: cont } = await supabase.from('contribuyentes').select('email').eq('identidad', identidad).maybeSingle();
  let cand = String(cont?.email || det?.correo || '').trim().toLowerCase();
  if (!cand) {
    const { data: inm } = await supabase.from('inmuebles').select('correo_electronico').eq('identidad', identidad).not('correo_electronico', 'is', null).limit(1).maybeSingle();
    cand = String(inm?.correo_electronico || '').trim().toLowerCase();
  }
  if (!cand || !cand.includes('@') || isFictitiousEmail(cand) || cand === fallback || cand === backup) return null;
  return cand;
}

function marco(titulo: string, subtitulo: string, cuerpo: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(titulo)} - IAMEC Naguanagua</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:30px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;border:1px solid #e2e8f0;">
<tr><td style="background:linear-gradient(135deg,#092617 0%,#11422b 100%);padding:24px;text-align:center;border-bottom:3px solid #b8cd29;">
<div style="color:#b8cd29;font-size:11px;font-weight:bold;letter-spacing:2px;">ALCALDÍA BOLIVARIANA DE NAGUANAGUA &bull; IAMEC</div>
<h1 style="margin:6px 0 0;color:#ffffff;font-size:18px;">${esc(titulo)}</h1>
<p style="margin:6px 0 0;color:#dcfce7;font-size:12px;">${esc(subtitulo)}</p></td></tr>
<tr><td style="padding:28px;">${cuerpo}</td></tr>
<tr><td style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
${esc(NOMBRE_IAMEC)} &bull; R.I.F. ${RIF_IAMEC}<br>Naguanagua, Estado Carabobo</td></tr>
</table></td></tr></table></body></html>`;
}

const fila = (k: string, v: string, fuerte = false) =>
  `<tr><td style="padding:7px 10px;color:#64748b;border-bottom:1px solid #e2e8f0;">${esc(k)}</td><td style="padding:7px 10px;text-align:right;color:#0f172a;border-bottom:1px solid #e2e8f0;${fuerte ? 'font-weight:bold;' : ''}">${v}</td></tr>`;

export function htmlDatosFactura(p: {
  contribuyente: string; identidad: string; numeroDocumento: string; numeroControl: string; fechaEmision: string;
  ret: RetencionPago; portalUrl: string; esCopiaInterna?: boolean; correoCliente?: string | null;
}): string {
  const fecha = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(p.fechaEmision));
  const cuerpo = `
${p.esCopiaInterna ? `<p style="margin:0 0 14px;padding:8px 12px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:bold;border-radius:6px;">COPIA DE ARCHIVO &mdash; ${p.correoCliente ? `enviado a ${esc(p.correoCliente)}` : 'el contribuyente NO tiene correo registrado: entregue estos datos por otra vía'}</p>` : ''}
<p style="margin:0 0 14px;font-size:15px;color:#1e293b;">Estimado(a) <strong>${esc(p.contribuyente)}</strong> (R.I.F.: <strong>${esc(p.identidad)}</strong>),</p>
<p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.6;">Hemos recibido su pago del Servicio de Aseo Urbano. Como <strong>Agente de Retención de IVA</strong>, a continuación le indicamos los datos de la factura para que elabore su <strong>comprobante de retención</strong>:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:18px;">
${fila('Emisor', `${esc(NOMBRE_IAMEC)}`)}
${fila('R.I.F. del emisor', RIF_IAMEC, true)}
${fila('N° de Factura', esc(p.numeroDocumento || '-'), true)}
${fila('N° de Control', esc(p.numeroControl || '-'), true)}
${fila('Fecha de emisión', esc(fecha))}
${fila('Base imponible', `Bs ${fmtBs(p.ret.base)}`)}
${fila('IVA (16%)', `Bs ${fmtBs(p.ret.iva)}`)}
${fila('Total factura', `Bs ${fmtBs(p.ret.total)}`, true)}
${fila('IVA retenido (75%)', `<span style="color:#b91c1c;">Bs ${fmtBs(p.ret.retenido)}</span>`, true)}
${fila('Monto pagado', `Bs ${fmtBs(p.ret.pagado)}`)}
</table>
<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 16px;font-size:13px;color:#065f46;line-height:1.6;">
<strong>Siguiente paso:</strong> ingrese a <strong>Soy Contribuyente</strong> &rarr; <strong>Retenciones</strong>, seleccione esta factura y suba su comprobante de retención (PDF).<br>
Una vez verificado por la Dirección de Hacienda, le enviaremos la <strong>factura fiscal</strong> a este correo.
${p.portalUrl ? `<div style="text-align:center;margin-top:12px;"><a href="${esc(p.portalUrl)}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;">Subir comprobante de retención</a></div>` : ''}
</div>
<p style="margin:18px 0 0;font-size:11px;color:#94a3b8;text-align:center;">Este correo NO es la factura fiscal. La factura se enviará cuando se apruebe su comprobante de retención.</p>`;
  return marco('DATOS PARA SU COMPROBANTE DE RETENCIÓN', 'AGENTE DE RETENCIÓN DE IVA (75%)', cuerpo);
}

export function htmlRechazo(p: { contribuyente: string; numeroDocumento: string; motivo: string; portalUrl: string }): string {
  const cuerpo = `
<p style="margin:0 0 14px;font-size:15px;color:#1e293b;">Estimado(a) <strong>${esc(p.contribuyente)}</strong>,</p>
<p style="margin:0 0 14px;font-size:14px;color:#475569;line-height:1.6;">Su comprobante de retención para la factura <strong>N° ${esc(p.numeroDocumento)}</strong> no pudo ser aprobado por el siguiente motivo:</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;color:#991b1b;font-size:14px;margin-bottom:16px;">${esc(p.motivo)}</div>
<p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">Por favor corrija y suba nuevamente el comprobante en <strong>Soy Contribuyente &rarr; Retenciones</strong>.</p>
${p.portalUrl ? `<div style="text-align:center;margin-top:14px;"><a href="${esc(p.portalUrl)}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;">Subir comprobante corregido</a></div>` : ''}`;
  return marco('COMPROBANTE DE RETENCIÓN RECHAZADO', 'AGENTE DE RETENCIÓN DE IVA', cuerpo);
}

export const portalRetencionesUrl = (origin?: string) => {
  const base = (origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return base ? `${base}/portal/retenciones` : '';
};

/** Totales de la retención a partir de los totales de la factura emitida. */
export function calcularRetencion(totalBase: number, totalIva: number): Omit<RetencionPago, 'estado'> {
  const base = r2(totalBase), iva = r2(totalIva);
  const retenido = r2(iva * PORC_RETENCION);
  const total = r2(base + iva);
  return { base, iva, retenido, total, pagado: r2(total - retenido) };
}

/**
 * Envía al contribuyente los DATOS de la factura (no la factura) para que llene su planilla,
 * con copia al archivo interno. Actualiza retencion.datos_enviados_at.
 */
export async function enviarDatosFacturaRetencion(pagoId: string, portalUrl?: string): Promise<{ ok: boolean; correo: string | null; error?: string }> {
  const { data: pago, error } = await supabase.from('pagos_reportados').select('id, identidad, detalles').eq('id', pagoId).maybeSingle();
  if (error || !pago) return { ok: false, correo: null, error: error?.message || 'Pago no encontrado' };
  const det = parseDet(pago.detalles);
  const fd = det.factura_digital || {};
  const ret: RetencionPago | undefined = fd.retencion;
  if (!fd.emitida || !ret) return { ok: false, correo: null, error: 'La factura no está emitida o el pago no tiene retención.' };

  const correo = await correoContribuyente(pago.identidad, det);
  const contribuyente = det.contribuyente || pago.identidad;
  const base = { contribuyente, identidad: pago.identidad, numeroDocumento: fd.numero_documento || '', numeroControl: fd.numero_control || '', fechaEmision: fd.fecha_emision || new Date().toISOString(), ret, portalUrl: portalUrl || portalRetencionesUrl() };
  const resend = getResendClient();
  const backup = TheFactoryHKA.getBackupEmail();
  let okCliente = false; let err: string | undefined;
  try {
    if (correo) {
      const r: any = await resend.emails.send({ from: DEFAULT_RESEND_FROM, to: [correo], subject: `Datos de su factura N° ${base.numeroDocumento} para comprobante de retención - IAMEC Naguanagua`, html: htmlDatosFactura(base) });
      if (r?.error) throw new Error(r.error.message || 'Error enviando');
      okCliente = true;
    }
  } catch (e: any) { err = e.message; }
  try {
    await resend.emails.send({ from: DEFAULT_RESEND_FROM, to: [backup], subject: `[ARCHIVO] Datos retención factura N° ${base.numeroDocumento} - ${contribuyente}`, html: htmlDatosFactura({ ...base, esCopiaInterna: true, correoCliente: correo }) });
  } catch { /* copia interna best-effort */ }

  fd.retencion = { ...ret, datos_enviados_at: okCliente ? new Date().toISOString() : ret.datos_enviados_at, datos_enviados_a: okCliente ? correo! : ret.datos_enviados_a };
  det.factura_digital = fd;
  await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pagoId);
  return { ok: okCliente, correo, error: correo ? err : 'El contribuyente no tiene correo registrado.' };
}

/** Busca el pago asociado a una planilla de retención. */
export async function pagoDeRetencion(retencionId: string): Promise<any | null> {
  const { data } = await supabase
    .from('pagos_reportados')
    .select('id, identidad, monto, detalles')
    .eq('detalles->factura_digital->retencion->>retencion_id', retencionId)
    .limit(1);
  return data?.[0] || null;
}
