import { NextResponse } from 'next/server';
import { cargarDatosRecibo } from '@/lib/reciboMailer';
import { construirReciboPdf } from '@/lib/reciboPdf';

export const dynamic = 'force-dynamic';

/** PDF del recibo (el mismo que se adjunta al correo), para revisarlo antes de enviar. */
export async function GET(req: Request) {
  const pagoId = new URL(req.url).searchParams.get('pagoId');
  if (!pagoId) return NextResponse.json({ error: 'Falta pagoId' }, { status: 400 });
  try {
    const d = await cargarDatosRecibo(pagoId);
    const pdf = construirReciboPdf(d);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Recibo_${d.numeroRecibo}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
