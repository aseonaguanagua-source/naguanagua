import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contribuyentes/buscar?q=V12345678
 * 
 * Endpoint de búsqueda directa de contribuyentes en Supabase.
 * Esto evita depender del contexto React (que puede estar desactualizado)
 * y del endpoint get-all-data (que carga todo en memoria).
 * 
 * Busca por: identidad, inmueble, nombre del contribuyente.
 * Retorna inmuebles + datos del contribuyente fusionados.
 */
import { formatPhoneNumber, isFictitiousEmail, getIdentidadVariants } from '@/lib/formatters';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ error: 'Búsqueda muy corta (mínimo 2 caracteres)' }, { status: 400 });
    }

    const variants = getIdentidadVariants(q);
    const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

    // Buscar por variantes de identidad (tolerante a V/J/ceros/guiones)
    let { data: inmuebles } = await supabaseAdmin
      .from('inmuebles')
      .select('*')
      .or(orFilter);

    // Fallback 1: Si no se encontró por identidad en inmuebles, buscar en tabla oficial contribuyentes
    if (!inmuebles || inmuebles.length === 0) {
      const { data: cMatches } = await supabaseAdmin
        .from('contribuyentes')
        .select('*')
        .or(orFilter)
        .limit(1);

      if (cMatches && cMatches.length > 0) {
        const cVars = getIdentidadVariants(cMatches[0].identidad);
        const { data: inmsByOfficial } = await supabaseAdmin
          .from('inmuebles')
          .select('*')
          .or(cVars.map(v => `identidad.eq.${v}`).join(','));
        if (inmsByOfficial && inmsByOfficial.length > 0) {
          inmuebles = inmsByOfficial;
        }
      }
    }

    // Fallback 2: buscar por nombre o código de inmueble
    if (!inmuebles || inmuebles.length === 0) {
      const { data: byName } = await supabaseAdmin
        .from('inmuebles')
        .select('*')
        .or(`inmueble.ilike.%${q}%,contribuyente.ilike.%${q}%`)
        .limit(20);
      inmuebles = byName || [];
    }

    if (inmuebles.length === 0) {
      return NextResponse.json({ found: false, contribuyente: null, inmuebles: [] });
    }

    // Construir contribuyente desde el primer inmueble
    const first = inmuebles[0];
    const rawTel = first.telefono;
    const cleanTel = formatPhoneNumber(rawTel);
    const rawEmail = first.correo_electronico || first.correo;
    const cleanEmail = isFictitiousEmail(rawEmail) ? '' : (rawEmail || '').trim();

    const contribuyente = {
      Identidad: first.identidad,
      Contribuyente: first.contribuyente || first.nombre || 'Sin Nombre',
      Telefono: cleanTel || 'No registrado',
      Correo: cleanEmail || 'No registrado',
      CodCont: first.inmueble || first.cod_cont,
      cod_cont: first.inmueble || first.cod_cont,
      Direccion: first.direccion || '',
      Clasificacion: first.clasificacion || 'Residencial',
      Actividad: first.actividad_principal || 'No aplica',
      SaldoFavor: inmuebles.reduce((sum: number, i: any) => 
        sum + (parseFloat(i.saldo_favor_bs || '0') || 0), 0),
      Estado: first.estado || 'Activo',
      FechaRegistro: first.created_at,
    };

    return NextResponse.json({
      found: true,
      contribuyente,
      inmuebles,
    });
  } catch (error: any) {
    console.error('Error en búsqueda de contribuyente:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
