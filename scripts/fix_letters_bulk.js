/**
 * fix_letters_bulk.js - Versión masiva y rápida
 * Asigna letra V/J/E a todos los inmuebles sin prefijo usando lotes paralelos
 */
const xlsx  = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function detectarLetra(nombre, tipo) {
  const n = (nombre || '').toUpperCase();
  const t = (tipo   || '').toUpperCase();
  if (/\b(C\.A\.|S\.A\.|S\.R\.L\.|C\.P\.|A\.C\.|COMPANIA|EMPRESA|INVERSIONES|INDUSTRIAS|CORPORACION|ASOCIACION|COOPERATIVA)\b/.test(n)
    || / C\.?A\.?$/.test(n) || / S\.?A\.?$/.test(n)) return 'J';
  if (/\b(INTERNATIONAL|AMERICAN|GLOBAL|LATIN AMERICAN|CORP\.|LLC|LTD|LIMITED)\b/.test(n) && !t.includes('RESIDENCIAL')) return 'E';
  return 'V';
}

async function fetchAll(table, select, filters = {}) {
  let all = [], page = 0;
  while (true) {
    let q = sb.from(table).select(select).range(page * 1000, (page+1)*1000 - 1);
    for (const [k,v] of Object.entries(filters)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

(async () => {
  // 1. Leer Excel
  const wb  = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx');
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const mapaExcel = {};
  for (const row of rows) {
    const cod = (row['Código']||row['Codigo']||'').toString().trim().toUpperCase();
    const doc = (row['Documento']||'').toString().trim().toUpperCase().replace(/\s+/g,'');
    if (cod && /^[VJGEP]/i.test(doc)) mapaExcel[cod] = doc;
  }
  console.log(`Excel: ${Object.keys(mapaExcel).length} registros`);

  // 2. Obtener TODOS los inmuebles de una vez
  console.log('Cargando todos los inmuebles...');
  const allInmuebles = await fetchAll('inmuebles', 'id,inmueble,identidad,contribuyente,tipo');
  console.log(`Total inmuebles: ${allInmuebles.length}`);

  // 3. Filtrar los que no tienen prefijo de letra válido
  const sinLetra = allInmuebles.filter(i => {
    const id = (i.identidad || '').trim();
    return id.length > 0 && !/^[VJGEP]-/i.test(id);
  });
  console.log(`Sin prefijo X-: ${sinLetra.length}`);

  // 4. Construir mapa de cambios: oldId → newId (deduplicado)
  const cambiosMap = new Map(); // oldId → newId
  for (const inm of sinLetra) {
    const idAct = (inm.identidad || '').trim();
    if (cambiosMap.has(idAct)) continue; // ya procesado

    const cod = (inm.inmueble || '').toUpperCase();
    const docExcel = mapaExcel[cod];

    let newId;
    if (docExcel) {
      newId = docExcel;
    } else if (/^[VJGEP]/i.test(idAct)) {
      // Tiene letra pero sin guión: V12345 → V-12345
      newId = idAct.charAt(0).toUpperCase() + '-' + idAct.slice(1).replace(/^-/,'');
    } else {
      // Solo número
      const letra = detectarLetra(inm.contribuyente, inm.tipo);
      newId = `${letra}-${idAct}`;
    }

    if (newId !== idAct) cambiosMap.set(idAct, newId);
  }

  console.log(`Cambios únicos: ${cambiosMap.size}`);

  // 5. Obtener todos los contribuyentes existentes (con letra)
  console.log('Cargando contribuyentes con letra...');
  // Usar query específica para los que tienen prefijo
  let contribsConLetra = new Set();
  let page = 0;
  while (true) {
    // Obtener en lotes los que tienen letra
    const { data } = await sb.from('contribuyentes').select('identidad')
      .or('identidad.like.V-%,identidad.like.J-%,identidad.like.E-%,identidad.like.G-%,identidad.like.P-%')
      .range(page*1000, (page+1)*1000-1);
    if (!data || data.length === 0) break;
    data.forEach(c => contribsConLetra.add(c.identidad));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Contribuyentes ya con letra: ${contribsConLetra.size}`);

  // 6. Para los newId que no existen en contribuyentes → prepararlos para insertar
  const aInsertar = [];
  for (const [oldId, newId] of cambiosMap) {
    if (!contribsConLetra.has(newId)) {
      aInsertar.push({ oldId, newId });
    }
  }
  console.log(`Contribuyentes a insertar: ${aInsertar.length}`);

  // 7. Obtener datos de los contribuyentes actuales para copiar info
  // Agrupar por oldId para hacer menos queries
  let insertOK = 0, insertErr = 0;
  const BATCH = 50;
  for (let i = 0; i < aInsertar.length; i += BATCH) {
    const lote = aInsertar.slice(i, i + BATCH);
    const oldIds = lote.map(l => l.oldId);

    const { data: contribsOld } = await sb.from('contribuyentes')
      .select('identidad,nombre,email,telefono,direccion,observaciones')
      .in('identidad', oldIds);

    const mapOld = {};
    (contribsOld || []).forEach(c => { mapOld[c.identidad] = c; });

    const rowsToInsert = lote.map(({ oldId, newId }) => {
      const old = mapOld[oldId] || {};
      return {
        identidad:     newId,
        nombre:        old.nombre || '',
        email:         old.email || null,
        telefono:      old.telefono || null,
        direccion:     old.direccion || null,
        observaciones: old.observaciones || null,
      };
    });

    const { error } = await sb.from('contribuyentes').upsert(rowsToInsert, { onConflict: 'identidad', ignoreDuplicates: true });
    if (error) { console.error(`  ❌ upsert contrib lote ${i}: ${error.message}`); insertErr++; }
    else insertOK += rowsToInsert.length;

    if ((i / BATCH) % 10 === 0) process.stdout.write(`  contrib: ${i+BATCH}/${aInsertar.length}\r`);
  }
  console.log(`\nContribs insertados/actualizados: ${insertOK} (${insertErr} errores)`);

  // 8. Actualizar inmuebles en lotes
  console.log('\nActualizando inmuebles...');
  let inmOK = 0, inmErr = 0;
  const idsPorOld = {}; // oldId → [inm.id, ...]
  for (const inm of sinLetra) {
    const idAct = (inm.identidad || '').trim();
    if (!cambiosMap.has(idAct)) continue;
    if (!idsPorOld[idAct]) idsPorOld[idAct] = [];
    idsPorOld[idAct].push(inm.id);
  }

  const entries = Object.entries(idsPorOld);
  for (let i = 0; i < entries.length; i += BATCH) {
    const lote = entries.slice(i, i + BATCH);
    await Promise.all(lote.map(async ([oldId, ids]) => {
      const newId = cambiosMap.get(oldId);
      // Actualizar en lote para este oldId
      const { error } = await sb.from('inmuebles').update({ identidad: newId }).in('id', ids);
      if (error) { inmErr += ids.length; }
      else inmOK += ids.length;
    }));
    if ((i / BATCH) % 5 === 0) process.stdout.write(`  inmuebles: ${Math.min(i+BATCH, entries.length)*20}/${sinLetra.length}\r`);
  }

  console.log(`\nInmuebles actualizados: ${inmOK} (${inmErr} errores)`);

  // 9. Verificación final
  const { count } = await sb.from('inmuebles').select('*', { count: 'exact', head: true })
    .not('identidad', 'like', 'V-%').not('identidad', 'like', 'J-%')
    .not('identidad', 'like', 'E-%').not('identidad', 'like', 'G-%').not('identidad', 'like', 'P-%');
  console.log(`\n✅ FIN - Inmuebles aún sin prefijo X-: ${count}`);
})();
