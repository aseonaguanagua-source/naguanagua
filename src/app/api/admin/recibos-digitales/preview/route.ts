import { NextResponse } from 'next/server';
import { cargarDatosRecibo, construirReciboHtml } from '@/lib/reciboMailer';

export const dynamic = 'force-dynamic';

/** Vista previa del recibo (HTML exacto que recibirá el contribuyente). */
export async function GET(request: Request) {
  const pagoId = new URL(request.url).searchParams.get('pagoId') || '';
  if (!pagoId) return NextResponse.json({ error: 'pagoId requerido' }, { status: 400 });
  try {
    const d = await cargarDatosRecibo(pagoId);
    return new NextResponse(construirReciboHtml(d), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
