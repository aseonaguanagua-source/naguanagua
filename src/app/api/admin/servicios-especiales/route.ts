import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('servicios_especiales')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Table may not exist yet
      console.error('Error fetching servicios:', error);
      return NextResponse.json([]);
    }
    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tipo, identidad, contribuyente, descripcion, monto, fecha, notas, estado, referencia, origen } = body;

    if (!identidad || !descripcion || !monto) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('servicios_especiales')
      .insert([{
        tipo,
        identidad,
        contribuyente,
        descripcion,
        monto: parseFloat(monto),
        fecha,
        notas: notas || '',
        estado: estado || 'Pendiente',
        referencia: referencia || `SRV-${Date.now()}`,
        origen: origen || 'funcionario'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error inserting servicio:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
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
      .eq('id', parseInt(id));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}
