const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deepAudit() {
  console.log('=== AUDITORIA INTEGRAL DE INMUEBLES CONTENEDORES Y ACTIVIDADES COMERCIALES ===\n');

  // 1. Obtener todos los inmuebles activos
  const { data: allInms, error } = await supabase
    .from('inmuebles')
    .select('id,inmueble,identidad,contribuyente,cant_inmuebles,mmv_mes,meses_deuda,actividad_principal,estado,condominio_padre_id,padre_id,es_condominio,direccion')
    .neq('estado', 'Eliminado');

  if (error) {
    console.error('Error fetching inmuebles:', error);
    return;
  }

  console.log(`Total inmuebles no eliminados en base de datos: ${allInms.length}`);

  // Filtrar contenedores o padres comerciales
  const parentsNA = allInms.filter(i => {
    const act = (i.actividad_principal || '').trim().toUpperCase();
    const isCondo = i.es_condominio || 
      (i.contribuyente || '').toLowerCase().includes('condominio') ||
      (i.contribuyente || '').toLowerCase().includes('conjunto resid');
    return act === 'N/A' && !isCondo;
  });

  console.log(`Total contenedores N/A comerciales: ${parentsNA.length}\n`);

  const issues = [];

  for (const p of parentsNA) {
    // Buscar hijos vinculados por padre_id
    const children = allInms.filter(i => i.padre_id === p.inmueble);
    const activeChildren = children.filter(c => (c.estado || 'Activo').toLowerCase() === 'activo');
    
    // Discrepancia 1: RIFs en hijos no coinciden con el padre
    const pRif = (p.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();
    const mismatchedRif = activeChildren.filter(c => {
      const cRif = (c.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();
      return pRif && cRif && pRif !== cRif;
    });

    // Discrepancia 2: El padre tiene cant_inmuebles pero no tiene hijos en Supabase
    const cant = parseInt(p.cant_inmuebles || 0, 10);
    const noChildren = cant > 0 && activeChildren.length === 0;

    // Discrepancia 3: Diferencia de cantidad entre cant_inmuebles y activeChildren.length
    const diffQty = activeChildren.length > 0 && cant !== activeChildren.length;

    // Discrepancia 4: El padre tiene meses_deuda pero los hijos tienen meses_deuda = 0
    const pMeses = parseInt(p.meses_deuda || 0, 10);
    const childrenSinDeuda = activeChildren.filter(c => parseInt(c.meses_deuda || 0, 10) === 0 && pMeses > 0);

    if (mismatchedRif.length > 0 || noChildren || diffQty || childrenSinDeuda.length > 0) {
      issues.push({
        padre: p.inmueble,
        rifPadre: p.identidad,
        contribuyente: p.contribuyente,
        cant_inmuebles: cant,
        hijosActivosCount: activeChildren.length,
        mesesPadre: pMeses,
        mismatchedRifs: mismatchedRif.map(c => ({ inm: c.inmueble, rif: c.identidad, contrib: c.contribuyente, act: c.actividad_principal })),
        childrenSinDeudaCount: childrenSinDeuda.length,
        noChildren,
        diffQty
      });
    }
  }

  // 2. Buscar hijos sueltos con padre_id que apunta a un padre que no existe o está eliminado
  const orphans = allInms.filter(i => {
    if (!i.padre_id) return false;
    const parent = allInms.find(p => p.inmueble === i.padre_id);
    return !parent;
  });

  // 3. Buscar contribuyentes comerciales con múltiples actividades que NO tengan padre_id y compartan misma dirección
  const groupedByTaxpayer = new Map();
  allInms.forEach(i => {
    if (!i.identidad || i.es_condominio) return;
    const cleanId = (i.identidad || '').replace(/^[VEJPG]-?/i, '').replace(/-/g, '').toUpperCase();
    if (!groupedByTaxpayer.has(cleanId)) groupedByTaxpayer.set(cleanId, []);
    groupedByTaxpayer.get(cleanId).push(i);
  });

  const taxpayersWithUnlinkedMultiple = [];
  for (const [rif, inms] of groupedByTaxpayer.entries()) {
    const active = inms.filter(i => (i.estado || 'Activo').toLowerCase() === 'activo');
    if (active.length > 1) {
      // Si tiene más de un inmueble activo, revisar si alguno tiene actividad N/A pero no tiene padre_id asignado en los hijos
      const naInm = active.find(i => (i.actividad_principal || '').trim().toUpperCase() === 'N/A');
      if (naInm) {
        const unlinked = active.filter(i => i.inmueble !== naInm.inmueble && !i.padre_id);
        if (unlinked.length > 0) {
          taxpayersWithUnlinkedMultiple.push({
            rif,
            contribuyente: active[0].contribuyente,
            naInm: naInm.inmueble,
            unlinkedCodes: unlinked.map(u => ({ inm: u.inmueble, act: u.actividad_principal, dir: u.direccion }))
          });
        }
      }
    }
  }

  console.log(`=== 1. CASOS DE PADRES N/A CON DISCREPANCIAS (${issues.length}) ===`);
  issues.forEach((iss, idx) => {
    console.log(`\n[Caso ${idx + 1}] Padre: ${iss.padre} | RIF: ${iss.rifPadre} | ${iss.contribuyente}`);
    console.log(`   cant_inmuebles en registro: ${iss.cant_inmuebles} | Hijos activos vinculados: ${iss.hijosActivosCount} | Meses deuda padre: ${iss.mesesPadre}`);
    if (iss.mismatchedRifs.length > 0) {
      console.log(`   ❌ RIF desalineado en ${iss.mismatchedRifs.length} hijos:`, iss.mismatchedRifs);
    }
    if (iss.noChildren) {
      console.log(`   ❌ Tiene cant_inmuebles=${iss.cant_inmuebles} pero 0 hijos vinculados en Supabase.`);
    }
    if (iss.diffQty) {
      console.log(`   ⚠️ Diferencia de cantidad: cant_inmuebles=${iss.cant_inmuebles} vs hijos=${iss.hijosActivosCount}`);
    }
    if (iss.childrenSinDeudaCount > 0) {
      console.log(`   ℹ️ ${iss.childrenSinDeudaCount} hijos tienen meses_deuda=0 (heredan los ${iss.mesesPadre} meses del padre en tiempo real en Caja/Portal).`);
    }
  });

  console.log(`\n=== 2. HIJOS CON PADRE INEXISTENTE O HUÉRFANOS (${orphans.length}) ===`);
  orphans.forEach(o => {
    console.log(`   Hijo: ${o.inmueble} | RIF: ${o.identidad} | padre_id apuntando a: ${o.padre_id} (No existe en inmuebles activos)`);
  });

  console.log(`\n=== 3. CONTRIBUYENTES CON N/A PERO HIJOS SIN PADRE_ID ASIGNADO (${taxpayersWithUnlinkedMultiple.length}) ===`);
  taxpayersWithUnlinkedMultiple.forEach(t => {
    console.log(`   RIF: ${t.rif} | Contribuyente: ${t.contribuyente} | N/A: ${t.naInm}`);
    console.log(`   Hijos sin padre_id:`, t.unlinkedCodes);
  });

  fs.writeFileSync('scripts/reporte_auditoria_similares.json', JSON.stringify({ issues, orphans, taxpayersWithUnlinkedMultiple }, null, 2));
  console.log('\nReporte guardado en scripts/reporte_auditoria_similares.json');
}

deepAudit();
