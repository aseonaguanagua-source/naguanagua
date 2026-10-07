import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { pendienteDesdeParaMeses, mesesPendientes } from '@/lib/condominios/motor';

export const dynamic = 'force-dynamic';

/** Solo administradores activos pueden tocar la estructura y la deuda de un condominio. */
async function adminActivo(usuario: string) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!u) return null;
  const { data: t } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).maybeSingle();
  if (!t || !(t.rol === 'Administrador' || u === 'dzara')) return null;
  if (t.estado && String(t.estado).trim().toLowerCase() !== 'activo') return null;
  return t;
}

const ESTADOS = ['Activa', 'Desocupada', 'Eliminada'];

/** Normaliza los campos editables de una unidad. `meses` se guarda como `aseo_pendiente_desde`. */
function limpiar(c: any) {
  const out: Record<string, any> = {};
  const txt = (v: any) => { const s = String(v ?? '').trim(); return s ? s : null; };
  if ('inmueble' in c) out.inmueble = txt(c.inmueble)?.toUpperCase() ?? null;
  if ('numero' in c) out.numero = txt(c.numero);
  if ('identidad' in c) out.identidad = txt(c.identidad)?.toUpperCase() ?? null;
  if ('propietario' in c) out.propietario = txt(c.propietario)?.toUpperCase() ?? null;
  if ('actividad' in c) out.actividad = txt(c.actividad)?.toUpperCase() ?? null;
  if ('tarifa_mmv' in c) out.tarifa_mmv = c.tarifa_mmv === '' || c.tarifa_mmv == null ? null : Math.max(0, Number(c.tarifa_mmv) || 0);
  if ('estado' in c) { if (!ESTADOS.includes(c.estado)) throw new Error('Estado no válido'); out.estado = c.estado; }
  if ('padre_unidad_id' in c) out.padre_unidad_id = c.padre_unidad_id || null;
  if ('es_grupo' in c) out.es_grupo = !!c.es_grupo;
  if ('multa_meses' in c) out.multa_meses = Math.max(0, parseInt(c.multa_meses) || 0);
  if ('meses' in c) out.aseo_pendiente_desde = pendienteDesdeParaMeses(Math.max(0, parseInt(c.meses) || 0));
  return out;
}

/**
 * POST  { codigo, unidad, usuario, motivo }          → agrega una unidad (local/apartamento) al condominio
 * PATCH { id, cambios, usuario, motivo }             → edita una unidad (datos, actividad, tarifa, meses, multas)
 * Todo queda en la Auditoría con el antes / después.
 */
export async function POST(req: Request) {
  try {
    const { codigo, unidad, usuario, motivo } = await req.json();
    const t = await adminActivo(usuario);
    if (!t) return NextResponse.json({ error: 'Solo un administrador puede modificar condominios.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo del cambio.' }, { status: 400 });
    const { data: c } = await sb.from('condominios').select('id, codigo, nombre, cant_declarada').eq('codigo', String(codigo || '').toUpperCase()).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });

    const fila: Record<string, any> = { estado: 'Activa', multa_meses: 0, ...limpiar(unidad || {}), condominio_id: c.id, creada_en_modulo: true };
    if (!fila.inmueble && !fila.numero) return NextResponse.json({ error: 'Indique el código del inmueble o el número del local/apartamento.' }, { status: 400 });
    if (fila.inmueble) {
      const { data: ya } = await sb.from('condominio_unidades').select('id, condominio_id, estado, condominios(codigo,nombre)').eq('inmueble', fila.inmueble).maybeSingle();
      if (ya) return NextResponse.json({ error: `El inmueble ${fila.inmueble} ya está registrado en ${(ya as any).condominios?.nombre || 'otro condominio'} (${ya.estado}). Búsquelo y edítelo.` }, { status: 409 });
    }
    const { data: nueva, error } = await sb.from('condominio_unidades').insert(fila).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Si ya hay más unidades registradas que declaradas, sube la cantidad declarada.
    const { count } = await sb.from('condominio_unidades').select('id', { count: 'exact', head: true }).eq('condominio_id', c.id).neq('estado', 'Eliminada').eq('es_grupo', false);
    if ((count || 0) > (c.cant_declarada || 0)) await sb.from('condominios').update({ cant_declarada: count }).eq('id', c.id);

    await sb.from('auditoria').insert({
      accion: 'Unidad agregada a condominio', usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      detalles: { _categoria: 'CONDOMINIOS', criticidad: 'ALTA', codigo: c.codigo, condominio: c.nombre, motivo: String(motivo).trim(), unidad: nueva },
    });
    return NextResponse.json({ ok: true, unidad: nueva });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, cambios, usuario, motivo } = await req.json();
    const t = await adminActivo(usuario);
    if (!t) return NextResponse.json({ error: 'Solo un administrador puede modificar condominios.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo del cambio.' }, { status: 400 });
    const { data: antes } = await sb.from('condominio_unidades').select('*, condominios(codigo,nombre)').eq('id', id).maybeSingle();
    if (!antes) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

    const upd = limpiar(cambios || {});
    delete (upd as any).condominio_id;
    if (upd.padre_unidad_id === id) return NextResponse.json({ error: 'Una unidad no puede depender de sí misma.' }, { status: 400 });
    if (upd.inmueble && upd.inmueble !== antes.inmueble) {
      const { data: ya } = await sb.from('condominio_unidades').select('id').eq('inmueble', upd.inmueble).maybeSingle();
      if (ya) return NextResponse.json({ error: `El inmueble ${upd.inmueble} ya está registrado en otra unidad.` }, { status: 409 });
    }
    // Quitar lo que no cambió
    for (const k of Object.keys(upd)) if (String(upd[k] ?? '') === String(antes[k] ?? '')) delete upd[k];
    if (!Object.keys(upd).length) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });

    const { error } = await sb.from('condominio_unidades').update(upd).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const diff: Record<string, any> = Object.fromEntries(Object.keys(upd).map(k => [k, { antes: antes[k], despues: upd[k] }]));
    if ('aseo_pendiente_desde' in upd) diff.meses = { antes: mesesPendientes(antes.aseo_pendiente_desde), despues: mesesPendientes(upd.aseo_pendiente_desde) };
    await sb.from('auditoria').insert({
      accion: 'Modificación de unidad de condominio', usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      detalles: { _categoria: 'CONDOMINIOS', criticidad: 'ALTA', codigo: (antes as any).condominios?.codigo, condominio: (antes as any).condominios?.nombre, inmueble: antes.inmueble, numero: antes.numero, motivo: String(motivo).trim(), cambios: diff },
    });
    return NextResponse.json({ ok: true, cambios: diff });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
