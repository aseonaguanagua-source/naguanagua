import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient, DEFAULT_RESEND_FROM } from '@/lib/emailClient';
import { enviarFacturaConCopiaInterna } from '@/lib/facturaMailer';
import { parseDet, pagoDeRetencion, correoContribuyente, htmlRechazo, portalRetencionesUrl } from '@/lib/retencionFlujo';

export const dynamic = 'force-dynamic';

/**
 * Hacienda revisa el comprobante de retención o el operador gestiona la retención:
 *  - aprobar (con o sin planilla) → se envía la FACTURA por correo al contribuyente
 *  - subir_planilla               → el operador adjunta la planilla recibida en taquilla / correo
 *  - guardar_y_aprobar            → el operador adjunta la planilla y la aprueba de inmediato enviando la factura
 *  - rechazar                     → se avisa el motivo para que el contribuyente suba uno nuevo
 */
export async function POST(request: Request) {
  try {
    const {
      retencionId,
      pagoId,
      accion,
      motivo,
      usuario,
      sinPlanilla,
      planillaUrl,
      numeroComprobante,
      fechaComprobante,
    } = await request.json().catch(() => ({}));

    const validActions = ['aprobar', 'rechazar', 'subir_planilla', 'guardar_y_aprobar'];
    if (!validActions.includes(accion)) {
      return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
    }

    if (accion === 'rechazar' && !String(motivo || '').trim()) {
      return NextResponse.json({ error: 'Indique el motivo del rechazo.' }, { status: 400 });
    }

    // 1. Resolver el pago
    let pago: any = null;
    if (pagoId) {
      const { data: pData } = await supabase
        .from('pagos_reportados')
        .select('id, identidad, monto, detalles')
        .eq('id', pagoId)
        .maybeSingle();
      pago = pData;
    }

    if (!pago && retencionId) {
      const { data: pDirect } = await supabase
        .from('pagos_reportados')
        .select('id, identidad, monto, detalles')
        .eq('id', retencionId)
        .maybeSingle();
      pago = pDirect || (await pagoDeRetencion(retencionId));
    }

    const det = pago ? parseDet(pago.detalles) : {};
    const fd = det.factura_digital || {};
    const retObj = fd.retencion || {};
    const ahora = new Date().toISOString();
    const quien = usuario || 'Operador';
    const correo = pago ? await correoContribuyente(pago.identidad, det) : null;
    const origin = new URL(request.url).origin;

    // 2. Resolver la fila en retenciones_iva si existe
    let ret: any = null;
    let actualRetId = retencionId || retObj.retencion_id || null;
    const norm = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pNorm = norm(pago?.identidad);

    if (actualRetId) {
      const { data: rData } = await supabase
        .from('retenciones_iva')
        .select('*')
        .eq('id', actualRetId)
        .maybeSingle();
      if (rData) {
        // Solo aceptar si pertenece al mismo contribuyente o no hay pago vinculado
        if (!pago || !pNorm || !rData.identidad || norm(rData.identidad) === pNorm) {
          ret = rData;
        } else {
          console.warn(`[retenciones/revisar] Descartando retencion_id ${actualRetId} (pertenece a ${rData.identidad}, no a ${pago?.identidad})`);
          actualRetId = null;
        }
      }
    }

    if (!ret && fd.numero_control) {
      const { data: rList } = await supabase
        .from('retenciones_iva')
        .select('*')
        .eq('factura_control', fd.numero_control);
      const rMatch = (rList || []).find((r: any) => !pNorm || !r.identidad || norm(r.identidad) === pNorm);
      if (rMatch) {
        ret = rMatch;
        actualRetId = rMatch.id;
      }
    }

    const fechaEmi = fd.fecha_emision ? new Date(fd.fecha_emision) : new Date();
    const periodo = `${String(fechaEmi.getMonth() + 1).padStart(2, '0')}/${fechaEmi.getFullYear()}`;

    // ── ACCIÓN: SUBIR PLANILLA POR EL OPERADOR ──
    if (accion === 'subir_planilla' || accion === 'guardar_y_aprobar') {
      if (!String(planillaUrl || '').trim() && !String(numeroComprobante || '').trim()) {
        return NextResponse.json({ error: 'Debe ingresar el número de comprobante o adjuntar el archivo de la planilla.' }, { status: 400 });
      }

      const numComp = String(numeroComprobante || '').trim() || (ret?.numero_planilla || 'COMP-OPERADOR');
      const fComp = fechaComprobante || ret?.fecha_planilla || ahora.split('T')[0];
      const pUrl = String(planillaUrl || '').trim() || ret?.planilla_url || null;
      const estadoFinal = accion === 'guardar_y_aprobar' ? 'Aprobado' : 'Pendiente';

      if (ret) {
        // Actualizar existente
        const { error: eUp } = await supabase
          .from('retenciones_iva')
          .update({
            numero_planilla: numComp,
            fecha_planilla: fComp,
            planilla_url: pUrl,
            estado: estadoFinal,
            motivo_rechazo: null,
            aprobado_at: estadoFinal === 'Aprobado' ? ahora : null,
            aprobado_por: estadoFinal === 'Aprobado' ? quien : null,
            factura_control: fd.numero_control || ret.factura_control,
            factura_emitida: true,
          })
          .eq('id', ret.id);
        if (eUp) throw eUp;
      } else {
        // Crear nuevo registro en retenciones_iva
        const { data: inmLink } = await supabase
          .from('inmuebles')
          .select('inmueble, contribuyente')
          .eq('identidad', pago?.identidad || '')
          .limit(1)
          .maybeSingle();

        const { data: ins, error: eIns } = await supabase
          .from('retenciones_iva')
          .insert({
            identidad: pago?.identidad || 'N/A',
            contribuyente: det.contribuyente || inmLink?.contribuyente || pago?.identidad || 'N/A',
            codigo_inmueble: inmLink?.inmueble || null,
            numero_planilla: numComp,
            periodo,
            fecha_planilla: fComp,
            monto_base: retObj.base || 0,
            monto_iva: retObj.iva || 0,
            monto_retenido: retObj.retenido || 0,
            codigo_retencion: `FAC-${fd.numero_documento || ''}`,
            planilla_url: pUrl,
            estado: estadoFinal,
            aprobado_at: estadoFinal === 'Aprobado' ? ahora : null,
            aprobado_por: estadoFinal === 'Aprobado' ? quien : null,
            factura_control: fd.numero_control || null,
            factura_emitida: true,
          })
          .select('id')
          .single();

        if (eIns) throw eIns;
        actualRetId = ins.id;
      }

      if (pago) {
        fd.retencion = {
          ...retObj,
          estado: estadoFinal === 'Aprobado' ? 'aprobada' : 'planilla_recibida',
          retencion_id: actualRetId,
          planilla_recibida_at: ahora,
          revisado_at: estadoFinal === 'Aprobado' ? ahora : undefined,
          revisado_por: estadoFinal === 'Aprobado' ? quien : undefined,
          motivo_rechazo: undefined,
          cargado_por_operador: true,
        };
        det.factura_digital = fd;
        await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pago.id);
      }

      if (accion === 'guardar_y_aprobar') {
        // Enviar factura por correo
        let envio: any = null;
        let errorEnvio: string | undefined;
        if (fd.emitida && fd.url) {
          try {
            envio = await enviarFacturaConCopiaInterna({
              contribuyente: ret?.contribuyente || det.contribuyente || pago?.identidad,
              identidad: pago?.identidad,
              numeroControl: fd.numero_control,
              numeroDocumento: fd.numero_documento,
              monto: parseFloat(String(fd.retencion?.total || fd.monto_total || det?.monto_factura || pago?.monto || 0)),
              fecha: fd.fecha_emision,
              urlPdf: fd.url,
              correoContribuyente: correo || undefined,
              esCorreoComodin: !correo,
            });
          } catch (e: any) { errorEnvio = e.message; }
        }

        if (pago) {
          fd.envio_correo = envio || fd.envio_correo;
          fd.retencion.factura_enviada_at = correo && !errorEnvio ? ahora : undefined;
          fd.retencion.factura_enviada_a = correo || undefined;
          det.factura_digital = fd;
          await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pago.id);
        }

        await supabase.from('auditoria').insert({
          usuario: quien,
          accion: 'Comprobante de retención montado y aprobado por operador - factura enviada',
          categoria: 'FACTURACION',
          modulo: '/admin/facturacion-electronica',
          detalles: { retencion_id: actualRetId, pago_id: pago?.id, factura: fd.numero_documento, correo, error_envio: errorEnvio }
        });

        return NextResponse.json({
          success: true,
          estado: 'Aprobado',
          retencionId: actualRetId,
          facturaEnviada: !!correo && !errorEnvio,
          correo,
          error: !correo ? 'El contribuyente no tiene correo registrado: la factura quedó en el archivo interno.' : errorEnvio
        });
      }

      await supabase.from('auditoria').insert({
        usuario: quien,
        accion: 'Comprobante de retención montado por operador',
        categoria: 'FACTURACION',
        modulo: '/admin/facturacion-electronica',
        detalles: { retencion_id: actualRetId, pago_id: pago?.id, comprobante: numComp, archivo: pUrl }
      });

      return NextResponse.json({ success: true, estado: 'planilla_recibida', retencionId: actualRetId });
    }

    // ── ACCIÓN: RECHAZAR COMPROBANTE ──
    if (accion === 'rechazar') {
      if (ret) {
        await supabase
          .from('retenciones_iva')
          .update({
            estado: 'Rechazado',
            motivo_rechazo: motivo,
            aprobado_at: ahora,
            aprobado_por: quien,
            planilla_url: null,
            numero_planilla: null,
          })
          .eq('id', ret.id);
      }
      if (pago) {
        fd.retencion = {
          ...(fd.retencion || {}),
          estado: 'rechazada',
          motivo_rechazo: motivo,
          revisado_at: ahora,
          revisado_por: quien,
          planilla_recibida_at: null,
          comprobante_url: null,
        };
        det.factura_digital = fd;
        det.retencion_aprobada = false;
        await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pago.id);
      }
      let avisado = false;
      if (correo) {
        try {
          const r: any = await getResendClient().emails.send({
            from: DEFAULT_RESEND_FROM,
            to: [correo],
            subject: `Comprobante de retención rechazado - Factura N° ${fd.numero_documento || ''} - IAMEC Naguanagua`,
            html: htmlRechazo({ contribuyente: ret?.contribuyente || det.contribuyente || pago?.identidad, numeroDocumento: fd.numero_documento || '', motivo, portalUrl: portalRetencionesUrl(origin) }),
          });
          avisado = !r?.error;
        } catch { /* aviso best-effort */ }
      }
      await supabase.from('auditoria').insert({
        usuario: quien,
        accion: 'Comprobante de retención rechazado',
        categoria: 'FACTURACION',
        modulo: '/admin/facturacion-electronica',
        detalles: { retencion_id: ret?.id, pago_id: pago?.id, motivo, avisado }
      });
      return NextResponse.json({ success: true, estado: 'Rechazado', avisado, correo });
    }

    // ── ACCIÓN: APROBAR (CON O SIN PLANILLA) Y ENVIAR FACTURA ──
    const finalFacturaUrl = fd.url || ret?.factura_url;
    const finalFacturaControl = fd.numero_control || ret?.factura_control;
    const finalFacturaDoc = fd.numero_documento || (ret?.codigo_retencion ? ret.codigo_retencion.replace(/^FAC-/i, '') : '');
    const isFacturaEmitida = Boolean(fd.emitida || ret?.factura_emitida || (finalFacturaUrl && finalFacturaControl));

    if (!isFacturaEmitida || !finalFacturaUrl) {
      return NextResponse.json({ error: 'No se encontró la factura emitida de este comprobante. Emítala primero en Facturación Electrónica.' }, { status: 409 });
    }

    const finalIdentidad = pago?.identidad || ret?.identidad;
    const finalContribuyente = ret?.contribuyente || det.contribuyente || finalIdentidad || 'Contribuyente';
    const finalMonto = parseFloat(String(
      fd.retencion?.total ||
      fd.monto_total ||
      det?.monto_factura ||
      (ret?.monto_base ? (Number(ret.monto_base || 0) + Number(ret.monto_iva || 0) + Number(ret.monto_exento || 0)) : pago?.monto || 0)
    ));
    const finalCorreo = correo || (finalIdentidad ? await correoContribuyente(finalIdentidad, det) : null);

    // Si no existía registro en retenciones_iva (ej. aprobado sin planilla antes de que el usuario la subiera)
    if (!ret) {
      const { data: inmLink } = await supabase
        .from('inmuebles')
        .select('inmueble, contribuyente')
        .eq('identidad', finalIdentidad)
        .limit(1)
        .maybeSingle();

      const { data: ins, error: eIns } = await supabase
        .from('retenciones_iva')
        .insert({
          identidad: finalIdentidad,
          contribuyente: finalContribuyente || inmLink?.contribuyente || finalIdentidad,
          codigo_inmueble: inmLink?.inmueble || null,
          numero_planilla: sinPlanilla ? 'S/P (Aprobado de Oficio)' : 'APROBADO',
          periodo,
          fecha_planilla: ahora.split('T')[0],
          monto_base: retObj.base || 0,
          monto_iva: retObj.iva || 0,
          monto_retenido: retObj.retenido || 0,
          codigo_retencion: `FAC-${finalFacturaDoc || ''}`,
          planilla_url: null,
          estado: 'Aprobado',
          aprobado_at: ahora,
          aprobado_por: quien,
          factura_url: finalFacturaUrl,
          factura_control: finalFacturaControl,
          factura_emitida: true,
        })
        .select('id')
        .single();

      if (!eIns && ins) {
        ret = ins;
        actualRetId = ins.id;
      }
    } else {
      await supabase
        .from('retenciones_iva')
        .update({
          estado: 'Aprobado',
          motivo_rechazo: null,
          aprobado_at: ahora,
          aprobado_por: quien,
          factura_url: finalFacturaUrl,
          factura_control: finalFacturaControl,
          factura_emitida: true
        })
        .eq('id', ret.id);
    }

    let envio: any = null;
    let errorEnvio: string | undefined;
    try {
      envio = await enviarFacturaConCopiaInterna({
        contribuyente: finalContribuyente,
        identidad: finalIdentidad,
        numeroControl: finalFacturaControl,
        numeroDocumento: finalFacturaDoc,
        monto: finalMonto,
        fecha: fd.fecha_emision || ret?.fecha_planilla || ahora,
        urlPdf: finalFacturaUrl,
        correoContribuyente: finalCorreo || undefined,
        esCorreoComodin: !finalCorreo,
      });
    } catch (e: any) {
      errorEnvio = e.message;
    }

    if (pago) {
      fd.emitida = true;
      fd.url = finalFacturaUrl;
      fd.numero_control = finalFacturaControl;
      fd.numero_documento = finalFacturaDoc;
      fd.envio_correo = envio || fd.envio_correo;
      fd.retencion = {
        ...(fd.retencion || {}),
        estado: 'aprobada',
        revisado_at: ahora,
        revisado_por: quien,
        retencion_id: actualRetId || fd.retencion?.retencion_id,
        motivo_rechazo: undefined,
        aprobado_sin_planilla: !!sinPlanilla,
        factura_enviada_at: finalCorreo && !errorEnvio ? ahora : undefined,
        factura_enviada_a: finalCorreo || undefined,
      };
      det.factura_digital = fd;
      det.retencion_aprobada = true;

      const { error: errUpPago } = await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pago.id);
      if (errUpPago) console.error('[revisar/aprobar] Error updating pagos_reportados:', errUpPago);
    }

    // Asegurar que si hay pagos hermanos del mismo contribuyente con el mismo número de control o retencionId, también queden aprobados
    if ((actualRetId || finalFacturaControl) && finalIdentidad) {
      try {
        const { data: hermanos } = await supabase
          .from('pagos_reportados')
          .select('id, detalles')
          .eq('identidad', finalIdentidad)
          .neq('id', pago?.id || '00000000-0000-0000-0000-000000000000')
          .limit(50);
        for (const h of hermanos || []) {
          const hDet = parseDet(h.detalles);
          const hFd = hDet.factura_digital;
          const matchRet = actualRetId && hFd?.retencion?.retencion_id === actualRetId;
          const matchCtrl = finalFacturaControl && hFd?.numero_control === finalFacturaControl;
          if (matchRet || matchCtrl) {
            hDet.retencion_aprobada = true;
            if (hFd?.retencion) {
              hFd.retencion.estado = 'aprobada';
              hFd.retencion.revisado_at = ahora;
              hFd.retencion.revisado_por = quien;
            }
            hDet.factura_digital = hFd;
            await supabase.from('pagos_reportados').update({ detalles: hDet }).eq('id', h.id);
          }
        }
      } catch (errH: any) {
        console.warn('[revisar/aprobar] Error actualizando pagos vinculados:', errH);
      }
    }

    const descAuditoria = sinPlanilla
      ? 'Comprobante de retención aprobado sin planilla por operador - factura enviada'
      : 'Comprobante de retención aprobado - factura enviada';

    await supabase.from('auditoria').insert({
      usuario: quien,
      accion: descAuditoria,
      categoria: 'FACTURACION',
      modulo: '/admin/facturacion-electronica',
      detalles: { retencion_id: actualRetId, pago_id: pago?.id || null, factura: finalFacturaDoc, sinPlanilla: !!sinPlanilla, correo: finalCorreo, error_envio: errorEnvio }
    });

    return NextResponse.json({
      success: true,
      estado: 'Aprobado',
      facturaEnviada: !!finalCorreo && !errorEnvio && (envio ? envio.clienteEnviado : true),
      correo: finalCorreo,
      error: !finalCorreo ? 'El contribuyente no tiene correo registrado: la factura quedó en el archivo fiscal interno.' : (errorEnvio || envio?.error)
    });

  } catch (e: any) {
    console.error('Error en revisar retención:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
