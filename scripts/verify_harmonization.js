const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const sb = createClient(url, key);

async function verify() {
  console.log('--- VERIFICACIÓN DE ESTADO POST-ARMONIZACIÓN ---');
  
  // 1. Total contribuyentes
  const { count: totalContrib } = await sb.from('contribuyentes').select('*', { count: 'exact', head: true });
  console.log(`1. Total Contribuyentes en Supabase: ${totalContrib}`);

  // 2. Contribuyentes sin prefijo (no-hyphen)
  const { count: unPrefixedContrib } = await sb.from('contribuyentes').select('*', { count: 'exact', head: true }).not('identidad', 'like', '%-%');
  console.log(`2. Contribuyentes sin guion/prefijo: ${unPrefixedContrib}`);

  // 3. Contribuyentes con códigos URB / AURI
  const { count: bogusCondos } = await sb.from('contribuyentes').select('*', { count: 'exact', head: true }).or('identidad.like.URB%,identidad.like.AURI%');
  console.log(`3. Contribuyentes espurios (URB/AURI): ${bogusCondos}`);

  // 4. Total inmuebles
  const { count: totalInm } = await sb.from('inmuebles').select('*', { count: 'exact', head: true });
  console.log(`4. Total Inmuebles en Supabase: ${totalInm}`);

  // 5. Inmuebles con identidad no estandarizada (sin V-, J-, E-, G-)
  const { data: invalidInmId } = await sb.from('inmuebles').select('id, identidad, contribuyente')
    .not('identidad', 'like', 'V-%')
    .not('identidad', 'like', 'E-%')
    .not('identidad', 'like', 'J-%')
    .not('identidad', 'like', 'G-%')
    .limit(10);
  console.log(`5. Inmuebles sin prefijo canónico: ${invalidInmId?.length || 0}`, invalidInmId);

  // 6. Inmuebles con meses_deuda > 0 pero deuda_mmv == 0
  const { count: zeroDebtWithMonths } = await sb.from('inmuebles').select('*', { count: 'exact', head: true }).gt('meses_deuda', 0).eq('deuda_mmv', 0);
  console.log(`6. Inmuebles con meses > 0 pero deuda_mmv == 0: ${zeroDebtWithMonths}`);

  // 7. Inmuebles con meses_deuda > 1 pero multa_bs == 0
  const { count: zeroMultaWithMora } = await sb.from('inmuebles').select('*', { count: 'exact', head: true }).gt('meses_deuda', 1).eq('multa_bs', 0);
  console.log(`7. Inmuebles con meses > 1 pero multa_bs == 0: ${zeroMultaWithMora}`);

  // 8. Sample de inmuebles con deuda y multas calculadas
  const { data: sampleDebt } = await sb.from('inmuebles')
    .select('inmueble, identidad, contribuyente, tipo, actividad_principal, cant_inmuebles, meses_deuda, deuda_mmv, multa_bs')
    .gt('meses_deuda', 1)
    .limit(5);
  console.log(`8. Muestra de cálculos:`, sampleDebt);
}

verify();
