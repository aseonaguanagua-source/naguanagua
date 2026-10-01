/**
 * fix_vj_from_libro.js
 * Corrige identidades V→J usando el Libro de Ventas como fuente de verdad
 * También importa contribuyentes faltantes
 */
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, select) {
  let all = [], page = 0;
  while (true) {
    const { data } = await sb.from(table).select(select).range(page*1000, (page+1)*1000-1);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

(async () => {
  // 1. Leer Excel Libro de Ventas
  const wb = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/Libro de Ventas - Desde 01-09-2026 hasta 30-09-2026.xlsx');
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const data = rows.slice(4).filter(r => r[1] && r[1].toString().trim() && r[1] !== 'TOTALES:');

  // Mapa Excel: RIF → nombre
  const excelMap = {};
  data.forEach(r => {
    const rif = (r[1] || '').toString().trim().toUpperCase();
    if (!excelMap[rif]) excelMap[rif] = (r[2] || '').toString().trim();
  });
  console.log('Excel:', Object.keys(excelMap).length, 'contribuyentes únicos');

  // 2. Cargar inmuebles del sistema
  const inmuebles = await fetchAll('inmuebles', 'id, identidad, inmueble, contribuyente');
  const sysIds = new Set(inmuebles.map(i => (i.identidad||'').toUpperCase()));
  console.log('Sistema:', inmuebles.length, 'inmuebles');

  // 3. Encontrar V→J (Excel dice J, sistema dice V)
  const cambios = []; // { oldId: V-xxx, newId: J-xxx, nombre }
  Object.entries(excelMap).forEach(([rif, nombre]) => {
    if (!rif.startsWith('J-')) return;
    const naked = rif.replace(/^J-/, '');
    const vVersion = 'V-' + naked;
    if (sysIds.has(vVersion) && !sysIds.has(rif)) {
      cambios.push({ oldId: vVersion, newId: rif, nombre });
    }
  });
  console.log('\nCambios V→J a realizar:', cambios.length);

  // 4. Paso 1: Crear contribuyentes con J- que no existen
  const contribExistentes = await fetchAll('contribuyentes', 'identidad');
  const contribSet = new Set(contribExistentes.map(c => c.identidad?.toUpperCase()));

  let insertOK = 0, insertErr = 0;
  const BATCH = 50;
  
  // Insertar contribuyentes J- faltantes (copiando datos de V-)
  const aInsertar = cambios.filter(c => !contribSet.has(c.newId));
  console.log('Contribuyentes J- a crear:', aInsertar.length);
  
  for (let i = 0; i < aInsertar.length; i += BATCH) {
    const lote = aInsertar.slice(i, i + BATCH);
    const oldIds = lote.map(l => l.oldId);
    
    const { data: contribsOld } = await sb.from('contribuyentes')
      .select('identidad, nombre, email, telefono, direccion, observaciones')
      .in('identidad', oldIds);
    
    const mapOld = {};
    (contribsOld || []).forEach(c => { mapOld[c.identidad.toUpperCase()] = c; });
    
    const rowsToInsert = lote.map(({ oldId, newId, nombre }) => {
      const old = mapOld[oldId] || {};
      return {
        identidad: newId,
        nombre: old.nombre || nombre || '',
        email: old.email || null,
        telefono: old.telefono || null,
        direccion: old.direccion || null,
        observaciones: old.observaciones || null,
      };
    });
    
    const { error } = await sb.from('contribuyentes').upsert(rowsToInsert, { onConflict: 'identidad', ignoreDuplicates: true });
    if (error) { console.error('  ❌ upsert contrib:', error.message); insertErr++; }
    else insertOK += rowsToInsert.length;
  }
  console.log('Contribuyentes insertados:', insertOK, '(' + insertErr + ' errores)');

  // 5. Paso 2: Actualizar inmuebles V→J
  let inmOK = 0, inmErr = 0;
  for (let i = 0; i < cambios.length; i += BATCH) {
    const lote = cambios.slice(i, i + BATCH);
    await Promise.all(lote.map(async ({ oldId, newId }) => {
      const ids = inmuebles.filter(inm => (inm.identidad||'').toUpperCase() === oldId).map(inm => inm.id);
      if (ids.length === 0) return;
      const { error } = await sb.from('inmuebles').update({ identidad: newId }).in('id', ids);
      if (error) inmErr += ids.length;
      else inmOK += ids.length;
    }));
    process.stdout.write('  inmuebles: ' + Math.min(i + BATCH, cambios.length) + '/' + cambios.length + '\r');
  }
  console.log('\nInmuebles actualizados V→J:', inmOK, '(' + inmErr + ' errores)');

  // 6. Paso 3: Importar los 68 faltantes como contribuyentes nuevos
  const faltantes = [];
  Object.entries(excelMap).forEach(([rif, nombre]) => {
    const naked = rif.replace(/^[VJGEP]-/, '');
    const exists = [...sysIds].some(s => s === rif || s.replace(/^[VJGEP]-/, '') === naked);
    if (!exists && !contribSet.has(rif)) {
      faltantes.push({ identidad: rif, nombre: nombre || '' });
    }
  });
  
  if (faltantes.length > 0) {
    console.log('\nImportando', faltantes.length, 'contribuyentes faltantes...');
    const { error } = await sb.from('contribuyentes').upsert(
      faltantes.map(f => ({ identidad: f.identidad, nombre: f.nombre })),
      { onConflict: 'identidad', ignoreDuplicates: true }
    );
    console.log('Faltantes importados:', error ? 'ERROR: ' + error.message : faltantes.length + ' OK');
  }

  // 7. Verificación
  const { count } = await sb.from('inmuebles').select('*', { count: 'exact', head: true })
    .not('identidad', 'like', 'V-%').not('identidad', 'like', 'J-%')
    .not('identidad', 'like', 'E-%').not('identidad', 'like', 'G-%').not('identidad', 'like', 'P-%');
  console.log('\n✅ FIN - Inmuebles sin prefijo:', count);
})();
