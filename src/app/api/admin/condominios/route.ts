import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { buscarPorDueno, calcularEstado, cargarCondominio, resumenGeneral, tasaVigente } from '@/lib/condominios/servicio';
import { mesesPendientes, pendienteDesdeParaMeses, periodosPendientes } from '@/lib/condominios/motor';
import { obtenerHistorialPagosMultasYPeriodos } from '@/lib/multasPagadas';

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
      const { data, error } = await sb.from('condominios').select('codigo,identidad,nombre,tipo').neq('estado', 'Eliminado').limit(5000);
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
      const { data: cs } = await sb.from('condominios').select('codigo,nombre,identidad,modalidad,tipo,cant_declarada').neq('estado', 'Eliminado').or(ors.join(',')).limit(25);
      const uors = [`inmueble.ilike.%${t}%`, `numero.ilike.%${t}%`, `propietario.ilike.%${t}%`];
      if (digitos.length >= 5) uors.push(`identidad.ilike.%${digitos}%`);
      const { data: us } = await sb.from('condominio_unidades').select('id,inmueble,numero,propietario,identidad,actividad,tarifa_mmv,estado,condominios!inner(codigo,nombre,estado)').neq('estado', 'Eliminada').neq('condominios.estado', 'Eliminado').or(uors.join(',')).limit(25);
      const codsUs = (us || []).map((u: any) => u.inmueble).filter(Boolean);
      const sfMap = new Map<string, number>();
      if (codsUs.length > 0) {
        const { data: inmsUs } = await sb.from('inmuebles').select('inmueble, saldo_favor_bs').in('inmueble', codsUs);
        (inmsUs || []).forEach((r: any) => {
          const val = parseFloat(r.saldo_favor_bs || '0') || 0;
          if (val >= 1.00 && r.inmueble) sfMap.set(String(r.inmueble).toUpperCase(), Math.round(val * 100) / 100);
        });
      }
      const usEnriquecidas = (us || []).map((u: any) => ({
        ...u,
        saldo_favor_bs: u.inmueble ? (sfMap.get(String(u.inmueble).toUpperCase()) || 0) : 0,
      }));
      return NextResponse.json({ condominios: cs || [], unidades: usEnriquecidas });
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
  'tipo', 'nombre', 'identidad', 'multa_meses', 'direccion'] as const;

/** PATCH { codigo, cambios, usuario, motivo } — solo administrador; queda en auditoría con el antes/después. */
export async function PATCH(req: Request) {
  try {
    const { codigo, cambios, usuario, motivo } = await req.json();
    const u = String(usuario || '').trim().toLowerCase();
    const { data: trab } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).limit(1).maybeSingle();
    
    // Si solo modifica notas, teléfono, correo, dirección, clave_portal o agente_retencion, permitir a cualquier operador o usuario autenticado
    const keysModificadas = Object.keys(cambios || {});
    const soloInfoContactoONotas = keysModificadas.length > 0 && keysModificadas.every(k => ['notas', 'telefono', 'correo', 'direccion', 'clave_portal', 'agente_retencion'].includes(k));
    
    if (!soloInfoContactoONotas) {
      if (!trab || !(trab.rol === 'Administrador' || u === 'dzara')) return NextResponse.json({ error: 'Solo un administrador puede modificar la configuración del condominio.' }, { status: 403 });
      if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo del cambio.' }, { status: 400 });
    }

    const { data: antes } = await sb.from('condominios').select('*').eq('codigo', String(codigo || '').toUpperCase()).limit(1).maybeSingle();
    if (!antes) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });

    const upd: Record<string, any> = {};
    for (const k of EDITABLES) if (cambios && k in cambios) upd[k] = cambios[k];
    if ('cant_declarada' in upd) upd.cant_declarada = Math.max(1, parseInt(upd.cant_declarada) || 1);
    if ('tarifa_mmv' in upd) upd.tarifa_mmv = upd.tarifa_mmv === '' || upd.tarifa_mmv == null ? null : Number(upd.tarifa_mmv);
    if ('tipo' in upd && !['RESIDENCIAL', 'COMERCIAL', 'MIXTO'].includes(upd.tipo)) return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 });
    if ('multa_meses' in upd) {
      upd.multa_meses = Math.max(0, parseInt(upd.multa_meses) || 0);
      if (upd.multa_meses > 0) {
        upd.multa_exonerada_hasta = null;
      }
    }
    if (cambios && 'meses' in cambios) {
      const nuevo = pendienteDesdeParaMeses(Math.max(0, parseInt(cambios.meses) || 0));
      const mesesAntes = mesesPendientes(antes.aseo_pendiente_desde);
      const mesesDespues = mesesPendientes(nuevo);
      if (mesesDespues > mesesAntes && nuevo) {
        const periodosNuevos = periodosPendientes(nuevo);
        const hist = await obtenerHistorialPagosMultasYPeriodos({
          inmueble: antes.codigo,
          condominio_id: antes.id,
          codigo_condominio: antes.codigo,
          identidad: antes.identidad,
        });
        const perConflicto = periodosNuevos.find(p => {
          const info = hist.porPeriodo?.[p];
          return Boolean(info && (info.tipo === 'MES' || info.tipo === 'MES_CON_MULTA'));
        });
        if (perConflicto) {
          const info = hist.porPeriodo[perConflicto];
          return NextResponse.json(
            {
              error: `No se puede agregar el período ${perConflicto} (${mesesDespues} meses) al condominio ${antes.codigo}: ya fue cancelado en el sistema (${info.etiqueta}) con la Referencia: ${info.referencia}.`,
            },
            { status: 409 }
          );
        }
      }
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
    if ('telefono' in upd || 'correo' in upd || 'direccion' in upd) {
      const inmUpd: any = {};
      if ('telefono' in upd) inmUpd.telefono = upd.telefono || null;
      if ('correo' in upd) inmUpd.correo_electronico = upd.correo || null;
      if ('direccion' in upd) inmUpd.direccion = upd.direccion || null;
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
    const { data: uHijasSync } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', antes.id).neq('estado', 'Eliminada');
    const codigosHijosSync = Array.from(new Set([antes.codigo, ...(uHijasSync || []).map((x: any) => x.inmueble).filter(Boolean)]));

    if ('aseo_pendiente_desde' in upd) {
      const mesesCalc = mesesPendientes(upd.aseo_pendiente_desde);
      const nuevosMesesMulta = Math.max(0, mesesCalc - 1);
      await sb.from('condominio_unidades').update({
        aseo_pendiente_desde: upd.aseo_pendiente_desde,
        ...(!('multa_meses' in upd) ? { multa_meses: nuevosMesesMulta } : {})
      }).eq('condominio_id', antes.id);
      if (!('multa_meses' in upd)) {
        await sb.from('condominios').update({ multa_meses: nuevosMesesMulta }).eq('id', antes.id);
      }
      await sb.from('inmuebles').update({ meses_deuda: mesesCalc, ...(mesesCalc === 0 ? { multa_bs: 0, deuda_congelada_bs: 0, deuda_mmv: 0 } : {}) }).eq('inmueble', antes.codigo);
      await sb.from('inmuebles').update({ meses_deuda: mesesCalc, ...(mesesCalc === 0 ? { multa_bs: 0, deuda_congelada_bs: 0, deuda_mmv: 0 } : {}) }).eq('condominio_padre_id', antes.codigo);
      for (let i = 0; i < codigosHijosSync.length; i += 200) {
        const { data: inmsLote } = await sb.from('inmuebles').select('id, mmv_mes').in('inmueble', codigosHijosSync.slice(i, i + 200));
        for (const ir of (inmsLote || [])) {
          const mmv = Number(ir.mmv_mes) || 0;
          await sb.from('inmuebles').update({
            meses_deuda: mesesCalc,
            deuda_mmv: parseFloat((mesesCalc * mmv).toFixed(5)),
            ...(mesesCalc === 0 ? { multa_bs: 0, deuda_congelada_bs: 0 } : {})
          }).eq('id', ir.id);
        }
      }
    }
    if ('multa_meses' in upd) {
      const mMulta = Math.max(0, Number(upd.multa_meses) || 0);
      if (mMulta === 0) {
        await sb.from('condominio_unidades').update({ multa_meses: 0, multa_exonerada_hasta: '2099-12-31' }).eq('condominio_id', antes.id);
        await sb.from('condominios').update({ multa_exonerada_hasta: '2099-12-31' }).eq('id', antes.id);
        await sb.from('condominio_multas').update({ estado: 'Anulada', motivo_anulacion: motivo }).eq('condominio_id', antes.id).eq('estado', 'Pendiente');
      } else if (mMulta > 0) {
        await sb.from('condominio_unidades').update({ multa_meses: mMulta, multa_exonerada_hasta: null }).eq('condominio_id', antes.id).neq('estado', 'Eliminada');
      }
      for (let i = 0; i < codigosHijosSync.length; i += 200) {
        const { data: inmsLote } = await sb.from('inmuebles').select('id, notas').in('inmueble', codigosHijosSync.slice(i, i + 200));
        for (const ir of (inmsLote || [])) {
          let notaStr = String(ir.notas || '').trim();
          if (mMulta === 0) {
            if (!notaStr.startsWith('{') && !notaStr.includes('Caso especial: Exonerado de multas')) {
              notaStr = notaStr ? `Caso especial: Exonerado de multas\n${notaStr}` : 'Caso especial: Exonerado de multas';
            }
            await sb.from('inmuebles').update({ multa_bs: 0, notas: notaStr || null }).eq('id', ir.id);
          } else {
            if (!notaStr.startsWith('{')) {
              notaStr = notaStr
                .replace(/Caso especial:\s*Exonerado de multas\n?/gi, '')
                .replace(/\[EXONERADO:\d{4}-\d{2}\]\s*/g, '')
                .trim();
              await sb.from('inmuebles').update({ notas: notaStr || null }).eq('id', ir.id);
            }
          }
        }
      }
    }

    // Sincronizar el campo agente_retencion en el inmueble matriz y en las unidades del condominio
    if ('agente_retencion' in upd) {
      const nuevoAgente = !!upd.agente_retencion;
      
      // 1. Inmueble principal del condominio
      await sb.from('inmuebles')
        .update({ agente_retencion: nuevoAgente })
        .eq('inmueble', antes.codigo);

      // 2. Inmuebles matriz con la identidad propia del condominio
      const condoIdent = upd.identidad ?? antes.identidad;
      if (condoIdent) {
        await sb.from('inmuebles')
          .update({ agente_retencion: nuevoAgente })
          .eq('identidad', condoIdent)
          .eq('es_condominio', true);
      }

      // 3. Si se desmarca agente_retencion en el condominio, o se actualiza a nivel del condominio,
      // sincronizar también en las unidades hijas asociadas al condominio para que no queden con retención forzada
      await sb.from('inmuebles')
        .update({ agente_retencion: nuevoAgente })
        .eq('condominio_padre_id', antes.codigo);

      for (let i = 0; i < codigosHijosSync.length; i += 200) {
        await sb.from('inmuebles')
          .update({ agente_retencion: nuevoAgente })
          .in('inmueble', codigosHijosSync.slice(i, i + 200));
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
    const cod = String(codigo || '').replace(/[,()]/g, '').trim().toUpperCase();
    if (!cod) return NextResponse.json({ error: 'Código de condominio requerido' }, { status: 400 });

    const u = String(usuario || '').trim().toLowerCase();
    const { data: trab } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).limit(1).maybeSingle();
    if (!trab || !(trab.rol === 'Administrador' || u === 'dzara')) {
      return NextResponse.json({ error: 'Solo un administrador puede eliminar un condominio.' }, { status: 403 });
    }

    // 1. Cargar el condominio
    const { data: condo } = await sb.from('condominios').select('*').eq('codigo', cod).limit(1).maybeSingle();
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

