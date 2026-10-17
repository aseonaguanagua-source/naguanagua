import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { descontarSaldoFavor } from '@/lib/saldoFavor';
import { parseLocalFloat } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { id, motivo, usuario } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Falta el ID de la Nota de Crédito' }, { status: 400 });
    }

    // 1. Obtener documento
    const { data: doc, error: eDoc } = await supabase
      .from('documentos')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (eDoc || !doc) {
      return NextResponse.json({ error: 'La Nota de Crédito no existe o ya fue eliminada' }, { status: 404 });
    }

    if (doc.tipo !== 'Nota de Credito') {
      return NextResponse.json({ error: 'El documento seleccionado no es una Nota de Crédito' }, { status: 400 });
    }

    // 2. Extraer monto de forma robusta con parseLocalFloat
    let details: any = {};
    try {
      details = typeof doc.detalles === 'string' ? JSON.parse(doc.detalles) : (doc.detalles || {});
    } catch (e) {}

    const raw = details.monto_bs ?? details.monto ?? 0;
    const montoNum = Math.round(parseLocalFloat(raw) * 100) / 100;

    const identidad = String(doc.identidad || '').trim().toUpperCase();
    const codigoCondo = details.codigo_condominio || details.condominio || (/^CM-/i.test(identidad) ? identidad : undefined);

    // 3. Revertir saldo a favor generado si aún existe
    let resDescontar: any = null;
    if (montoNum > 0 && identidad) {
      resDescontar = await descontarSaldoFavor(identidad, montoNum, codigoCondo, supabase);
    }

    // 4. Eliminar el registro del documento
    const { error: eDel } = await supabase
      .from('documentos')
      .delete()
      .eq('id', id);

    if (eDel) {
      return NextResponse.json({ error: eDel.message }, { status: 500 });
    }

    // 5. Registrar en auditoría
    await supabase.from('auditoria').insert({
      accion: 'Nota de Crédito Eliminada',
      usuario: usuario || 'Admin',
      modulo: 'Caja / Documentos',
      detalles: {
        documento_id: id,
        identidad: doc.identidad,
        contribuyente: doc.contribuyente,
        monto_bs: montoNum,
        motivo: motivo || 'Eliminación manual solicitada por el usuario',
        detalles_previos: details
      }
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Nota de crédito de Bs. ${montoNum.toFixed(2)} eliminada exitosamente y saldo a favor revertido.`
    });
  } catch (err: any) {
    console.error('Error al eliminar nota de crédito:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
