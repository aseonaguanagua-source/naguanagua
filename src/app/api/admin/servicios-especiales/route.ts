import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('servicios_especiales')
      .select('*')
      .order('created_at', { ascending: false });

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
