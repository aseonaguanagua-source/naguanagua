/**
 * assign_letters_from_excel.js
 * Actualiza identidad en tabla 'contribuyentes' (primero) y luego 'inmuebles'
 * usando DATA NAGUANAGUA.xlsx como fuente de verdad
 */
const xlsx  = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXCEL = '/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx';

function detectarLetra(nombre, tipo) {
  const n = (nombre || '').toUpperCase();
  const t = (tipo   || '').toUpperCase();
  if (/\b(C\.A\.|S\.A\.|S\.R\.L\.|C\.P\.|A\.C\.|COMPANIA|EMPRESA|INVERSIONES|INDUSTRIAS|CORPORACION|ASOCIACION|COOPERATIVA)\b/.test(n)
    || / C\.?A\.?$/.test(n) || / S\.?A\.?$/.test(n)) return 'J';
  if (/\b(INTERNATIONAL|AMERICAN|GLOBAL|LATIN AMERICAN|CORP\.|LLC|LTD|LIMITED)\b/.test(n) && !t.includes('RESIDENCIAL')) return 'E';
  return 'V';
}

(async () => {
  // 1. Leer Excel → mapa codigo→doc con letra
  const wb  = xlsx.readFile(EXCEL);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const mapaExcel = {};
  for (const row of rows) {
    const cod = (row['Código']||row['Codigo']||'').toString().trim().toUpperCase();
    const doc = (row['Documento']||'').toString().trim().toUpperCase().replace(/\s+/g,'');
    if (cod && /^[VJGEP]/i.test(doc)) mapaExcel[cod] = doc;
  }
  console.log(`Excel: ${Object.keys(mapaExcel).length} registros`);

  // 2. Leer inmuebles
  const { data: inmuebles } = await sb.from('inmuebles')
    .select('id, inmueble, identidad, contribuyente, tipo');

  // 3. Construir mapa de cambios: identidad_vieja → identidad_nueva
  const cambios = new Map(); // oldId → newId

  for (const inm of inmuebles) {
    const idAct = (inm.identidad || '').trim();
    if (/^[VJGEP]/i.test(idAct)) continue; // ya tiene letra

    const cod = (inm.inmueble || '').toUpperCase();
    const docExcel = mapaExcel[cod];
    let newId;

    if (docExcel) {
      newId = docExcel; // Usar el del Excel exactamente (ej: "V-12607940")
    } else {
      const letra = detectarLetra(inm.contribuyente, inm.tipo);
      newId = `${letra}-${idAct.replace(/^[VJGEP]-?/i, '')}`;
    }

    if (!cambios.has(idAct)) {
      cambios.set(idAct, newId);
      console.log(`  [${cod.padEnd(12)}] ${idAct.padEnd(15)} → ${newId}`);
    }
  }

  console.log(`\nTotal identidades únicas a actualizar: ${cambios.size}`);

  // 4. Actualizar contribuyentes PRIMERO (FK parent)
  console.log('\n[1/2] Actualizando tabla contribuyentes...');
  let okC = 0, errC = 0;
  for (const [oldId, newId] of cambios) {
    const { error } = await sb.from('contribuyentes')
      .update({ identidad: newId })
      .eq('identidad', oldId);
    if (error) { console.error(`  ❌ contribuyentes ${oldId}: ${error.message}`); errC++; }
    else { okC++; }
  }
  console.log(`  Contribuyentes: ${okC} OK, ${errC} errores`);

  // 5. Actualizar inmuebles DESPUÉS (FK child)
  console.log('\n[2/2] Actualizando tabla inmuebles...');
  let okI = 0, errI = 0;
  for (const inm of inmuebles) {
    const idAct = (inm.identidad || '').trim();
    if (!cambios.has(idAct)) continue;
    const newId = cambios.get(idAct);
    const { error } = await sb.from('inmuebles').update({ identidad: newId }).eq('id', inm.id);
    if (error) { console.error(`  ❌ inmueble ${inm.inmueble}: ${error.message}`); errI++; }
    else okI++;
  }
  console.log(`  Inmuebles: ${okI} OK, ${errI} errores`);

  // 6. También actualizar pagos_reportados para consistencia histórica
  console.log('\n[3/3] Actualizando pagos_reportados...');
  let okP = 0;
  for (const [oldId, newId] of cambios) {
    const { data: pagos } = await sb.from('pagos_reportados').select('id').eq('identidad', oldId);
    if (pagos && pagos.length > 0) {
      const { error } = await sb.from('pagos_reportados').update({ identidad: newId }).eq('identidad', oldId);
      if (!error) { okP += pagos.length; }
    }
  }
  console.log(`  Pagos: ${okP} actualizados`);

  // 7. Verificar resultado final
  const { data: check } = await sb.from('inmuebles').select('identidad').limit(1000);
  const sinLetra = check.filter(i => !/^[VJGEP]/i.test((i.identidad||'').charAt(0)));
  console.log(`\n✅ FIN - Inmuebles aún sin letra: ${sinLetra.length}`);
  if (sinLetra.length > 0) {
    console.log('  Muestra:', sinLetra.slice(0,5).map(i=>i.identidad).join(', '));
  }
})();
