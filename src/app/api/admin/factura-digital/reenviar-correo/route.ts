import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

function buildFacturaEmailHtml(data: {
  contribuyente: string;
  identidad: string;
  numeroControl: string;
  monto: number;
  fecha: string;
  url: string;
}): string {
  const BASE = 'https://aseonaguanaguaad.globalrecca.com';
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura Fiscal Digital - IAMEC Naguanagua</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:600px;border:1px solid #e2e8f0;">
          
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#0a4a2a 0%,#1a7a40 100%);padding:24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:1px;text-transform:uppercase;">
                ALCALDÍA DE NAGUANAGUA &bull; IAMEC
              </h1>
              <p style="margin:6px 0 0;color:#dcfce7;font-size:13px;font-weight:bold;">
                COMPROBANTE FISCAL DIGITAL (SENIAT / THE FACTORY HKA)
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">
                Estimado(a) <strong>${data.contribuyente}</strong> (R.I.F. / Cédula: <strong>${data.identidad}</strong>),
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
                Le informamos que su <strong>Factura Fiscal Digital</strong> correspondiente a las tasas del servicio de aseo urbano y saneamiento ambiental ha sido emitida exitosamente a través de la imprenta digital autorizada.
              </p>

              <!-- DETALLES FISCALES -->
              <table width="100%" cellpadding="10" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:24px;font-size:13px;">
                <tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">N&uacute;mero de Control SENIAT:</td>
                  <td style="color:#0f172a;font-weight:bold;text-align:right;border-bottom:1px solid #e2e8f0;">${data.numeroControl}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">Fecha de Emisi&oacute;n:</td>
                  <td style="color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">${data.fecha}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:14px;font-weight:bold;">Monto Total Pagado:</td>
                  <td style="color:#166534;font-size:15px;font-weight:bold;text-align:right;">Bs ${data.monto.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </table>

              <!-- BOTON DE DESCARGA / CONSULTA -->
              <div style="text-align:center;margin:28px 0;">
                <a href="${data.url}" target="_blank" style="background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;box-shadow:0 2px 8px rgba(22,163,74,0.3);">
                  &darr; Ver y Descargar Factura Fiscal Digital (PDF)
                </a>
              </div>

              <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                Documento emitido conforme a las providencias administrativas del SENIAT sobre Facturaci&oacute;n Electr&oacute;nica. El documento cuenta con c&oacute;digo QR y firma digital v&aacute;lida.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f1f5f9;padding:14px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
              Instituto Aut&oacute;nomo Municipal de Ecosocialismo Naguanagua (IAMEC) &bull; Alcald&iacute;a Bolivariana de Naguanagua
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export async function POST(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY || 'dev-placeholder');

  try {
    const body = await request.json();
    const { pagoId, correoDestino, facturaUrl, numeroControl, contribuyente, identidad, monto, fecha } = body;

    const testMode = process.env.EMAIL_TEST_MODE !== 'false';
    const defaultTestEmail = process.env.TEST_EMAIL || 'davidzara66@gmail.com';

    // Determinar destino: si está en modo prueba o se especificó correo destino
    const targetEmail = testMode ? defaultTestEmail : (correoDestino || defaultTestEmail);

    if (!targetEmail) {
      return NextResponse.json({ error: 'No se especificó correo destino' }, { status: 400 });
    }

    const htmlContent = buildFacturaEmailHtml({
      contribuyente: contribuyente || 'Contribuyente',
      identidad: identidad || 'N/A',
      numeroControl: numeroControl || 'PENDIENTE',
      monto: parseFloat(monto || '0'),
      fecha: fecha ? new Date(fecha).toLocaleDateString('es-VE') : new Date().toLocaleDateString('es-VE'),
      url: facturaUrl || '#'
    });

    const subject = testMode
      ? `[PRUEBA FACTURA DIGITAL] Factura Fiscal ${numeroControl || ''} - ${contribuyente || ''}`
      : `Factura Fiscal Digital ${numeroControl || ''} - IAMEC Naguanagua`;

    let emailSent = false;
    let emailError: string | null = null;

    if (!process.env.RESEND_API_KEY) {
      emailError = 'No se ha configurado la variable RESEND_API_KEY en Vercel/.env.local';
      console.warn('[Correo Factura]', emailError);
    } else {
      try {
        // En modo prueba o cuentas nuevas de Resend, usar onboarding@resend.dev para entregar sin esperar DNS
        const fromEmail = process.env.RESEND_FROM || 'IAMEC Facturación <onboarding@resend.dev>';
        const sendResult = await resend.emails.send({
          from: fromEmail,
          to: [targetEmail],
          subject: subject,
          html: htmlContent
        });
        if (sendResult.error) {
          emailError = sendResult.error.message;
          console.warn('[Resend Error]:', sendResult.error);
        } else {
          emailSent = true;
        }
      } catch (sendErr: any) {
        console.warn('Advertencia al enviar correo vía Resend:', sendErr.message);
        emailError = sendErr.message;
      }
    }

    // Registrar en auditoría de pago
    if (pagoId) {
      const { data: pago } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoId).single();
      let det = pago?.detalles || {};
      if (typeof det === 'string') {
        try { det = JSON.parse(det); } catch(e) { det = {}; }
      }
      det.factura_digital = det.factura_digital || {};
      det.factura_digital.ultimo_envio_correo = {
        destinatario: targetEmail,
        fecha: new Date().toISOString(),
        modo: testMode ? 'PRUEBA' : 'PRODUCCIÓN',
        exito: emailSent,
        error: emailError
      };
      await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pagoId);
    }

    return NextResponse.json({
      success: true,
      destinatario: targetEmail,
      modoPrueba: testMode,
      correoEnviado: emailSent,
      mensaje: emailSent
        ? `Factura enviada exitosamente a ${targetEmail}`
        : (emailError || `Simulación de envío completada para ${targetEmail}`)
    });

  } catch (err: any) {
    console.error('Error reenviando factura:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
