const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function run() {
  let list = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, contribuyente, actividad_principal, tipo, clasificacion, multa_bs, deuda_congelada_bs, deuda_mmv, meses_deuda, notas')
      .ilike('actividad_principal', '%TERRENO%')
      .range(from, from + step - 1);

    if (error) {
      console.error('Error al consultar inmuebles:', error);
      break;
    }
    list = list.concat(data);
    if (data.length < step) break;
    from += step;
  }

  console.log('Total inmuebles con actividad TERRENO:', list.length);

  const conMulta = list.filter(i => Number(i.multa_bs) > 0);
  const conCongelada = list.filter(i => Number(i.deuda_congelada_bs) > 0);
  const conDeudaMmv = list.filter(i => Number(i.deuda_mmv) > 0);
  const conMeses = list.filter(i => Number(i.meses_deuda) > 0);

  console.log('\n--- CON MULTA_BS > 0 --- (' + conMulta.length + ')');
  for (const i of conMulta) {
    console.log(i.inmueble, '|', i.contribuyente, '|', i.actividad_principal, '| MultaBs:', i.multa_bs, '| Meses:', i.meses_deuda);
  }

  console.log('\n--- CON DEUDA_CONGELADA_BS > 0 --- (' + conCongelada.length + ')');
  for (const i of conCongelada) {
    console.log(i.inmueble, '|', i.contribuyente, '|', i.actividad_principal, '| Congelada:', i.deuda_congelada_bs);
  }

  console.log('\n--- CON DEUDA_MMV > 0 --- (' + conDeudaMmv.length + ')');
  for (const i of conDeudaMmv) {
    console.log(i.inmueble, '|', i.contribuyente, '|', i.actividad_principal, '| DeudaMMV:', i.deuda_mmv, '| Meses:', i.meses_deuda);
  }

  console.log('\n--- CON MESES_DEUDA > 0 --- (' + conMeses.length + ')');
  for (const i of conMeses) {
    console.log(i.inmueble, '|', i.contribuyente, '|', i.actividad_principal, '| Meses:', i.meses_deuda);
  }

  // Revisar también si hay inmuebles cuya clasificación o tipo tenga TERRENO pero actividad diferente
  const { data: otros, error: errOtros } = await supabase
    .from('inmuebles')
    .select('id, inmueble, contribuyente, actividad_principal, tipo, clasificacion, multa_bs, deuda_congelada_bs, deuda_mmv, meses_deuda')
    .not('actividad_principal', 'ilike', '%TERRENO%')
    .or('tipo.ilike.%TERRENO%,clasificacion.ilike.%TERRENO%');

  if (!errOtros && otros && otros.length > 0) {
    console.log('\n--- INMUEBLES CON TERRENO EN TIPO/CLASIFICACION PERO NO EN ACTIVIDAD --- (' + otros.length + ')');
    for (const i of otros) {
      console.log(i.inmueble, '|', i.contribuyente, '|', i.tipo, '|', i.clasificacion, '| Act:', i.actividad_principal, '| MultaBs:', i.multa_bs);
    }
  }
}

run();
