/**
 * Servicio de Pagos — Lógica centralizada de procesamiento de pagos.
 * 
 * Antes esta lógica vivía en handleConfirmAndPay() de caja/page.tsx (~300 líneas).
 * Al centralizarla aquí, facilitamos las pruebas unitarias y la reutilización.
 */

import type { PagoDetalles, CuotaSeleccion, Recibo } from '@/types';

/**
 * Construye el objeto de detalles para un pago.
 */
export function construirDetallesPago(params: {
  recibos: string[];
  cuotas: CuotaSeleccion[];
  servicios: string[];
  talaPoda: string[];
  cajero: string;
  esAbono: boolean;
  montoAbonado?: number;
  tasaBcv: number;
  deudaTotalSistema?: number;
  fechaTransaccion: string;
  tasaBcvAplicada?: string;
  notaCambioTasa?: string;
  montoRetencionIva?: number;
  ivaPercent?: number;
  esCondominio?: boolean;
  condominioModo?: 'Total' | 'Local' | 'Abono';
  condominioHijosPagados?: string[];
}): PagoDetalles {
  return {
    recibos: params.recibos,
    cuotas: params.cuotas,
    servicios: params.servicios,
    tala_poda: params.talaPoda,
    cajero: params.cajero,
    es_abono: params.esAbono,
    monto_abonado: params.esAbono ? params.montoAbonado : undefined,
    tasa_bcv: params.tasaBcv,
    deuda_total_sistema: params.deudaTotalSistema,
    fecha_transaccion: params.fechaTransaccion,
    tasa_bcv_aplicada: params.tasaBcvAplicada ? parseFloat(params.tasaBcvAplicada) : undefined,
    nota_cambio_tasa: params.notaCambioTasa,
    monto_retencion_iva: params.montoRetencionIva,
    iva_percent: params.ivaPercent,
    es_condominio: params.esCondominio,
    condominio_modo: params.condominioModo,
    condominio_hijos_pagados: params.condominioModo === 'Local' ? params.condominioHijosPagados : [],
  };
}

/**
 * Calcula los totales finales de un pago considerando IVA, retenciones y saldo a favor.
 */
export function calcularTotalesPago(params: {
  totalBs: number;
  ivaPercent: number;
  montoRetencionIVA: number;
  saldoFavorDisponible: number;
  usarSaldoFavor: boolean;
  metodoPago: string;
}): {
  totalConImpuestos: number;
  descuentoSaldoFavor: number;
  finalTotal: number;
} {
  const totalConImpuestos = (params.totalBs + (params.totalBs * params.ivaPercent)) - params.montoRetencionIVA;
  
  // No aplicar descuento de saldo a favor si el método de pago ya es "Saldo a Favor"
  const descuentoSaldoFavor = (params.metodoPago !== 'Saldo a Favor' && params.usarSaldoFavor)
    ? Math.min(totalConImpuestos, params.saldoFavorDisponible)
    : 0;
  
  const finalTotal = Math.max(0, totalConImpuestos - descuentoSaldoFavor);
  
  return { totalConImpuestos, descuentoSaldoFavor, finalTotal };
}

/**
 * Determina si un pago por transferencia es un abono parcial.
 */
export function esAbonoParcial(
  montoTransferido: number,
  finalTotal: number,
  esPagoMultiple: boolean
): boolean {
  return montoTransferido < finalTotal || esPagoMultiple;
}

/**
 * Calcula el saldo a favor nuevo si el monto transferido excede la deuda.
 */
export function calcularSaldoFavorNuevo(
  montoTransferido: number,
  finalTotal: number
): number {
  return montoTransferido > finalTotal ? montoTransferido - finalTotal : 0;
}

/**
 * Actualiza el estado de las facturas tras un pago.
 * Para abonos parciales, distribuye el monto entre las facturas más antiguas.
 */
export async function actualizarEstadoFacturas(
  supabase: any,
  recibos: string[],
  monto: number,
  esAbono: boolean
): Promise<void> {
  if (recibos.length === 0) return;

  if (!esAbono) {
    // Pago completo: marcar todas como Pagado
    await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', recibos);
    return;
  }

  // Abono parcial: distribuir monto entre facturas (más antiguas primero)
  const { data: facs } = await supabase
    .from('facturas')
    .select('*')
    .in('referencia', recibos)
    .order('emision', { ascending: true });

  if (!facs || facs.length === 0) return;

  let dineroDisponible = monto;
  for (const fac of facs) {
    const montoFac = parseFloat(fac.monto || '0');
    if (dineroDisponible >= montoFac - 1.00) {
      dineroDisponible = Math.max(0, dineroDisponible - montoFac);
      await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', fac.referencia);
    } else if (dineroDisponible > 1.00) {
      const montoRestante = parseFloat((montoFac - dineroDisponible).toFixed(2));
      await supabase.from('facturas').update({ monto: montoRestante, estado: 'Abonado' }).eq('referencia', fac.referencia);
      dineroDisponible = 0;
    }
  }
}
