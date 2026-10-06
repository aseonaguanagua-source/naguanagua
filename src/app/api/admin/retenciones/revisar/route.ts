import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient, DEFAULT_RESEND_FROM } from '@/lib/emailClient';
import { enviarFacturaConCopiaInterna } from '@/lib/facturaMailer';
import { parseDet, pagoDeRetencion, correoContribuyente, htmlRechazo, portalRetencionesUrl } from '@/lib/retencionFlujo';

export const dynamic = 'force-dynamic';

/**
 * Hacienda revisa el comprobante de retención:
 *  - aprobar  → se envía la FACTURA por correo al contribuyente (con copia de archivo)
 *  - rechazar → se le avisa el motivo para que suba uno nuevo
 */
export async function POST(request: Request) {
  try {
    const { retencionId, accion, motivo, usuario } = await request.json().catch(() => ({}));
    if (!retencionId || !['aprobar', 'rechazar'].includes(accion)) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    if (accion === 'rechazar' && !String(motivo || '').trim()) return NextResponse.json({ error: 'Indique el motivo del rechazo.' }, { status: 400 });

    const { data: ret, error: eR } = await supabase.from('retenciones_iva').select('*').eq('id', retencionId).maybeSingle();
    if (eR) throw eR;
    if (!ret) return NextResponse.json({ error: 'Comprobante no encontrado.' }, { status: 404 });
    if (ret.estado !== 'Pendiente') return NextResponse.json({ error: `Este comprobante ya fue ${String(ret.estado).toLowerCase()}.` }, { status: 409 });

    const pago = await pagoDeRetencion(retencionId);
    const det = pago ? parseDet(pago.detalles) : {};
    const fd = det.factura_digital || {};
    const ahora = new Date().toISOString();
    const quien = usuario || 'Administración';
    const correo = pago ? await correoContribuyente(pago.identidad, det) : null;
    const origin = new URL(request.url).origin;

    if (accion === 'rechazar') {
      await supabase.from('retenciones_iva').update({ estado: 'Rechazado', motivo_rechazo: motivo, aprobado_at: ahora, aprobado_por: quien }).eq('id', retencionId);
      if (pago) {
        fd.retencion = { ...(fd.retencion || {}), estado: 'rechazada', motivo_rechazo: motivo, revisado_at: ahora, revisado_por: quien };
        det.factura_digital = fd;
        await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pago.id);
      }
      let avisado = false;
      if (correo) {
        try {
          const r: any = await getResendClient().emails.send({
            from: DEFAULT_RESEND_FROM, to: [correo],
            subject: `Comprobante de retención rechazado - Factura N° ${fd.numero_documento || ''} - IAMEC Naguanagua`,
            html: htmlRechazo({ contribuyente: ret.contribuyente, numeroDocumento: fd.numero_documento || '', motivo, portalUrl: portalRetencionesUrl(origin) }),
          });
          avisado = !r?.error;
        } catch { /* aviso best-effort */ }
      }
      await supabase.from('auditoria').insert({ usuario: quien, accion: 'Comprobante de retención rechazado', categoria: 'FACTURACION', modulo: '/admin/caja/conciliacion', detalles: { retencion_id: retencionId, pago_id: pago?.id, motivo, avisado } });
      return NextResponse.json({ success: true, estado: 'Rechazado', avisado, correo });
    }

    // ── APROBAR: enviar la factura ──
    if (!pago || !fd.emitida || !fd.url) {
      return NextResponse.json({ error: 'No se encontró la factura emitida de este comprobante. Emítala primero en Facturación Electrónica.' }, { status: 409 });
    }
    let envio: any = null; let errorEnvio: string | undefined;
    try {
      envio = await enviarFacturaConCopiaInterna({
        contribuyente: ret.contribuyente || det.contribuyente || pago.identidad,
        identidad: pago.identidad,
        numeroControl: fd.numero_control,
        numeroDocumento: fd.numero_documento,
        monto: parseFloat(String(fd.retencion?.total || pago.monto || 0)),
        fecha: fd.fecha_emision,
        urlPdf: fd.url,
        correoContribuyente: correo || undefined,
        esCorreoComodin: !correo,
      });
    } catch (e: any) { errorEnvio = e.message; }

    await supabase.from('retenciones_iva').update({ estado: 'Aprobado', motivo_rechazo: null, aprobado_at: ahora, aprobado_por: quien, factura_url: fd.url, factura_control: fd.numero_control, factura_emitida: true }).eq('id', retencionId);
    fd.retencion = { ...(fd.retencion || {}), estado: 'aprobada', revisado_at: ahora, revisado_por: quien, motivo_rechazo: undefined, factura_enviada_at: correo && !errorEnvio ? ahora : undefined, factura_enviada_a: correo || undefined };
    fd.envio_correo = envio || fd.envio_correo;
    det.factura_digital = fd;
    await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pago.id);

    await supabase.from('auditoria').insert({ usuario: quien, accion: 'Comprobante de retención aprobado - factura enviada', categoria: 'FACTURACION', modulo: '/admin/caja/conciliacion', detalles: { retencion_id: retencionId, pago_id: pago.id, factura: fd.numero_documento, correo, error_envio: errorEnvio } });

    return NextResponse.json({ success: true, estado: 'Aprobado', facturaEnviada: !!correo && !errorEnvio, correo, error: !correo ? 'El contribuyente no tiene correo registrado: la factura quedó en el archivo interno.' : errorEnvio });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
