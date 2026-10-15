const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkRecentPayments() {
  const { data: pagos } = await supabase.from('pagos_reportados')
    .select('id, referencia, identidad, monto, created_at, detalles')
    .ilike('identidad', 'J-%')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log('=== MUESTRA DETALLADA DE PAGOS DE EMPRESAS (RIF J-) ===');
  for (const p of pagos || []) {
    let det = p.detalles;
    if (typeof det === 'string') {
      try { det = JSON.parse(det); } catch(e) {}
    }
    const retIva = parseFloat(String(det?.monto_retencion_iva || det?.retencion_iva || 0));
    const esAg = det?.es_agente_retencion || det?.agente_retencion;
    const modulo = det?.modulo || (det?.isCondominio ? 'condominio' : 'caja');

    // Consultar el inmueble en DB para ver si tiene agente_retencion = true
    const { data: inms } = await supabase.from('inmuebles').select('inmueble, agente_retencion').eq('identidad', p.identidad);
    const flagsInm = (inms || []).map(i => i.agente_retencion);
    const algunAgenteEnDB = flagsInm.some(f => f === true);

    console.log({
      referencia: p.referencia,
      identidad: p.identidad,
      contribuyente: det?.contribuyente || det?.condominio?.nombre,
      monto_cobrado: p.monto,
      retencion_iva_aplicada: retIva,
      es_agente_en_pago: esAg,
      tiene_agente_en_inmuebles_db: algunAgenteEnDB,
      total_inmuebles_contribuyente: inms?.length || 0,
      inmuebles_con_agente_true: flagsInm.filter(Boolean).length
    });
  }
}
checkRecentPayments();
