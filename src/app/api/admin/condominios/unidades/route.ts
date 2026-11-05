import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { pendienteDesdeParaMeses, mesesPendientes, periodosPendientes, isResidencialInm } from '@/lib/condominios/motor';
import { tasaVigente } from '@/lib/condominios/servicio';
import { calcularMensualidad } from '@/lib/calculos';
import { obtenerHistorialPagosMultasYPeriodos } from '@/lib/multasPagadas';

export const dynamic = 'force-dynamic';

/** Solo administradores activos pueden tocar la estructura y la deuda de un condominio. */
async function adminActivo(usuario: string) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!u) return null;
  const { data: t } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).limit(1).maybeSingle();
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
    const { data: c } = await sb.from('condominios').select('id, codigo, nombre, cant_declarada').eq('codigo', String(codigo || '').toUpperCase()).limit(1).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });

    const fila: Record<string, any> = { estado: 'Activa', multa_meses: 0, ...limpiar(unidad || {}), condominio_id: c.id, creada_en_modulo: true };
    if (!fila.inmueble && !fila.numero) return NextResponse.json({ error: 'Indique el código del inmueble o el número del local/apartamento.' }, { status: 400 });
    let yaEliminadaId: string | null = null;
    if (fila.inmueble) {
      const { data: ya } = await sb.from('condominio_unidades').select('id, condominio_id, estado, condominios(codigo,nombre)').eq('inmueble', fila.inmueble).limit(1).maybeSingle();
      if (ya) {
        if (ya.estado === 'Eliminada') {
          yaEliminadaId = ya.id;
        } else {
          return NextResponse.json({ error: `El inmueble ${fila.inmueble} ya está registrado en ${(ya as any).condominios?.nombre || 'otro condominio'} (${ya.estado}). Búsquelo y edítelo.` }, { status: 409 });
        }
      }
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

    const { data: nueva, error } = yaEliminadaId
      ? await sb.from('condominio_unidades').update({ ...fila, updated_at: new Date().toISOString() }).eq('id', yaEliminadaId).select('*').single()
      : await sb.from('condominio_unidades').insert(fila).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Ensure it exists in inmuebles with complete synchronized fields
    const notasStr = _actExt && _actExt.length > 0 ? JSON.stringify({ actividades_extra: _actExt }) : null;
    const mesesIniciales = fila.aseo_pendiente_desde ? mesesPendientes(fila.aseo_pendiente_desde) : 0;
    const mmvInicial = fila.tarifa_mmv != null ? Number(fila.tarifa_mmv) : 1.98;
    const esResidencial = String(fila.actividad || '').toUpperCase().includes('RESIDENCIAL');
    if (fila.identidad) {
      await sb.from('contribuyentes').upsert({
        identidad: fila.identidad,
        nombre: fila.propietario || c.nombre,
      }, { onConflict: 'identidad' });
    }
    await sb.from('inmuebles').upsert({
      inmueble: fila.inmueble,
      contribuyente: fila.propietario || c.nombre,
      tipo: esResidencial ? 'RESIDENCIAL' : 'COMERCIAL',
      clasificacion: esResidencial ? 'Residencial' : 'Comercial',
      actividad_principal: fila.actividad,
      estado: 'ACTIVO',
      identidad: fila.identidad,
      mmv_mes: mmvInicial,
      meses_deuda: mesesIniciales,
      deuda_mmv: parseFloat((mesesIniciales * mmvInicial).toFixed(5)),
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
    if ('multa_meses' in upd && Number(upd.multa_meses) > 0) {
      (upd as any).multa_exonerada_hasta = null;
    }
    const esAgente = cambios.agente_retencion === true;
    
    const _tel = upd._telefono; const _cor = upd._correo; const _dir = upd._direccion; const _actExt = upd._actividades_extra;
    delete upd._telefono; delete upd._correo; delete upd._direccion; delete upd._actividades_extra;
    delete (upd as any).condominio_id;

    if (upd.padre_unidad_id === id) return NextResponse.json({ error: 'Una unidad no puede depender de sí misma.' }, { status: 400 });
    if (upd.inmueble && upd.inmueble !== antes.inmueble) {
      const { data: ya } = await sb.from('condominio_unidades').select('id').eq('inmueble', upd.inmueble).limit(1).maybeSingle();
      if (ya) return NextResponse.json({ error: `El inmueble ${upd.inmueble} ya está registrado en otra unidad.` }, { status: 409 });
    }

    // Bloquear si se intenta aumentar o fijar meses pendientes sobre un período cuyo mes ya fue cancelado en el sistema
    if ('aseo_pendiente_desde' in upd && upd.aseo_pendiente_desde) {
      const mesesAntes = mesesPendientes(antes.aseo_pendiente_desde);
      const mesesDespues = mesesPendientes(upd.aseo_pendiente_desde);
      if (mesesDespues > mesesAntes) {
        const periodosNuevos = periodosPendientes(upd.aseo_pendiente_desde);
        const hist = await obtenerHistorialPagosMultasYPeriodos({
          unidad_id: id,
          inmueble: antes.inmueble || upd.inmueble,
          condominio_id: antes.condominio_id,
          codigo_condominio: (antes as any).condominios?.codigo,
          identidad: antes.identidad || upd.identidad,
        });
        const perConflicto = periodosNuevos.find(p => {
          const info = hist.porPeriodo?.[p];
          return Boolean(info && (info.tipo === 'MES' || info.tipo === 'MES_CON_MULTA'));
        });
        if (perConflicto) {
          const info = hist.porPeriodo[perConflicto];
          return NextResponse.json(
            {
              error: `No se puede agregar el período ${perConflicto} (${mesesDespues} meses): ya fue cancelado en el sistema (${info.etiqueta}) con la Referencia: ${info.referencia}.`,
            },
            { status: 409 }
          );
        }
      }
    }
    
    // Actualizar campos en inmuebles (sincronización completa de propietario, identidad, deuda y actividad)
    const inmuebleAActualizar = antes.inmueble || upd.inmueble;
    if (inmuebleAActualizar) {
      const inmUpd: any = {};
      if ('inmueble' in upd && upd.inmueble) inmUpd.inmueble = upd.inmueble;
      if ('numero' in upd) inmUpd.numero_local = upd.numero;
      if ('padre_unidad_id' in upd && !upd.padre_unidad_id) inmUpd.padre_id = null;
      if ('propietario' in upd && upd.propietario) inmUpd.contribuyente = upd.propietario;
      if ('identidad' in upd && upd.identidad) {
        inmUpd.identidad = upd.identidad;
        await sb.from('contribuyentes').upsert({
          identidad: upd.identidad,
          nombre: upd.propietario || antes.propietario || antes.condominios?.nombre || upd.identidad,
        }, { onConflict: 'identidad' });
      }
      if ('agente_retencion' in cambios) inmUpd.agente_retencion = esAgente;
      if (_tel !== undefined) inmUpd.telefono = _tel;
      if (_cor !== undefined) inmUpd.correo_electronico = _cor;
      if (_dir !== undefined) inmUpd.direccion = _dir;
      if ('desocupada_desde' in cambios || _actExt !== undefined) {
        const { data: currInm } = await sb.from('inmuebles').select('notas').eq('inmueble', inmuebleAActualizar).limit(1).maybeSingle();
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
        if (m === 0) {
          inmUpd.multa_bs = 0;
          inmUpd.deuda_congelada_bs = 0;
        }
        if (!('multa_meses' in upd)) {
          upd.multa_meses = Math.max(0, m - 1);
          if (m === 0) upd.multa_exonerada_hasta = null;
        }
      }
      if ('multa_meses' in upd) {
        const mMulta = Math.max(0, Number(upd.multa_meses) || 0);
        const desdeEfectivo = 'aseo_pendiente_desde' in upd ? upd.aseo_pendiente_desde : antes.aseo_pendiente_desde;
        const mDeudaEfectivo = mesesPendientes(desdeEfectivo);
        const mesesConMoraAseo = Math.max(0, mDeudaEfectivo - 1);
        const periodosEfectivos = periodosPendientes(desdeEfectivo);
        const exoneradosCount = Math.max(0, mesesConMoraAseo - mMulta);

        if (mMulta === 0) {
          upd.multa_exonerada_hasta = '2099-12-31';
        } else if (exoneradosCount > 0 && periodosEfectivos[exoneradosCount - 1]) {
          upd.multa_exonerada_hasta = `${periodosEfectivos[exoneradosCount - 1]}-01`;
        } else {
          upd.multa_exonerada_hasta = null;
        }

        const { data: currInmMulta } = await sb.from('inmuebles').select('*').eq('inmueble', inmuebleAActualizar).limit(1).maybeSingle();
        let notaStr = String(inmUpd.notas !== undefined ? (inmUpd.notas || '') : (currInmMulta?.notas || '')).trim();
        if (mMulta === 0) {
          inmUpd.multa_bs = 0;
          if (!notaStr.startsWith('{') && !notaStr.includes('Caso especial: Exonerado de multas')) {
            notaStr = notaStr ? `Caso especial: Exonerado de multas\n${notaStr}` : 'Caso especial: Exonerado de multas';
            inmUpd.notas = notaStr;
          }
          await sb.from('condominio_multas').update({ estado: 'Anulada' }).eq('unidad_id', id).eq('estado', 'Pendiente');
        } else {
          // Calcular multa extra remanente si mMulta > mesesConMoraAseo
          const mesesExtraMulta = Math.max(0, mMulta - mesesConMoraAseo);
          if (mesesExtraMulta > 0 && currInmMulta) {
            const tasaAct = await tasaVigente();
            const esResU = isResidencialInm(currInmMulta);
            const bMesU = calcularMensualidad(currInmMulta, tasaAct > 0 ? tasaAct : 1);
            const tMoraU = esResU ? 0.10 : 0.12;
            inmUpd.multa_bs = Math.round(bMesU * tMoraU * mesesExtraMulta * 100) / 100;
          } else {
            inmUpd.multa_bs = 0;
          }
          if (!notaStr.startsWith('{')) {
            notaStr = notaStr
              .replace(/Caso especial:\s*Exonerado de multas\n?/gi, '')
              .replace(/\[EXONERADO:\d{4}-\d{2}\]\s*/g, '')
              .trim();
            if (exoneradosCount > 0) {
              const tagsExo = periodosEfectivos.slice(0, exoneradosCount).map(k => `[EXONERADO:${k}]`).join(' ');
              notaStr = notaStr ? `${notaStr}\n${tagsExo}` : tagsExo;
            }
            inmUpd.notas = notaStr || null;
          }
        }
      }
      if (upd.estado === 'Eliminada') {
        inmUpd.estado = 'Eliminado';
        inmUpd.condominio_padre_id = null;
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

      // Si la unidad modificada es un contenedor padre (es_grupo = true y tiene hijos con padre_unidad_id = id),
      // propagar propietario, identidad, estado, aseo_pendiente_desde, multa_meses y multa_exonerada_hasta a sus actividades hijas
      const childSync: Record<string, any> = {};
      if ('propietario' in upd) childSync.propietario = upd.propietario;
      if ('identidad' in upd) childSync.identidad = upd.identidad;
      if ('estado' in upd) childSync.estado = upd.estado;
      if ('aseo_pendiente_desde' in upd) childSync.aseo_pendiente_desde = upd.aseo_pendiente_desde;
      if ('multa_meses' in upd) childSync.multa_meses = upd.multa_meses;
      if ('multa_exonerada_hasta' in upd) childSync.multa_exonerada_hasta = (upd as any).multa_exonerada_hasta;

      if (Object.keys(childSync).length > 0) {
        const { data: hijas } = await sb.from('condominio_unidades').select('id, inmueble, tarifa_mmv').eq('padre_unidad_id', id).neq('estado', 'Eliminada');
        if (hijas && hijas.length > 0) {
          await sb.from('condominio_unidades').update(childSync).eq('padre_unidad_id', id).neq('estado', 'Eliminada');
          for (const h of hijas) {
            if (!h.inmueble) continue;
            const hInmUpd: Record<string, any> = {};
            if ('propietario' in childSync && childSync.propietario) hInmUpd.contribuyente = childSync.propietario;
            if ('identidad' in childSync && childSync.identidad) hInmUpd.identidad = childSync.identidad;
            if ('numero' in childSync && childSync.numero) hInmUpd.numero_local = childSync.numero;
            if ('agente_retencion' in cambios) hInmUpd.agente_retencion = esAgente;
            if ('aseo_pendiente_desde' in childSync) {
              const mH = mesesPendientes(childSync.aseo_pendiente_desde);
              const mmvH = Number(h.tarifa_mmv) || 1.98;
              hInmUpd.meses_deuda = mH;
              hInmUpd.deuda_mmv = parseFloat((mH * mmvH).toFixed(5));
              if (mH === 0) {
                hInmUpd.multa_bs = 0;
                hInmUpd.deuda_congelada_bs = 0;
              }
            }
            if (Object.keys(hInmUpd).length > 0) {
              await sb.from('inmuebles').update(hInmUpd).eq('inmueble', h.inmueble);
            }
          }
        }
      }
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
