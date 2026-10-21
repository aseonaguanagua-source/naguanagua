import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { getIdentidadVariantsExact } from "@/lib/formatters";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const doc = searchParams.get('doc') || searchParams.get('identidad') || searchParams.get('codigo') || '';

    if (!doc || doc.trim().length < 2) {
      return NextResponse.json({ bloqueado: false });
    }

    const cleanDoc = doc.trim();
    const variantes = getIdentidadVariantsExact(cleanDoc);
    const rawNum = cleanDoc.replace(/\D/g, '');

    // 1. Verificar en tabla condominios (por código de condominio o por RIF/identidad)
    const condoOrFilters = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `codigo.eq.${cleanDoc.toUpperCase()}`
    ];
    if (rawNum.length >= 6) {
      condoOrFilters.push(`identidad.ilike.%${rawNum}%`);
    }

    const { data: condoMatches } = await supabase
      .from('condominios')
      .select('id, codigo, nombre')
      .or(condoOrFilters.join(','))
      .limit(1);

    if (condoMatches && condoMatches.length > 0) {
      const cNom = condoMatches[0]?.nombre || 'su condominio';
      return NextResponse.json({
        bloqueado: true,
        esCondominio: true,
        error: `El acceso a este portal está reservado para personas naturales y comercios individuales. La administración, facturación y solvencia de los Condominios (${cNom}) se gestiona de forma centralizada y directa a través del IAMEC y la Dirección de Condominios de la Alcaldía.`
      });
    }

    // 2. Verificar si alguno de sus inmuebles corresponde a régimen matriz de condominio
    const { data: inmsCondoCheck } = await supabase
      .from('inmuebles')
      .select('es_condominio, clasificacion, inmueble, contribuyente')
      .or(variantes.map(v => `identidad.eq.${v}`).join(','))
      .limit(10);

    if (inmsCondoCheck && inmsCondoCheck.length > 0 && inmsCondoCheck.some((i: any) => i.es_condominio === true || String(i.clasificacion || '').toLowerCase() === 'condominio')) {
      const cNom = inmsCondoCheck.find((i: any) => i.es_condominio === true)?.contribuyente || inmsCondoCheck[0]?.contribuyente || 'su condominio';
      return NextResponse.json({
        bloqueado: true,
        esCondominio: true,
        error: `El acceso a este portal está reservado para personas naturales y comercios individuales. La administración, facturación y solvencia de los Condominios (${cNom}) se gestiona de forma centralizada y directa a través del IAMEC y la Dirección de Condominios de la Alcaldía.`
      });
    }

    return NextResponse.json({ bloqueado: false });
  } catch (err: any) {
    console.error('Error al verificar sesión de contribuyente:', err);
    return NextResponse.json({ bloqueado: false });
  }
}
