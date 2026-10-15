import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

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

    // 2. Extraer monto
    let details: any = {};
    try {
      details = typeof doc.detalles === 'string' ? JSON.parse(doc.detalles) : (doc.detalles || {});
    } catch (e) {}

    let raw = details.monto ?? details.monto_bs ?? 0;
    let montoNum = 0;
    if (typeof raw === 'number') {
      montoNum = raw;
    } else if (typeof raw === 'string') {
      const clean = raw.trim();
      if (clean.includes(',') && clean.includes('.')) {
        montoNum = parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
      } else if (clean.includes(',')) {
        montoNum = parseFloat(clean.replace(',', '.')) || 0;
      } else {
        montoNum = parseFloat(clean) || 0;
      }
    }

    const identidad = String(doc.identidad || '').trim().toUpperCase();
    const codigoCondo = details.codigo_condominio || details.condominio || (/^CM-/i.test(identidad) ? identidad : undefined);

    // 3. Revertir saldo a favor generado si aún existe
    let saldoRevertido = 0;
    if (montoNum > 0 && identidad) {
      // Si es condominio, revisar y descontar de condominios.abono_bs
      if (codigoCondo) {
        const { data: cRow } = await supabase
          .from('condominios')
          .select('id, abono_bs')
          .eq('codigo', codigoCondo.toUpperCase())
          .maybeSingle();
        if (cRow && (parseFloat(cRow.abono_bs || '0') || 0) > 0) {
          const actualAbono = parseFloat(cRow.abono_bs || '0') || 0;
          const desc = Math.min(actualAbono, montoNum);
          const nuevoAbono = Math.max(0, Math.round((actualAbono - desc) * 100) / 100);
          await supabase.from('condominios').update({ abono_bs: nuevoAbono }).eq('id', cRow.id);
          saldoRevertido += desc;
        }
      }

      // También revisar condominios por identidad
      const { data: cById } = await supabase
        .from('condominios')
        .select('id, abono_bs')
        .or(`identidad.eq.${identidad},codigo.eq.${identidad}`)
        .maybeSingle();
      if (cById && (parseFloat(cById.abono_bs || '0') || 0) > 0 && (!codigoCondo || cById.id !== codigoCondo)) {
        const actualAbono = parseFloat(cById.abono_bs || '0') || 0;
        const pendiente = Math.max(0, montoNum - saldoRevertido);
        if (pendiente > 0) {
          const desc = Math.min(actualAbono, pendiente);
          const nuevoAbono = Math.max(0, Math.round((actualAbono - desc) * 100) / 100);
          await supabase.from('condominios').update({ abono_bs: nuevoAbono }).eq('id', cById.id);
          saldoRevertido += desc;
        }
      }

      // Descontar de inmuebles vinculados al contribuyente
      const sinGuion = identidad.replace(/-/g, '');
      const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : identidad;
      const variantes = [...new Set([identidad, sinGuion, conGuion].filter(Boolean))];

      let q = supabase.from('inmuebles').select('id, saldo_favor_bs, inmueble');
      if (codigoCondo) {
        q = q.or(`identidad.in.(${variantes.join(',')}),inmueble.eq.${codigoCondo.toUpperCase()}`);
      } else if (/^(URB|AURI|[A-Z]{3,})\d+/i.test(identidad)) {
        q = q.or(`inmueble.eq.${identidad},identidad.in.(${variantes.join(',')})`);
      } else {
        q = q.in('identidad', variantes);
      }

      const { data: inms } = await q;
      if (inms && inms.length > 0) {
        let porDescontar = Math.max(0, montoNum - saldoRevertido);
        for (const inm of inms) {
          if (porDescontar <= 0) break;
          const s = parseFloat(inm.saldo_favor_bs || '0') || 0;
          if (s > 0) {
            const desc = Math.min(s, porDescontar);
            const nuevoS = Math.round((s - desc) * 100) / 100;
            await supabase.from('inmuebles').update({ saldo_favor_bs: nuevoS }).eq('id', inm.id);
            porDescontar = Math.round((porDescontar - desc) * 100) / 100;
          }
        }
      }
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
