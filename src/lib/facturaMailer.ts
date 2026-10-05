/**
 * Servicio de Notificaciones y Copia de Respaldo Fiscal de Facturas
 * Envía las facturas emitidas por The Factory HKA por correo electrónico
 * SIN gastar facturas adicionales en The Factory HKA.
 */

import { getResendClient, DEFAULT_RESEND_FROM } from '@/lib/emailClient';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

export interface EnviarFacturaEmailParams {
  contribuyente: string;
  identidad: string;
  numeroControl: string;
  numeroDocumento?: string;
  monto: number;
  fecha: string;
  urlPdf: string;
  correoContribuyente?: string;
  esCorreoComodin?: boolean;
}

export function buildFacturaEmailTemplate(data: {
  contribuyente: string;
  identidad: string;
  numeroControl: string;
  numeroDocumento: string;
  monto: number;
  fecha: string;
  urlPdf: string;
  esCopiaInterna?: boolean;
  esCorreoComodin?: boolean;
}): string {
  const montoFormateado = data.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura Fiscal Digital - IAMEC Naguanagua</title>
</head>
<body style="margin:0;padding:0;background:#0d1f17;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1912;padding:35px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.3);max-width:620px;border:1px solid #c8e64c33;">
          
          <!-- BANNER HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg, #092617 0%, #11422b 100%);padding:26px 28px;text-align:center;border-bottom:3px solid #b8cd29;">
              <div style="color:#b8cd29;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">
                ALCALDÍA BOLIVARIANA DE NAGUANAGUA &bull; IAMEC
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">
                ${data.esCopiaInterna ? 'COPIA DE ARCHIVO FISCAL' : 'FACTURA FISCAL DIGITAL'}
              </h1>
              <p style="margin:6px 0 0;color:#dcfce7;font-size:12px;">
                SISTEMA INTEGRAL DE RECAUDACIÓN TRIBUTARIA &bull; THE FACTORY HKA (SENIAT)
              </p>
            </td>
          </tr>

          ${data.esCopiaInterna ? `
          <!-- ALERTA COPIA INTERNA -->
          <tr>
            <td style="background:#fef3c7;padding:12px 24px;border-bottom:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:bold;text-align:center;">
              📁 Copia de Respaldo Administrativo Interno &bull; Generada automáticamente sin consumo adicional de créditos fiscales.
            </td>
          </tr>
          ` : ''}

          ${data.esCorreoComodin ? `
          <!-- ALERTA CORREO COMODÍN / PENDIENTE ACTUALIZACIÓN -->
          <tr>
            <td style="background:#eff6ff;padding:12px 24px;border-bottom:1px solid #dbeafe;color:#1e40af;font-size:12px;text-align:center;">
              ⚠️ <strong>Aviso Importante:</strong> Esta factura fue enviada al correo comodín de contingencia municipal. Por favor comuníquese con la administración para registrar su correo electrónico definitivo.
            </td>
          </tr>
          ` : ''}

          <!-- CUERPO PRINCIPAL -->
          <tr>
            <td style="padding:32px 30px;">
              <p style="margin:0 0 16px;font-size:15px;color:#0f172a;line-height:1.5;">
                Estimado(a) <strong>${data.contribuyente}</strong><br>
                <span style="font-size:13px;color:#64748b;">R.I.F. / Cédula: <strong>${data.identidad}</strong></span>
              </p>

              <p style="margin:0 0 22px;font-size:14px;color:#334155;line-height:1.6;">
                Hacemos entrega de su <strong>Factura Fiscal Digital</strong> emitida formalmente ante la administración tributaria conforme a las providencias del SENIAT.
              </p>

              <!-- DETALLES DE FACTURA -->
              <table width="100%" cellpadding="10" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;font-size:13px;">
                <tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">Número de Control SENIAT:</td>
                  <td style="color:#0f172a;font-weight:bold;text-align:right;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:14px;">
                    ${data.numeroControl}
                  </td>
                </tr>
                <tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">Número de Documento:</td>
                  <td style="color:#0f172a;font-weight:bold;text-align:right;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:14px;">
                    ${data.numeroDocumento || '00000001'}
                  </td>
                </tr>
                <tr>
                  <td style="color:#64748b;border-bottom:1px solid #e2e8f0;">Fecha de Emisión:</td>
                  <td style="color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">
                    ${data.fecha}
                  </td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:14px;font-weight:bold;">Monto Total Pagado:</td>
                  <td style="color:#166534;font-size:17px;font-weight:800;text-align:right;">
                    Bs ${montoFormateado}
                  </td>
                </tr>
              </table>

              <!-- BOTÓN DESCARGA -->
              <div style="text-align:center;margin:30px 0 20px;">
                <a href="${data.urlPdf}" target="_blank" style="background:linear-gradient(135deg, #16a34a, #15803d);color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:10px;font-size:15px;font-weight:bold;display:inline-block;box-shadow:0 4px 14px rgba(22,163,74,0.35);">
                  &darr; Ver y Descargar Factura Fiscal Digital (PDF)
                </a>
              </div>

              <p style="margin:22px 0 0;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">
                Comprobante electrónico certificado por el Proveedor Autorizado de Certificación (PAC) The Factory HKA. Documento legal válido conforme al SENIAT.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
              Instituto Autónomo Municipal de Ecosocialismo Naguanagua (IAMEC) &bull; R.I.F. G-20000147-3<br>
              Naguanagua, Estado Carabobo &bull; República Bolivariana de Venezuela
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

/**
 * Envía la factura digital al contribuyente y automáticamente envía una copia de respaldo interna
 * al correo de archivo fiscal (sin consumir créditos de The Factory).
 */
export async function enviarFacturaConCopiaInterna(params: EnviarFacturaEmailParams): Promise<{
  success: boolean;
  clienteEnviado: boolean;
  copiaInternaEnviada: boolean;
  backupEmail: string;
  error?: string;
}> {
  const resend = getResendClient();
  const backupEmail = TheFactoryHKA.getBackupEmail();
  const fallbackEmail = TheFactoryHKA.getFallbackEmail();

  const numDoc = params.numeroDocumento || 'DOC-' + params.numeroControl.slice(-6);
  const fechaStr = params.fecha ? new Date(params.fecha).toLocaleDateString('es-VE') : new Date().toLocaleDateString('es-VE');

  // Determinar correo destino del cliente
  const clienteEmail = (params.correoContribuyente?.trim() || fallbackEmail).toLowerCase();
  const esComodin = !params.correoContribuyente || params.correoContribuyente.trim() === '' || clienteEmail === fallbackEmail;

  let clienteEnviado = false;
  let copiaInternaEnviada = false;
  let lastError: string | undefined;

  const fromEmail = process.env.RESEND_FROM || DEFAULT_RESEND_FROM;

  // 1. Envío al contribuyente
  try {
    const htmlCliente = buildFacturaEmailTemplate({
      contribuyente: params.contribuyente,
      identidad: params.identidad,
      numeroControl: params.numeroControl,
      numeroDocumento: numDoc,
      monto: params.monto,
      fecha: fechaStr,
      urlPdf: params.urlPdf,
      esCopiaInterna: false,
      esCorreoComodin: esComodin,
    });

    const resCliente = await resend.emails.send({
      from: fromEmail,
      to: [clienteEmail],
      subject: `Factura Fiscal Digital ${params.numeroControl} - IAMEC Naguanagua`,
      html: htmlCliente,
    });

    if (!resCliente.error) {
      clienteEnviado = true;
    } else {
      console.warn('[Resend] Error enviando a cliente:', resCliente.error);
      lastError = resCliente.error.message;
    }
  } catch (err: any) {
    console.warn('[Mailer] Error envío cliente:', err.message);
    lastError = err.message;
  }

  // 2. Envío de Copia de Respaldo Interna (Solo copia, 0 costo The Factory)
  if (backupEmail && backupEmail.length > 3) {
    try {
      const htmlCopia = buildFacturaEmailTemplate({
        contribuyente: params.contribuyente,
        identidad: params.identidad,
        numeroControl: params.numeroControl,
        numeroDocumento: numDoc,
        monto: params.monto,
        fecha: fechaStr,
        urlPdf: params.urlPdf,
        esCopiaInterna: true,
        esCorreoComodin: esComodin,
      });

      const resCopia = await resend.emails.send({
        from: fromEmail,
        to: [backupEmail],
        subject: `[ARCHIVO FISCAL] Factura ${params.numeroControl} - ${params.contribuyente} (${params.identidad})`,
        html: htmlCopia,
      });

      if (!resCopia.error) {
        copiaInternaEnviada = true;
      } else {
        console.warn('[Resend] Error enviando copia interna:', resCopia.error);
      }
    } catch (err: any) {
      console.warn('[Mailer] Error envío copia interna:', err.message);
    }
  }

  return {
    success: clienteEnviado || copiaInternaEnviada,
    clienteEnviado,
    copiaInternaEnviada,
    backupEmail,
    error: lastError,
  };
}
