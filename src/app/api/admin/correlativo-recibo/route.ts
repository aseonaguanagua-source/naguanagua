import { NextResponse } from 'next/server';
import { siguienteCorrelativoRecibo } from '@/lib/correlativoRecibo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cantidad = Math.max(1, Math.min(50, parseInt(String(body?.cantidad || 1), 10) || 1));
    const correlativos = await siguienteCorrelativoRecibo(cantidad);
    return NextResponse.json({
      ok: true,
      correlativo: correlativos[0],
      correlativos,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Error generando correlativo de recibo' },
      { status: 500 }
    );
  }
}

