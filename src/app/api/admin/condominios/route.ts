import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { buscarPorDueno, calcularEstado, cargarCondominio, resumenGeneral, tasaVigente } from '@/lib/condominios/servicio';
import { mesesPendientes, pendienteDesdeParaMeses } from '@/lib/condominios/motor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/admin/condominios                → lista + panel (montos calculados con el motor)
 * GET /api/admin/condominios?codigo=URB…    → ficha completa con estado de cuenta
 * GET /api/admin/condominios?dueno=V-123…   → unidades de un dueño
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const codigo = url.searchParams.get('codigo');
    const dueno = url.searchParams.get('dueno');

    if (dueno) return NextResponse.json({ unidades: await buscarPorDueno(dueno) });

    // Lista ligera (Conciliación / Facturación): para reconocer pagos de condominios por su RIF
    if (url.searchParams.get('ligero')) {
      const { data, error } = await sb.from('condominios').select('codigo,identidad,nombre,tipo').limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ condominios: data || [] });
    }

    const buscar = url.searchParams.get('buscar') || url.searchParams.get('q');
    if (buscar) {
      const t = buscar.trim().replace(/[%,()]/g, ' ').trim();
      if (t.length < 2) return NextResponse.json({ condominios: [], unidades: [] });
      const digitos = t.replace(/[^0-9]/g, '');
      const ors = [`nombre.ilike.%${t}%`, `codigo.ilike.%${t}%`, `identidad.ilike.%${t}%`];
      if (digitos.length >= 5) ors.push(`identidad.ilike.%${digitos}%`);
      const { data: cs } = await sb.from('condominios').select('codigo,nombre,identidad,modalidad,tipo,cant_declarada').or(ors.join(',')).limit(25);
      const uors = [`inmueble.ilike.%${t}%`, `numero.ilike.%${t}%`, `propietario.ilike.%${t}%`];
      if (digitos.length >= 5) uors.push(`identidad.ilike.%${digitos}%`);
      const { data: us } = await sb.from('condominio_unidades').select('id,inmueble,numero,propietario,identidad,actividad,tarifa_mmv,estado,condominios!inner(codigo,nombre)').or(uors.join(',')).limit(25);
      return NextResponse.json({ condominios: cs || [], unidades: us || [] });
    }

    if (codigo) {
      const datos = await cargarCondominio(codigo);
      if (!datos) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });
      const tasa = await tasaVigente();
      return NextResponse.json({ ...datos, estado: calcularEstado(datos.condo, datos.unidades, tasa, new Date(), datos.multas) });
    }

    return NextResponse.json(await resumenGeneral());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

const EDITABLES = ['modalidad', 'cant_declarada', 'tarifa_mmv', 'tarifa_fija_bs', 'actividad', 'agente_retencion',
  'permite_pago_por_unidad', 'permite_abonos', 'cobro_tarifa_por_unidad', 'correo', 'telefono', 'administradora', 'notas', 'estado',
  'tipo', 'nombre', 'identidad', 'multa_meses'] as const;

/** PATCH { codigo, cambios, usuario, motivo } — solo administrador; queda en auditoría con el antes/después. */
export async function PATCH(req: Request) {
  try {
    const { codigo, cambios, usuario, motivo } = await req.json();
    const u = String(usuario || '').trim().toLowerCase();
    const { data: trab } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).maybeSingle();
    
    // Si solo modifica notas, teléfono, correo o clave_portal, permitir a cualquier operador o usuario autenticado
    const keysModificadas = Object.keys(cambios || {});
    const soloInfoContactoONotas = keysModificadas.length > 0 && keysModificadas.every(k => ['notas', 'telefono', 'correo', 'clave_portal'].includes(k));
    
    if (!soloInfoContactoONotas) {
      if (!trab || !(trab.rol === 'Administrador' || u === 'dzara')) return NextResponse.json({ error: 'Solo un administrador puede modificar la configuración del condominio.' }, { status: 403 });
      if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo del cambio.' }, { status: 400 });
    }

    const { data: antes } = await sb.from('condominios').select('*').eq('codigo', String(codigo || '').toUpperCase()).maybeSingle();
    if (!antes) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });

    const upd: Record<string, any> = {};
    for (const k of EDITABLES) if (cambios && k in cambios) upd[k] = cambios[k];
    if ('cant_declarada' in upd) upd.cant_declarada = Math.max(1, parseInt(upd.cant_declarada) || 1);
    if ('tarifa_mmv' in upd) upd.tarifa_mmv = upd.tarifa_mmv === '' || upd.tarifa_mmv == null ? null : Number(upd.tarifa_mmv);
    if ('tipo' in upd && !['RESIDENCIAL', 'COMERCIAL', 'MIXTO'].includes(upd.tipo)) return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 });
    if ('multa_meses' in upd) upd.multa_meses = Math.max(0, parseInt(upd.multa_meses) || 0);
    if (cambios && 'meses' in cambios) {
      const nuevo = pendienteDesdeParaMeses(Math.max(0, parseInt(cambios.meses) || 0));
      upd.aseo_pendiente_desde = nuevo;
    }
    if (Object.keys(upd).length === 0 && (!cambios || !('clave_portal' in cambios))) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });

    if (Object.keys(upd).length > 0) {
      const { error } = await sb.from('condominios').update(upd).eq('id', antes.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sincronizar notas en inmuebles
    if ('notas' in upd) {
      await sb.from('inmuebles').update({ notas: upd.notas || null }).eq('inmueble', antes.codigo);
    }
    // Sincronizar teléfono y correo en inmuebles
    if ('telefono' in upd || 'correo' in upd) {
      const inmUpd: any = {};
      if ('telefono' in upd) inmUpd.telefono = upd.telefono || null;
      if ('correo' in upd) inmUpd.correo_electronico = upd.correo || null;
      await sb.from('inmuebles').update(inmUpd).eq('inmueble', antes.codigo);
    }
    // Sincronizar clave_portal en inmuebles
    if (cambios && 'clave_portal' in cambios) {
      const nuevaClave = String(cambios.clave_portal || '').trim() || null;
      await sb.from('inmuebles').update({ clave_portal: nuevaClave }).eq('inmueble', antes.codigo);
      if (antes.identidad) {
        await sb.from('inmuebles').update({ clave_portal: nuevaClave }).eq('identidad', antes.identidad);
      }
    }

    // Sincronizar meses en todas las unidades del condominio y en la tabla inmuebles
    if ('aseo_pendiente_desde' in upd) {
      await sb.from('condominio_unidades').update({ aseo_pendiente_desde: upd.aseo_pendiente_desde }).eq('condominio_id', antes.id);
      const mesesCalc = mesesPendientes(upd.aseo_pendiente_desde);
      await sb.from('inmuebles').update({ meses_deuda: mesesCalc }).eq('inmueble', antes.codigo);
      await sb.from('inmuebles').update({ meses_deuda: mesesCalc }).eq('condominio_padre_id', antes.codigo);
    }
    if ('multa_meses' in upd && Number(upd.multa_meses) === 0) {
      await sb.from('condominio_unidades').update({ multa_meses: 0, multa_exonerada_hasta: upd.aseo_pendiente_desde || antes.aseo_pendiente_desde }).eq('condominio_id', antes.id);
      await sb.from('condominio_multas').update({ estado: 'Anulada', motivo_anulacion: motivo }).eq('condominio_id', antes.id).eq('estado', 'Pendiente');
    }

    // Sincronizar el campo agente_retencion en la tabla inmuebles para el inmueble principal del condominio
    // y para las unidades que son del MISMO RIF del condominio o están desocupadas/sin dueño (se cobran
    // al condominio). Las unidades de otros dueños conservan su propia condición de agente.
    if ('agente_retencion' in upd) {
      await sb.from('inmuebles')
        .update({ agente_retencion: upd.agente_retencion })
        .eq('inmueble', antes.codigo);
      const { data: us } = await sb.from('condominio_unidades').select('inmueble, identidad, estado').eq('condominio_id', antes.id);
      const norm = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const ridCondo = norm(upd.identidad ?? antes.identidad);
      const propias = (us || []).filter((x: any) => x.inmueble && (!x.identidad || x.estado === 'Desocupada' || (ridCondo && norm(x.identidad) === ridCondo))).map((x: any) => x.inmueble);
      for (let i = 0; i < propias.length; i += 200) {
        await sb.from('inmuebles').update({ agente_retencion: !!upd.agente_retencion }).in('inmueble', propias.slice(i, i + 200));
      }
    }

    const diff = Object.fromEntries(Object.keys(upd).map(k => [k, { antes: antes[k], despues: upd[k] }]));
    const nombreUsuario = trab ? `${trab.nombre || trab.usuario} (${trab.usuario})` : (usuario || 'Operador');
    await sb.from('auditoria').insert({
      accion: 'Modificación de condominio', usuario: nombreUsuario,
      detalles: { codigo: antes.codigo, condominio: antes.nombre, motivo: String(motivo || 'Actualización de datos').trim(), cambios: diff, _categoria: 'CONDOMINIOS', criticidad: soloInfoContactoONotas ? 'MEDIA' : 'ALTA' },
    });
    return NextResponse.json({ ok: true, cambios: diff });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/condominios
 * Body: { codigo, usuario, motivo }
 * Elimina un condominio de una sola vez junto con todas sus unidades:
 * 1. Elimina condominio_multas asociadas.
 * 2. Elimina condominio_movimientos asociados.
 * 3. Elimina todas las unidades en condominio_unidades.
 * 4. Elimina el registro del condominio en la tabla condominios.
 * 5. Da de baja en la tabla inmuebles (estado: 'Eliminado', mmv_mes: 0, deuda_mmv: 0, cant_inmuebles: 0)
 *    para la matriz y todas las unidades hijas asociadas.
 * 6. Si no quedan otros inmuebles activos con el RIF del condominio, elimina el registro en contribuyentes.
 * 7. Registra auditoría crítica.
 */
export async function DELETE(req: Request) {
  try {
    const { codigo, usuario, motivo } = await req.json();
    const cod = String(codigo || '').trim().toUpperCase();
    if (!cod) return NextResponse.json({ error: 'Código de condominio requerido' }, { status: 400 });

    const u = String(usuario || '').trim().toLowerCase();
    const { data: trab } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).maybeSingle();
    if (!trab || !(trab.rol === 'Administrador' || u === 'dzara')) {
      return NextResponse.json({ error: 'Solo un administrador puede eliminar un condominio.' }, { status: 403 });
    }

    // 1. Cargar el condominio
    const { data: condo } = await sb.from('condominios').select('*').eq('codigo', cod).maybeSingle();
    if (!condo) {
      return NextResponse.json({ error: `Condominio "${cod}" no encontrado.` }, { status: 404 });
    }

    // 2. Cargar todas sus unidades en condominio_unidades
    const { data: unidades } = await sb.from('condominio_unidades').select('id, inmueble, numero, identidad').eq('condominio_id', condo.id);
    const codigosUnidades = (unidades || []).map(un => un.inmueble).filter(Boolean);

    // 3. Cargar todos los inmuebles asociados en inmuebles (matriz + hijas por condominio_padre_id o padre_id)
    const { data: inmsHijos } = await sb.from('inmuebles')
      .select('inmueble')
      .or(`condominio_padre_id.eq.${cod},padre_id.eq.${cod}`);
    const codigosHijosInms = (inmsHijos || []).map(i => i.inmueble).filter(Boolean);

    const todosLosCodigos = Array.from(new Set([cod, ...codigosUnidades, ...codigosHijosInms]));

    // 4. Eliminar multas de condominio
    await sb.from('condominio_multas').delete().eq('condominio_id', condo.id);

    // 5. Eliminar movimientos de condominio
    await sb.from('condominio_movimientos').delete().eq('condominio_id', condo.id);

    // 6. Eliminar unidades en condominio_unidades
    await sb.from('condominio_unidades').delete().eq('condominio_id', condo.id);

    // 7. Eliminar el condominio de la tabla condominios
    const { error: errDelCondo } = await sb.from('condominios').delete().eq('id', condo.id);
    if (errDelCondo) {
      return NextResponse.json({ error: 'Error al eliminar condominio: ' + errDelCondo.message }, { status: 500 });
    }

    // 8. En la tabla inmuebles, dar de baja matriz y todas las unidades
    if (todosLosCodigos.length > 0) {
      for (let i = 0; i < todosLosCodigos.length; i += 100) {
        const batch = todosLosCodigos.slice(i, i + 100);
        await sb.from('inmuebles')
          .update({
            estado: 'Eliminado',
            mmv_mes: 0,
            deuda_mmv: 0,
            cant_inmuebles: 0,
            meses_deuda: 0,
            saldo_favor_bs: 0,
            es_condominio: false
          })
          .in('inmueble', batch);
      }
    }

    // 9. Si el RIF del condominio no tiene más inmuebles activos, dar de baja en contribuyentes
    if (condo.identidad) {
      const { data: remainingActive } = await sb.from('inmuebles')
        .select('id')
        .eq('identidad', condo.identidad)
        .neq('estado', 'Eliminado')
        .limit(1);

      if (!remainingActive || remainingActive.length === 0) {
        await sb.from('contribuyentes').delete().eq('identidad', condo.identidad);
      }
    }

    // 10. Auditoría
    const nombreUsuario = trab ? `${trab.nombre || trab.usuario} (${trab.usuario})` : (usuario || 'Administrador');
    await sb.from('auditoria').insert({
      accion: 'Eliminación completa de condominio y unidades',
      usuario: nombreUsuario,
      detalles: {
        codigo: condo.codigo,
        nombre: condo.nombre,
        identidad: condo.identidad,
        total_unidades_eliminadas: (unidades || []).length,
        codigos_inmuebles_afectados: todosLosCodigos,
        motivo: String(motivo || 'Eliminado por el administrador').trim(),
        _categoria: 'CONDOMINIOS',
        criticidad: 'CRITICA'
      }
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Condominio "${condo.nombre}" (${condo.codigo}) y sus ${(unidades || []).length} unidades fueron eliminados exitosamente.`,
      unidadesEliminadas: (unidades || []).length,
      codigosAfectados: todosLosCodigos
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error en el servidor' }, { status: 500 });
  }
}

