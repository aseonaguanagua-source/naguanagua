const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAll(table, select) {
  let all = [], page = 0;
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
    if (error) {
      console.error('Error fetching', table, error);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

(async () => {
  console.log('--- EXHAUSTIVE PREFIX AUDIT ---');
  console.log('Fetching all contribuyentes and inmuebles...');
  const contribs = await fetchAll('contribuyentes', 'identidad, nombre, email, telefono');
  const inmuebles = await fetchAll('inmuebles', 'id, inmueble, identidad, contribuyente');
  console.log(`Total contribuyentes: ${contribs.length}`);
  console.log(`Total inmuebles: ${inmuebles.length}`);

  // 1. Contribuyentes J map
  const jContribMap = new Map();
  const allContribMap = new Map();
  contribs.forEach(c => {
    if (!c.identidad) return;
    const cleanNum = c.identidad.replace(/^[A-Za-z]+-?0*/, '');
    allContribMap.set(c.identidad.toUpperCase(), c);
    if (c.identidad.startsWith('J-')) {
      jContribMap.set(cleanNum, c);
    }
  });

  // 2. Inmuebles with V- whose contribuyente is J-
  const inmueblesVtoJ = [];
  inmuebles.forEach(i => {
    if (i.identidad && i.identidad.startsWith('V-')) {
      const num = i.identidad.replace(/^V-0*/, '');
      if (jContribMap.has(num)) {
        inmueblesVtoJ.push({
          id: i.id,
          inmueble: i.inmueble,
          old_id: i.identidad,
          new_id: jContribMap.get(num).identidad,
          inm_name: i.contribuyente,
          contrib_name: jContribMap.get(num).nombre
        });
      }
    }
  });

  console.log(`\n1. Inmuebles with V- whose official contribuyente is J-: ${inmueblesVtoJ.length}`);
  console.log('Sample (first 5):', inmueblesVtoJ.slice(0, 5));

  // 3. Malformed syntax in contribuyentes and inmuebles
  const malformedContribs = [];
  contribs.forEach(c => {
    const id = c.identidad || '';
    if (!/^[VJGEP]-\d+$/.test(id)) {
      malformedContribs.push(c);
    }
  });

  const malformedInmuebles = [];
  inmuebles.forEach(i => {
    const id = i.identidad || '';
    if (!/^[VJGEP]-\d+$/.test(id)) {
      malformedInmuebles.push(i);
    }
  });

  console.log(`\n2. Syntax-malformed contribuyentes: ${malformedContribs.length}`);
  malformedContribs.forEach(c => console.log(`   [${c.identidad}] -> "${c.nombre}"`));

  console.log(`\n3. Syntax-malformed inmuebles: ${malformedInmuebles.length}`);
  malformedInmuebles.forEach(i => console.log(`   [${i.inmueble}]: [${i.identidad}] -> "${i.contribuyente}"`));

  // 4. Pure corporate names in contribuyentes that still have V-
  const pureCorpRegex = /(,?\s+(C\.A\.?|S\.A\.?|S\.R\.L\.?|C\.R\.L\.?)\b|^(CONDOMINIO|CENTRO COMERCIAL|ASOCIACION CIVIL|FUNDACION|INVERSIONES)\b)/i;
  const fpRegex = /\b(F\.?P\.?|FIRMA PERSONAL)\b/i;

  const vContribsPureCorp = contribs.filter(c => {
    if (!c.identidad || !c.identidad.startsWith('V-')) return false;
    const name = c.nombre || '';
    if (fpRegex.test(name)) return false;
    return pureCorpRegex.test(name);
  });

  console.log(`\n4. Contribuyentes with V- that are pure C.A. / S.A. / CONDOMINIO: ${vContribsPureCorp.length}`);
  console.log('Sample (first 10):', vContribsPureCorp.slice(0, 10).map(c => ({ id: c.identidad, name: c.nombre })));

  // Check how many of these vContribsPureCorp already have J- equivalent in contribuyentes vs need to be created/switched
  let vContribsHaveJ = 0;
  let vContribsNeedJ = 0;
  vContribsPureCorp.forEach(c => {
    const num = c.identidad.replace(/^V-0*/, '');
    if (jContribMap.has(num)) vContribsHaveJ++;
    else vContribsNeedJ++;
  });
  console.log(`   - Have existing J- record: ${vContribsHaveJ}`);
  console.log(`   - Do NOT have J- record: ${vContribsNeedJ}`);

  // 5. Inmuebles with pure corporate name that still have V- and no J- contribuyente
  const vInmueblesPureCorpNoJ = inmuebles.filter(i => {
    if (!i.identidad || !i.identidad.startsWith('V-')) return false;
    const name = i.contribuyente || '';
    if (fpRegex.test(name)) return false;
    if (!pureCorpRegex.test(name)) return false;
    const num = i.identidad.replace(/^V-0*/, '');
    return !jContribMap.has(num);
  });
  console.log(`\n5. Inmuebles with V- and corporate name but no J- contribuyente exists: ${vInmueblesPureCorpNoJ.length}`);
  console.log('Sample (first 10):', vInmueblesPureCorpNoJ.slice(0, 10).map(i => ({ inmueble: i.inmueble, id: i.identidad, name: i.contribuyente })));

  // Write a summary JSON report
  const report = {
    total_contribuyentes: contribs.length,
    total_inmuebles: inmuebles.length,
    inmuebles_v_to_j_count: inmueblesVtoJ.length,
    malformed_contribs_count: malformedContribs.length,
    malformed_contribs: malformedContribs,
    malformed_inmuebles_count: malformedInmuebles.length,
    malformed_inmuebles: malformedInmuebles,
    v_contribs_pure_corp_count: vContribsPureCorp.length,
    v_contribs_pure_corp_samples: vContribsPureCorp.slice(0, 20),
    v_inmuebles_pure_corp_no_j_count: vInmueblesPureCorpNoJ.length,
    v_inmuebles_pure_corp_no_j_samples: vInmueblesPureCorpNoJ.slice(0, 20)
  };

  fs.writeFileSync(path.join(__dirname, 'prefix_audit_report.json'), JSON.stringify(report, null, 2));
  console.log('\nReport written to scripts/prefix_audit_report.json');
})();
