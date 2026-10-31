import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DEV_PASS = process.env.GOD_MODE_SECRET || '1756762';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, table, data, match, pass } = body;

    if (!pass || pass !== DEV_PASS) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!table || typeof table !== 'string') {
      return NextResponse.json({ error: 'Tabla no especificada' }, { status: 400 });
    }

    let result: any = null;

    if (action === 'select') {
      let query = supabaseAdmin.from(table).select('*').limit(100);
      if (match && typeof match === 'object' && Object.keys(match).length > 0) {
        query = query.match(match);
      }
      result = await query;
    } 
    else if (action === 'update') {
      if (!match || typeof match !== 'object' || Object.keys(match).length === 0) {
        return NextResponse.json({ error: 'Criterio match obligatorio para actualizar registros' }, { status: 400 });
      }
      result = await supabaseAdmin.from(table).update(data).match(match);
    }
    else if (action === 'insert') {
      result = await supabaseAdmin.from(table).insert(data);
    }
    else if (action === 'delete') {
      if (!match || typeof match !== 'object' || Object.keys(match).length === 0) {
        return NextResponse.json({ error: 'Criterio match obligatorio para eliminar registros' }, { status: 400 });
      }
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
