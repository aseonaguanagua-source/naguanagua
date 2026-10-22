import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { isResidencialInm } from '@/lib/calculos';
import { sanitizarDireccionFiscal } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

function numeroALetras(monto: number): string {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const especiales: Record<number, string> = {
    11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
    16: 'DIECISEIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
    21: 'VEINTIUN', 22: 'VEINTIDOS', 23: 'VEINTITRES', 24: 'VEINTICUATRO', 25: 'VEINTICINCO',
    26: 'VEINTISEIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE'
  };
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertirGrupo(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    if (especiales[n]) return especiales[n];
    if (n < 10) return unidades[n];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    const c = Math.floor(n / 100);
    const resto = n % 100;
    return resto === 0 ? centenas[c] : `${centenas[c]} ${convertirGrupo(resto)}`;
  }

  const entero = Math.floor(Math.abs(monto));
  const decimales = Math.round((Math.abs(monto) - entero) * 100);
  
  if (entero === 0) return `CERO BOLIVARES CON ${String(decimales).padStart(2, '0')}/100`;

  let resultado = '';
  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;

  if (millones > 0) {
    resultado += millones === 1 ? 'UN MILLON' : `${convertirGrupo(millones)} MILLONES`;
    if (miles > 0 || resto > 0) resultado += ' ';
  }
  if (miles > 0) {
    resultado += miles === 1 ? 'MIL' : `${convertirGrupo(miles)} MIL`;
    if (resto > 0) resultado += ' ';
  }
  if (resto > 0) {
    resultado += convertirGrupo(resto);
  }

  return `${resultado} BOLIVARES CON ${String(decimales).padStart(2, '0')}/100`;
}

export async function POST(request: Request) {
  try {
    const { pagoId, identidad, contribuyente, monto, recibos } = await request.json();

    // 1. Probar conectividad con The Factory HKA
    const estadoConexion = await TheFactoryHKA.verificarConexion();

    // 2. Si no se especificó pagoId, retornar estado general
    if (!pagoId && !identidad) {
      return NextResponse.json({
        ok: estadoConexion.ok,
        conexionTfhka: estadoConexion,
        message: estadoConexion.message
      });
    }

    // 3. Buscar datos del pago en BD si vino pagoId
    let pagoData: any = null;
    if (pagoId) {
      const { data } = await supabase.from('pagos_reportados').select('*').eq('id', pagoId).single();
      pagoData = data;
    }

    const docIdentidad = (identidad || pagoData?.identidad || '').trim();
    const nombreContrib = (contribuyente || pagoData?.detalles?.contribuyente || 'CONTRIBUYENTE').trim();
    let montoTotal = parseFloat(String(monto || '0'));
    if (montoTotal <= 0 && pagoData) {
      let det: any = pagoData.detalles || {};
      if (typeof det === 'string') { try { det = JSON.parse(det); } catch { det = {}; } }
      const ret = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || 0)) || 0;
      const sf = parseFloat(String(det.saldo_a_favor_nuevo || det.monto_sobrante || det.saldo_favor || det.saldo_favor_generado || 0)) || 0;
      const sfReal = (ret > 0 && Math.abs(sf - ret) < 0.05) ? 0 : sf;
      const esRet = ret > 0 || det.es_retencion || det.agente_retencion;
      const sfUsado = (() => {
        let u = parseFloat(String(det.saldo_usado ?? det.descuentoSaldoFavor ?? det.descuento_saldo_favor ?? det.saldo_favor_usado ?? det.nota_credito_usada ?? det.monto_saldo_favor ?? 0)) || 0;
        if (u === 0 && (String(pagoData?.tipo || det.tipo || '').toLowerCase().includes('saldo a favor') || String(pagoData?.tipo || det.tipo || '').toLowerCase().includes('nota de credito'))) {
          return parseFloat(String(pagoData?.monto || 0)) || 0;
        }
        if (u === 0 && Array.isArray(det.pagos_agregados)) {
          u = det.pagos_agregados
            .filter((pa: any) => String(pa?.metodo || pa?.tipo || '').toLowerCase().includes('saldo a favor') || String(pa?.metodo || pa?.tipo || '').toLowerCase().includes('nota de credito'))
            .reduce((sum: number, pa: any) => sum + (parseFloat(String(pa.monto || 0)) || 0), 0);
        }
        if (u === 0 && Array.isArray(det.formasPago)) {
          u = det.formasPago
            .filter((fp: any) => String(fp?.descripcion || fp?.tipo || fp?.metodo || '').toLowerCase().includes('saldo a favor') || String(fp?.descripcion || fp?.tipo || fp?.metodo || '').toLowerCase().includes('nota de credito'))
            .reduce((sum: number, fp: any) => sum + (parseFloat(String(fp.monto || 0)) || 0), 0);
        }
        if (u === 0 && det.monto_factura) {
          const mFactura = parseFloat(String(det.monto_factura)) || 0;
          const mPago = parseFloat(String(pagoData?.monto || 0)) || 0;
          const dif = Math.round((mFactura - mPago - ret + (sfReal > 0 ? sfReal : 0)) * 100) / 100;
          if (dif > 0.05) u = dif;
        }
        return Math.round(u * 100) / 100;
      })();

      let rcTotal = 0;
      if (det.recibo_caja) {
        try {
          const rc = typeof det.recibo_caja === 'string' ? JSON.parse(det.recibo_caja) : det.recibo_caja;
          if (Array.isArray(rc) && rc.length > 0) {
            rcTotal = rc.reduce((acc: number, r: any) => acc + (parseFloat(String(r.total || 0)) || 0), 0);
          }
        } catch(e) {}
      }

      if (rcTotal > 0) {
        montoTotal = Math.round(rcTotal * 100) / 100;
      } else if (esRet) {
        const montoNeto = parseFloat(String(det.monto_neto_factura || 0));
        const totalSel = parseFloat(String(det.total_seleccionado || 0));
        const deudaSis = parseFloat(String(det.deuda_total_sistema || 0));
        if (montoNeto > 0 && ret > 0) {
          montoTotal = Math.round((montoNeto + ret) * 100) / 100;
        } else if (totalSel > 0) {
          montoTotal = totalSel;
        } else if (deudaSis > 0) {
          montoTotal = deudaSis;
        } else if (ret > 0) {
          montoTotal = Math.max(0, parseFloat(pagoData.monto || 0) - sfReal) + ret + sfUsado;
        }
      } else if (det.monto_neto_factura && parseFloat(det.monto_neto_factura) > 0) {
        montoTotal = parseFloat(det.monto_neto_factura);
      } else if (det.monto_factura && parseFloat(det.monto_factura) > 0) {
        montoTotal = parseFloat(det.monto_factura);
      } else if (det.total_seleccionado && parseFloat(det.total_seleccionado) > 0) {
        montoTotal = parseFloat(det.total_seleccionado);
      } else if (sfReal > 0 && parseFloat(pagoData.monto || 0) > sfReal) {
        montoTotal = (parseFloat(pagoData.monto || 0)) - sfReal + sfUsado;
      } else {
        montoTotal = parseFloat(String(pagoData.monto || '0')) + sfUsado;
      }
    }

    // 4. Buscar información del inmueble ESPECÍFICO facturado
    let detPagoObj: any = pagoData?.detalles || {};
    if (typeof detPagoObj === 'string') { try { detPagoObj = JSON.parse(detPagoObj); } catch { detPagoObj = {}; } }

    const codInmEspecifico = 
      detPagoObj.condominio?.lineas?.[0]?.inmueble ||
      detPagoObj.lineas?.[0]?.inmueble ||
      detPagoObj.condominio_hijos_pagados?.[0]?.inmueble ||
      detPagoObj.inmueble ||
      (detPagoObj.codigo_inmueble && !String(detPagoObj.codigo_inmueble).startsWith('CONDO-') ? detPagoObj.codigo_inmueble : null) ||
      (detPagoObj.cod_inmueble && !String(detPagoObj.cod_inmueble).startsWith('CONDO-') ? detPagoObj.cod_inmueble : null) ||
      detPagoObj.recibo_caja?.[0]?.inmueble ||
      (() => {
        const rec = (detPagoObj.recibos || []).find((r: string) => /^RECIB-HIST-/i.test(r));
        return rec ? rec.split('-')[2] : null;
      })();

    let prop: any = null;
    if (codInmEspecifico) {
      const { data: matchedInm } = await supabase
        .from('inmuebles')
        .select('inmueble, tipo, actividad_principal, direccion, correo_electronico, telefono, condominio_padre_id')
        .eq('inmueble', codInmEspecifico)
        .maybeSingle();
      if (matchedInm) prop = matchedInm;
    }

    const idNaked = docIdentidad.replace(/^[VJGEP]-?/i, '');
    const idVariants = [docIdentidad, idNaked, `V-${idNaked}`, `J-${idNaked}`, `E-${idNaked}`];

    if (!prop) {
      const { data: inmuebleDb } = await supabase
        .from('inmuebles')
        .select('inmueble, tipo, actividad_principal, direccion, correo_electronico, telefono, condominio_padre_id')
        .in('identidad', idVariants)
        .not('estado', 'ilike', 'eliminado%')
        .limit(10);

      const condoCode = detPagoObj.condominio?.codigo || detPagoObj.cod_inmueble;
      if (condoCode && inmuebleDb && inmuebleDb.length > 0) {
        prop = inmuebleDb.find((p: any) => p.condominio_padre_id === condoCode) || inmuebleDb[0];
      } else {
        prop = inmuebleDb && inmuebleDb.length > 0 ? inmuebleDb[0] : null;
      }
    }

    const { data: contribuyenteDb } = await supabase
      .from('contribuyentes')
      .select('nombre, email, telefono, direccion')
      .in('identidad', idVariants)
      .maybeSingle();

    const emailReal = contribuyenteDb?.email || prop?.correo_electronico || pagoData?.detalles?.correo || null;
    const fallbackEmail = TheFactoryHKA.getFallbackEmail();
    const backupEmail = TheFactoryHKA.getBackupEmail();

    const usaCorreoComodin = !emailReal || emailReal.trim() === '' || emailReal.toLowerCase() === fallbackEmail.toLowerCase();
    const emailFinal = usaCorreoComodin ? fallbackEmail : emailReal;

    // 5. Validar formato de RIF / Cédula
    const errores: string[] = [];
    const advertencias: string[] = [];

    const limpiaId = docIdentidad.replace(/[^A-Z0-9]/gi, '');
    let tipoId = 'V';
    let numId = limpiaId;

    if (/^[VJGEP]/i.test(limpiaId)) {
      tipoId = limpiaId.charAt(0).toUpperCase();
      numId = limpiaId.substring(1);
    } else {
      tipoId = 'V';
      numId = limpiaId;
      advertencias.push('Identificación sin prefijo fiscal explícito (se asumirá tipo ' + tipoId + ').');
    }

    if (numId.length < 5) {
      errores.push('El número de identificación fiscal (' + docIdentidad + ') es inválido o muy corto.');
    }

    if (pagoData && pagoData.estado !== 'Aprobado') {
      errores.push(`El pago no está conciliado (estado actual: "${pagoData.estado || 'Pendiente'}"). Debe ser aprobado en Conciliación Bancaria antes de emitir la factura fiscal.`);
    }

    if (montoTotal <= 0) {
      errores.push('El monto a facturar debe ser mayor a cero.');
    }

    if (usaCorreoComodin) {
      advertencias.push(`El contribuyente NO tiene correo personal registrado. Se asignará automáticamente el correo comodín (${fallbackEmail}). Requiere actualización de correo.`);
    }

    // 6. Totales: la MISMA simulación que usa la emisión (dryRun) → incluye retención de IVA, multas exentas
    //    y porción comercial. Si falla, se estima con cobrado / 1,16.
    let baseImponible = parseFloat((montoTotal / 1.16).toFixed(2));
    let ivaEstimado = parseFloat((montoTotal - baseImponible).toFixed(2));
    let exento = 0;
    let totalFactura = montoTotal;
    let retencionIva = 0;
    let simPayload: any = null;
    if (pagoData) {
      try {
        let det: any = pagoData.detalles || {};
        if (typeof det === 'string') { try { det = JSON.parse(det); } catch { det = {}; } }
        const origin = new URL(request.url).origin;
        const r = await fetch(`${origin}/api/admin/factura-digital/emitir`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pagoId, identidad: docIdentidad, contribuyente: nombreContrib,
            recibos: Array.isArray(det.recibos) ? det.recibos : (recibos || []), montos: det.montos,
            montoTotal: montoTotal, dryRun: true, enviarCorreo: false,
          }),
        });
        const sim = await r.json();
        simPayload = sim;
        const t = sim?.payload?.documentoElectronico?.Encabezado?.Totales;
        if (t && sim.totalAPagar > 0) {
          baseImponible = parseFloat(t.MontoGravadoTotal || '0') || 0;
          ivaEstimado = parseFloat(t.TotalIVA || '0') || 0;
          exento = parseFloat(t.MontoExentoTotal || '0') || 0;
          totalFactura = Math.round(sim.totalAPagar * 100) / 100;
          retencionIva = parseFloat(String(det.monto_retencion_iva || 0)) || 0;
          (sim.errores || []).forEach((e: string) => advertencias.push(e));
        } else if (sim?.skipped) {
          advertencias.push(sim.message || 'Este pago no genera factura fiscal.');
        }
      } catch (e: any) {
        advertencias.push('No se pudo simular la factura; se muestra una estimación: ' + e.message);
      }
    }
    const montoLetras = numeroALetras(totalFactura);

    const reporteValidacion = {
      ok: errores.length === 0,
      pagoId,
      identidad: `${tipoId}-${numId}`,
      contribuyente: nombreContrib,
      comprador: {
        tipo: tipoId,
        numero: numId,
        razonSocial: nombreContrib,
        direccion: simPayload?.payload?.documentoElectronico?.Comprador?.Direccion || sanitizarDireccionFiscal(
          prop?.direccion || detPagoObj?.recibo_caja?.[0]?.domicilioFiscal || contribuyenteDb?.direccion,
          {
            unidadNumero: detPagoObj?.modo === 'CONDOMINIO' ? null : (detPagoObj?.condominio?.lineas?.[0]?.numero || (prop as any)?.numero_local),
            nombreCondo: detPagoObj?.condominio?.nombre,
            parentDir: detPagoObj?.condominio?.direccion
          }
        ),
        correo: emailFinal,
        usaCorreoComodin,
        requiereActualizacionCorreo: usaCorreoComodin,
      },
      totales: {
        montoTotal: totalFactura,
        montoCobrado: montoTotal,
        retencionIva,
        baseImponible,
        iva: ivaEstimado,
        exento,
        montoEnLetras: montoLetras,
        moneda: 'BSD'
      },
      conexionTheFactory: estadoConexion,
      copiaInternaFiscal: {
        correoDestino: backupEmail,
        costoAdicionalTheFactory: '0 (Gratuito vía servidor de correo interno)'
      },
      errores,
      advertencias,
      estadoFinal: errores.length === 0 ? 'LISTA_PARA_EMISION' : 'REQUIERE_CORRECCION'
    };

    return NextResponse.json(reporteValidacion);
  } catch (err: any) {
    console.error('Error verificando facturación digital:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
