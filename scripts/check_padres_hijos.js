require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Get all taxpayers that have a Condominio (cant_inmuebles > 1)
  const { data: condominios, error } = await supabase.from('inmuebles').select('id, identidad, inmueble, actividad_principal, cant_inmuebles, estado')
    .gt('cant_inmuebles', 1).eq('estado', 'Activo');
    
  if (error) { console.error(error); return; }
  
  const byRif = {};
  for (const c of condominios) {
    if (!byRif[c.identidad]) byRif[c.identidad] = [];
    byRif[c.identidad].push(c);
  }
  
  const rifs = Object.keys(byRif);
  
  // Now get ALL active properties for these RIFs
  let allProps = [];
  for(let i=0; i<rifs.length; i+=100) {
    const batch = rifs.slice(i, i+100);
    const { data } = await supabase.from('inmuebles').select('identidad, inmueble, tipo, actividad_principal, cant_inmuebles, estado').in('identidad', batch).eq('estado', 'Activo');
    if (data) allProps = allProps.concat(data);
  }
  
  let anomalies = 0;
  let missingChildren = 0;
  let correctCondos = 0;
  
  const report = [];
  
  for (const rif of rifs) {
    const props = allProps.filter(p => p.identidad === rif);
    // Padre is usually cant_inmuebles > 1
    const padres = props.filter(p => p.cant_inmuebles > 1);
    const hijos = props.filter(p => p.cant_inmuebles <= 1);
    
    // We expect the sum of children to be roughly equal to cant_inmuebles, minus 1 if Padre is N/A or something.
    let expectedChildren = padres.reduce((acc, p) => acc + p.cant_inmuebles, 0);
    
    if (hijos.length === 0) {
      missingChildren++;
      report.push(`RIF ${rif}: Tiene Padre(s) [${padres.map(p => p.inmueble).join(', ')}] que declaran ${expectedChildren} inmuebles, pero NO TIENE NINGÚN HIJO ACTIVO en la BD.`);
    } else if (hijos.length < expectedChildren - padres.length) {
      anomalies++;
      // It's common to have fewer children if some are inactive, but let's log it
      // report.push(`RIF ${rif}: Faltan hijos. Declara ${expectedChildren}, pero solo tiene ${hijos.length} hijos activos.`);
    } else {
      correctCondos++;
    }
  }
  
  console.log(`\n=== REPORTE DE AUDITORÍA DE CONDOMINIOS ===`);
  console.log(`Total de Condominios (Padres) activos analizados: ${condominios.length} (de ${rifs.length} RIFs)`);
  console.log(`Condominios con hijos correctos o parcialmente completos: ${correctCondos + anomalies}`);
  console.log(`Condominios SIN NINGÚN HIJO ACTIVO (Alerta grave): ${missingChildren}`);
  console.log(`\nEjemplos de los que no tienen hijos:\n` + report.slice(0, 10).join('\n'));
}

run();
