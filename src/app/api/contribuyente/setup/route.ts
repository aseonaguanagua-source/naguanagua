import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { identidad, correo, telefono, clave } = await request.json();
    
    if (!identidad || !correo || !clave) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    const idLimpio = identidad.replace(/-/g, '').toUpperCase();
    const idFormateado = `${idLimpio.charAt(0)}-${idLimpio.slice(1)}`;
    const soloNumeros = identidad.replace(/\D/g, '');

    // Actualizar todos los inmuebles que pertenezcan a este contribuyente
    const { data, error } = await supabase
      .from('inmuebles')
      .update({ 
        clave_portal: clave,
        correo_electronico: correo,
        telefono: telefono || null
      })
      .or(`identidad.eq.${idFormateado},identidad.eq.${idLimpio},identidad.eq.${identidad.toUpperCase()},identidad.eq.${soloNumeros}`)
      .select('contribuyente, cod_cont');

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ error: 'Error al actualizar base de datos' }, { status: 500 });
    }

    if (data && data.length > 0) {
      return NextResponse.json({ 
        status: 'success',
        nombre: data[0].contribuyente, 
        codigo: data[0].cod_cont 
      });
    } else {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}
