const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function parseDet(det) {
  if (!det) return {};
  if (typeof det === 'string') {
    try { return JSON.parse(det); } catch { return {}; }
  }
  return det;
}

async function testPendientes() {
  const identidad = 'J-501249490';
  const variantes = ['J-501249490', 'J501249490'];

  const [{ data }, { data: inmsAg }] = await Promise.all([
    supabase
      .from('pagos_reportados')
      .select('id, identidad, monto, created_at, detalles')
      .in('identidad', variantes)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('inmuebles')
      .select('inmueble, agente_retencion, tipo')
      .in('identidad', variantes)
  ]);

  const esContribAgente = (inmsAg || []).some(i => i.agente_retencion === true && !String(i.tipo || '').toUpperCase().includes('RESIDENCIAL'));

  const facturas = [];
  (data || []).forEach(p => {
    const det = parseDet(p.detalles);
    if (det.es_pago_adicional === true || Boolean(det.pago_principal_id)) return;
    const fd = det.factura_digital || {};
    const r = fd.retencion || {};
    const retMonto = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || r.retenido || 0)) || 0;
    const esRet = det.es_retencion || det.agente_retencion || retMonto > 0 || !!r.estado || (esContribAgente && !String(det.tipo || '').toUpperCase().includes('RESIDENCIAL'));

    if (!esRet) return;

    const baseCalc = r.base || (det.total_seleccionado ? Math.round((det.total_seleccionado / 1.16) * 100) / 100 : (retMonto > 0 ? Math.round((retMonto / 0.12) * 100) / 100 : Math.round((parseFloat(p.monto || 0) / 1.16) * 100) / 100));
    const ivaCalc = r.iva || (baseCalc ? Math.round((baseCalc * 0.16) * 100) / 100 : (retMonto > 0 ? Math.round((retMonto / 0.75) * 100) / 100 : Math.round((parseFloat(p.monto || 0) - baseCalc) * 100) / 100));
    const totalCalc = r.total || (baseCalc + ivaCalc);
    const retCalculado = retMonto > 0 ? retMonto : Math.round((ivaCalc * 0.75) * 100) / 100;
    const pagadoCalc = r.pagado || (parseFloat(String(p.monto || 0)) || (totalCalc - retCalculado));

    let estadoRet = r.estado || 'esperando_planilla';
    if (det.retencion_aprobada === true) estadoRet = 'aprobada';

    facturas.push({
      pagoId: p.id,
      base: r.base || baseCalc,
      iva: r.iva || ivaCalc,
      retenido: r.retenido || retCalculado,
      total: r.total || totalCalc,
      pagado: pagadoCalc,
      estado: estadoRet,
    });
  });

  console.log('Facturas pendientes para portal retenciones:', JSON.stringify(facturas, null, 2));
}

testPendientes();
