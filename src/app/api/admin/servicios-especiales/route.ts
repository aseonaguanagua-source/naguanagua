import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

import { getIdentidadVariantsExact } from '@/lib/formatters';

// Variantes EXACTAS de la cédula/RIF (no mezcla V/J/E/G con el mismo número)
function getIdentidadVariants(rawId: string): string[] {
  const clean = rawId.trim().toUpperCase();
  const v = new Set(getIdentidadVariantsExact(clean));
  v.add(clean); v.add(clean.replace(/-/g, ''));
  return Array.from(v);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identidad = searchParams.get('identidad');
    const referencia = searchParams.get('referencia');
    const estado = searchParams.get('estado');

    let query = supabase
      .from('servicios_especiales')
      .select('*');

    if (referencia) {
      query = query.eq('referencia', referencia.trim().toUpperCase());
    } else if (identidad) {
      const variants = getIdentidadVariants(identidad);
      query = query.in('identidad', variants);
    }

    if (estado) {
      query = query.eq('estado', estado);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching servicios:', error);
      return NextResponse.json([]);
    }

    const enriched = (data || []).map((s: any) => ({
      ...s,
      origen: s.origen || (s.notas?.includes('[ORIGEN:contribuyente]') ? 'contribuyente' : 'funcionario')
    }));

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tipo, identidad, contribuyente, descripcion, monto, fecha, notas, estado, referencia, origen } = body;

    if (!identidad || !descripcion || monto === undefined || monto === null || isNaN(Number(monto))) {
      return NextResponse.json({ error: 'Datos incompletos o monto inválido' }, { status: 400 });
    }

    const origenStr = origen || 'funcionario';
    const originTag = `[ORIGEN:${origenStr}]`;
    const finalNotas = notas ? (notas.includes('[ORIGEN:') ? notas : `${originTag} ${notas}`) : originTag;

    const baseRow: any = {
      tipo,
      identidad,
      contribuyente,
      descripcion,
      monto: parseFloat(monto),
      fecha: fecha || new Date().toISOString().split('T')[0],
      estado: estado || 'Pendiente',
      referencia: referencia || `SRV-${Date.now()}`
    };
    // Campos de la planilla (Servicio Especial / Extraordinario). Solo se envían si vienen.
    const EXTRA = ['categoria', 'inmueble', 'tarifa_id', 'vehiculo', 'nivel', 'valor_ucd', 'nve', 'factor', 'tasa_euro',
      'nombre_evento', 'fecha_evento', 'hora_evento', 'direccion_evento', 'aforo', 'telefono', 'correo', 'creado_por'];
    for (const k of EXTRA) if (body[k] !== undefined && body[k] !== null && body[k] !== '') baseRow[k] = body[k];

    // Intentar primero con la columna origen por si existe en el esquema
    let result = await supabase
      .from('servicios_especiales')
      .insert([{ ...baseRow, notas: notas || '', origen: origenStr }])
      .select()
      .maybeSingle();

    // Si falla porque no existe la columna origen en la tabla, insertar con notas conteniendo la etiqueta de origen
    if (result.error && (result.error.message?.includes('origen') || result.error.code === 'PGRST204')) {
      result = await supabase
        .from('servicios_especiales')
        .insert([{ ...baseRow, notas: finalNotas }])
        .select()
        .maybeSingle();
    }

    if (result.error) {
      console.error('Error inserting servicio:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    const row = result.data ? {
      ...result.data,
      origen: result.data.origen || origenStr
    } : null;

    return NextResponse.json(row);
  } catch (err) {
    console.error('Error:', err);
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const { error } = await supabase
      .from('servicios_especiales')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, monto, descripcion, fecha, notas, referencias, ids, estado } = body;

    if (id) {
      const upd: any = {};
      if (monto !== undefined) upd.monto = Number(monto);
      if (descripcion !== undefined) upd.descripcion = descripcion;
      if (fecha !== undefined) upd.fecha = fecha;
      if (notas !== undefined) upd.notas = notas;
      if (estado !== undefined) upd.estado = estado;

      const { data, error } = await supabase
        .from('servicios_especiales')
        .update(upd)
        .eq('id', id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    let query = supabase.from('servicios_especiales').update({ estado: estado || 'Pagado' });

    if (referencias && Array.isArray(referencias) && referencias.length > 0) {
      query = query.in('referencia', referencias);
    } else if (ids && Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids);
    } else {
      return NextResponse.json({ error: 'id, referencias o ids requeridos' }, { status: 400 });
    }

    const { data, error } = await query.select();
    if (error) {
      console.error('Error updating servicios_especiales:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('Error en PATCH servicios_especiales:', err);
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}

