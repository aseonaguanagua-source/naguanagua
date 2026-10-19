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
      .select('id, inmueble, identidad, contribuyente, actividad_principal, direccion, estado, padre_id, condominio_padre_id, es_condominio, tipo, notas')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    page++;
  }

  const byRif = new Map();
  const byCode = new Map();
  all.forEach(i => {
    byCode.set(i.inmueble, i);
    const rif = (i.identidad || '').trim().toUpperCase();
    if (!byRif.has(rif)) byRif.set(rif, []);
    byRif.get(rif).push(i);
  });

  console.log('Total inmuebles en DB:', all.length);

  // 1. Caso URB033304 (Amal Tiendas)
  const amal = all.filter(i => (i.identidad || '').includes('500430272'));
  console.log('\n--- AMAL TIENDAS (J-500430272 / URB033304) ---');
  amal.forEach(i => {
    console.log(`[${i.estado}] ${i.inmueble} - Act: ${i.actividad_principal} - Padre: ${i.padre_id} - Dir: ${i.direccion}`);
  });

  // 2. Buscar casos donde una propiedad activa tiene en su direccion '| OLD_CODE' y ese OLD_CODE tenia padre_id
  const dirRelinkCases = [];
  const activeInms = all.filter(i => i.estado !== 'Eliminado');

  activeInms.forEach(i => {
    if (!i.padre_id && i.direccion && i.direccion.includes('|')) {
      const parts = i.direccion.split('|');
      const oldCode = parts[parts.length - 1].trim();
      const oldInm = byCode.get(oldCode);
      if (oldInm && oldInm.padre_id && oldInm.padre_id !== i.inmueble) {
        dirRelinkCases.push({
          childId: i.id,
          childCode: i.inmueble,
          childAct: i.actividad_principal,
          childRif: i.identidad,
          childContribuyente: i.contribuyente,
          oldCode,
          oldEstado: oldInm.estado,
          targetPadreId: oldInm.padre_id,
          padreAct: byCode.get(oldInm.padre_id)?.actividad_principal,
          padreEstado: byCode.get(oldInm.padre_id)?.estado
        });
      }
    }
  });

  console.log(`\n--- CASOS IDENTIFICADOS POR REFERENCIA DIRECTA (| OLD_CODE): ${dirRelinkCases.length} ---`);
  dirRelinkCases.forEach(c => {
    console.log(`Inmueble ${c.childCode} (${c.childAct}) -> Antes ${c.oldCode} (Padre: ${c.targetPadreId} [${c.padreAct}], Estado padre: ${c.padreEstado}) Contribuyente: ${c.childContribuyente}`);
  });

  // 3. Buscar casos de N/A activos donde el mismo RIF tiene N/A activo y otras propiedades activas huérfanas
  const naOrphanCases = [];
  for (const [rif, inms] of byRif.entries()) {
    const actives = inms.filter(i => i.estado !== 'Eliminado');
    const naParents = actives.filter(i => (i.actividad_principal || '').trim().toUpperCase() === 'N/A' && !i.es_condominio);
    
    for (const na of naParents) {
      const children = actives.filter(i => i.padre_id === na.inmueble);
      const unlinked = actives.filter(i => i.inmueble !== na.inmueble && !i.padre_id && !i.condominio_padre_id && !i.es_condominio && (i.actividad_principal || '').trim().toUpperCase() !== 'N/A');
      
      if (children.length === 0 && unlinked.length > 0) {
        // Un N/A activo que no tiene ningún hijo activo, pero el contribuyente tiene actividades comerciales activas huérfanas
        naOrphanCases.push({
          rif,
          contribuyente: na.contribuyente,
          naCode: na.inmueble,
          unlinkedCount: unlinked.length,
          unlinked: unlinked.map(u => ({ id: u.id, inmueble: u.inmueble, act: u.actividad_principal, dir: u.direccion }))
        });
      }
    }
  }

  console.log(`\n--- CASOS DE N/A ACTIVOS SIN HIJOS PERO CON ACTIVIDADES HUÉRFANAS DEL MISMO RIF: ${naOrphanCases.length} ---`);
  naOrphanCases.forEach(c => {
    console.log(`RIF: ${c.rif} | ${c.contribuyente} | Padre N/A: ${c.naCode} | ${c.unlinkedCount} actividades sueltas:`, c.unlinked.map(u => `${u.inmueble} (${u.act})`).join(', '));
  });
}

main();
