import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Lectura de la bitácora de auditoría para el panel admin.
 * La tabla `auditoria` tiene RLS que impide leerla con la clave pública, por eso se lee aquí
 * con la clave de servicio. Fechas en hora de Venezuela (UTC-4).
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const desde = sp.get('desde') || '';
    const hasta = sp.get('hasta') || '';
    const usuario = sp.get('usuario') || '';
    const categoria = sp.get('categoria') || '';
    const accion = sp.get('accion') || '';
    const soloConteo = sp.get('count') === '1';
    const limit = Math.min(parseInt(sp.get('limit') || '2000') || 2000, 5000);

    let q = soloConteo
      ? supabaseAdmin.from('auditoria').select('id', { count: 'exact', head: true })
      : supabaseAdmin.from('auditoria').select('*').order('created_at', { ascending: false }).limit(limit);
    if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte('created_at', `${desde}T00:00:00-04:00`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) q = q.lte('created_at', `${hasta}T23:59:59.999-04:00`);
    if (usuario) q = q.eq('usuario', usuario);
    if (categoria && categoria !== 'TODAS') q = q.eq('categoria', categoria);
    if (accion) q = q.eq('accion', accion);

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(soloConteo ? { count: count || 0 } : { data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
