import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { mesActualCaracas } from '@/lib/condominios/motor';

export const dynamic = 'force-dynamic';

async function adminActivo(usuario: string) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!u) return null;
  const { data: t } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).maybeSingle();
  if (!t || !(t.rol === 'Administrador' || u === 'dzara')) return null;
  if (t.estado && String(t.estado).trim().toLowerCase() !== 'activo') return null;
  return t;
}

/** Primer día del mes anterior (último mes facturado). */
function ultimoMesFacturado(): string {
  const { y, m } = mesActualCaracas();
  const i = y * 12 + (m - 1) - 1;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;
}

/**
 * POST { codigo, unidad_id?, usuario, motivo }
 * Quita TODAS las multas: las de los meses pendientes (hasta el último mes facturado), los meses de multa
 * agregados y las multas de monto fijo. Con `unidad_id` solo esa unidad; sin él, el condominio y todas sus unidades.
 */
export async function POST(req: Request) {
  try {
    const { codigo, unidad_id, usuario, motivo } = await req.json();
    const t = await adminActivo(usuario);
    if (!t) return NextResponse.json({ error: 'Solo un administrador puede quitar multas.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo.' }, { status: 400 });
    const { data: c } = await sb.from('condominios').select('id, codigo, nombre, multa_meses, multa_exonerada_hasta').eq('codigo', String(codigo || '').toUpperCase()).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });
    const hasta = ultimoMesFacturado();

    let qU = sb.from('condominio_unidades').select('id, inmueble, numero, multa_meses, multa_exonerada_hasta').eq('condominio_id', c.id);
    if (unidad_id) qU = qU.eq('id', unidad_id);
    const { data: us, error: eU } = await qU;
    if (eU) return NextResponse.json({ error: eU.message.includes('multa_exonerada_hasta') ? 'Falta ejecutar el SQL 2026-10-07_condominios_quitar_multas.sql en Supabase.' : eU.message }, { status: 500 });
    if (unidad_id && !us?.length) return NextResponse.json({ error: 'La unidad no pertenece a este condominio.' }, { status: 400 });

    const ids = (us || []).map(u => u.id);
    for (let i = 0; i < ids.length; i += 300) {
      const { error } = await sb.from('condominio_unidades').update({ multa_meses: 0, multa_exonerada_hasta: hasta }).in('id', ids.slice(i, i + 300));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!unidad_id) {
      const { error } = await sb.from('condominios').update({ multa_meses: 0, multa_exonerada_hasta: hasta }).eq('id', c.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    let qM = sb.from('condominio_multas').update({ estado: 'Anulada', anulada_por: t.usuario, motivo_anulacion: String(motivo).trim() })
      .eq('condominio_id', c.id).eq('estado', 'Pendiente');
    if (unidad_id) qM = qM.eq('unidad_id', unidad_id);
    const { data: anuladas } = await qM.select('id, concepto, monto_bs, monto_mmv, unidad_id');

    await sb.from('auditoria').insert({
      accion: unidad_id ? 'Multas quitadas a unidad de condominio' : 'Multas quitadas a condominio completo', usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      detalles: {
        _categoria: 'CONDOMINIOS', criticidad: 'ALTA', codigo: c.codigo, condominio: c.nombre, motivo: String(motivo).trim(), exonerada_hasta: hasta,
        antes: { condominio: unidad_id ? undefined : { multa_meses: c.multa_meses, multa_exonerada_hasta: c.multa_exonerada_hasta }, unidades: (us || []).filter(u => u.multa_meses || u.multa_exonerada_hasta).slice(0, 2000) },
        multas_anuladas: anuladas || [], unidades_afectadas: ids.length,
      },
    });
    return NextResponse.json({ ok: true, unidades: ids.length, multasAnuladas: anuladas?.length || 0, hasta });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
