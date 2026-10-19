import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIdentidadVariantsExact } from "@/lib/formatters";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const doc = searchParams.get('doc') || searchParams.get('identidad') || searchParams.get('codigo') || '';

    if (!doc || doc.trim().length < 2) {
      return NextResponse.json({ bloqueado: false });
    }

    const variantes = getIdentidadVariantsExact(doc.trim());
    const isCondoCode = /^(URB|AURI)\d+/i.test(doc.trim());

    // 1. Verificar en tabla condominios
    const { data: condoMatches } = await supabase
      .from('condominios')
      .select('id, codigo, nombre')
      .or(variantes.map(v => `identidad.eq.${v}`).join(','))
      .limit(1);

    let condoByCode = null;
    if (isCondoCode) {
      const { data: cbc } = await supabase
        .from('condominios')
        .select('id, codigo, nombre')
        .eq('codigo', doc.trim().toUpperCase())
        .maybeSingle();
      condoByCode = cbc;
    }

    if ((condoMatches && condoMatches.length > 0) || condoByCode) {
      const cNom = condoMatches?.[0]?.nombre || condoByCode?.nombre || 'su condominio';
      return NextResponse.json({
        bloqueado: true,
        esCondominio: true,
        error: `El acceso a este portal está reservado para personas naturales y comercios individuales. La administración, facturación y solvencia de los Condominios (${cNom}) se gestiona de forma centralizada y directa a través del IAMEC y la Dirección de Condominios de la Alcaldía.`
      });
    }

    // 2. Verificar si todos sus inmuebles corresponden a régimen matriz de condominio
    const { data: inmsCondoCheck } = await supabase
      .from('inmuebles')
      .select('es_condominio, clasificacion, inmueble, contribuyente')
      .or(variantes.map(v => `identidad.eq.${v}`).join(','))
      .limit(10);

    if (inmsCondoCheck && inmsCondoCheck.length > 0 && inmsCondoCheck.every((i: any) => i.es_condominio === true || String(i.clasificacion || '').toLowerCase() === 'condominio')) {
      const cNom = inmsCondoCheck[0]?.contribuyente || 'su condominio';
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
