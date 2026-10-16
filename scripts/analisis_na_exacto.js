const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function main() {
  console.log('1. Extrayendo propiedades del SQL original...');
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

      const tupleRegex = /\((.*?)\)/g;
      let match;
      while ((match = tupleRegex.exec(line)) !== null) {
        const cols = match[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
        const id = parseInt(cols[0], 10);
        const parentId = cols[22] && cols[22] !== 'NULL' && cols[22] !== '0' ? parseInt(cols[22], 10) : null;
        let urbCode = cols[10];
        if (urbCode) urbCode = urbCode.replace(/'/g, '').trim();

        if (id && urbCode) idToCode.set(id, urbCode);
        rawProperties.push({ id, parentId, urbCode });
      }
    }
  }

  const originalParentMap = new Map(); // childUrbCode -> parentUrbCode
  rawProperties.forEach(p => {
    if (p.parentId && idToCode.has(p.parentId)) {
      const parentUrb = idToCode.get(p.parentId);
      if (p.urbCode) originalParentMap.set(p.urbCode, parentUrb);
    }
  });

  console.log('2. Obteniendo propiedades de Supabase...');
  let allSupabase = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, direccion, estado, padre_id, es_condominio, condominio_padre_id')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allSupabase = allSupabase.concat(data);
    page++;
  }

  const supaByCode = new Map(allSupabase.map(i => [i.inmueble, i]));

  // Buscar casos idénticos:
  // 1. Inmuebles con | REF donde la ref pertenecía a un padre N/A (como URB033304 y URB033315)
  const pipeReplacements = [];
  allSupabase.filter(i => i.estado !== 'Eliminado' && i.direccion && i.direccion.includes('|')).forEach(curr => {
    const parts = curr.direccion.split('|');
    const refCode = parts[parts.length - 1].trim();
    const refSupa = supaByCode.get(refCode);
    const parentFromRefSupa = refSupa?.padre_id;
    const parentFromSql = originalParentMap.get(refCode);
    const targetParent = parentFromRefSupa || parentFromSql;

    if (targetParent) {
      const parentSupa = supaByCode.get(targetParent);
      pipeReplacements.push({
        childCode: curr.inmueble,
        actividad: curr.actividad_principal,
        contribuyente: curr.contribuyente,
        rif: curr.identidad,
        refCode,
        targetParent,
        parentAct: parentSupa?.actividad_principal,
        currentPadreId: curr.padre_id,
        isSameRif: curr.identidad === parentSupa?.identidad
      });
    }
  });

  console.log('\n======================================================');
  console.log('CASOS TIPO 1: ACTIVIDADES NUEVAS REEMPLAZANDO A VIEJAS (| REF)');
  console.log('======================================================');
  console.table(pipeReplacements);

  // 2. Inmuebles activos del MISMO RIF que en el SQL original tenían como padre un N/A, pero hoy tienen padre_id = null
  const sameRifCommercial = [];
  for (const [childCode, origParentCode] of originalParentMap.entries()) {
    const childSupa = supaByCode.get(childCode);
    const parentSupa = supaByCode.get(origParentCode);

    if (childSupa && childSupa.estado !== 'Eliminado' && !childSupa.padre_id) {
      if (parentSupa && parentSupa.estado !== 'Eliminado') {
        const pAct = (parentSupa.actividad_principal || '').toUpperCase().trim();
        if (pAct === 'N/A' && !parentSupa.es_condominio) {
          if (childSupa.identidad === parentSupa.identidad) {
            sameRifCommercial.push({
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
  }

  console.log('\n======================================================');
  console.log('CASOS TIPO 2: MISMO RIF QUE TENÍAN PADRE N/A EN EL SQL PERO PADRE_ID ES NULL');
  console.log('======================================================');
  console.table(sameRifCommercial);
}

main();
