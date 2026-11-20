import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parseDetallesDoc(d: any): any {
  if (!d) return {};
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { return {}; }
  }
  return d;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('tipo', 'Pre-Registro')
      .neq('estado', 'Rechazado')
      .neq('estado', 'Aprobado')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, data: [] }, { status: 500 });
    }

    const mapped = (data || []).map((row: any) => {
      const det = parseDetallesDoc(row.detalles);
      return {
        ...det,
        id: row.id,
        identidad: row.identidad || det.identidad || '',
        contribuyente: row.contribuyente || det.contribuyente || '',
        estado: row.estado || 'Pendiente',
        created_at: row.created_at || det.created_at || det.registrado || new Date().toISOString(),
      };
    });

    return NextResponse.json({ ok: true, data: mapped });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, data: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identidad = String(body.identidad || body.Identidad || '').trim().toUpperCase();
    const contribuyente = String(body.contribuyente || body.Contribuyente || '').trim();

    if (!identidad || !contribuyente) {
      return NextResponse.json({ ok: false, error: 'Identidad y Nombre/Razón Social son obligatorios.' }, { status: 400 });
    }

    const detallesObj = {
      ...body,
      identidad,
      contribuyente,
      origen: body.origen || 'Web',
      registrado: body.registrado || new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('documentos')
      .insert([{
        identidad,
        contribuyente,
        tipo: 'Pre-Registro',
        estado: 'Pendiente',
        detalles: JSON.stringify(detallesObj),
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // También guardar los documentos adjuntos en contribuyentes.observaciones si ya existiera o preparar tags
    const docTags: string[] = [];
    if (body.cedula_doc) docTags.push(`[DOC_CEDULA: ${body.cedula_doc}]`);
    if (body.rif_doc) docTags.push(`[DOC_RIF: ${body.rif_doc}]`);
    if (body.ficha_doc) docTags.push(`[DOC_FICHA: ${body.ficha_doc}]`);
    if (body.patente_doc) docTags.push(`[DOC_PATENTE: ${body.patente_doc}]`);
    if (body.registro_doc) docTags.push(`[DOC_REGISTRO: ${body.registro_doc}]`);

    if (docTags.length > 0) {
      try {
        const { data: cExist } = await supabase.from('contribuyentes').select('id, observaciones').eq('identidad', identidad).maybeSingle();
        if (cExist) {
          let obs = cExist.observaciones || '';
          for (const tag of docTags) {
            if (!obs.includes(tag)) obs = obs ? `${obs}\n${tag}` : tag;
          }
          await supabase.from('contribuyentes').update({ observaciones: obs }).eq('id', cExist.id);
        }
      } catch (_) {}
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...detallesObj,
        id: data.id,
        created_at: data.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = body.id;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Falta ID del pre-registro' }, { status: 400 });
    }

    const { data: current } = await supabase.from('documentos').select('*').eq('id', id).maybeSingle();
    if (!current) {
      return NextResponse.json({ ok: false, error: 'Pre-registro no encontrado' }, { status: 404 });
    }

    const curDet = parseDetallesDoc(current.detalles);
    const updatedDet = { ...curDet, ...(body.detalles || body) };
    const newEstado = body.estado || current.estado || 'Pendiente';

    const { error } = await supabase
      .from('documentos')
      .update({
        estado: newEstado,
        identidad: updatedDet.identidad || current.identidad,
        contribuyente: updatedDet.contribuyente || current.contribuyente,
        detalles: JSON.stringify(updatedDet),
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const accion = searchParams.get('accion') || 'eliminar';
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Falta ID del pre-registro' }, { status: 400 });
    }

    if (accion === 'aprobar') {
      await supabase.from('documentos').update({ estado: 'Aprobado' }).eq('id', id);
    } else {
      await supabase.from('documentos').delete().eq('id', id);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
