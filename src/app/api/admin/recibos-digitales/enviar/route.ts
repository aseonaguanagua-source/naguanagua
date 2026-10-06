import { NextResponse } from 'next/server';
import { enviarRecibo } from '@/lib/reciboMailer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Envía por correo los recibos (no fiscales) de los pagos indicados. Máx. 20 por llamada. */
export async function POST(request: Request) {
  try {
    const { pagoIds } = await request.json().catch(() => ({}));
    if (!Array.isArray(pagoIds) || pagoIds.length === 0) {
      return NextResponse.json({ error: 'Debe indicar los pagos a enviar (pagoIds).' }, { status: 400 });
    }
    if (pagoIds.length > 20) {
      return NextResponse.json({ error: 'Máximo 20 recibos por llamada.' }, { status: 400 });
    }
    const items: any[] = [];
    for (const pagoId of pagoIds) {
      try {
        items.push({ pagoId, ...(await enviarRecibo(String(pagoId))) });
      } catch (e: any) {
        items.push({ pagoId, ok: false, error: e.message });
      }
    }
    return NextResponse.json({
      success: true,
      enviados: items.filter(i => i.ok).length,
      fallidos: items.filter(i => !i.ok).length,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
