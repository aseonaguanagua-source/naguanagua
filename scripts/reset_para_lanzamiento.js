const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function run() {
  console.log('=== LIMPIEZA PRE-LANZAMIENTO ===\n');

  // 1. Eliminar pagos_reportados
  console.log('1) Eliminando pagos_reportados...');
  const { error: e1 } = await supabase.from('pagos_reportados').delete().neq('id','00000000-0000-0000-0000-000000000000');
  console.log(e1 ? '   ERROR: ' + e1.message : '   OK\n');

  // 2. Restaurar recibos Pagado -> Pendiente
  console.log('2) Restaurando recibos Pagadas...');
  const { data: pagadas } = await supabase.from('facturas').select('id').eq('estado','Pagado');
  console.log('   Recibos pagadas:', (pagadas||[]).length);
  if ((pagadas||[]).length > 0) {
    const { error: e2 } = await supabase.from('facturas').update({estado:'Pendiente'}).in('id', pagadas.map(f=>f.id));
    console.log(e2 ? '   ERROR: ' + e2.message : '   OK: restauradas\n');
  } else console.log('   OK: ninguna\n');

  // 3. Eliminar servicios_especiales
  console.log('3) Eliminando servicios_especiales...');
  const { error: e3 } = await supabase.from('servicios_especiales').delete().neq('id','00000000-0000-0000-0000-000000000000');
  console.log(e3 ? '   ERROR: ' + e3.message : '   OK\n');

  // 4. Resetear saldo_a_favor
  console.log('4) Reseteando saldo_a_favor...');
  const { data: conSaldo } = await supabase.from('inmuebles').select('id').gt('saldo_a_favor',0);
  if ((conSaldo||[]).length > 0) {
    const { error: e4 } = await supabase.from('inmuebles').update({saldo_a_favor:0}).in('id', conSaldo.map(i=>i.id));
    console.log(e4 ? '   ERROR: ' + e4.message : '   OK: ' + conSaldo.length + ' reseteados\n');
  } else console.log('   OK: ninguno\n');

  // 5. Resumen
  const { data: res } = await supabase.from('facturas').select('estado, referencia');
  const est = (res||[]).reduce((a,f)=>({...a,[f.estado]:(a[f.estado]||0)+1}),{});
  console.log('=== RESUMEN FINAL ===');
  console.log('Estados:', JSON.stringify(est));
  console.log('CM- mensuales:', (res||[]).filter(f=>f.referencia?.startsWith('CM-')).length);
  console.log('RECIB- acumuladas:', (res||[]).filter(f=>f.referencia?.startsWith('RECIB-')).length);
  console.log('Total recibos:', (res||[]).length);
  console.log('\n=== LISTO PARA LANZAMIENTO ===');
}
run().catch(e=>{console.error('ERROR FATAL:',e.message);process.exit(1);});
