import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
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

    const identidad = String(doc.identidad || details.rif || '').trim().toUpperCase();
    const codigoCondo = details.codigo_condominio || details.condominio || (/^CM-/i.test(identidad) ? identidad : undefined);
    const codigoInm = String(details.codigo_inmueble || details.inmueble_id || codigoCondo || (/^(URB|AURI)/i.test(identidad) ? identidad : '')).trim().toUpperCase();

    // 3. Primero eliminar el registro del documento objetivo (sin tocar otras filas de documentos)
    const { error: eDel } = await supabase
      .from('documentos')
      .delete()
      .eq('id', id);

    if (eDel) {
      return NextResponse.json({ error: eDel.message }, { status: 500 });
    }

    // 4. Descontar montoBs directamente de inmuebles.saldo_favor_bs, condominios.abono_bs y/o contribuyentes.saldo_favor_bs (nunca < 0)
    const montoBs = montoNum;
    if (montoBs > 0 && (identidad || codigoInm)) {
      const sinGuion = identidad.replace(/-/g, '');
      const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : identidad;
      const variantes = [...new Set([identidad, sinGuion, conGuion].filter(Boolean))];
      const esAmbitoLocal = String(details.ambito || '').toUpperCase() === 'LOCAL';

      // 4a. Condominios (abono_bs)
      if (!esAmbitoLocal) {
        let condoRow: any = null;
        if (codigoCondo) {
          const { data } = await supabase.from('condominios').select('id, abono_bs').eq('codigo', String(codigoCondo).trim().toUpperCase()).neq('estado', 'Eliminado').limit(1).maybeSingle();
          condoRow = data;
        } else if (variantes.length > 0 && (!codigoInm || !/^(URB|AURI)/i.test(codigoInm))) {
          const { data } = await supabase.from('condominios').select('id, abono_bs').in('identidad', variantes).neq('estado', 'Eliminado').order('created_at', { ascending: true }).limit(1).maybeSingle();
          condoRow = data;
        }
        if (condoRow) {
          const curAbono = parseFloat(String(condoRow.abono_bs || 0)) || 0;
          const nuevoAbono = Math.max(0, Math.round((curAbono - montoBs) * 100) / 100);
          await supabase.from('condominios').update({ abono_bs: nuevoAbono }).eq('id', condoRow.id);
        }
      }

      // 4b. Inmuebles (saldo_favor_bs)
      let pendiente = montoBs;
      const processedIds = new Set<any>();
      if (codigoInm) {
        const { data: inmsCod } = await supabase.from('inmuebles').select('id, saldo_favor_bs').eq('inmueble', codigoInm).order('id', { ascending: true });
        for (const inm of inmsCod || []) {
          processedIds.add(inm.id);
          const s = parseFloat(String(inm.saldo_favor_bs || 0)) || 0;
          if (pendiente <= 0.009 || s <= 0.009) continue;
          const usa = Math.min(s, pendiente);
          const nuevoSaldo = Math.max(0, Math.round((s - usa) * 100) / 100);
          await supabase.from('inmuebles').update({ saldo_favor_bs: nuevoSaldo }).eq('id', inm.id);
          pendiente = Math.max(0, Math.round((pendiente - usa) * 100) / 100);
        }
      }
      if (pendiente > 0.009 && variantes.length > 0) {
        const { data: inmsId } = await supabase.from('inmuebles').select('id, saldo_favor_bs').in('identidad', variantes).order('id', { ascending: true });
        for (const inm of inmsId || []) {
          if (processedIds.has(inm.id)) continue;
          processedIds.add(inm.id);
          const s = parseFloat(String(inm.saldo_favor_bs || 0)) || 0;
          if (pendiente <= 0.009 || s <= 0.009) continue;
          const usa = Math.min(s, pendiente);
          const nuevoSaldo = Math.max(0, Math.round((s - usa) * 100) / 100);
          await supabase.from('inmuebles').update({ saldo_favor_bs: nuevoSaldo }).eq('id', inm.id);
          pendiente = Math.max(0, Math.round((pendiente - usa) * 100) / 100);
        }
      }

      // 4c. Contribuyentes (saldo_favor_bs, si aplica en la tabla)
      if (variantes.length > 0) {
        try {
          const { data: contRow } = await supabase.from('contribuyentes').select('id, identidad, saldo_favor_bs').in('identidad', variantes).limit(1).maybeSingle();
          if (contRow && contRow.saldo_favor_bs !== undefined && contRow.saldo_favor_bs !== null) {
            const curSf = parseFloat(String(contRow.saldo_favor_bs || 0)) || 0;
            const nuevoSf = Math.max(0, Math.round((curSf - montoBs) * 100) / 100);
            await supabase.from('contribuyentes').update({ saldo_favor_bs: nuevoSf }).eq('identidad', contRow.identidad);
          }
        } catch {}
      }
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
