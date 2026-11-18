import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

const CONFIG_ID_CORRELATIVO = 'correlativo_recibos_caja';
const CORTE_CORRELATIVO_NUEVO = '2026-11-17T19:50:00Z';

/**
 * Genera un Número de Control Web (`WEB-XXXXXXX`) de 7 dígitos distinto al `reciboNo` y distinto a la referencia bancaria.
 */
export function generarCodigoControlWeb(reciboNo: string, seed = ''): string {
  const recClean = String(reciboNo || '').replace(/^WEB-/i, '').trim();
  const [basePart, suffixPart] = recClean.split('-');
  const numBase = parseInt(basePart.replace(/\D/g, '') || '1', 10) || 1;
  let hash = 0;
  const strSeed = `${numBase}:${seed || basePart}`;
  for (let i = 0; i < strSeed.length; i++) {
    hash = (hash * 31 + strSeed.charCodeAt(i)) % 800000;
  }
  let webNum = ((numBase * 37 + 148291 + hash) % 8900000) + 1000000;
  if (String(webNum).padStart(7, '0') === basePart.padStart(7, '0')) {
    webNum = ((webNum + 135791) % 8900000) + 1000000;
  }
  const webStr = String(webNum).padStart(7, '0');
  return suffixPart ? `WEB-${webStr}-${suffixPart}` : `WEB-${webStr}`;
}

/**
 * Obtiene y avanza el siguiente número correlativo de recibos de caja en `sistema_config`
 * (sin usar nunca la referencia bancaria ni del punto de venta).
 */
export async function siguienteCorrelativoRecibo(cantidad = 1): Promise<string[]> {
  const n = Math.max(1, Math.floor(cantidad));
  let base = 7490;
  try {
    const { data: row } = await supabase
      .from('sistema_config')
      .select('valor')
      .eq('id', CONFIG_ID_CORRELATIVO)
      .maybeSingle();

    const guardado = parseInt(String(row?.valor || '0'), 10);
    if (guardado > 0) {
      base = guardado;
    } else {
      const { count } = await supabase
        .from('pagos_reportados')
        .select('id', { count: 'exact', head: true });
      base = Math.max(7490, count || 0);
    }

    const nuevoValor = base + n;
    await supabase.from('sistema_config').upsert(
      {
        id: CONFIG_ID_CORRELATIVO,
        valor: String(nuevoValor),
      },
      { onConflict: 'id' }
    );
  } catch {
    base = Math.floor(Date.now() / 1000) % 10000000;
  }

  return Array.from({ length: n }, (_, i) => String(base + 1 + i).padStart(7, '0'));
}

/**
 * Obtiene el número de recibo de un pago en `pagos_reportados`:
 *  1) Si el recibo YA FUE EMITIDO previamente (tiene `recibo_correlativo`, `recibo_no`, `recibo_caja[0].reciboNo`
 *     o `recibo_digital.numero`, o es anterior al corte de activación), RESPETA Y CONSERVA su número original sin cambiarlo.
 *  2) Si es un recibo NUEVO sin número asignado, le asigna el siguiente correlativo secuencial de `correlativo_recibos_caja`
 *     (nunca la referencia del banco) y lo deja guardado en `detalles`.
 */
export async function obtenerCorrelativoReciboPago(pago: any): Promise<string> {
  if (!pago) return '0000001';
  let det: any = {};
  try {
    det = typeof pago.detalles === 'string' ? JSON.parse(pago.detalles) : (pago.detalles || {});
  } catch {
    det = {};
  }

  // 1. Si ya tiene un correlativo asignado explícitamente, devolverlo sin tocar nada
  const corrGuardado = String(det.recibo_correlativo || det.recibo_no || '').replace(/^WEB-/i, '').trim();
  if (/^\d{4,10}$/.test(corrGuardado)) {
    return corrGuardado.padStart(7, '0');
  }

  // 2. Si el pago ya tiene un recibo hecho en `recibo_caja` o `recibo_digital`, respetarlo tal cual
  const rcExistente = String(
    det.recibo_caja?.[0]?.reciboNo ||
    det.recibo_caja?.[0]?.controlWeb ||
    det.recibo_digital?.numero ||
    ''
  )
    .replace(/^WEB-/i, '')
    .replace(/-\d+$/, '')
    .trim();

  if (rcExistente && !rcExistente.startsWith('RC-') && !rcExistente.includes('M')) {
    return rcExistente.padStart(7, '0');
  }

  // 3. Si es un pago histórico previo a la activación del correlativo y no tenía recibo guardado, conservar su numeración previa
  if (pago.created_at && String(pago.created_at) < CORTE_CORRELATIVO_NUEVO) {
    const refAntigua = String(pago.referencia || '').replace(/^RECH-/, '').replace(/\D/g, '').slice(-7);
    if (refAntigua.length >= 3) {
      return refAntigua.padStart(7, '0');
    }
    return String(pago.id || '').replace(/\D/g, '').slice(0, 7).padStart(7, '0');
  }

  // 4. Pago nuevo sin correlativo asignado: tomar el siguiente de la relación oficial de recibos
  const [corrStr] = await siguienteCorrelativoRecibo(1);

  if (pago.id) {
    const nuevoDet: Record<string, any> = {
      ...det,
      recibo_correlativo: corrStr,
      recibo_no: corrStr,
    };
    if (Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0) {
      nuevoDet.recibo_caja = det.recibo_caja.map((rc: any, idx: number) => {
        const suffix = det.recibo_caja.length > 1 ? `-${idx + 1}` : '';
        const rNo = rc.reciboNo || `${corrStr}${suffix}`;
        const existingWebCore = String(rc.controlWeb || '').replace(/^WEB-/i, '').trim();
        const rNoCore = String(rNo || '').replace(/^WEB-/i, '').trim();
        const ctrlWeb = (!rc.controlWeb || existingWebCore === rNoCore)
          ? generarCodigoControlWeb(rNo, String(pago.id || rc.codContribuyente || ''))
          : rc.controlWeb;
        return {
          ...rc,
          reciboNo: rNo,
          controlWeb: ctrlWeb,
        };
      });
    }
    if (det.recibo_digital && typeof det.recibo_digital === 'object' && !det.recibo_digital.numero) {
      nuevoDet.recibo_digital = {
        ...det.recibo_digital,
        numero: `WEB-${corrStr}`,
      };
    }
    supabase
      .from('pagos_reportados')
      .update({ detalles: nuevoDet })
      .eq('id', pago.id)
      .then(() => {});
  }

  return corrStr;
}
