import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { acreditarSaldoFavor, descontarSaldoFavor } from '@/lib/saldoFavor';
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
    const montoNuevo = Math.round(parseLocalFloat(nuevoMonto) * 100) / 100;

    if (isNaN(montoNuevo) || montoNuevo <= 0) {
      return NextResponse.json({ error: 'El monto de la nota de crédito debe ser mayor a 0.' }, { status: 400 });
    }

    const identidad = String(doc.identidad || '').trim().toUpperCase();
    const codigoCondo = details.codigo_condominio || details.condominio || (/^CM-/i.test(identidad) ? identidad : undefined);

    // 3. Calcular diferencia de monto y ajustar saldos correspondientes
    const diff = Math.round((montoNuevo - montoAnterior) * 100) / 100;

    if (diff > 0) {
      // Aumentó el monto: se acredita la diferencia adicional
      const resAcred = await acreditarSaldoFavor(identidad, diff, codigoCondo, supabase);
      if (!resAcred.ok) {
        console.warn('Aviso acreditando saldo adicional:', resAcred.error);
      }
    } else if (diff < 0) {
      // Disminuyó el monto: se descuenta el exceso
      const resDesc = await descontarSaldoFavor(identidad, Math.abs(diff), codigoCondo, supabase);
      if (!resDesc.ok) {
        console.warn('Aviso descontando saldo:', resDesc.error);
      }
    }

    // 4. Actualizar detalles del documento
    const refFinal = nuevaReferencia !== undefined && String(nuevaReferencia).trim() !== ''
      ? String(nuevaReferencia).trim()
      : (details.origen_referencia || '');

    const motivoFinal = nuevoMotivo !== undefined && String(nuevoMotivo).trim() !== ''
      ? String(nuevoMotivo).trim()
      : (details.motivo || 'Nota de Crédito modificada');

    const updatedDetails = {
      ...details,
      monto: montoNuevo.toFixed(2),
      monto_bs: montoNuevo,
      origen_referencia: refFinal,
      motivo: motivoFinal,
      editado_el: new Date().toISOString(),
      editado_por: usuario || 'Admin',
      historial_ediciones: [
        ...(Array.isArray(details.historial_ediciones) ? details.historial_ediciones : []),
        {
          fecha: new Date().toISOString(),
          usuario: usuario || 'Admin',
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
        detalles: JSON.stringify(updatedDetails)
      })
      .eq('id', id)
      .select()
      .single();

    if (errUpd) {
      return NextResponse.json({ error: `Error al actualizar documento: ${errUpd.message}` }, { status: 500 });
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
