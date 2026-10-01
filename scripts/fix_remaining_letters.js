/**
 * fix_remaining_letters.js
 * Para los inmuebles que aún no tienen letra (FK falló porque la identidad
 * con prefijo no existe en contribuyentes):
 * 1. Busca el contribuyente original (sin prefijo)
 * 2. Inserta un nuevo contribuyente con la identidad con prefijo
 * 3. Actualiza inmuebles para apuntar al nuevo contribuyente
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

(async () => {
  // Leer Excel
  const wb  = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx');
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const mapaExcel = {};
  for (const row of rows) {
    const cod = (row['Código']||row['Codigo']||'').toString().trim().toUpperCase();
    const doc = (row['Documento']||'').toString().trim().toUpperCase().replace(/\s+/g,'');
    if (cod && /^[VJGEP]/i.test(doc)) mapaExcel[cod] = doc;
  }

  // Obtener todos los inmuebles sin letra (en múltiples páginas)
  let sinLetra = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, tipo')
      .not('identidad', 'like', 'V-%')
      .not('identidad', 'like', 'J-%')
      .not('identidad', 'like', 'E-%')
      .not('identidad', 'like', 'G-%')
      .not('identidad', 'like', 'P-%')
      .range(page * 500, (page + 1) * 500 - 1);
    if (!data || data.length === 0) break;
    sinLetra = sinLetra.concat(data);
    if (data.length < 500) break;
    page++;
  }
  console.log(`Inmuebles sin letra: ${sinLetra.length}`);

  let insertadosOK = 0, insertErr = 0, inmOK = 0, inmErr = 0;

  for (const inm of sinLetra) {
    const idAct = (inm.identidad || '').trim();
    const cod   = (inm.inmueble  || '').toUpperCase();

    // Determinar nueva identidad
    const docExcel = mapaExcel[cod];
    let newId;
    if (docExcel) {
      newId = docExcel;
    } else {
      const letra = detectarLetra(inm.contribuyente, inm.tipo);
      newId = `${letra}-${idAct.replace(/^[VJGEP]-?/i,'')}`;
    }

    // Verificar si newId ya existe en contribuyentes
    const { data: existe } = await sb.from('contribuyentes')
      .select('id').eq('identidad', newId).limit(1);

    if (!existe || existe.length === 0) {
      // Obtener datos del contribuyente actual
      const { data: contribActual } = await sb.from('contribuyentes')
        .select('nombre, email, telefono, direccion, observaciones')
        .eq('identidad', idAct).limit(1);

      const ca = contribActual?.[0] || {};

      // Insertar nuevo contribuyente con la identidad con letra
      const { error: iErr } = await sb.from('contribuyentes').insert({
        identidad:     newId,
        nombre:        ca.nombre || inm.contribuyente || '',
        email:         ca.email || null,
        telefono:      ca.telefono || null,
        direccion:     ca.direccion || null,
        observaciones: ca.observaciones || null,
      });

      if (iErr) {
        if (iErr.message.includes('duplicate')) {
          // Ya existe (carrera) — continuar
        } else {
          console.error(`  ❌ INSERT contrib ${newId}: ${iErr.message}`);
          insertErr++;
          continue;
        }
      } else {
        insertadosOK++;
      }
    }

    // Actualizar inmueble
    const { error: uErr } = await sb.from('inmuebles').update({ identidad: newId }).eq('id', inm.id);
    if (uErr) { console.error(`  ❌ inmueble ${cod}: ${uErr.message}`); inmErr++; }
    else inmOK++;
  }

  console.log(`\n✅ Contribuyentes insertados: ${insertadosOK} (${insertErr} err)`);
  console.log(`   Inmuebles actualizados:    ${inmOK} (${inmErr} err)`);

  // Verificación final
  const { count } = await sb.from('inmuebles')
    .select('*', { count: 'exact', head: true })
    .not('identidad', 'like', 'V-%')
    .not('identidad', 'like', 'J-%')
    .not('identidad', 'like', 'E-%')
    .not('identidad', 'like', 'G-%')
    .not('identidad', 'like', 'P-%');
  console.log(`\n🔍 Inmuebles aún sin letra: ${count}`);
})();
