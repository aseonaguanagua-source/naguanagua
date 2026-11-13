import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { mesesPendientes, isResidencialInm } from '@/lib/condominios/motor';

export const dynamic = 'force-dynamic';

const SUPERUSUARIOS_ADMIN = new Set(['dzara', 'isamar', 'raquel', 'nell', 'admin', 'administrador']);

async function adminActivo(usuario: string) {
  let u = String(usuario || '').trim().toLowerCase();
  if (u.includes('(')) u = u.split('(')[1].replace(')', '').trim();
  u = u.replace(/^[a-z]-/i, '').trim();
  if (!u) return { usuario: 'administrador', nombre: 'Administrador', rol: 'Administrador', estado: 'Activo' };
  const { data: t } = await sb.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).limit(1).maybeSingle();
  if (!t) {
    if (SUPERUSUARIOS_ADMIN.has(u)) return { usuario: u, nombre: u, rol: 'Administrador', estado: 'Activo' };
    return null;
  }
  if (t.estado && String(t.estado).trim().toLowerCase() !== 'activo') return null;
  if (!(t.rol === 'Administrador' || t.rol === 'Personalizado' || SUPERUSUARIOS_ADMIN.has(u))) return null;
  return t;
}

/**
 * POST /api/admin/condominios/extraer-contribuyente
 * Body: { unidad_id?, inmueble, condominio_codigo?, usuario, motivo }
 *
 * Saca una unidad/código particular de su condominio, lo excluye del condominio
 * y lo convierte en un contribuyente independiente en Contribuyentes / Caja General:
 * 1. Marca la unidad (y sus actividades hijas si es un contenedor N/A / grupo) como 'Eliminada' en `condominio_unidades`
 *    para que quede excluida del condominio sin romper referencias históricas en `condominio_movimientos`.
 * 2. Ajusta `cant_declarada` del condominio restando las unidades activas extraídas para no generar "unidades sin registrar".
 * 3. En `inmuebles`: limpia `condominio_padre_id = null`, `es_condominio = false`, activa `estado = 'ACTIVO'`,
 *    desvincula `padre_id = null` en el código principal extraído (manteniendo `padre_id = codigoPrincipal` en sus actividades hijas si las tiene),
 *    y sincroniza sus datos de propietario, RIF/Cédula, actividad, tarifa MMV y meses pendientes.
 * 4. Asegura que el titular exista activo en la tabla `contribuyentes`.
 * 5. Registra la operación completa en `auditoria`.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { unidad_id, inmueble, condominio_codigo, usuario, motivo } = body || {};

    const t = await adminActivo(usuario);
    if (!t) {
      return NextResponse.json({ ok: false, error: 'Solo un administrador autorizado puede extraer un código de un condominio.' }, { status: 403 });
    }

    const mot = String(motivo || '').trim();
    if (mot.length < 5) {
      return NextResponse.json({ ok: false, error: 'Debe indicar un motivo descriptivo para la auditoría (mínimo 5 caracteres).' }, { status: 400 });
    }

    // 1. Localizar la unidad en condominio_unidades
    let unidadActual: any = null;
    if (unidad_id) {
      const { data } = await sb
        .from('condominio_unidades')
        .select('*, condominios(id, codigo, nombre, cant_declarada, aseo_pendiente_desde)')
        .eq('id', unidad_id)
        .limit(1)
        .maybeSingle();
      unidadActual = data;
    }

    const inmobCodeInput = String(inmueble || unidadActual?.inmueble || '').trim().toUpperCase();
    if (!unidadActual && inmobCodeInput) {
      const { data } = await sb
        .from('condominio_unidades')
        .select('*, condominios(id, codigo, nombre, cant_declarada, aseo_pendiente_desde)')
        .ilike('inmueble', inmobCodeInput)
        .neq('estado', 'Eliminada')
        .limit(1)
        .maybeSingle();
      unidadActual = data;
    }

    const codigoPrincipal = String(unidadActual?.inmueble || inmobCodeInput || '').trim().toUpperCase();
    if (!codigoPrincipal) {
      return NextResponse.json({ ok: false, error: 'Esta unidad no posee un código de inmueble asignado (ej. URB / AURI). Asígnele un código antes de convertirla en contribuyente independiente.' }, { status: 400 });
    }

    // 2. Resolver datos del condominio origen
    let condoOrigen: any = unidadActual?.condominios || null;
    if (!condoOrigen && (unidadActual?.condominio_id || condominio_codigo)) {
      const qCondo = unidadActual?.condominio_id
        ? sb.from('condominios').select('id, codigo, nombre, cant_declarada, aseo_pendiente_desde').eq('id', unidadActual.condominio_id)
        : sb.from('condominios').select('id, codigo, nombre, cant_declarada, aseo_pendiente_desde').eq('codigo', String(condominio_codigo).trim().toUpperCase());
      const { data: cData } = await qCondo.limit(1).maybeSingle();
      condoOrigen = cData;
    }

    // 3. Buscar si la unidad tiene actividades hijas en condominio_unidades (cuando es contenedor N/A o torre/local)
    let hijasCondo: any[] = [];
    if (unidadActual?.id) {
      const { data: hData } = await sb
        .from('condominio_unidades')
        .select('*')
        .eq('padre_unidad_id', unidadActual.id)
        .neq('estado', 'Eliminada');
      hijasCondo = hData || [];
    }

    // También buscar en inmuebles el registro principal y posibles hijos por padre_id
    const { data: inmPrincipal } = await sb
      .from('inmuebles')
      .select('*')
      .ilike('inmueble', codigoPrincipal)
      .limit(1)
      .maybeSingle();

    const { data: inmsHijosPorPadre } = await sb
      .from('inmuebles')
      .select('*')
      .ilike('padre_id', codigoPrincipal)
      .neq('estado', 'Eliminado');

    // 4. Excluir del condominio en condominio_unidades (la unidad principal y sus hijas si las tiene)
    const idsUnidadesAExcluir = [
      ...(unidadActual?.id ? [unidadActual.id] : []),
      ...hijasCondo.map((h: any) => h.id).filter(Boolean),
    ];

    let unidadesNoGrupoExtraidas = 0;
    if (unidadActual) {
      if (hijasCondo.length > 0) {
        unidadesNoGrupoExtraidas = hijasCondo.filter((h: any) => !h.es_grupo && h.estado !== 'Eliminada').length;
      } else if (!unidadActual.es_grupo && unidadActual.estado !== 'Eliminada') {
        unidadesNoGrupoExtraidas = 1;
      }
    }

    if (idsUnidadesAExcluir.length > 0) {
      const { error: errUpdUnidades } = await sb
        .from('condominio_unidades')
        .update({
          estado: 'Eliminada',
          padre_unidad_id: null,
          es_grupo: false,
          updated_at: new Date().toISOString(),
        })
        .in('id', idsUnidadesAExcluir);

      if (errUpdUnidades) {
        return NextResponse.json({ ok: false, error: `Error al excluir unidad del condominio: ${errUpdUnidades.message}` }, { status: 500 });
      }

      // Anular multas pendientes asociadas dentro del módulo de condominios para que no sigan sumando al condominio
      await sb
        .from('condominio_multas')
        .update({ estado: 'Anulada' })
        .in('unidad_id', idsUnidadesAExcluir)
        .eq('estado', 'Pendiente');
    }

    // Si la unidad extraída colgaba de un contenedor padre dentro del condominio, verificar si ese padre quedó sin hijas activas
    if (unidadActual?.padre_unidad_id) {
      const { count: remHijasPadre } = await sb
        .from('condominio_unidades')
        .select('id', { count: 'exact', head: true })
        .eq('padre_unidad_id', unidadActual.padre_unidad_id)
        .neq('estado', 'Eliminada');
      if (!remHijasPadre) {
        await sb
          .from('condominio_unidades')
          .update({ es_grupo: false })
          .eq('id', unidadActual.padre_unidad_id);
      }
    }

    // 5. Actualizar cant_declarada del condominio para que no quede cobrando la unidad excluida como "sin registrar"
    if (condoOrigen?.id && unidadesNoGrupoExtraidas > 0) {
      const { count: activasRestantes } = await sb
        .from('condominio_unidades')
        .select('id', { count: 'exact', head: true })
        .eq('condominio_id', condoOrigen.id)
        .neq('estado', 'Eliminada')
        .eq('es_grupo', false);

      const cantDeclaradaActual = Number(condoOrigen.cant_declarada) || 0;
      const nuevaCantDeclarada = Math.max(
        activasRestantes || 0,
        Math.max(1, cantDeclaradaActual - unidadesNoGrupoExtraidas)
      );

      if (nuevaCantDeclarada !== cantDeclaradaActual) {
        await sb
          .from('condominios')
          .update({ cant_declarada: nuevaCantDeclarada })
          .eq('id', condoOrigen.id);
      }
    }

    // 6. Preparar y actualizar/crear el registro independiente en `inmuebles` y `contribuyentes`
    const propietarioFinal = String(
      unidadActual?.propietario || inmPrincipal?.contribuyente || inmPrincipal?.nombre || 'SIN NOMBRE'
    ).trim().toUpperCase();
    const identidadFinal = String(
      unidadActual?.identidad || inmPrincipal?.identidad || ''
    ).trim().toUpperCase() || null;
    const actividadFinal = String(
      unidadActual?.actividad || inmPrincipal?.actividad_principal || 'COMERCIO'
    ).trim().toUpperCase();
    const esRes = isResidencialInm({
      tipo: inmPrincipal?.tipo || '',
      clasificacion: inmPrincipal?.clasificacion || '',
      actividad_principal: actividadFinal,
    });
    const desdeEfectivo = unidadActual?.aseo_pendiente_desde !== undefined
      ? unidadActual.aseo_pendiente_desde
      : condoOrigen?.aseo_pendiente_desde;
    const mesesDeudaCalc = desdeEfectivo !== undefined
      ? mesesPendientes(desdeEfectivo)
      : Math.max(0, parseInt(String(inmPrincipal?.meses_deuda ?? 0), 10) || 0);
    const mmvPrincipal = unidadActual?.tarifa_mmv != null
      ? Number(unidadActual.tarifa_mmv)
      : (inmPrincipal?.mmv_mes != null ? Number(inmPrincipal.mmv_mes) : (esRes ? 0.91 : 1.98));
    const deudaMmvPrincipal = parseFloat((mesesDeudaCalc * mmvPrincipal).toFixed(5));

    if (identidadFinal) {
      await sb.from('contribuyentes').upsert(
        {
          identidad: identidadFinal,
          nombre: propietarioFinal,
          telefono: inmPrincipal?.telefono || null,
          email: inmPrincipal?.correo_electronico || null,
          direccion: inmPrincipal?.direccion || null,
          clasificacion: esRes ? 'Residencial' : 'Comercial',
          actividad: actividadFinal,
          estado: 'Activo',
        },
        { onConflict: 'identidad' }
      );
    }

    if (inmPrincipal) {
      const { error: errInmUpd } = await sb
        .from('inmuebles')
        .update({
          contribuyente: propietarioFinal,
          identidad: identidadFinal,
          actividad_principal: actividadFinal,
          tipo: esRes ? 'RESIDENCIAL' : 'COMERCIAL',
          clasificacion: esRes ? 'Residencial' : 'Comercial',
          estado: 'ACTIVO',
          condominio_padre_id: null,
          padre_id: null,
          es_condominio: false,
          mmv_mes: mmvPrincipal,
          meses_deuda: mesesDeudaCalc,
          deuda_mmv: deudaMmvPrincipal,
        })
        .eq('id', inmPrincipal.id);

      if (errInmUpd) {
        return NextResponse.json({ ok: false, error: `Error al actualizar inmueble independiente: ${errInmUpd.message}` }, { status: 500 });
      }
    } else {
      const { error: errInmIns } = await sb
        .from('inmuebles')
        .insert({
          inmueble: codigoPrincipal,
          numero_local: unidadActual?.numero || null,
          contribuyente: propietarioFinal,
          identidad: identidadFinal,
          actividad_principal: actividadFinal,
          tipo: esRes ? 'RESIDENCIAL' : 'COMERCIAL',
          clasificacion: esRes ? 'Residencial' : 'Comercial',
          estado: 'ACTIVO',
          condominio_padre_id: null,
          padre_id: null,
          es_condominio: false,
          mmv_mes: mmvPrincipal,
          meses_deuda: mesesDeudaCalc,
          deuda_mmv: deudaMmvPrincipal,
          cant_inmuebles: 1,
        });

      if (errInmIns) {
        return NextResponse.json({ ok: false, error: `Error al crear inmueble independiente: ${errInmIns.message}` }, { status: 500 });
      }
    }

    // 7. Si tenía actividades hijas (en condominio_unidades o en inmuebles), mantenerlas vinculadas a `padre_id = codigoPrincipal` pero FUERA del condominio (`condominio_padre_id = null`)
    const codigosHijos = Array.from(
      new Set([
        ...hijasCondo.map((h: any) => String(h.inmueble || '').trim().toUpperCase()).filter(Boolean),
        ...(inmsHijosPorPadre || []).map((h: any) => String(h.inmueble || '').trim().toUpperCase()).filter(Boolean),
      ])
    ).filter(c => c !== codigoPrincipal);

    if (codigosHijos.length > 0) {
      for (const codH of codigosHijos) {
        const uHija = hijasCondo.find((h: any) => String(h.inmueble || '').trim().toUpperCase() === codH);
        const mHija = uHija?.aseo_pendiente_desde !== undefined ? mesesPendientes(uHija.aseo_pendiente_desde) : mesesDeudaCalc;
        const updHija: Record<string, any> = {
          condominio_padre_id: null,
          padre_id: codigoPrincipal,
          es_condominio: false,
          estado: 'ACTIVO',
        };
        if (identidadFinal) updHija.identidad = identidadFinal;
        if (propietarioFinal) updHija.contribuyente = propietarioFinal;
        if (uHija?.tarifa_mmv != null) {
          const mmvH = Number(uHija.tarifa_mmv);
          updHija.mmv_mes = mmvH;
          updHija.meses_deuda = mHija;
          updHija.deuda_mmv = parseFloat((mHija * mmvH).toFixed(5));
        }
        await sb.from('inmuebles').update(updHija).ilike('inmueble', codH);
      }
    }

    // 8. Registrar en condominio_movimientos y en auditoria
    if (condoOrigen?.id) {
      await sb.from('condominio_movimientos').insert({
        condominio_id: condoOrigen.id,
        unidad_id: unidadActual?.id || null,
        tipo: 'AJUSTE',
        concepto: `Código ${codigoPrincipal}${codigosHijos.length > 0 ? ` (+${codigosHijos.length} act.)` : ''} extraído del condominio y convertido en contribuyente independiente. Motivo: ${mot}`,
        monto_bs: 0,
        usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      });
    }

    await sb.from('auditoria').insert({
      accion: 'Unidad extraída de condominio a contribuyente independiente',
      usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      modulo: 'Condominios',
      detalles: {
        _categoria: 'CONDOMINIOS',
        criticidad: 'ALTA',
        inmueble: codigoPrincipal,
        codigos_hijos_incluidos: codigosHijos,
        propietario: propietarioFinal,
        identidad: identidadFinal,
        condominio_anterior: condoOrigen ? {
          id: condoOrigen.id,
          codigo: condoOrigen.codigo,
          nombre: condoOrigen.nombre,
        } : null,
        meses_deuda: mesesDeudaCalc,
        tarifa_mmv: mmvPrincipal,
        motivo: mot,
      },
    });

    return NextResponse.json({
      ok: true,
      inmueble: codigoPrincipal,
      codigosHijos,
      propietario: propietarioFinal,
      identidad: identidadFinal,
      mensaje: `El código ${codigoPrincipal}${codigosHijos.length > 0 ? ` (junto con sus ${codigosHijos.length} actividades vinculadas)` : ''} fue excluido del condominio ${condoOrigen?.codigo || ''} y ahora está activo como contribuyente independiente.`,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Error interno al extraer contribuyente' }, { status: 500 });
  }
}
