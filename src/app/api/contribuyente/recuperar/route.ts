import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { Resend } from 'resend';
import jwt from 'jsonwebtoken';

const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');
const JWT_SECRET = process.env.JWT_PRIVATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || (() => { throw new Error('JWT_PRIVATE_SECRET no configurado'); })();

export async function POST(request: Request) {
  try {
    const { identidad } = await request.json();
    
    if (!identidad) {
      return NextResponse.json({ error: 'Identidad requerida' }, { status: 400 });
    }

    const idLimpio = identidad.replace(/-/g, '').toUpperCase();
    const idFormateado = `${idLimpio.charAt(0)}-${idLimpio.slice(1)}`;
    const soloNumeros = identidad.replace(/\D/g, '');

    const { data: records, error } = await supabase
      .from('inmuebles')
      .select('contribuyente, correo_electronico, identidad')
      .or(`identidad.eq.${idFormateado},identidad.eq.${idLimpio},identidad.eq.${identidad.toUpperCase()},identidad.eq.${soloNumeros}`)
      .limit(1);

    if (error || !records || records.length === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const user = records[0];

    if (!user.correo_electronico) {
      return NextResponse.json({ error: 'Este usuario no tiene un correo electrónico configurado.' }, { status: 400 });
    }

    // Generate JWT token valid for 1 hour
    const token = jwt.sign({ identidad: user.identidad }, JWT_SECRET, { expiresIn: '1h' });
    const resetUrl = `https://aseonaguanagua.globalrecca.com/portal/reset?token=${token}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 20px; text-align: center;">
          <h1 style="color: #4ade80; margin: 0; font-size: 24px;">GLOBAL <span style="color: white;">REC</span></h1>
          <p style="color: #94a3b8; margin-top: 5px; font-size: 14px;">Portal del Contribuyente</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #1e293b; margin-top: 0;">Recuperación de Contraseña</h2>
          <p>Hola <strong>${user.contribuyente}</strong>,</p>
          <p>Hemos recibido una solicitud para restablecer la contraseña de su cuenta en el Portal del Contribuyente del Municipio Naguanagua.</p>
          <p>Para crear una nueva contraseña, por favor haga clic en el siguiente botón:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
          </div>
          <p style="font-size: 14px; color: #64748b;">Si usted no solicitó este cambio, puede ignorar este correo de forma segura. El enlace expirará en 1 hora.</p>
        </div>
        <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeaea;">
          &copy; ${new Date().getFullYear()} Sistema Integral de Recaudación Tributaria Municipal
        </div>
      </div>
    `;

    // MODO PRUEBA: redirigir al correo de prueba si EMAIL_TEST_MODE=true
    const modoTest = process.env.EMAIL_TEST_MODE === 'true';
    const destinoReal = user.correo_electronico;
    const destinoEnvio = modoTest ? 'aseonaguanagua@globalgreenca.com' : destinoReal;
    const subjectEnvio = modoTest
      ? `[PRUEBA | Para: ${destinoReal}] Recuperación de Contraseña`
      : 'Recuperación de Contraseña - Global Rec';

    // Send email using Resend
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Global Rec <iamec.naguanagua@globalgreenca.com>',
        to: destinoEnvio,
        subject: subjectEnvio,
        html: emailHtml,
      });
    } else {
      console.log('NO RESEND API KEY. Email would be sent to:', destinoEnvio);
      console.log('Reset URL:', resetUrl);
    }

    return NextResponse.json({ status: 'success' });
  } catch (err) {
    console.error("Recovery Error:", err);
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}
