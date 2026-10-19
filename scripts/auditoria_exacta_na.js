const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runAccurateAudit() {
  console.log('=== AUDITORIA EXACTA DE CONTENEDORES N/A Y ACTIVIDADES VINCULADAS ===\n');

  // 1. Traer TODOS los padres con actividad 'N/A' paginados
  let allNAParents = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id,inmueble,identidad,contribuyente,cant_inmuebles,mmv_mes,meses_deuda,actividad_principal,estado,condominio_padre_id,es_condominio,direccion')
      .ilike('actividad_principal', '%N/A%')
      .neq('estado', 'Eliminado')
      .range(from, from + PAGE_SIZE - 1);

    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allNAParents.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Excluir condominios residenciales
  const commParents = allNAParents.filter(p => 
    !p.es_condominio && 
    !p.condominio_padre_id &&
    !(p.contribuyente || '').toLowerCase().includes('condominio') &&
    !(p.contribuyente || '').toLowerCase().includes('conjunto resid')
  );

  console.log(`Total contenedores N/A comerciales encontrados: ${commParents.length}\n`);

  const parentCodes = commParents.map(p => p.inmueble).filter(Boolean);

  // 2. Traer todos los hijos vinculados a estos padres
  let allChildren = [];
  // Dividir en lotes de 100 códigos para el 'in'
  for (let i = 0; i < parentCodes.length; i += 100) {
    const batch = parentCodes.slice(i, i + 100);
    const { data: batchChildren, error: cErr } = await supabase
      .from('inmuebles')
      .select('id,inmueble,identidad,contribuyente,padre_id,actividad_principal,mmv_mes,meses_deuda,estado,deuda_mmv')
      .in('padre_id', batch)
      .neq('estado', 'Eliminado');

    if (cErr) { console.error('Error fetching batch:', cErr); }
    if (batchChildren) allChildren.push(...batchChildren);
  }

  console.log(`Total actividades hijas activas encontradas vinculadas por padre_id: ${allChildren.length}\n`);

  const results = {
    mismatchedRifs: [],
    emptyContainers: [],
    debtDiscrepancies: [],
    okContainers: []
  };

  for (const parent of commParents) {
    const children = allChildren.filter(c => c.padre_id === parent.inmueble);
    const pRif = (parent.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();

    // A. RIF mismatched
    const badRifs = children.filter(c => {
      const cRif = (c.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();
      return pRif && cRif && pRif !== cRif;
    });

    if (badRifs.length > 0) {
      results.mismatchedRifs.push({
        parent: parent.inmueble,
        parentRif: parent.identidad,
        parentContrib: parent.contribuyente,
        badChildren: badRifs.map(b => ({ inm: b.inmueble, rif: b.identidad, contrib: b.contribuyente, act: b.actividad_principal }))
      });
    }

    // B. Empty containers (cant_inmuebles > 0 pero 0 hijos)
    const cant = parseInt(parent.cant_inmuebles || 0, 10);
    if (cant > 0 && children.length === 0) {
      results.emptyContainers.push({
        parent: parent.inmueble,
        parentRif: parent.identidad,
        parentContrib: parent.contribuyente,
        cant_inmuebles: cant,
        mmv_mes: parent.mmv_mes,
        meses_deuda: parent.meses_deuda
      });
    }

    // C. Debt inheritance check
    const pMeses = parseInt(parent.meses_deuda || 0, 10);
    const childrenNoDebt = children.filter(c => parseInt(c.meses_deuda || 0, 10) === 0 && pMeses > 0);
    if (childrenNoDebt.length > 0) {
      results.debtDiscrepancies.push({
        parent: parent.inmueble,
        parentMeses: pMeses,
        countNoDebt: childrenNoDebt.length,
        totalChildren: children.length
      });
    }

    if (badRifs.length === 0 && (cant === 0 || children.length > 0)) {
      results.okContainers.push({
        parent: parent.inmueble,
        rif: parent.identidad,
        contribuyente: parent.contribuyente,
        childrenCount: children.length,
        totalMmv: parent.mmv_mes
      });
    }
  }

  console.log('------------------------------------------------------------');
  console.log(`1. RIFs Desalineados en Hijos: ${results.mismatchedRifs.length}`);
  results.mismatchedRifs.forEach(m => {
    console.log(`   Padre ${m.parent} (${m.parentRif} - ${m.parentContrib})`);
    console.log(`   Hijos con RIF diferente:`, m.badChildren);
  });

  console.log('------------------------------------------------------------');
  console.log(`2. Contenedores N/A con cant_inmuebles > 0 pero SIN hijos en Supabase: ${results.emptyContainers.length}`);
  results.emptyContainers.forEach(e => {
    console.log(`   Padre ${e.parent} | RIF: ${e.parentRif} | Contrib: ${e.parentContrib} | cant: ${e.cant_inmuebles} | mmv: ${e.mmv_mes}`);
  });

  console.log('------------------------------------------------------------');
  console.log(`3. Contenedores N/A funcionando correctamente: ${results.okContainers.length}`);
  results.okContainers.slice(0, 10).forEach(ok => {
    console.log(`   ✓ Padre ${ok.parent} | RIF: ${ok.rif} | ${ok.contribuyente} | ${ok.childrenCount} actividades`);
  });

  fs.writeFileSync('scripts/resultado_auditoria_exacta.json', JSON.stringify(results, null, 2));
}

runAccurateAudit();
