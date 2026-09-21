import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'default_secret';

export async function POST(request: Request) {
  try {
    const { token, clave } = await request.json();
    
    if (!token || !clave) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as { identidad: string };
    } catch (err) {
      return NextResponse.json({ error: 'Enlace inválido o expirado' }, { status: 401 });
    }

    const { identidad } = payload;
    
    // Update password
    const { error } = await supabase
      .from('inmuebles')
      .update({ clave_portal: clave })
      .eq('identidad', identidad);

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ error: 'Error al actualizar base de datos' }, { status: 500 });
    }

    return NextResponse.json({ status: 'success' });
  } catch (err) {
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}
