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

    const buscar = url.searchParams.get('buscar');
    if (buscar) {
      const t = buscar.trim().replace(/[%,()]/g, ' ').trim();
      if (t.length < 3) return NextResponse.json({ condominios: [], unidades: [] });
      const digitos = t.replace(/[^0-9]/g, '');
      const ors = [`nombre.ilike.%${t}%`, `codigo.ilike.%${t}%`, `identidad.ilike.%${t}%`];
      if (digitos.length >= 5) ors.push(`identidad.ilike.%${digitos}%`);
      const { data: cs } = await sb.from('condominios').select('codigo,nombre,identidad,modalidad,tipo,cant_declarada').or(ors.join(',')).limit(25);
      const uors = [`inmueble.ilike.%${t}%`, `numero.ilike.%${t}%`, `propietario.ilike.%${t}%`];
      if (digitos.length >= 5) uors.push(`identidad.ilike.%${digitos}%`);
      const { data: us } = await sb.from('condominio_unidades').select('id,inmueble,numero,propietario,identidad,condominios!inner(codigo,nombre)').or(uors.join(',')).limit(25);
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
    if (!trab || !(trab.rol === 'Administrador' || u === 'dzara')) return NextResponse.json({ error: 'Solo un administrador puede modificar condominios.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo del cambio.' }, { status: 400 });

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
      if (mesesPendientes(nuevo) !== mesesPendientes(antes.aseo_pendiente_desde)) upd.aseo_pendiente_desde = nuevo;
    }
    if (Object.keys(upd).length === 0) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });

    const { error } = await sb.from('condominios').update(upd).eq('id', antes.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sincronizar meses en todas las unidades si se actualizaron los meses del condominio
    if ('aseo_pendiente_desde' in upd) {
      await sb.from('condominio_unidades').update({ aseo_pendiente_desde: upd.aseo_pendiente_desde }).eq('condominio_id', antes.id);
    }

    // Sincronizar el campo agente_retencion en la tabla inmuebles para el inmueble principal del condominio
    if ('agente_retencion' in upd) {
      await sb.from('inmuebles')
        .update({ agente_retencion: upd.agente_retencion })
        .eq('inmueble', antes.codigo);
    }

    const diff = Object.fromEntries(Object.keys(upd).map(k => [k, { antes: antes[k], despues: upd[k] }]));
    await sb.from('auditoria').insert({
      accion: 'Modificación de condominio', usuario: `${trab.nombre || trab.usuario} (${trab.usuario})`,
      detalles: { codigo: antes.codigo, condominio: antes.nombre, motivo: String(motivo).trim(), cambios: diff, _categoria: 'CONDOMINIOS', criticidad: 'ALTA' },
    });
    return NextResponse.json({ ok: true, cambios: diff });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
