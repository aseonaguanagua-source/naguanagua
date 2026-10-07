import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { todas } from '@/lib/condominios/servicio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/condominios/separados
 * ¿Están separados los condominios? (sistema_config.condominios_separados = 'true')
 * Si lo están, devuelve los códigos que se cobran SOLO en la Caja de Condominios (condominio + sus unidades),
 * para que la Caja normal no los cobre (evita cobrar dos veces lo mismo en dos cuentas distintas).
 */
export async function GET() {
  try {
    const { data } = await sb.from('sistema_config').select('valor').eq('id', 'condominios_separados').maybeSingle();
    const separados = String(data?.valor ?? '').toLowerCase() === 'true';
    if (!separados) return NextResponse.json({ separados: false, codigos: [] });
    const condos = await todas((a, b) => sb.from('condominios').select('id,codigo,estado').order('id').range(a, b));
    const unidades = await todas((a, b) => sb.from('condominio_unidades').select('condominio_id,inmueble,estado').order('id').range(a, b));
    const vivos = new Set(condos.filter((c: any) => c.estado !== 'Eliminado').map((c: any) => c.id));
    const codigos = new Set<string>();
    condos.forEach((c: any) => { if (vivos.has(c.id) && c.codigo) codigos.add(String(c.codigo).toUpperCase()); });
    unidades.forEach((u: any) => { if (vivos.has(u.condominio_id) && u.inmueble && u.estado !== 'Eliminada') codigos.add(String(u.inmueble).toUpperCase()); });
    return NextResponse.json({ separados: true, codigos: [...codigos] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ separados: false, codigos: [], error: e?.message }, { status: 200 });
  }
}
