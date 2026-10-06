import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Registro de auditoría desde el navegador.
 * La tabla `auditoria` tiene RLS que bloquea a la clave pública; por eso el cliente escribe aquí
 * y el servidor inserta con la clave de servicio. Solo se permite INSERTAR (bitácora inmutable).
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.accion || typeof b.accion !== 'string') {
      return NextResponse.json({ error: 'accion requerida' }, { status: 400 });
    }
    const row = {
      usuario: String(b.usuario || 'Desconocido').slice(0, 200),
      accion: String(b.accion).slice(0, 500),
      categoria: String(b.categoria || 'SISTEMA').slice(0, 50),
      modulo: String(b.modulo || '').slice(0, 300),
      detalles: {
        ...(b.detalles && typeof b.detalles === 'object' ? b.detalles : {}),
        _ip: req.headers.get('x-forwarded-for') || undefined,
      },
    };
    const { error } = await supabaseAdmin.from('auditoria').insert([row]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
