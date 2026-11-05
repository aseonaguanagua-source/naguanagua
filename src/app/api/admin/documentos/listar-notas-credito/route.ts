import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const identidad = (searchParams.get('identidad') || '').replace(/[,()]/g, ' ').trim();
    const codigo = (searchParams.get('codigoInmueble') || searchParams.get('codigo') || '').replace(/[,()]/g, ' ').trim();

    if (!identidad && !codigo) {
      const { data: recentDocs, error: errRecent } = await supabase
        .from('documentos')
        .select('*')
        .eq('tipo', 'Nota de Credito')
        .order('created_at', { ascending: false })
        .limit(200);
      if (errRecent) {
        return NextResponse.json({ error: errRecent.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, notas: recentDocs || [] });
    }

    const cleanIdents = new Set<string>();
    if (identidad) {
      cleanIdents.add(identidad.toUpperCase());
      const sinGuion = identidad.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      cleanIdents.add(sinGuion);
      if (/^[VEJPG]\d+/.test(sinGuion)) {
        cleanIdents.add(`${sinGuion[0]}-${sinGuion.slice(1)}`);
      }
    }
    if (codigo) {
      cleanIdents.add(codigo.toUpperCase());
    }

    const identArray = Array.from(cleanIdents).filter(Boolean);
    const orFilters = identArray.map(id => `identidad.eq.${id}`);
    if (codigo) {
      orFilters.push(`detalles->>codigo_inmueble.ilike.%${codigo.toUpperCase()}%`);
      orFilters.push(`detalles->>codigo_condominio.ilike.%${codigo.toUpperCase()}%`);
    }

    let docs: any[] = [];
    if (orFilters.length > 0) {
      const { data: sqlDocs, error: sqlErr } = await supabase
        .from('documentos')
        .select('*')
        .eq('tipo', 'Nota de Credito')
        .or(orFilters.join(','))
        .order('created_at', { ascending: false })
        .limit(500);
      if (!sqlErr && sqlDocs && sqlDocs.length > 0) {
        docs = sqlDocs;
      }
    }

    if (docs.length === 0) {
      const { data: fallbackDocs, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('tipo', 'Nota de Credito')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      docs = fallbackDocs || [];
    }

    // Filtrar los que coincidan con la identidad, el código o dentro de detalles
    const filtered = (docs || []).filter((d: any) => {
      const docIdent = String(d.identidad || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      for (const id of cleanIdents) {
        const cleanTarget = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (docIdent === cleanTarget) return true;
      }
      try {
        const detStr = typeof d.detalles === 'string' ? d.detalles : JSON.stringify(d.detalles || {});
        for (const id of cleanIdents) {
          if (detStr.toUpperCase().includes(id.toUpperCase())) return true;
        }
      } catch (e) {}
      return false;
    });

    return NextResponse.json({ ok: true, notas: filtered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
