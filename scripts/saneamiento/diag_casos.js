// Diagnóstico de casos puntuales del documento de WhatsApp (solo lectura)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const show = (t, x) => console.log(`\n=== ${t} ===\n` + JSON.stringify(x, null, 1).slice(0, 4000));
(async () => {
  const arg = process.argv[2];
  if (arg === 'envaplast') {
    const { data: inm } = await sb.from('inmuebles').select('inmueble,identidad,meses_deuda,deuda_mmv,saldo_favor_bs,agente_retencion,estado,actividad_principal').in('identidad', ['J-305071764', 'J305071764']);
    show('inmuebles', inm);
    const { data: p } = await sb.from('pagos_reportados').select('id,identidad,monto,estado,referencia,created_at,tipo,modulo,detalles').in('identidad', ['J-305071764', 'J305071764']).order('created_at', { ascending: false }).limit(5);
    show('pagos', p?.map(x => ({ ...x, detalles: { recibos: x.detalles?.recibos, monto_retencion_iva: x.detalles?.monto_retencion_iva, nota: x.detalles?.nota_credito, saldo: x.detalles?.saldo_favor_generado, keys: Object.keys(x.detalles || {}) } })));
    const { data: r } = await sb.from('retenciones_iva').select('*').in('identidad', ['J-305071764', 'J305071764']);
    show('retenciones', r);
    const { data: f } = await sb.from('facturas').select('id,referencia,estado,monto,emision').in('identidad', ['J-305071764', 'J305071764']).order('emision', { ascending: false }).limit(10);
    show('facturas', f);
  }
  if (arg === 'pago') {
    const { data: p } = await sb.from('pagos_reportados').select('*').eq('id', process.argv[3]).maybeSingle();
    show('pago', p);
  }
  if (arg === 'ref') {
    const { data: p } = await sb.from('pagos_reportados').select('id,identidad,monto,estado,referencia,created_at,tipo,modulo,detalles').ilike('referencia', `%${process.argv[3]}%`);
    show('pagos ref ' + process.argv[3], p?.map(x => ({ ...x, detalles: { recibos: x.detalles?.recibos, fecha_transaccion: x.detalles?.fecha_transaccion, formasPago: x.detalles?.formasPago, keys: Object.keys(x.detalles || {}) } })));
  }
  if (arg === 'cod') {
    const { data: inm } = await sb.from('inmuebles').select('*').ilike('inmueble', process.argv[3]);
    show('inmueble ' + process.argv[3], inm);
  }
  if (arg === 'id') {
    const { data: inm } = await sb.from('inmuebles').select('inmueble,identidad,contribuyente,estado,meses_deuda,actividad_principal,condominio_padre_id').ilike('identidad', `%${process.argv[3]}%`);
    show('inmuebles id ' + process.argv[3], inm);
    const { data: c } = await sb.from('contribuyentes').select('identidad,nombre').ilike('identidad', `%${process.argv[3]}%`);
    show('contribuyentes', c);
  }
})();
