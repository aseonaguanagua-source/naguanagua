import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const identidad = (searchParams.get('identidad') || '').trim();
    const codigo = (searchParams.get('codigo') || '').trim();

    if (!identidad && !codigo) {
      return NextResponse.json({ error: 'Se requiere identidad o código' }, { status: 400 });
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

    const { data: docs, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('tipo', 'Nota de Credito')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
