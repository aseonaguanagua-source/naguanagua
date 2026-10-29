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
  // Save extras temporarily to process in route
  if ('telefono' in c) out._telefono = txt(c.telefono);
  if ('correo' in c) out._correo = txt(c.correo);
  if ('direccion' in c) out._direccion = txt(c.direccion);
  if ('actividades_extra' in c) out._actividades_extra = c.actividades_extra;
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
    // Extra fields processing
    const _tel = fila._telefono; const _cor = fila._correo; const _dir = fila._direccion; const _actExt = fila._actividades_extra;
    delete fila._telefono; delete fila._correo; delete fila._direccion; delete fila._actividades_extra;

    // Generate code if missing
    if (!fila.inmueble) {
      // Find max child
      const { data: maxU } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', c.id).ilike('inmueble', `${c.codigo}-%`).order('inmueble', { ascending: false }).limit(1).maybeSingle();
      let nextNum = 1;
      if (maxU && maxU.inmueble) {
        const p = maxU.inmueble.split('-');
        if (p.length > 1) nextNum = (parseInt(p[p.length-1]) || 0) + 1;
      }
      fila.inmueble = `${c.codigo}-${String(nextNum).padStart(3, '0')}`;
    }

    const { data: nueva, error } = await sb.from('condominio_unidades').insert(fila).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Ensure it exists in inmuebles
    const notasStr = _actExt && _actExt.length > 0 ? JSON.stringify({ actividades_extra: _actExt }) : null;
    await sb.from('inmuebles').upsert({
      inmueble: fila.inmueble,
      tipo: 'COMERCIAL',
      actividad_principal: fila.actividad,
      estado: 'ACTIVO',
      identidad: fila.identidad,
      telefono: _tel,
      correo_electronico: _cor,
      direccion: _dir,
      notas: notasStr,
      condominio_padre_id: c.codigo,
      es_condominio: false
    }, { onConflict: 'inmueble' });
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
    const esAgente = cambios.agente_retencion === true;
    
    const _tel = upd._telefono; const _cor = upd._correo; const _dir = upd._direccion; const _actExt = upd._actividades_extra;
    delete upd._telefono; delete upd._correo; delete upd._direccion; delete upd._actividades_extra;
    delete (upd as any).condominio_id;

    if (upd.padre_unidad_id === id) return NextResponse.json({ error: 'Una unidad no puede depender de sí misma.' }, { status: 400 });
    if (upd.inmueble && upd.inmueble !== antes.inmueble) {
      const { data: ya } = await sb.from('condominio_unidades').select('id').eq('inmueble', upd.inmueble).maybeSingle();
      if (ya) return NextResponse.json({ error: `El inmueble ${upd.inmueble} ya está registrado en otra unidad.` }, { status: 409 });
    }
    
    // Actualizar campos en inmuebles
    const inmuebleAActualizar = upd.inmueble || antes.inmueble;
    if (inmuebleAActualizar) {
      const inmUpd: any = {};
      if ('agente_retencion' in cambios) inmUpd.agente_retencion = esAgente;
      if (_tel !== undefined) inmUpd.telefono = _tel;
      if (_cor !== undefined) inmUpd.correo_electronico = _cor;
      if (_dir !== undefined) inmUpd.direccion = _dir;
      if ('desocupada_desde' in cambios || _actExt !== undefined) {
        const { data: currInm } = await sb.from('inmuebles').select('notas').eq('inmueble', inmuebleAActualizar).maybeSingle();
        let existingNotes: any = {};
        try { if (currInm?.notas) existingNotes = typeof currInm.notas === 'string' ? JSON.parse(currInm.notas) : currInm.notas; } catch {}
        if (_actExt !== undefined) existingNotes.actividades_extra = _actExt;
        if ('desocupada_desde' in cambios) {
          if (cambios.desocupada_desde) {
            existingNotes.desocupada_desde = cambios.desocupada_desde;
            existingNotes.desocupada_hasta = cambios.desocupada_hasta || null;
            existingNotes.tarifa_desocupada_mmv = Number(cambios.tarifa_desocupada_mmv) || 1.98;
            existingNotes.actividad_desocupada = 'INMUEBLES DESOCUPADOS';
            existingNotes.tarifa_activa_mmv = Number(cambios.tarifa_activa_mmv) || 3.77;
            existingNotes.actividad_activa = cambios.actividad_activa || 'LUNCHERIAS (BAJA)';
          } else {
            delete existingNotes.desocupada_desde;
            delete existingNotes.desocupada_hasta;
            delete existingNotes.tarifa_desocupada_mmv;
            delete existingNotes.tarifa_activa_mmv;
            delete existingNotes.actividad_activa;
          }
        }
        inmUpd.notas = Object.keys(existingNotes).length > 0 ? JSON.stringify(existingNotes) : null;
      }
      if ('actividad' in upd) inmUpd.actividad_principal = upd.actividad;
      if ('tarifa_mmv' in upd && upd.tarifa_mmv != null) inmUpd.mmv_mes = upd.tarifa_mmv;
      if ('aseo_pendiente_desde' in upd) {
        const m = mesesPendientes(upd.aseo_pendiente_desde);
        inmUpd.meses_deuda = m;
        const mmvTarifa = upd.tarifa_mmv ?? antes.tarifa_mmv ?? 1.98;
        inmUpd.deuda_mmv = parseFloat((m * Number(mmvTarifa)).toFixed(5));
      }
      if (upd.estado === 'Eliminada') {
        inmUpd.estado = 'Eliminado';
        inmUpd.mmv_mes = 0;
        inmUpd.deuda_mmv = 0;
        inmUpd.cant_inmuebles = 0;
        inmUpd.meses_deuda = 0;
        await sb.from('condominio_multas').update({ estado: 'Anulada' }).eq('unidad_id', id).eq('estado', 'Pendiente');
      }
      if (Object.keys(inmUpd).length > 0) {
        await sb.from('inmuebles').update(inmUpd).eq('inmueble', inmuebleAActualizar);
      }
    }
    // Quitar lo que no cambió
    for (const k of Object.keys(upd)) if (String(upd[k] ?? '') === String(antes[k] ?? '')) delete upd[k];
    if (!Object.keys(upd).length && !('agente_retencion' in cambios) && _tel === undefined && _cor === undefined && _dir === undefined && _actExt === undefined && !('desocupada_desde' in cambios)) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });

    if (Object.keys(upd).length > 0) {
      const { error } = await sb.from('condominio_unidades').update(upd).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const diff: Record<string, any> = Object.fromEntries(Object.keys(upd).map(k => [k, { antes: antes[k], despues: upd[k] }]));
    if ('agente_retencion' in cambios) diff.agente_retencion = { antes: '?', despues: esAgente };
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
