import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { codigo, inmueble, unidad_id, periodos_custom, usuario, motivo } = await req.json();
    const u = String(usuario || 'Administrador').trim();
    if (String(motivo || '').trim().length < 5) {
      return NextResponse.json({ error: 'Escriba un motivo de al menos 5 caracteres.' }, { status: 400 });
    }

    // 1. Encontrar el inmueble
    let inmCode = inmueble;
    if (!inmCode && unidad_id) {
      const { data: uData } = await sb.from('condominio_unidades').select('inmueble').eq('id', unidad_id).maybeSingle();
      if (uData?.inmueble) inmCode = uData.inmueble;
    }

    if (!inmCode) {
      return NextResponse.json({ error: 'Código de inmueble no especificado.' }, { status: 400 });
    }

    // 2. Cargar notas actuales de inmuebles
    const { data: inm } = await sb.from('inmuebles').select('notas, contribuyente, actividad_principal').eq('inmueble', inmCode).maybeSingle();
    let existingNotas: any = {};
    try {
      if (inm?.notas) existingNotas = typeof inm.notas === 'string' ? JSON.parse(inm.notas) : inm.notas;
    } catch {}

    existingNotas.periodos_custom = periodos_custom;

    // Actualizar inmuebles
    const { error: errInm } = await sb.from('inmuebles').update({
      notas: JSON.stringify(existingNotas)
    }).eq('inmueble', inmCode);

    if (errInm) return NextResponse.json({ error: errInm.message }, { status: 500 });

    // 3. Registrar en Auditoría
    await sb.from('auditoria').insert({
      accion: 'Ajuste de actividad y multas por mes',
      usuario: u,
      detalles: {
        _categoria: 'CONDOMINIOS',
        criticidad: 'ALTA',
        codigo,
        inmueble: inmCode,
        motivo: String(motivo).trim(),
        periodos_modificados: Object.keys(periodos_custom || {}).length
      }
    });

    return NextResponse.json({ ok: true, periodos_custom });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error en el servidor' }, { status: 500 });
  }
}
