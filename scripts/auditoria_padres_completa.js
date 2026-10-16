const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function main() {
  console.log('1. Extrayendo propiedades del SQL original línea por línea...');
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const fileStream = fs.createReadStream(sqlPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const idToCode = new Map();
  const rawProperties = [];

  let isPropertiesBlock = false;

  for await (const line of rl) {
    if (line.includes('INSERT INTO public."properties"')) {
      isPropertiesBlock = true;
      continue;
    }
    if (isPropertiesBlock) {
      if (line.startsWith('INSERT INTO') || line.startsWith('--') || line.startsWith('COMMIT')) {
        isPropertiesBlock = false;
        continue;
      }

      // Procesar tuplas en la línea
      const tupleRegex = /\((.*?)\)/g;
      let match;
      while ((match = tupleRegex.exec(line)) !== null) {
        const cols = match[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
        const id = parseInt(cols[0], 10);
        const parentId = cols[22] && cols[22] !== 'NULL' && cols[22] !== '0' ? parseInt(cols[22], 10) : null;
        let urbCode = cols[10];
        if (urbCode) urbCode = urbCode.replace(/'/g, '').trim();

        if (id && urbCode) {
          idToCode.set(id, urbCode);
        }

        rawProperties.push({
          id,
          parentId,
          urbCode
        });
      }
    }
  }

  console.log(`Leídas ${rawProperties.length} propiedades del SQL original.`);

  // Mapear cada código a su código padre original en el SQL
  const originalParentMap = new Map(); // childUrbCode -> parentUrbCode
  rawProperties.forEach(p => {
    if (p.parentId && idToCode.has(p.parentId)) {
      const parentUrb = idToCode.get(p.parentId);
      if (p.urbCode) {
        originalParentMap.set(p.urbCode, parentUrb);
      }
    }
  });

  console.log(`Propiedades con parent_id en SQL: ${originalParentMap.size}`);

  // 2. Traer todas las propiedades de Supabase
  console.log('2. Obteniendo todas las propiedades de Supabase...');
  let allSupabase = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, direccion, estado, padre_id')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allSupabase = allSupabase.concat(data);
    page++;
  }
  console.log(`Total propiedades en Supabase: ${allSupabase.length}`);

  const supaByCode = new Map(allSupabase.map(i => [i.inmueble, i]));

  // 3. Comparar discrepancias
  // Caso A: El inmueble existe y en el SQL tenía padre, pero en Supabase tiene padre_id null o diferente
  const discrepanciesDirect = [];
  for (const [childCode, origParentCode] of originalParentMap.entries()) {
    const childSupa = supaByCode.get(childCode);
    const parentSupa = supaByCode.get(origParentCode);

    if (childSupa && childSupa.estado !== 'Eliminado') {
      if (parentSupa && parentSupa.estado !== 'Eliminado') {
        if (!childSupa.padre_id) {
          discrepanciesDirect.push({
            childCode,
            actividad: childSupa.actividad_principal,
            contribuyente: childSupa.contribuyente,
            rif: childSupa.identidad,
            origParentCode,
            parentAct: parentSupa.actividad_principal,
            currentPadreId: childSupa.padre_id
          });
        }
      }
    }
  }

  console.log(`\n=== CASO A: INMUEBLES ACTIVOS QUE TENÍAN PADRE EN EL SQL ORIGINAL PERO HOY TIENEN PADRE_ID = NULL (${discrepanciesDirect.length}) ===`);
  console.table(discrepanciesDirect);

  // Caso B: Inmuebles nuevos que tienen | OLD_CODE en la dirección y ese OLD_CODE tenía padre en el SQL original o en Supabase
  const discrepanciesMigrated = [];
  allSupabase.filter(i => i.estado !== 'Eliminado' && i.direccion && i.direccion.includes('|')).forEach(curr => {
    const parts = curr.direccion.split('|');
    const refCode = parts[parts.length - 1].trim();
    const refSupa = supaByCode.get(refCode);
    
    // Padre vía ref en Supabase o vía SQL original
    const parentFromRefSupa = refSupa?.padre_id;
    const parentFromSql = originalParentMap.get(refCode);
    const targetParent = parentFromRefSupa || parentFromSql;

    if (targetParent && curr.padre_id !== targetParent) {
      const parentSupa = supaByCode.get(targetParent);
      discrepanciesMigrated.push({
        childCode: curr.inmueble,
        actividad: curr.actividad_principal,
        contribuyente: curr.contribuyente,
        rif: curr.identidad,
        refCode,
        targetParent,
        parentAct: parentSupa?.actividad_principal,
        currentPadreId: curr.padre_id
      });
    }
  });

  console.log(`\n=== CASO B: INMUEBLES NUEVOS REEMPLAZANDO A VIEJOS CON REFERENCIA (| REF) CUYO PADRE SE PERDIÓ (${discrepanciesMigrated.length}) ===`);
  console.table(discrepanciesMigrated);
}

main();
