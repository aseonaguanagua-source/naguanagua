const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseDetalles(d) {
  if (!d) return {};
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { return {}; }
  }
  return d;
}

const normId = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function testListar() {
  const { data: rawPagos } = await supabase
    .from('pagos_reportados')
    .select('*')
    .ilike('identidad', '%501249490%')
    .order('created_at', { ascending: false });

  // 1.1) Detectar abonos parciales previos que fueron absorbidos
  const abonosAbsorbidosIds = new Set();
  const abonosInfoPorPagoPrincipal = new Map();

  (rawPagos || []).forEach(pPrincipal => {
    if (pPrincipal.tipo === 'Retencion de IVA') return;
    const dP = parseDetalles(pPrincipal.detalles);
    const saldoPrevio = parseFloat(String(dP?.deuda_previa?.[0]?.saldo_favor_bs || dP?.abono_previo_descontado || 0)) || 0;
    const recibosP = (dP?.recibos || []).map(r => String(r).toUpperCase());

    (rawPagos || []).forEach(pAbono => {
      if (pAbono.id === pPrincipal.id || pAbono.tipo === 'Retencion de IVA') return;
      if (pAbono.estado !== 'Aprobado') return;
      if (String(pAbono.referencia || '').startsWith('RECH-')) return;
      if (normId(pAbono.identidad) !== normId(pPrincipal.identidad)) return;

      const dA = parseDetalles(pAbono.detalles);
      const yaEmitidoA = Boolean(dA?.factura_digital?.emitida || dA?.factura_digital?.numero_documento || dA?.factura_digital?.url);
      if (yaEmitidoA) return;

      const esAbonoA = dA?.es_abono === true || dA?.abono === true || pAbono.tipo === 'Abono' || dA?.pago_parcial === true;
      if (!esAbonoA) return;

      const montoSoloA = parseFloat(String(pAbono.monto || 0)) || 0;
      const recibosA = (dA?.recibos || []).map(r => String(r).toUpperCase());
      const comparteRecibo = recibosP.length > 0 && recibosA.length > 0 && recibosP.some(r => recibosA.includes(r));
      const coincideSaldo = saldoPrevio > 0 && Math.abs(saldoPrevio - montoSoloA) < 0.05;

      if ((comparteRecibo || coincideSaldo) && new Date(pAbono.created_at) <= new Date(pPrincipal.created_at)) {
        abonosAbsorbidosIds.add(pAbono.id);
        const current = abonosInfoPorPagoPrincipal.get(pPrincipal.id) || { montoTotal: 0, referencias: [], formasPago: [] };
        if (!current.referencias.includes(pAbono.referencia)) {
          current.montoTotal += montoSoloA;
          if (pAbono.referencia) current.referencias.push(pAbono.referencia);
        }
        abonosInfoPorPagoPrincipal.set(pPrincipal.id, current);
      }
    });
  });

  const pagos = (rawPagos || []).filter(p => {
    if (p.tipo === 'Retencion de IVA') return false;
    const d = parseDetalles(p.detalles);
    if (d?.es_pago_adicional === true || Boolean(d?.pago_principal_id)) return false;
    if (abonosAbsorbidosIds.has(p.id)) return false;
    if (['Rechazado', 'Reversado', 'Condonado'].includes(String(p?.estado || ''))) return false;
    return true;
  });

  console.log('Resultados para facturacion electronica:');
  pagos.forEach(p => {
    const d = parseDetalles(p.detalles);
    const infoAbonos = abonosInfoPorPagoPrincipal.get(p.id);
    const montoPagado = parseFloat(p.monto || 0) + (infoAbonos?.montoTotal || 0);
    const refFinal = infoAbonos && infoAbonos.referencias.length > 0
      ? `${p.referencia} (+ ${infoAbonos.referencias.join(', ')})`
      : p.referencia;
    console.log({
      id: p.id,
      contribuyente: d.contribuyente,
      referencia: refFinal,
      montoFactura: d.monto_factura,
      montoPagadoEfectivo: montoPagado,
      es_retencion: d.es_retencion,
      retencion_iva: d.monto_retencion_iva
    });
  });
}

testListar();
