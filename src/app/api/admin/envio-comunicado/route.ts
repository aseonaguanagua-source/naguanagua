import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient, DEFAULT_RESEND_FROM } from '@/lib/emailClient';

function buildHtml(nombre: string): string {
  const BASE = 'https://aseonaguanaguaad.globalrecca.com';
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comunicado Oficial IAMEC Naguanagua</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:20px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);max-width:620px;">

  <!-- HEADER LOGOS -->
  <tr>
    <td style="background:linear-gradient(135deg,#0a4a2a 0%,#1a7a40 50%,#0a4a2a 100%);padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" width="33%">
            <img src="${BASE}/logos/logo_global_rec.png" alt="Global Rec - Naguanagua" width="100" style="display:block;margin:0 auto;border-radius:6px;" />
          </td>
          <td align="center" width="34%">
            <img src="${BASE}/logos/alcaldia.png" alt="Alcaldía Bolivariana de Naguanagua" width="110" style="display:block;margin:0 auto;border-radius:8px;padding:4px;" />
          </td>
          <td align="center" width="33%">
            <img src="${BASE}/logos/IAMEC.png" alt="IAMEC Naguanagua" width="100" style="display:block;margin:0 auto;border-radius:6px;" />
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- SLOGAN BANNER -->
  <tr>
    <td style="background:#1a7a40;padding:12px 24px;text-align:center;">
      <p style="margin:0;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">
        &#x1F331; LIMPIAMOS EL PRESENTE, TRANSFORMAMOS EL FUTURO &#x1F331;
      </p>
    </td>
  </tr>

  <!-- HEADER MEMO INFO -->
  <tr>
    <td style="background:#f8fafc;padding:20px 28px;border-bottom:3px solid #1a7a40;">
      <table width="100%" cellpadding="4" cellspacing="0" style="font-size:13px;color:#374151;">
        <tr>
          <td width="80" style="font-weight:bold;color:#1a7a40;vertical-align:top;">DE:</td>
          <td style="color:#1e293b;">INSTITUTO DE SANEAMIENTO AMBIENTAL (IAMEC) / ALCALDÍA DE NAGUANAGUA</td>
        </tr>
        <tr>
          <td style="font-weight:bold;color:#1a7a40;vertical-align:top;">FECHA:</td>
          <td style="color:#1e293b;">Septiembre, 2026</td>
        </tr>
        <tr>
          <td style="font-weight:bold;color:#1a7a40;vertical-align:top;">PARA:</td>
          <td style="color:#1e293b;">COMERCIANTES, CONTRIBUYENTES Y COMUNIDAD EN GENERAL DE NAGUANAGUA</td>
        </tr>
        <tr>
          <td style="font-weight:bold;color:#1a7a40;vertical-align:top;">ASUNTO:</td>
          <td style="color:#1e293b;font-weight:bold;">COMUNICADO OFICIAL &ndash; RENOVACI&Oacute;N DE PLATAFORMA DIGITAL Y CANALES DE ATENCI&Oacute;N</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- SALUDO -->
  <tr>
    <td style="padding:24px 28px 8px;">
      <p style="margin:0 0 12px;font-size:15px;color:#1e293b;line-height:1.7;">
        Estimado(a) <strong>${nombre}</strong>,
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.8;">
        Reciban un cordial y respetuoso saludo institucional. En el marco del fortalecimiento integral del sistema de recolección de desechos sólidos y preservación ambiental en nuestras comunidades y ejes comerciales, el <strong>Instituto de Ambiente del Municipio Naguanagua (IAMEC Naguanagua)</strong> conjuntamente con la <strong>Alcaldía del Municipio Naguanagua</strong>, les informa la <strong>renovación y modernización tecnológica</strong> de nuestra plataforma de atención y recaudación.
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.8;">
        Esta actualización tiene como objetivo brindar a cada ciudadano y comerciante una experiencia &aacute;gil, aut&oacute;noma y accesible, evitando traslados innecesarios y garantizando total transparencia en sus gestiones tributarias.
      </p>
    </td>
  </tr>

  <!-- SECCION 1: PORTAL WEB -->
  <tr>
    <td style="padding:0 28px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:10px;border-left:5px solid #1a7a40;overflow:hidden;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#14532d;">
              &#x1F4BB; Portal Web de Autogesti&oacute;n y Pago en L&iacute;nea (24/7)
            </p>
            <p style="margin:0 0 10px;font-size:13px;color:#166534;line-height:1.7;">
              Desde cualquier dispositivo m&oacute;vil o computador, acceda a consultar su estado de cuenta, efectuar pagos y gestionar su solvencia en el siguiente enlace oficial:
            </p>
            <p style="margin:0 0 12px;text-align:center;">
              <a href="https://aseonaguanagua.globalrecca.com" style="display:inline-block;background:#1a7a40;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:24px;font-size:14px;font-weight:bold;letter-spacing:0.5px;">
                &#x1F517; aseonaguanagua.globalrecca.com
              </a>
            </p>
            <table cellpadding="3" cellspacing="0" style="font-size:13px;color:#166534;">
              <tr><td style="padding-right:8px;">&#x2022;</td><td><strong>Usuario:</strong> Su correo electr&oacute;nico registrado en el sistema.</td></tr>
              <tr><td>&#x2022;</td><td><strong>Contrase&ntilde;a:</strong> La miamec contrase&ntilde;a utilizada por &uacute;ltima vez para acceder a la plataforma.</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- SECCION 2: DATOS BANCARIOS -->
  <tr>
    <td style="padding:0 28px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;border-left:5px solid #0369a1;overflow:hidden;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#0c4a6e;">
              &#x1F3E6; Cuentas Bancarias Oficiales para Pagos y Transferencias
            </p>
            <p style="margin:0 0 10px;font-size:13px;color:#075985;line-height:1.7;">
              Le informamos que <strong>seguimos contando con los mismos n&uacute;meros de cuenta habituales</strong> para procesar sus pagos y reportar transferencias a trav&eacute;s del portal:
            </p>
            <table width="100%" cellpadding="6" cellspacing="0" style="background:#ffffff;border-radius:8px;font-size:13px;color:#1e293b;">
              <tr style="background:#0369a1;">
                <td colspan="2" style="color:#ffffff;font-weight:bold;padding:8px 12px;border-radius:6px 6px 0 0;">Datos Bancarios IAMEC Naguanagua</td>
              </tr>
              <tr><td style="padding:6px 12px;font-weight:bold;color:#0369a1;width:100px;">Titular:</td><td style="padding:6px 12px;">INST SOC MUN PARA EL AMBIENTE</td></tr>
              <tr style="background:#f8fafc;"><td style="padding:6px 12px;font-weight:bold;color:#0369a1;">Banco:</td><td style="padding:6px 12px;">BANESCO (0134)</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold;color:#0369a1;">Cta. Cte:</td><td style="padding:6px 12px;font-family:monospace;font-size:14px;font-weight:bold;">0134 0415 14 4151031715</td></tr>
              <tr style="background:#f8fafc;"><td style="padding:6px 12px;font-weight:bold;color:#0369a1;">R.I.F.:</td><td style="padding:6px 12px;font-family:monospace;">G-200076739</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- SECCION 3: CONTACTO -->
  <tr>
    <td style="padding:0 28px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-radius:10px;border-left:5px solid #ca8a04;overflow:hidden;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:#713f12;">
              &#x1F4F2; Canales Oficiales de Orientaci&oacute;n, Tr&aacute;mites y Reportes
            </p>
            <table width="100%" cellpadding="3" cellspacing="0">
              <tr>
                <td width="50%" style="vertical-align:top;padding-right:10px;">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#92400e;">&#x1F4DE; Tel&eacute;fonos y WhatsApp:</p>
                  <p style="margin:0;font-size:13px;color:#78350f;line-height:1.9;">
                    +58 412-9030238<br/>+58 412-0374884
                  </p>
                </td>
                <td width="50%" style="vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#92400e;">&#x2709;&#xFE0F; Correos Electr&oacute;nicos:</p>
                  <p style="margin:0;font-size:12px;color:#78350f;line-height:2.0;">
                    iamec.naguanagua@globalgreenca.com<br/>
                    atencion.aseourbanoms@globalgreenca.com<br/>
                    coordinacion.aseourbanoms@gmail.com
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- PARRAFO CIERRE -->
  <tr>
    <td style="padding:8px 28px 20px;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.8;border-top:1px solid #e2e8f0;padding-top:16px;">
        Recordamos que mantenerse al d&iacute;a con el servicio de aseo urbano se traduce en <strong>salud familiar, prevenci&oacute;n de plagas, revalorizaci&oacute;n del patrimonio</strong> y consolidaci&oacute;n del atractivo tur&iacute;stico de Naguanagua y Boca de Aroa. Agradecemos su colaboraci&oacute;n c&iacute;vica hacia la meta de un municipio sustentable.
      </p>
    </td>
  </tr>

  <!-- REDES SOCIALES -->
  <tr>
    <td style="padding:0 28px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a7a40;border-radius:10px;">
        <tr>
          <td style="padding:14px 20px;text-align:center;">
            <p style="margin:0 0 6px;color:#ffffff;font-size:12px;font-weight:bold;letter-spacing:1px;">&#x1F310; REDES SOCIALES OFICIALES</p>
            <p style="margin:0;font-size:13px;color:#bbf7d0;">
              @iamecnaguanagua &nbsp;|&nbsp; @alcaldianaguanagua &nbsp;|&nbsp; @osnel_arniasoficial
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#0a4a2a;padding:16px 24px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#86efac;line-height:1.7;">
        Instituto de Ambiente del Municipio Naguanagua (IAMEC Naguanagua) &bull; Alcald&iacute;a del Municipio Naguanagua &bull; Estado Falc&oacute;n<br/>
        Este correo fue enviado de forma oficial. Por favor no responda directamente a este mensaje.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>
  `;
}

export async function POST(request: Request) {
  const resend = getResendClient();
  try {
    const body = await request.json().catch(() => ({}));
    const testMode: boolean = body.test !== false;
    const testEmail = process.env.TEST_EMAIL || process.env.ADMIN_EMAIL || 'aseonaguanagua@globalgreenca.com';

    let destinatarios: { nombre: string; correo: string }[] = [];
    if (testMode) {
      destinatarios = [{ nombre: 'Prueba IAMEC Naguanagua', correo: testEmail }];
    } else {
      const { data: inms, error } = await supabase
        .from('inmuebles')
        .select('contribuyente, correo_electronico')
        .not('correo_electronico', 'is', null)
        .neq('correo_electronico', '');
      if (error) throw error;
      const vistos = new Set<string>();
      for (const inm of inms || []) {
        const correo = (inm.correo_electronico || '').toLowerCase().trim();
        if (correo && !vistos.has(correo)) {
          vistos.add(correo);
          destinatarios.push({ nombre: inm.contribuyente || 'Contribuyente', correo });
        }
      }
    }

    if (!destinatarios.length)
      return NextResponse.json({ success: false, error: 'No hay destinatarios con correo registrado' });

    let enviados = 0, errores = 0;
    const erroresList: string[] = [];

    // MODO PRUEBA: si EMAIL_TEST_MODE=true, todos los comunicados van a aseonaguanagua@globalgreenca.com
    const modoTestComun = process.env.EMAIL_TEST_MODE !== 'false';
    const fromEmail = process.env.RESEND_FROM || 'IAMEC Naguanagua <onboarding@resend.dev>';

    for (let i = 0; i < destinatarios.length; i += 10) {
      const lote = destinatarios.slice(i, i + 10);
      await Promise.all(lote.map(async (dest) => {
        try {
          const destinoComun = modoTestComun ? 'aseonaguanagua@globalgreenca.com' : dest.correo;
          const subjectComun = modoTestComun
            ? `[PRUEBA | Para: ${dest.correo}] Comunicado Oficial - IAMEC Naguanagua`
            : 'Comunicado Oficial - Renovacion de Plataforma Digital | IAMEC Naguanagua Municipio Naguanagua';
          let sendRes = await resend.emails.send({
            from: fromEmail,
            to: [destinoComun],
            subject: subjectComun,
            html: buildHtml(dest.nombre),
          });
          if (sendRes.error && sendRes.error.message.includes('only send testing emails')) {
            sendRes = await resend.emails.send({
              from: fromEmail,
              to: ['aseonaguanagua@globalgreenca.com'],
              subject: subjectComun + ` (Destino original: ${destinoComun})`,
              html: buildHtml(dest.nombre),
            });
          }
          if (sendRes.error) {
            errores++;
            erroresList.push(dest.correo + ': ' + sendRes.error.message);
          } else {
            enviados++;
          }
        } catch (err: any) {
          errores++;
          erroresList.push(dest.correo + ': ' + err.message);
        }
      }));
      if (i + 10 < destinatarios.length)
        await new Promise(r => setTimeout(r, 500));
    }

    if (enviados === 0 && errores > 0) {
      return NextResponse.json({
        success: false,
        error: erroresList[0] || 'Error entregando el correo de prueba',
        erroresList
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      modo: testMode ? 'PRUEBA' : 'PRODUCCION',
      enviados,
      errores,
      totalDestinatarios: destinatarios.length,
      erroresList: erroresList.slice(0, 10),
      mensaje: testMode
        ? 'Correo de prueba enviado a ' + testEmail
        : 'Comunicado enviado a ' + enviados + ' contribuyentes',
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

