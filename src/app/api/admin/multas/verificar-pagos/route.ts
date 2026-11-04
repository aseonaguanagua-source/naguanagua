import { NextResponse } from 'next/server';
import { obtenerHistorialPagosMultasYPeriodos } from '@/lib/multasPagadas';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inmueble = url.searchParams.get('inmueble');
    const unidad_id = url.searchParams.get('unidad_id');
    const condominio_id = url.searchParams.get('condominio_id');
    const codigo_condominio = url.searchParams.get('codigo_condominio');
    const identidad = url.searchParams.get('identidad');

    const resultado = await obtenerHistorialPagosMultasYPeriodos({
      inmueble,
      unidad_id,
      condominio_id,
      codigo_condominio,
      identidad,
    });

    return NextResponse.json({
      ok: true,
      ...resultado,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Error verificando pagos de multas y períodos' },
      { status: 500 }
    );
  }
}
