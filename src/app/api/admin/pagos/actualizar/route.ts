import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * ACTUALIZAR UN PAGO (servidor).
 * La base de datos NO permite que el navegador modifique `pagos_reportados` (solo leer e insertar): antes las
 * pantallas hacían el update desde el navegador y fallaba EN SILENCIO (p. ej. Conciliación aprobaba, bajaba la
 * deuda, pero el pago seguía "Por Verificar" y se podía aprobar otra vez → deuda descontada dos veces).
 *
 * Body: { pagoId, cambios: { estado?, banco?, tipo?, detalles?, created_at? }, usuario, soloSiEstado? }
 *  - soloSiEstado: el cambio solo se aplica si el pago sigue en ese estado (evita aprobar dos veces).
 *  Responde { ok: true } o { error } con 409 si el pago ya fue procesado.
 */
const PERMITIDOS = ['estado', 'banco', 'tipo', 'detalles', 'created_at'] as const;
const ESTADOS = ['Aprobado', 'Rechazado', 'Por Verificar', 'Con Diferencia', 'Pendiente'];

export async function POST(req: Request) {
  try {
    const { pagoId, cambios, usuario, soloSiEstado } = await req.json();
    if (!pagoId || !cambios || typeof cambios !== 'object') return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });

    const u = String(usuario || '').trim();
    if (!u) return NextResponse.json({ error: 'Usuario no autorizado. Vuelva a iniciar sesión.' }, { status: 403 });
    let { data: trab } = await sb.from('trabajadores').select('usuario, nombre, estado').ilike('usuario', u).limit(1);
    if (!trab?.length) ({ data: trab } = await sb.from('trabajadores').select('usuario, nombre, estado').ilike('nombre', u).limit(1));
    const t = trab?.[0];
    if (!t || String(t.estado || 'Activo').toLowerCase() !== 'activo') return NextResponse.json({ error: 'Usuario no autorizado. Vuelva a iniciar sesión.' }, { status: 403 });

    const upd: Record<string, any> = {};
    for (const k of PERMITIDOS) if (k in cambios) upd[k] = cambios[k];
    if (!Object.keys(upd).length) return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
    if ('estado' in upd && !ESTADOS.includes(upd.estado)) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });

    let q = sb.from('pagos_reportados').update(upd).eq('id', pagoId);
    if (soloSiEstado) q = q.eq('estado', soloSiEstado);
    const { data, error } = await q.select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) {
      const { data: actual } = await sb.from('pagos_reportados').select('estado').eq('id', pagoId).maybeSingle();
      if (!actual) return NextResponse.json({ error: 'El pago no existe.' }, { status: 404 });
      return NextResponse.json({ error: `Este pago ya fue procesado (estado actual: ${actual.estado}). Recargue la página.`, estado: actual.estado }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
