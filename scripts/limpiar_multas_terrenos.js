const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

function isTerreno(str) {
  if (!str) return false;
  return str.toUpperCase().includes('TERRENO');
}

async function run() {
  console.log('--- REVISIÓN Y LIMPIEZA DE MULTAS A INMUEBLES CON ACTIVIDAD TERRENO ---');

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

  console.log(`Total inmuebles con actividad TERRENO encontrados: ${list.length}`);

  // Filtrar aquellos que tengan cualquier multa o deuda registrada
  const afectables = list.filter(i => 
    Number(i.multa_bs) > 0 || 
    Number(i.deuda_congelada_bs) > 0 || 
    Number(i.deuda_mmv) > 0 || 
    Number(i.meses_deuda) > 0
  );

  console.log(`Inmuebles que tienen multas o deuda pendiente: ${afectables.length}`);

  for (const item of afectables) {
    console.log(`\nProcesando inmueble: ${item.inmueble} (${item.contribuyente})`);
    console.log(`  Actividad: ${item.actividad_principal}`);
    console.log(`  Multa Bs anterior: ${item.multa_bs}`);
    console.log(`  Congelada Bs anterior: ${item.deuda_congelada_bs}`);
    console.log(`  Deuda MMV anterior: ${item.deuda_mmv}`);
    console.log(`  Meses Deuda anterior: ${item.meses_deuda}`);

    const existingNotas = item.notas || '';
    const tagExon = '[EXONERADO SEGUN ORDENANZA: ACTIVIDAD TERRENO NO PAGA ASEO NI MULTA]';
    const newNotas = existingNotas.includes(tagExon) ? existingNotas : (existingNotas ? `${existingNotas}\n---\n${tagExon}` : tagExon);

    const { error: updateErr } = await supabase
      .from('inmuebles')
      .update({
        multa_bs: 0,
        deuda_congelada_bs: 0,
        deuda_mmv: 0,
        meses_deuda: 0,
        notas: newNotas
      })
      .eq('id', item.id);

    if (updateErr) {
      console.error(`  Error actualizando ${item.inmueble}:`, updateErr);
    } else {
      console.log(`  ✓ Multas y deudas eliminadas con éxito para ${item.inmueble}.`);
    }
  }

  // Verificación posterior
  const { data: verif, error: verifErr } = await supabase
    .from('inmuebles')
    .select('inmueble, contribuyente, actividad_principal, multa_bs, deuda_congelada_bs, deuda_mmv, meses_deuda')
    .ilike('actividad_principal', '%TERRENO%')
    .or('multa_bs.gt.0,deuda_congelada_bs.gt.0,deuda_mmv.gt.0,meses_deuda.gt.0');

  console.log('\n--- VERIFICACIÓN POST-LIMPIEZA ---');
  if (verifErr) {
    console.error('Error en verificación:', verifErr);
  } else {
    console.log(`Total inmuebles de terreno con multa o deuda pendiente: ${verif.length}`);
    if (verif.length === 0) {
      console.log('✓ PERFECTO: 0 inmuebles de terreno tienen multas o deuda en la base de datos.');
    } else {
      console.table(verif);
    }
  }
}

run();
