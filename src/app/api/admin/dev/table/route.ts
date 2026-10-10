import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, table, data, match, pass } = body;

    if (pass !== '1756762') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!table) {
      return NextResponse.json({ error: 'Tabla no especificada' }, { status: 400 });
    }

    let result: any = null;

    if (action === 'select') {
      let query = supabaseAdmin.from(table).select('*').limit(100);
      if (match) {
        query = query.match(match);
      }
      result = await query;
    } 
    else if (action === 'update') {
      result = await supabaseAdmin.from(table).update(data).match(match);
    }
    else if (action === 'insert') {
      result = await supabaseAdmin.from(table).insert(data);
    }
    else if (action === 'delete') {
      result = await supabaseAdmin.from(table).delete().match(match);
    }
    else {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({
      success: true,
      data: result.data || [],
      count: result.count
    });
  } catch (error: any) {
    console.error('Table Edit Error:', error);
    return NextResponse.json({ error: error.message || 'Error en DB' }, { status: 500 });
  }
}
