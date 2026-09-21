import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');

export async function POST(request: Request) {
  try {
    const { recibos } = await request.json();

    if (!recibos || !Array.isArray(recibos) || recibos.length === 0) {
      return NextResponse.json({ error: 'No se enviaron recibos válidas' }, { status: 400 });
    }

    // Insertar masivamente en supabase
    const { data: result, error } = await supabase
      .from('facturas')
      .insert(recibos)
      .select('*, inmuebles!facturas_identidad_fkey(correo_electronico)');

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ error: 'Error al insertar recibos en la base de datos', details: error }, { status: 500 });
    }

    // Si todo salió bien, enviamos los correos en segundo plano
    enviarCorreos(result || []);

    return NextResponse.json({ success: true, count: recibos.length });

  } catch (err) {
    console.error("Emision de recibos Masiva Error:", err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

async function enviarCorreos(facturasGeneradas: any[]) {
  if (!process.env.RESEND_API_KEY) {
    console.log('No RESEND_API_KEY configurada. Saltando envío de correos.');
    return;
  }

  for (const f of facturasGeneradas) {
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0f172a; padding: 20px; text-align: center;">
            <h1 style="color: #4ade80; margin: 0; font-size: 24px;">GLOBAL <span style="color: white;">REC</span></h1>
            <p style="color: #94a3b8; margin-top: 5px; font-size: 14px;">Nueva Recibo Generada</p>
          </div>
          <div style="padding: 30px;">
            <h2 style="color: #1e293b; margin-top: 0;">¡Hola ${f.contribuyente}!</h2>
            <p>Se ha generado una nueva recibo en su cuenta con la siguiente información:</p>
            <ul>
              <li><strong>Referencia:</strong> ${f.referencia}</li>
              <li><strong>Monto (Bs):</strong> ${parseFloat(f.monto || '0').toFixed(2)}</li>
              <li><strong>Emisión:</strong> ${f.emision}</li>
              <li><strong>Vencimiento:</strong> ${f.vencimiento}</li>
              <li><strong>Estado:</strong> ${f.estado}</li>
            </ul>
            <p>Le invitamos a ingresar al Portal del Contribuyente para gestionar sus pagos.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://aseosilva.globalrecca.com/portal/login" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ir al Portal</a>
            </div>
          </div>
          <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #eaeaea;">
            &copy; ${new Date().getFullYear()} Sistema Integral de Recaudación Tributaria Municipal
          </div>
        </div>
      `;

      let emailDestino = null;
      if (f.inmuebles && f.inmuebles.correo_electronico) {
        emailDestino = f.inmuebles.correo_electronico;
      } else if (f.inmuebles && Array.isArray(f.inmuebles) && f.inmuebles[0]?.correo_electronico) {
        emailDestino = f.inmuebles[0].correo_electronico;
      }

      if (emailDestino && emailDestino.includes('@')) {
        await resend.emails.send({
          from: 'Global Rec <aseo.municipiosilva@globalgreenca.com>',
          to: emailDestino,
          subject: `Nueva Recibo Generada - ${f.referencia}`,
          html: emailHtml,
        });
      }
    } catch (e) {
      console.error(`Error enviando correo para recibo ${f.referencia}:`, e);
    }
  }
}
