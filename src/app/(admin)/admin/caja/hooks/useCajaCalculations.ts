/**
 * useCajaCalculations.ts
 * Hook que encapsula toda la lógica de cálculo de montos en caja.
 * Antes vivía como función inline dentro de CajaPage (la "God Function").
 *
 * Extraído de caja/page.tsx como parte de la Fase 2 de refactorización.
 */
import { useCallback } from 'react';
import { calcularMensualidad } from '@/lib/calculos';
import { getUserInmuebles } from '@/lib/cajaHelpers';

interface UseCajaCalculationsParams {
  foundUser: any;
  customBcvRate: string;
  tcmmv: number;
  freshInmuebles: any[];
  condominioHijos: any[];
  inmuebles: any[];
  pagosPendientes: any[];
}

/**
 * Retorna `getReciboMonto`: función que calcula el monto actual de un recibo
 * aplicando la tasa BCV vigente, la mora por antigüedad y descontando pagos
 * en estado "Por Verificar".
 *
 * Siempre recalcula — nunca usa el monto almacenado en BD para recibos activos
 * de tipo RECIB-HIST- o CM-, para reflejar la tasa del día.
 */
export function useCajaCalculations({
  foundUser,
  customBcvRate,
  tcmmv,
  freshInmuebles,
  condominioHijos,
  inmuebles,
  pagosPendientes,
}: UseCajaCalculationsParams) {

  const getReciboMonto = useCallback((r: any): string => {
    // Sin usuario o sin tasa: usar monto almacenado en BD
    if (!foundUser) {
      return String(parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0);
    }

    // Recibos ya pagados/abonados usan el monto que quedó en BD
    if (r.estado === 'Abonado' || r.estado === 'Pagado') {
      return String(parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0);
    }

    // Tasa efectiva: personalizada por el cajero o la del BCV global
    const tasaActual = (customBcvRate && !isNaN(parseFloat(customBcvRate)))
      ? parseFloat(customBcvRate)
      : (tcmmv || 0);

    if (tasaActual <= 0) {
      return String(parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0);
    }

    const userInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);

    // ─── RECIB-HIST-: deuda histórica por inmueble ─────────────────────────────
    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inmId = parts[2];
      const inm = userInms.find((i: any) => i.inmueble === inmId);
      if (inm) {
        const baseMonto = calcularMensualidad(
          String(inm.clasificacion || ''),
          String(inm.actividad_principal || ''),
          parseInt(String(inm.cant_inmuebles || 1)),
          tasaActual,
          parseFloat(String(inm.mmv_mes || '0'))
        );
        const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
        const montoIVA = esRes ? 0 : baseMonto * 0.16;
        const emision = r.emision ? new Date(r.emision) : new Date();
        const today = new Date();
        const monthsDiff =
          (today.getFullYear() - emision.getFullYear()) * 12 +
          (today.getMonth() - emision.getMonth());
        const montoMulta = monthsDiff > 1 ? baseMonto * (esRes ? 0.10 : 0.12) : 0;
        const totalMes = baseMonto + montoIVA + montoMulta;

        const montoPendiente = _calcularMontoPendienteEnVuelo(r.referencia, pagosPendientes);
        return String(Math.max(0, totalMes - montoPendiente).toFixed(2));
      }
      return '0.00';
    }

    // ─── RECIB- legacy ─────────────────────────────────────────────────────────
    if (r.referencia?.startsWith('RECIB-')) {
      return String(parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0);
    }

    // ─── CM-: recibo mensual generado por el cron ──────────────────────────────
    if (r.referencia?.startsWith('CM-')) {
      let targetInms = userInms.filter(
        (inm: any) => inm.inmueble && (r.referencia || '').includes(inm.inmueble)
      );
      if (targetInms.length === 0) targetInms = userInms;

      let totalConIva = 0;
      targetInms.forEach((inm: any) => {
        const bm = calcularMensualidad(
          inm.clasificacion || '',
          inm.actividad_principal || '',
          parseInt(inm.cant_inmuebles || 1),
          tasaActual,
          parseFloat(inm.mmv_mes || '0')
        );
        const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
        const emision = r.emision ? new Date(r.emision) : new Date();
        const today = new Date();
        const monthsDiff =
          (today.getFullYear() - emision.getFullYear()) * 12 +
          (today.getMonth() - emision.getMonth());
        const multaLocal = monthsDiff > 1 ? bm * (esRes ? 0.10 : 0.12) : 0;
        totalConIva += bm + (esRes ? 0 : bm * 0.16) + multaLocal;
      });

      if (totalConIva > 0) {
        const montoPendiente = _calcularMontoPendienteEnVuelo(r.referencia, pagosPendientes);
        return String(Math.max(0, totalConIva - montoPendiente).toFixed(2));
      }
    }

    // ─── Fallback genérico ─────────────────────────────────────────────────────
    return String(parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0);
  }, [foundUser, customBcvRate, tcmmv, freshInmuebles, condominioHijos, inmuebles, pagosPendientes]);

  return { getReciboMonto };
}

/**
 * Calcula cuánto de un recibo está cubierto por pagos "Por Verificar" en vuelo.
 * Helper privado — no se exporta.
 */
function _calcularMontoPendienteEnVuelo(referencia: string, pagosPendientes: any[]): number {
  let montoPendiente = 0;
  pagosPendientes.forEach((p: any) => {
    let det: any = {};
    try {
      det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {});
    } catch (_) { /* JSON malformado — ignorar */ }
    const refs: string[] = det.recibos || [];
    if (refs.includes(referencia)) {
      const montoPago = parseFloat(String(p.monto || '0').replace(/[^0-9.]/g, '')) || 0;
      if (refs.length > 0) montoPendiente += montoPago / refs.length;
    }
  });
  return montoPendiente;
}
