import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logAuditServer } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '5000', 10);
    const status = searchParams.get('status') || 'Todos';
    const search = searchParams.get('search') || '';

    let query = supabaseAdmin
      .from('facturas')
      .select('*', { count: 'exact' })
      .order('emision', { ascending: false })
      .limit(limit);

    if (status && status !== 'Todos') {
      query = query.eq('estado', status);
    }

    if (search.trim()) {
      const s = search.trim();
      query = query.or(`referencia.ilike.%${s}%,contribuyente.ilike.%${s}%,identidad.ilike.%${s}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching facturas with supabaseAdmin:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      facturas: data || [],
      count: count || data?.length || 0,
    });
  } catch (err: any) {
    console.error('Error in GET /api/admin/facturas:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, facturas, recibos } = body;

    const itemsToInsert = facturas || recibos;
    if (itemsToInsert && Array.isArray(itemsToInsert) && itemsToInsert.length > 0) {
      const batchSize = 500;
      let inserted = 0;
      for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const chunk = itemsToInsert.slice(i, i + batchSize);
        const { error } = await supabaseAdmin.from('facturas').upsert(chunk, {
          onConflict: 'referencia',
          ignoreDuplicates: true,
        });
        if (error) throw error;
        inserted += chunk.length;
      }

      await logAuditServer(
        'Facturación Masiva Generada',
        { total_recibos: inserted },
        'FACTURACION',
        'ALTA',
        'Administrador',
        '/api/admin/facturas'
      );

      return NextResponse.json({ success: true, count: inserted });
    }

    return NextResponse.json({ success: false, error: 'No se recibieron recibos válidos' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in POST /api/admin/facturas:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, referencia, estado, nota, cajero } = body;

    if (!id && !referencia) {
      return NextResponse.json({ success: false, error: 'Falta id o referencia' }, { status: 400 });
    }

    let query = supabaseAdmin.from('facturas').update({ estado });
    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('referencia', referencia);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;

    await logAuditServer(
      `Recibo ${estado}`,
      {
        referencia: data?.referencia || referencia,
        contribuyente: data?.contribuyente,
        monto: data?.monto,
        nuevo_estado: estado,
        motivo: nota || 'Sin observación',
        cajero: cajero || 'Administrador',
      },
      'RECIBO',
      'MEDIA',
      cajero || 'Administrador',
      '/api/admin/facturas'
    );

    return NextResponse.json({ success: true, factura: data });
  } catch (err: any) {
    console.error('Error in PATCH /api/admin/facturas:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
