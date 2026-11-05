import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const identidad = searchParams.get('identidad');
  
  if (!identidad) {
    return NextResponse.json({ error: 'Identidad requerida' }, { status: 400 });
  }

  // Normalizar: Si el usuario escribe J123456, convertirlo a J-123456 para buscar en BD
  const safeId = identidad.replace(/[,()]/g, ' ').trim();
  const idLimpio = safeId.replace(/-/g, '').toUpperCase().trim();
  const primeraEsLetra = /^[A-Z]/.test(idLimpio);
  const idFormateado = primeraEsLetra ? `${idLimpio.charAt(0)}-${idLimpio.slice(1)}` : null;
  const soloNumeros = safeId.replace(/\D/g, '');
  const variantesGet = [idLimpio, safeId.toUpperCase(), soloNumeros].filter(Boolean);
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
  }

  // Si no está en inmuebles, buscar en contribuyentes
  const { data: contrib } = await supabase
    .from('contribuyentes')
    .select('nombre, identidad')
    .or(orFilterGet)
    .limit(1);

  if (contrib && contrib.length > 0) {
    return NextResponse.json({
      nombre: contrib[0].nombre,
      codigo: contrib[0].identidad
    });
  }

  // Si no está en contribuyentes, buscar en servicios_especiales
  const { data: srv } = await supabase
    .from('servicios_especiales')
    .select('contribuyente, referencia')
    .or(orFilterGet)
    .limit(1);

  if (srv && srv.length > 0) {
    return NextResponse.json({
      nombre: srv[0].contribuyente,
      codigo: srv[0].referencia
    });
  }

  // Si no se encuentra en ninguna fuente, retornamos 404
  return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
}
