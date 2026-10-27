import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient, DEFAULT_RESEND_FROM } from '@/lib/emailClient';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_PRIVATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || (() => { throw new Error('JWT_PRIVATE_SECRET no configurado'); })();

export async function POST(request: Request) {
  try {
    const { identidad } = await request.json();
    
    if (!identidad || typeof identidad !== 'string' || !identidad.trim()) {
      return NextResponse.json({ error: 'Identidad requerida' }, { status: 400 });
    }

    const term = identidad.trim();
    const rawDigits = term.replace(/\D/g, '');
    const cleanPrefix = term.replace(/[-\s]/g, '').toUpperCase();
    
    // Generar todas las variantes posibles de búsqueda para el RIF / Cédula
    const variantsSet = new Set<string>();
    variantsSet.add(term.toUpperCase());
    variantsSet.add(cleanPrefix);
    if (rawDigits) {
      variantsSet.add(rawDigits);
      ['V-', 'J-', 'E-', 'G-', 'V', 'J', 'E', 'G'].forEach(pre => {
        variantsSet.add(`${pre}${rawDigits}`);
      });
    }
    const idVariants = Array.from(variantsSet);
    const orFilter = idVariants.map(v => `identidad.eq.${v}`).join(',');

    // 1. Buscar en inmuebles
    const { data: records, error: inmsErr } = await supabase
      .from('inmuebles')
      .select('contribuyente, correo_electronico, identidad, estado')
      .or(orFilter)
      .limit(10);

    if (inmsErr) console.warn('Error buscando inmueble en recuperar:', inmsErr);

    let user: { contribuyente: string; correo_electronico: string; identidad: string } | null = null;

    if (records && records.length > 0) {
      // Priorizar el que tenga correo electrónico configurado y esté activo
      const conCorreo = records.find(r => r.correo_electronico && r.correo_electronico.trim().length > 3 && r.estado !== 'Eliminado')
        || records.find(r => r.correo_electronico && r.correo_electronico.trim().length > 3)
        || records[0];
      user = {
        contribuyente: conCorreo.contribuyente || 'Contribuyente',
        correo_electronico: (conCorreo.correo_electronico || '').trim(),
        identidad: conCorreo.identidad || term,
      };
    }

    // 2. Si no se encontró en inmuebles o no tenía correo, buscar en la tabla contribuyentes
    if (!user || !user.correo_electronico) {
      const { data: conts } = await supabase
        .from('contribuyentes')
        .select('nombre, email, identidad')
        .or(orFilter)
        .limit(5);

      const contConCorreo = (conts || []).find(c => c.email && c.email.trim().length > 3);
      if (contConCorreo) {
        user = {
          contribuyente: user?.contribuyente || contConCorreo.nombre || 'Contribuyente',
          correo_electronico: contConCorreo.email.trim(),
          identidad: user?.identidad || contConCorreo.identidad || term,
        };
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'No se encontró ningún contribuyente con la identificación ingresada.' }, { status: 404 });
    }

    if (!user.correo_electronico || !user.correo_electronico.includes('@')) {
      return NextResponse.json({ 
        error: 'Este usuario no tiene un correo electrónico registrado en el sistema. Por favor diríjase o comuníquese con las oficinas del IAMEC para registrar su correo.' 
      }, { status: 400 });
    }

    // Generar JWT token válido por 2 horas
    const token = jwt.sign({ identidad: user.identidad }, JWT_SECRET, { expiresIn: '2h' });
    const resetUrl = `https://aseonaguanagua.globalrecca.com/portal/reset?token=${token}`;

    const anio = new Date().getFullYear();

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Restablecer Contraseña - IAMEC Naguanagua</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:30px 15px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
                
                <!-- Encabezado Institucional Oficial -->
                <tr>
                  <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);padding:28px 24px;text-align:center;border-bottom:3px solid #10b981;">
                    <div style="color:#b8cd29;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">
                      ALCALDÍA BOLIVARIANA DE NAGUANAGUA &bull; IAMEC
                    </div>
                    <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:0.5px;">
                      <span style="color:#4ade80;font-weight:900;">GLOBAL</span> REC
                    </h1>
                    <p style="color:#94a3b8;margin:6px 0 0;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
                      Portal Oficial del Contribuyente &bull; Aseo Urbano
                    </p>
                  </td>
                </tr>

                <!-- Contenido Principal -->
                <tr>
                  <td style="padding:32px 28px;">
                    <div style="background-color:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
                      <p style="margin:0;color:#065f46;font-size:14px;font-weight:bold;">
                        Solicitud de Restablecimiento de Clave
                      </p>
                    </div>

                    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;line-height:1.6;">
                      Estimado(a) <strong>${user.contribuyente}</strong>,
                    </p>
                    <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
                      Hemos recibido una solicitud para restablecer la contraseña de acceso a su cuenta en el <strong>Portal del Contribuyente del Municipio Naguanagua</strong> (R.I.F. / C.I.: <span style="font-family:monospace;font-weight:bold;color:#0f172a;">${user.identidad}</span>).
                    </p>
                    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
                      Para crear su nueva contraseña de forma segura, haga clic en el siguiente botón institucional:
                    </p>

                    <!-- Botón de Acción -->
                    <div style="text-align:center;margin:30px 0;">
                      <a href="${resetUrl}" target="_blank" style="background-color:#059669;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block;box-shadow:0 2px 6px rgba(5,150,105,0.3);letter-spacing:0.3px;">
                        Restablecer mi Contraseña
                      </a>
                    </div>

                    <!-- Enlace directo de respaldo -->
                    <p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.5;">
                      Si el botón no funciona, copie y pegue el siguiente enlace en su navegador:<br/>
                      <a href="${resetUrl}" style="color:#059669;word-break:break-all;font-size:11px;">${resetUrl}</a>
                    </p>

                    <!-- Nota de Seguridad -->
                    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-top:24px;">
                      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">
                        <strong style="color:#334155;">Nota de seguridad:</strong> Este enlace es de un solo uso y expirará en <strong>2 horas</strong>. Si usted no realizó esta solicitud, puede ignorar este mensaje; su cuenta continuará protegida con su clave actual.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Pie de Página Institucional -->
                <tr>
                  <td style="background-color:#f8fafc;padding:20px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6;">
                    <p style="margin:0 0 4px;font-weight:bold;color:#334155;">
                      Instituto Autónomo Municipal de Ecosocialismo (IAMEC) &bull; R.I.F. G-20008614-9
                    </p>
                    <p style="margin:0 0 4px;color:#64748b;">
                      Alcaldía Bolivariana de Naguanagua &bull; Estado Carabobo
                    </p>
                    <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">
                      Atención al contribuyente: <a href="mailto:iamec.naguanagua@globalgreenca.com" style="color:#059669;text-decoration:none;">iamec.naguanagua@globalgreenca.com</a>
                    </p>
                    <p style="margin:6px 0 0;font-size:10px;color:#cbd5e1;">
                      &copy; ${anio} Sistema de Gestión y Recaudación Tributaria Global Rec.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // MODO PRUEBA: redirigir al correo de prueba solo si EMAIL_TEST_MODE=true explícito
    const modoTest = process.env.EMAIL_TEST_MODE === 'true';
    const destinoReal = user.correo_electronico;
    const destinoEnvio = modoTest ? 'aseonaguanagua@globalgreenca.com' : destinoReal;
    const subjectEnvio = modoTest
      ? `[PRUEBA | Para: ${destinoReal}] Restablecer Contraseña - IAMEC Naguanagua · Global Rec`
      : 'Restablecer Contraseña - IAMEC Naguanagua · Global Rec';

    const resend = getResendClient();
    const remitente = DEFAULT_RESEND_FROM || 'Global Rec <iamec.naguanagua@globalgreenca.com>';

    // Enviar correo con Resend
    const sendResult = await resend.emails.send({
      from: remitente,
      to: [destinoEnvio],
      subject: subjectEnvio,
      html: emailHtml,
    });

    if (sendResult.error) {
      console.error('Error enviando correo de recuperación con Resend:', sendResult.error);
      return NextResponse.json({ 
        error: `Error al enviar el correo: ${sendResult.error.message || 'Error en el servicio de correo'}` 
      }, { status: 500 });
    }

    console.log(`Correo de recuperación enviado exitosamente a: ${destinoEnvio} (ID: ${sendResult.data?.id})`);

    // Ocultar parcialmente el correo para confirmación al usuario (ej: f***a@gmail.com)
    const partesCorreo = destinoReal.split('@');
    const maskedUser = partesCorreo[0].length > 3 
      ? `${partesCorreo[0].slice(0, 2)}***${partesCorreo[0].slice(-1)}` 
      : `${partesCorreo[0].slice(0, 1)}***`;
    const maskedEmail = `${maskedUser}@${partesCorreo[1]}`;

    return NextResponse.json({ 
      status: 'success',
      correo: maskedEmail
    });
  } catch (err: any) {
    console.error("Recovery Error:", err);
    return NextResponse.json({ error: err.message || 'Error en servidor' }, { status: 500 });
  }
}

