import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { parseLocalFloat } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, nuevoMonto, nuevaReferencia, nuevoMotivo, usuario } = body;

    if (!id) {
      return NextResponse.json({ error: 'Falta el ID de la Nota de Crédito' }, { status: 400 });
    }

    // 1. Obtener documento actual
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

    // 2. Extraer detalles actuales
    let details: any = {};
    try {
      details = typeof doc.detalles === 'string' ? JSON.parse(doc.detalles) : (doc.detalles || {});
    } catch (e) {}

    const montoAnterior = parseLocalFloat(details.monto_bs ?? details.monto ?? 0);
    const estabaAplicada = doc.estado === 'Aplicada';
    const montoAnteriorEfectivo = estabaAplicada ? 0 : montoAnterior;
    const montoNuevo = Math.round(parseLocalFloat(nuevoMonto) * 100) / 100;

    if (isNaN(montoNuevo) || montoNuevo <= 0) {
      return NextResponse.json({ error: 'El monto de la nota de crédito debe ser mayor a 0.' }, { status: 400 });
    }

    const identidad = String(doc.identidad || details.rif || '').trim().toUpperCase();
    const codigoCondo = details.codigo_condominio || details.condominio || (/^CM-/i.test(identidad) ? identidad : undefined);
    const codigoInm = String(details.codigo_inmueble || details.inmueble_id || codigoCondo || (/^(URB|AURI)/i.test(identidad) ? identidad : '')).trim().toUpperCase();

    // 3. Calcular diferencia de monto (si estaba Aplicada, vuelve a estar Vigente y suma el montoNuevo completo al saldo disponible)
    const diff = Math.round((montoNuevo - montoAnteriorEfectivo) * 100) / 100;

    // 4. Primero actualizar el registro id en documentos con el nuevo monto/datos (sin tocar otras filas de documentos)
    const refFinal = nuevaReferencia !== undefined && String(nuevaReferencia).trim() !== ''
      ? String(nuevaReferencia).trim()
      : (details.origen_referencia || '');

    const motivoFinal = nuevoMotivo !== undefined && String(nuevoMotivo).trim() !== ''
      ? String(nuevoMotivo).trim()
      : (details.motivo || 'Nota de Crédito modificada');

    const cleanDetails = { ...details };
    if (estabaAplicada) {
      delete cleanDetails.ultima_aplicacion;
      delete cleanDetails.monto_aplicado;
      delete cleanDetails.fecha_aplicacion;
    }

    const updatedDetails = {
      ...cleanDetails,
      monto: montoNuevo.toFixed(2),
      monto_bs: montoNuevo,
      monto_original: montoNuevo,
      origen_referencia: refFinal,
      motivo: motivoFinal,
      editado_el: new Date().toISOString(),
      editado_por: usuario || 'Admin',
      historial_ediciones: [
        ...(Array.isArray(details.historial_ediciones) ? details.historial_ediciones : []),
        {
          fecha: new Date().toISOString(),
          usuario: usuario || 'Admin',
          estado_anterior: doc.estado,
          monto_anterior: montoAnterior,
          monto_nuevo: montoNuevo,
          diferencia: diff,
          referencia_anterior: details.origen_referencia,
          referencia_nueva: refFinal,
          motivo_anterior: details.motivo,
          motivo_nuevo: motivoFinal
        }
      ]
    };

    const { data: updatedDoc, error: errUpd } = await supabase
      .from('documentos')
      .update({
        estado: 'Vigente',
        detalles: JSON.stringify(updatedDetails)
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (errUpd) {
      return NextResponse.json({ error: `Error al actualizar documento: ${errUpd.message}` }, { status: 500 });
    }

    // 4.1 Aplicar diff directamente sobre inmuebles.saldo_favor_bs, condominios.abono_bs y/o contribuyentes.saldo_favor_bs (nunca menor a 0)
    if (diff !== 0 && (identidad || codigoInm)) {
      const sinGuion = identidad.replace(/-/g, '');
      const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : identidad;
      const variantes = [...new Set([identidad, sinGuion, conGuion].filter(Boolean))];
      const esAmbitoLocal = String(details.ambito || '').toUpperCase() === 'LOCAL';

      // Condominios (abono_bs)
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
          const nuevoAbono = Math.max(0, Math.round((curAbono + diff) * 100) / 100);
          await supabase.from('condominios').update({ abono_bs: nuevoAbono }).eq('id', condoRow.id);
        }
      }

      // Inmuebles (saldo_favor_bs)
      let inms: any[] = [];
      if (codigoInm) {
        const { data: inmsCod } = await supabase.from('inmuebles').select('id, saldo_favor_bs, estado').eq('inmueble', codigoInm).order('id', { ascending: true });
        if (inmsCod && inmsCod.length > 0) inms = inmsCod;
      }
      if (inms.length === 0 && variantes.length > 0) {
        const { data: inmsId } = await supabase.from('inmuebles').select('id, saldo_favor_bs, estado').in('identidad', variantes).order('id', { ascending: true });
        if (inmsId && inmsId.length > 0) inms = inmsId;
      }
      if (inms.length > 0) {
        if (diff > 0) {
          const targetInm = inms.find((i: any) => (parseFloat(String(i.saldo_favor_bs || 0)) || 0) > 0.009) || inms.find((i: any) => i.estado !== 'Eliminado') || inms[0];
          const curSf = parseFloat(String(targetInm.saldo_favor_bs || 0)) || 0;
          const nuevoSf = Math.max(0, Math.round((curSf + diff) * 100) / 100);
          await supabase.from('inmuebles').update({ saldo_favor_bs: nuevoSf }).eq('id', targetInm.id);
        } else {
          let porDescontar = Math.abs(diff);
          for (const inm of inms) {
            const s = parseFloat(String(inm.saldo_favor_bs || 0)) || 0;
            if (porDescontar <= 0.009 || s <= 0.009) continue;
            const usa = Math.min(s, porDescontar);
            const nuevoSf = Math.max(0, Math.round((s - usa) * 100) / 100);
            await supabase.from('inmuebles').update({ saldo_favor_bs: nuevoSf }).eq('id', inm.id);
            porDescontar = Math.max(0, Math.round((porDescontar - usa) * 100) / 100);
          }
        }
      }

      // Contribuyentes (saldo_favor_bs, si existe en tabla)
      if (variantes.length > 0) {
        try {
          const { data: contRow } = await supabase.from('contribuyentes').select('id, identidad, saldo_favor_bs').in('identidad', variantes).limit(1).maybeSingle();
          if (contRow && contRow.saldo_favor_bs !== undefined && contRow.saldo_favor_bs !== null) {
            const curSf = parseFloat(String(contRow.saldo_favor_bs || 0)) || 0;
            const nuevoSf = Math.max(0, Math.round((curSf + diff) * 100) / 100);
            await supabase.from('contribuyentes').update({ saldo_favor_bs: nuevoSf }).eq('identidad', contRow.identidad);
          }
        } catch {}
      }
    }

    // 5. Auditoría
    try {
      await supabase.from('auditoria').insert({
        accion: 'Nota de Crédito Editada',
        usuario: usuario || 'Admin',
        modulo: codigoCondo ? 'Condominios' : 'Caja / Contribuyentes',
        detalles: {
          documento_id: id,
          identidad,
          contribuyente: doc.contribuyente,
          monto_anterior: montoAnterior,
          monto_nuevo: montoNuevo,
          diferencia: diff,
          referencia_nueva: refFinal,
          motivo_nuevo: motivoFinal
        }
      });
    } catch (e) {
      console.warn('Error en auditoria al editar nota:', e);
    }

    return NextResponse.json({
      ok: true,
      mensaje: `Nota de crédito actualizada a Bs. ${montoNuevo.toLocaleString('es-VE', { minimumFractionDigits: 2 })} con éxito.`,
      documento: updatedDoc,
      nuevoMonto: montoNuevo,
      diferencia: diff
    });
  } catch (err: any) {
    console.error('Error en editar-nota-credito:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
