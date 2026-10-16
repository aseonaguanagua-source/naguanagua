const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function main() {
  let all = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, direccion, estado, padre_id, es_condominio, tipo, notas, cant_inmuebles')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    page++;
  }

  // Agrupar por identidad
  const byRif = new Map();
  all.forEach(i => {
    if (!byRif.has(i.identidad)) byRif.set(i.identidad, []);
    byRif.get(i.identidad).push(i);
  });

  const suspiciousCases = [];

  for (const [rif, inms] of byRif.entries()) {
    const activeInms = inms.filter(i => i.estado !== 'Eliminado');
    const naActive = activeInms.filter(i => (i.actividad_principal || '').trim().toUpperCase() === 'N/A' && !i.es_condominio);
    
    if (naActive.length === 0) continue;

    // Inmuebles no N/A activos
    const commActive = activeInms.filter(i => {
      const act = (i.actividad_principal || '').toUpperCase();
      if (act === 'N/A' || i.es_condominio) return false;
      return true;
    });

    naActive.forEach(na => {
      const currentChildren = activeInms.filter(c => c.padre_id === na.inmueble);
      const unlinkedComm = commActive.filter(c => !c.padre_id);
      const deletedChildren = inms.filter(c => c.estado === 'Eliminado' && c.padre_id === na.inmueble);

      if (unlinkedComm.length > 0) {
        suspiciousCases.push({
          rif,
          contribuyente: na.contribuyente,
          naPadre: na.inmueble,
          cant_inmuebles: na.cant_inmuebles,
          currentChildren: currentChildren.map(c => c.inmueble),
          deletedChildren: deletedChildren.map(c => c.inmueble + ' (' + c.actividad_principal + ')'),
          unlinkedComm: unlinkedComm.map(c => ({
            inmueble: c.inmueble,
            act: c.actividad_principal,
            dir: c.direccion
          }))
        });
      }
    });
  }

  console.log('Total de casos sospechosos:', suspiciousCases.length);
  suspiciousCases.forEach(s => {
    console.log('\n========================================');
    console.log(`RIF: ${s.rif} | ${s.contribuyente}`);
    console.log(`Padre N/A: ${s.naPadre} (Hijos actuales: ${s.currentChildren.length}, Hijos eliminados antes: ${s.deletedChildren.length})`);
    if (s.deletedChildren.length > 0) {
      console.log(`  -> Hijos eliminados anteriores:`, s.deletedChildren.join(', '));
    }
    console.log(`  -> Inmuebles sin padre_id (${s.unlinkedComm.length}):`);
    s.unlinkedComm.forEach(u => {
      console.log(`     * ${u.inmueble} | ${u.act} | Dir: ${u.dir}`);
    });
  });
}

main();
