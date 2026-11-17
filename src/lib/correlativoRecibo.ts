import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

/**
 * Obtiene o asigna un número de recibo correlativo único de 7 dígitos (ej. "0007478" / "WEB-0007478")
 * para un pago en `pagos_reportados`, garantizando que NUNCA se use la referencia bancaria/POS como número de recibo
 * y que tanto el recibo impreso en sistema como el PDF enviado por correo tengan exactamente el mismo correlativo.
 */
export async function obtenerCorrelativoReciboPago(pago: any): Promise<string> {
  if (!pago) return '0000001';
  let det: any = {};
  try {
    det = typeof pago.detalles === 'string' ? JSON.parse(pago.detalles) : (pago.detalles || {});
  } catch {
    det = {};
  }

  // 1. Si ya tiene un correlativo asignado explícitamente, devolverlo
  const corrGuardado = String(det.recibo_correlativo || '').replace(/^WEB-/i, '').trim();
  if (/^\d{5,9}$/.test(corrGuardado)) {
    return corrGuardado.padStart(7, '0');
  }

  // 2. Calcular su posición correlativa cronológica en pagos_reportados
  let numero = 1;
  try {
    if (pago.created_at) {
      const { count } = await supabase
        .from('pagos_reportados')
        .select('id', { count: 'exact', head: true })
        .lte('created_at', pago.created_at);
      if (typeof count === 'number' && count > 0) {
        numero = count;
      }
    } else {
      const { count } = await supabase
        .from('pagos_reportados')
        .select('id', { count: 'exact', head: true });
      numero = (count || 0) + 1;
    }
  } catch {
    numero = 1;
  }

  const corrStr = String(numero).padStart(7, '0');

  // 3. Persistir en segundo plano en detalles del pago para que quede fijo en sistema, PDF y reportes
  if (pago.id) {
    const nuevoDet: Record<string, any> = {
      ...det,
      recibo_correlativo: corrStr,
      recibo_no: corrStr,
    };
    if (Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0) {
      nuevoDet.recibo_caja = det.recibo_caja.map((rc: any, idx: number) => {
        const suffix = det.recibo_caja.length > 1 ? `-${idx + 1}` : '';
        return {
          ...rc,
          reciboNo: `${corrStr}${suffix}`,
          controlWeb: `WEB-${corrStr}${suffix}`,
        };
      });
    }
    if (det.recibo_digital && typeof det.recibo_digital === 'object') {
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

