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
 * POST /api/admin/condominios/mover-unidad
 * Body: { unidad_id?, inmueble, nuevo_condominio_codigo, usuario, motivo }
 *
 * Mueve un local/unidad a un condominio funcional:
 * 1. Valida permisos de administrador y el condominio destino.
 * 2. Si la unidad ya existe en `condominio_unidades`, actualiza su `condominio_id` al nuevo condominio.
 * 3. Si no existe en `condominio_unidades` (por ejemplo, venía como local hijo en `inmuebles.padre_id`),
 *    crea el registro en `condominio_unidades` copiando datos de `inmuebles`.
 * 4. Actualiza la tabla `inmuebles`: desliga `padre_id = null`, asigna `condominio_padre_id = nuevo_condominio_codigo`,
 *    y asegura `es_condominio = false`.
 * 5. Registra auditoría con antes y después.
 */
export async function POST(req: Request) {
  try {
    const { unidad_id, inmueble, nuevo_condominio_codigo, usuario, motivo } = await req.json();

    const t = await adminActivo(usuario);
    if (!t) {
      return NextResponse.json({ ok: false, error: 'Solo un administrador puede transferir unidades o locales a condominios.' }, { status: 403 });
    }

    if (!inmueble || !String(inmueble).trim()) {
      return NextResponse.json({ ok: false, error: 'Código de inmueble requerido.' }, { status: 400 });
    }

    const codDestino = String(nuevo_condominio_codigo || '').trim().toUpperCase();
    if (!codDestino) {
      return NextResponse.json({ ok: false, error: 'Código del nuevo condominio requerido.' }, { status: 400 });
    }

    const mot = String(motivo || '').trim();
    if (mot.length < 5) {
      return NextResponse.json({ ok: false, error: 'Debe indicar un motivo descriptivo (mínimo 5 caracteres).' }, { status: 400 });
    }

    // 1. Buscar condominio destino
    const { data: condoDestino, error: errDestino } = await sb
      .from('condominios')
      .select('id, codigo, nombre, cant_declarada')
      .eq('codigo', codDestino)
      .maybeSingle();

    if (errDestino || !condoDestino) {
      return NextResponse.json({ ok: false, error: `No se encontró ningún condominio registrado con el código ${codDestino}.` }, { status: 404 });
    }

    const inmobCode = String(inmueble).trim().toUpperCase();

    // 2. Obtener datos actuales del inmueble
    const { data: inmActual } = await sb
      .from('inmuebles')
      .select('*')
      .ilike('inmueble', inmobCode)
      .maybeSingle();

    // 3. Buscar si existe en condominio_unidades
    let queryUnidad = sb.from('condominio_unidades').select('*, condominios(id, codigo, nombre)');
    if (unidad_id) {
      queryUnidad = queryUnidad.eq('id', unidad_id);
    } else {
      queryUnidad = queryUnidad.eq('inmueble', inmobCode);
    }
    const { data: unidadActual } = await queryUnidad.maybeSingle();

    const condoAnteriorCodigo = (unidadActual as any)?.condominios?.codigo || inmActual?.condominio_padre_id || null;
    const condoAnteriorNombre = (unidadActual as any)?.condominios?.nombre || null;
    const padreIdAnterior = inmActual?.padre_id || null;

    let unidadIdFinal = unidadActual?.id;

    if (unidadActual) {
      // Si ya existía, trasladarla al nuevo condominio
      const { error: errUpdUnidad } = await sb
        .from('condominio_unidades')
        .update({
          condominio_id: condoDestino.id,
          estado: unidadActual.estado === 'Eliminada' ? 'Activa' : unidadActual.estado
        })
        .eq('id', unidadActual.id);

      if (errUpdUnidad) {
        return NextResponse.json({ ok: false, error: `Error al mover unidad en condominio_unidades: ${errUpdUnidad.message}` }, { status: 500 });
      }
    } else {
      // Si no existía, crear la unidad en condominio_unidades
      const nuevaUnidad: Record<string, any> = {
        condominio_id: condoDestino.id,
        inmueble: inmobCode,
        numero: inmobCode,
        identidad: inmActual?.identidad || null,
        propietario: inmActual?.propietario || null,
        actividad: inmActual?.actividad_principal || null,
        tarifa_mmv: inmActual?.tarifa_mmv ?? null,
        estado: 'Activa',
        creada_en_modulo: true,
        multa_meses: 0
      };

      const { data: uInsertada, error: errInsertUnidad } = await sb
        .from('condominio_unidades')
        .insert(nuevaUnidad)
        .select('id')
        .single();

      if (errInsertUnidad) {
        return NextResponse.json({ ok: false, error: `Error al crear unidad en condominio_unidades: ${errInsertUnidad.message}` }, { status: 500 });
      }
      unidadIdFinal = uInsertada?.id;
    }

    // 4. Actualizar tabla inmuebles
    const { error: errUpdInm } = await sb
      .from('inmuebles')
      .update({
        padre_id: null,
        condominio_padre_id: condoDestino.codigo,
        es_condominio: false
      })
      .ilike('inmueble', inmobCode);

    if (errUpdInm) {
      return NextResponse.json({ ok: false, error: `Error al actualizar tabla inmuebles: ${errUpdInm.message}` }, { status: 500 });
    }

    // 5. Actualizar recuento de unidades del condominio destino
    const { count } = await sb
      .from('condominio_unidades')
      .select('id', { count: 'exact', head: true })
      .eq('condominio_id', condoDestino.id)
      .neq('estado', 'Eliminada')
      .eq('es_grupo', false);

    if ((count || 0) > (condoDestino.cant_declarada || 0)) {
      await sb.from('condominios').update({ cant_declarada: count }).eq('id', condoDestino.id);
    }

    // 6. Registrar en auditoría
    await sb.from('auditoria').insert({
      accion: 'Local trasladado a condominio',
      usuario: `${t.nombre || t.usuario} (${t.usuario})`,
      modulo: 'Condominios',
      ip: req.headers.get('x-forwarded-for') || null,
      detalles: {
        inmueble: inmobCode,
        unidad_id: unidadIdFinal,
        condominio_anterior: {
          codigo: condoAnteriorCodigo,
          nombre: condoAnteriorNombre,
          padre_id: padreIdAnterior
        },
        condominio_nuevo: {
          id: condoDestino.id,
          codigo: condoDestino.codigo,
          nombre: condoDestino.nombre
        },
        motivo: mot
      }
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Inmueble ${inmobCode} transferido satisfactoriamente al condominio ${condoDestino.codigo} - ${condoDestino.nombre}.`,
      condominio: condoDestino
    });

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
