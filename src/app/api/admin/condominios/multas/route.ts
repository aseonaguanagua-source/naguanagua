import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

async function adminActivo(usuario: string) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!u) return null;
  const { data: t } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).maybeSingle();
  if (!t || !(t.rol === 'Administrador' || u === 'dzara')) return null;
  if (t.estado && String(t.estado).trim().toLowerCase() !== 'activo') return null;
  return t;
}

/**
 * POST  { codigo, unidad_id?, concepto, monto_bs?, monto_mmv?, usuario, motivo } → agrega una multa manual
 * PATCH { id, usuario, motivo }                                                 → anula una multa pendiente
 */
export async function POST(req: Request) {
  try {
    const { codigo, unidad_id, concepto, monto_bs, monto_mmv, usuario, motivo } = await req.json();
    const t = await adminActivo(usuario);
    if (!t) return NextResponse.json({ error: 'Solo un administrador puede agregar multas.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo.' }, { status: 400 });
    if (String(concepto || '').trim().length < 3) return NextResponse.json({ error: 'Escriba el concepto de la multa.' }, { status: 400 });
    const bs = Number(monto_bs) || 0, mmv = Number(monto_mmv) || 0;
    if (bs <= 0 && mmv <= 0) return NextResponse.json({ error: 'Indique el monto (Bs o MMV).' }, { status: 400 });
    const { data: c } = await sb.from('condominios').select('id, codigo, nombre, identidad').eq('codigo', String(codigo || '').toUpperCase()).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });
    let identidad = c.identidad;
    if (unidad_id) {
      const { data: u } = await sb.from('condominio_unidades').select('id, identidad, condominio_id').eq('id', unidad_id).maybeSingle();
      if (!u || u.condominio_id !== c.id) return NextResponse.json({ error: 'La unidad no pertenece a este condominio.' }, { status: 400 });
      identidad = u.identidad;
    }
    const fila = {
      condominio_id: c.id, unidad_id: unidad_id || null, identidad, concepto: String(concepto).trim().toUpperCase(),
      monto_bs: bs > 0 ? bs : null, monto_mmv: bs > 0 ? null : mmv, estado: 'Pendiente', creada_por: t.usuario,
    };
    const { data: m, error } = await sb.from('condominio_multas').insert(fila).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await sb.from('auditoria').insert({
      accion: 'Multa agregada en condominio', usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      detalles: { _categoria: 'CONDOMINIOS', criticidad: 'ALTA', codigo: c.codigo, condominio: c.nombre, motivo: String(motivo).trim(), multa: m },
    });
    return NextResponse.json({ ok: true, multa: m });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, usuario, motivo } = await req.json();
    const t = await adminActivo(usuario);
    if (!t) return NextResponse.json({ error: 'Solo un administrador puede anular multas.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo de la anulación.' }, { status: 400 });
    const { data, error } = await sb.from('condominio_multas')
      .update({ estado: 'Anulada', anulada_por: t.usuario, motivo_anulacion: String(motivo).trim() })
      .eq('id', id).eq('estado', 'Pendiente').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: 'La multa no existe o ya no está pendiente.' }, { status: 409 });
    await sb.from('auditoria').insert({
      accion: 'Multa anulada en condominio', usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      detalles: { _categoria: 'CONDOMINIOS', criticidad: 'ALTA', motivo: String(motivo).trim(), multa: data[0] },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
