/**
 * Servicio de Deuda — Cálculos centralizados de deuda y montos de recibos.
 * 
 * Antes esta lógica vivía inline en caja/page.tsx (función getReciboMonto).
 * Al centralizarla aquí, cualquier módulo puede calcular la deuda de un
 * contribuyente con la misma fórmula.
 */

import type { Inmueble, Recibo, PagoReportado } from '@/types';
import { parsePagoDetalles } from '@/types';

/**
 * Calcula el monto en Bolívares de un recibo, considerando:
 * - Recibos RECIB-*: deuda acumulada (deuda_mmv × tasa)
 * - Recibos CM-*: 1 mes del inmueble específico (mmv_mes × tasa)
 * - Fallback: monto literal del recibo
 */
export function calcularMontoRecibo(
  recibo: Recibo,
  inmuebles: Inmueble[],
  identidad: string,
  tasaBcv: number,
  pagosPendientes: PagoReportado[] = []
): number {
  if (!identidad || tasaBcv <= 0) {
    return parseFloat(String(recibo.monto || '0').replace(/[^\d.]/g, '')) || 0;
  }

  // Si ya está abonado o pagado, usar monto literal (ya fue reducido)
  if (recibo.estado === 'Abonado' || recibo.estado === 'Pagado') {
    return parseFloat(String(recibo.monto || '0').replace(/[^\d.]/g, '')) || 0;
  }

  const userInms = inmuebles.filter((i) =>
    (i.identidad || '').replace(/-/g, '').toUpperCase() === 
    (identidad || '').replace(/-/g, '').toUpperCase()
  );

  // RECIB- = deuda acumulada de N meses → usar deuda_mmv del inmueble × tasa actual
  if (recibo.referencia?.startsWith('RECIB-')) {
    let totalDeudaMMV = 0;
    userInms.forEach((inm) => {
      totalDeudaMMV += parseFloat(String(inm.deuda_mmv || 0));
    });
    if (totalDeudaMMV > 0) {
      const baseMonto = totalDeudaMMV * tasaBcv;
      const montoPendiente = calcularMontoPendiente(recibo.referencia, pagosPendientes);
      return Math.max(0, baseMonto - montoPendiente);
    }
    return parseFloat(String(recibo.monto || '0').replace(/[^\d.]/g, '')) || 0;
  }

  // CM- = exactamente 1 mes del inmueble específico
  if (recibo.referencia?.startsWith('CM-')) {
    let targetInms = userInms.filter((inm) =>
      inm.inmueble && (recibo.referencia || '').includes(inm.inmueble)
    );
    if (targetInms.length === 0) targetInms = userInms;

    let monthlyMMV = 0;
    targetInms.forEach((inm) => {
      const cant = parseFloat(String(inm.cant_inmuebles || 1));
      const mmv = parseFloat(String(inm.mmv_mes || 0));
      if (mmv > 0) monthlyMMV += cant * mmv;
    });
    if (monthlyMMV > 0) {
      const baseMonto = monthlyMMV * tasaBcv;
      const montoPendiente = calcularMontoPendiente(recibo.referencia, pagosPendientes);
      return Math.max(0, baseMonto - montoPendiente);
    }
  }

  // Fallback genérico
  return parseFloat(String(recibo.monto || '0').replace(/[^\d.]/g, '')) || 0;
}

/**
 * Calcula cuánto dinero de pagos "Por Verificar" ya está asignado a un recibo específico.
 */
function calcularMontoPendiente(referencia: string, pagosPendientes: PagoReportado[]): number {
  let montoPendiente = 0;
  pagosPendientes.forEach((p) => {
    const det = parsePagoDetalles(p.detalles);
    const refs: string[] = det.recibos || [];
    if (refs.includes(referencia)) {
      const montoPago = parseFloat(String(p.monto || '0').replace(/[^0-9.]/g, '')) || 0;
      if (refs.length > 0) montoPendiente += (montoPago / refs.length);
    }
  });
  return montoPendiente;
}

/**
 * Calcula la deuda total de un contribuyente en Bolívares.
 */
export function calcularDeudaTotal(
  inmuebles: Inmueble[],
  identidad: string,
  tasaBcv: number
): number {
  const userInms = inmuebles.filter((i) =>
    (i.identidad || '').replace(/-/g, '').toUpperCase() === 
    (identidad || '').replace(/-/g, '').toUpperCase()
  );
  
  let totalMMV = 0;
  let totalCongelada = 0;
  userInms.forEach((inm) => {
    totalMMV += parseFloat(String(inm.deuda_mmv || 0));
    totalCongelada += parseFloat(String(inm.deuda_congelada_bs || 0));
  });
  
  return (totalMMV * tasaBcv) + totalCongelada;
}

/**
 * Limpia la deuda de un contribuyente tras un pago completo.
 * Usa `id` del inmueble para evitar problemas con guiones en identidad.
 */
export async function limpiarDeuda(
  supabase: any,
  inmuebles: Inmueble[],
  identidad: string
): Promise<void> {
  const userInms = inmuebles.filter((i) =>
    (i.identidad || '').replace(/-/g, '').toUpperCase() === 
    (identidad || '').replace(/-/g, '').toUpperCase()
  );
  for (const inm of userInms) {
    await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0 }).eq('id', inm.id);
  }
}
