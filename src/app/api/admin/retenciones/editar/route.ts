import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function esUsuarioAutorizadoRetencion(usuarioRaw: any): boolean {
  const u = String(usuarioRaw || '').trim().toLowerCase();
  if (!u) return false;
  // Solo Raquel, Isamar y David (dzara) están autorizados
  return (
    u.includes('raquel') ||
    u.includes('isamar') ||
    u.includes('isa ') ||
    u === 'isa' ||
    u.includes('dzara') ||
    u.includes('david')
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      retencionId,
      numero_planilla,
      periodo,
      fecha_planilla,
      monto_base,
      monto_iva,
      monto_retenido,
      factura_control,
      codigo_retencion,
      identidad,
      usuario,
    } = body || {};

    if (!retencionId) {
      return NextResponse.json({ error: 'Falta el ID de la retención' }, { status: 400 });
    }

    if (!esUsuarioAutorizadoRetencion(usuario)) {
      return NextResponse.json(
        { error: 'No tiene permisos para editar datos de planillas de retención. Solo autorizado para Raquel, Isamar y Dirección.' },
        { status: 403 }
      );
    }

    const nroPlanillaClean = String(numero_planilla || '').trim();
    if (!nroPlanillaClean) {
      return NextResponse.json({ error: 'El número de planilla no puede estar vacío' }, { status: 400 });
    }

    const perClean = String(periodo || '').trim();
    const fechaClean = String(fecha_planilla || '').trim();
    const mBase = Number(monto_base) || 0;
    const mIva = Number(monto_iva) || 0;
    const mRet = Number(monto_retenido) || 0;

    // 1. Actualizar en retenciones_iva si existe
    const { data: retRow } = await supabase
      .from('retenciones_iva')
      .select('*')
      .eq('id', retencionId)
      .maybeSingle();

    if (retRow) {
      const updatePayload: Record<string, any> = {
        numero_planilla: nroPlanillaClean,
      };
      if (perClean) updatePayload.periodo = perClean;
      if (fechaClean) updatePayload.fecha_planilla = fechaClean;
      if (mBase > 0) updatePayload.monto_base = mBase;
      if (mIva > 0) updatePayload.monto_iva = mIva;
      if (mRet > 0) updatePayload.monto_retenido = mRet;

      const { error: upErr } = await supabase
        .from('retenciones_iva')
        .update(updatePayload)
        .eq('id', retencionId);

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }

    // 2. Sincronizar también en pagos_reportados para que el Libro de Ventas refleje el nuevo N° de planilla y fecha
    const ctrlTarget = String(factura_control || retRow?.factura_control || '').trim();
    const codRetTarget = String(codigo_retencion || retRow?.codigo_retencion || '').trim();
    const docTarget = codRetTarget.replace(/^FAC-/i, '').trim();
    const idTarget = String(identidad || retRow?.identidad || '').trim();

    const idClean = idTarget.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const idNum = idClean.replace(/^[VJGEP]/, '');
    const variantes = idNum
      ? [idTarget, idClean, `J-${idNum}`, `V-${idNum}`, `G-${idNum}`, `E-${idNum}`, `J${idNum}`, `V${idNum}`]
      : [idTarget].filter(Boolean);

    const { data: pagosCand } = variantes.length > 0
      ? await supabase.from('pagos_reportados').select('id, tipo, referencia, detalles').in('identidad', variantes)
      : await supabase.from('pagos_reportados').select('id, tipo, referencia, detalles').eq('id', retencionId);

    const listaPagos = Array.isArray(pagosCand) ? [...pagosCand] : [];
    if (!listaPagos.some(p => p.id === retencionId)) {
      const { data: pById } = await supabase
        .from('pagos_reportados')
        .select('id, tipo, referencia, detalles')
        .eq('id', retencionId)
        .maybeSingle();
      if (pById) listaPagos.push(pById);
    }

    const pagosVinculadosIds = new Set<string>();
    for (const p of listaPagos) {
      const det = typeof p.detalles === 'string' ? JSON.parse(p.detalles || '{}') : (p.detalles || {});
      const fd = det.factura_digital || {};
      const coincidePago =
        p.id === retencionId ||
        String(fd.retencion?.retencion_id || '') === String(retencionId) ||
        (ctrlTarget && String(fd.numero_control || '').trim() === ctrlTarget) ||
        (docTarget && String(fd.numero_documento || '').trim() === docTarget);

      if (coincidePago) {
        pagosVinculadosIds.add(String(p.id));
        det.comprobante_retencion = nroPlanillaClean;
        det.numero_comprobante_retencion = nroPlanillaClean;
        if (fechaClean) det.fecha_comprobante_retencion = fechaClean;
        if (fd) {
          fd.retencion = {
            ...(fd.retencion || {}),
            retencion_id: retRow?.id || retencionId,
            numero_planilla: nroPlanillaClean,
            comprobante: nroPlanillaClean,
            numero_comprobante: nroPlanillaClean,
            comprobante_numero: nroPlanillaClean,
            ...(fechaClean ? { fecha_comprobante: fechaClean } : {}),
            ...(mBase > 0 ? { base: mBase } : {}),
            ...(mIva > 0 ? { iva: mIva } : {}),
            ...(mRet > 0 ? { retenido: mRet } : {}),
          };
          det.factura_digital = fd;
        }
        await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', p.id);
      }
    }

    // Si hay filas tipo "Retencion de IVA" vinculadas a alguno de esos pagos, actualizar su referencia/detalles
    for (const p of listaPagos) {
      if (!/retenci/i.test(String(p.tipo || ''))) continue;
      const det = typeof p.detalles === 'string' ? JSON.parse(p.detalles || '{}') : (p.detalles || {});
      if (det.pago_vinculado && pagosVinculadosIds.has(String(det.pago_vinculado))) {
        det.comprobante_retencion = nroPlanillaClean;
        det.numero_comprobante_retencion = nroPlanillaClean;
        if (fechaClean) det.fecha_comprobante_retencion = fechaClean;
        await supabase
          .from('pagos_reportados')
          .update({ referencia: nroPlanillaClean, detalles: det })
          .eq('id', p.id);
      }
    }

    // Registrar en auditoría para trazabilidad y respaldo en Libro de Ventas
    await supabase.from('auditoria').insert([{
      usuario: String(usuario || 'Administración'),
      accion: 'Edición de Planilla de Retención IVA',
      modulo: 'Retenciones IVA',
      detalles: {
        retencion_id: retencionId,
        pago_id: [...pagosVinculadosIds][0] || retencionId,
        factura: docTarget || null,
        factura_control: ctrlTarget || null,
        comprobante: nroPlanillaClean,
        numero_comprobante: nroPlanillaClean,
        fecha_comprobante: fechaClean || null,
        periodo: perClean || null,
        monto_base: mBase,
        monto_iva: mIva,
        monto_retenido: mRet,
      }
    }]);

    return NextResponse.json({
      success: true,
      numero_planilla: nroPlanillaClean,
      periodo: perClean,
      fecha_planilla: fechaClean,
      monto_base: mBase,
      monto_iva: mIva,
      monto_retenido: mRet,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error interno al editar retención' }, { status: 500 });
  }
}
