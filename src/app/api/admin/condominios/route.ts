import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { buscarPorDueno, calcularEstado, cargarCondominio, resumenGeneral, tasaVigente } from '@/lib/condominios/servicio';

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

    if (codigo) {
      const datos = await cargarCondominio(codigo);
      if (!datos) return NextResponse.json({ error: 'Condominio no encontrado' }, { status: 404 });
      const tasa = await tasaVigente();
      return NextResponse.json({ ...datos, estado: calcularEstado(datos.condo, datos.unidades, tasa) });
    }

    return NextResponse.json(await resumenGeneral());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

const EDITABLES = ['modalidad', 'cant_declarada', 'tarifa_mmv', 'tarifa_fija_bs', 'actividad', 'agente_retencion',
  'permite_pago_por_unidad', 'permite_abonos', 'cobro_tarifa_por_unidad', 'correo', 'telefono', 'administradora', 'notas', 'estado'] as const;

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
    if (Object.keys(upd).length === 0) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });

    const { error } = await sb.from('condominios').update(upd).eq('id', antes.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
