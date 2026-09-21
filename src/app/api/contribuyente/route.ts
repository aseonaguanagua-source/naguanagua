import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const identidad = searchParams.get('identidad');
  
  if (!identidad) {
    return NextResponse.json({ error: 'Identidad requerida' }, { status: 400 });
  }

  // Normalizar: Si el usuario escribe J123456, convertirlo a J-123456 para buscar en BD
  const idLimpio = identidad.replace(/-/g, '').toUpperCase().trim();
  const primeraEsLetra = /^[A-Z]/.test(idLimpio);
  const idFormateado = primeraEsLetra ? `${idLimpio.charAt(0)}-${idLimpio.slice(1)}` : null;
  const soloNumeros = identidad.replace(/\D/g, '');
  const variantesGet = [idLimpio, identidad.toUpperCase().trim(), soloNumeros];
  if (idFormateado) variantesGet.push(idFormateado);
  const orFilterGet = [...new Set(variantesGet)].map(v => `identidad.eq.${v}`).join(',');

  const { data: records, error } = await supabase
    .from('inmuebles')
    .select('contribuyente, cod_cont')
    .or(orFilterGet)
    .limit(1);

  if (error) {
    console.error("Supabase Error:", error);
  }

  if (records && records.length > 0) {
    return NextResponse.json({ 
      nombre: records[0].contribuyente, 
      codigo: records[0].cod_cont 
    });
  } else {
    // Si no se encuentra, retornamos 404
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }
}
