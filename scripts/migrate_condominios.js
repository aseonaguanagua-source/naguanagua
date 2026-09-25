/**
 * FASE M2 v2: Migrar condominios — con timeout y progreso
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = '', SUPABASE_KEY = '';
try {
  const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
  SUPABASE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || '';
} catch(e) {}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseTuples(block) {
  const tuples = [];
  let depth = 0, current = '', inStr = false;
  const start = block.indexOf('VALUES');
  if (start < 0) return tuples;
  for (let i = start + 6; i < block.length; i++) {
    const ch = block[i];
    if (ch === "'" && block[i-1] !== '\\') {
      if (inStr && block[i+1] === "'") { current += "''"; i++; continue; }
      inStr = !inStr;
    }
    if (!inStr) {
      if (ch === '(') { if (depth === 0) current = ''; depth++; if (depth > 1) current += ch; continue; }
      if (ch === ')') { depth--; if (depth === 0) tuples.push(current); else current += ch; continue; }
      if (ch === ';' && depth === 0) break;
    }
    if (depth > 0) current += ch;
  }
  return tuples;
}

function splitFields(t) {
  const f = []; let field = '', inS = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "'" && !inS) { inS = true; continue; }
    if (ch === "'" && inS) { if (t[i+1] === "'") { field += "'"; i++; continue; } inS = false; continue; }
    if (!inS && ch === ',') { f.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  f.push(field.trim());
  return f.map(v => v === 'NULL' ? null : v);
}

(async () => {
  console.log('🏢 FASE M2 v2: Condominios\n');
  
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Parse users
  console.log('1. Parseando users...');
  const userBlocks = sql.match(/INSERT INTO public\."users"[^;]+;/g) || [];
  const userById = {};
  for (const block of userBlocks) {
    for (const t of parseTuples(block)) {
      const f = splitFields(t);
      if (f.length < 10) continue;
      // f[0]=id, f[9]=document, f[16]=username (inmueble code)
      if (f[0] && f[9] && f[9] !== '0') {
        userById[f[0]] = { doc: f[9], code: f[16] || '' };
      }
    }
  }
  console.log(`   ${Object.keys(userById).length} users`);
  
  // Parse properties
  console.log('2. Parseando properties...');
  const propBlocks = sql.match(/INSERT INTO public\."properties"[^;]+;/g) || [];
  const props = [];
  const propsById = {};
  
  for (const block of propBlocks) {
    for (const t of parseTuples(block)) {
      const f = splitFields(t);
      if (f.length < 23) continue;
      const p = {
        id: f[0],
        user_id: f[1],
        use_id: f[2],     // 2=Condominio
        type_id: f[3],
        parent_id: f[22], // property_id = parent
        code: f[10],      // urbaser_code
      };
      props.push(p);
      propsById[p.id] = p;
    }
  }
  console.log(`   ${props.length} properties`);
  
  // Build condominio relationships
  const hijos = props.filter(p => p.parent_id);
  const parentIds = [...new Set(hijos.map(h => h.parent_id))];
  console.log(`   Hijos: ${hijos.length}, Padres únicos: ${parentIds.length}`);
  
  // For each parent, find its urbaser_code / user document
  // For each hijo, find its urbaser_code / user document and its parent's code
  const parentCodeMap = {}; // parentPropId → parent code for Supabase
  for (const pid of parentIds) {
    const parent = propsById[pid];
    if (!parent) continue;
    const user = userById[parent.user_id];
    parentCodeMap[pid] = {
      code: parent.code || user?.code || '',
      doc: user?.doc || '',
    };
  }
  
  // Load Supabase inmuebles
  console.log('\n3. Cargando inmuebles...');
  const allInm = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('inmuebles').select('id, identidad, inmueble').range(from, from + 999);
    if (!data || data.length === 0) break;
    allInm.push(...data);
    from += 1000;
  }
  console.log(`   ${allInm.length} inmuebles`);
  
  const byDoc = {};
  allInm.forEach(i => {
    if (i.identidad) {
      const k = i.identidad.replace(/-/g, '').toUpperCase();
      if (!byDoc[k]) byDoc[k] = [];
      byDoc[k].push(i);
    }
  });
  
  const byCode = {};
  allInm.forEach(i => {
    if (i.inmueble) byCode[i.inmueble.toUpperCase()] = i;
  });
  
  // ── Update parents ──
  console.log('\n4. Marcando padres como condominio...');
  let updP = 0, noP = 0;
  
  for (let i = 0; i < parentIds.length; i++) {
    const pid = parentIds[i];
    const parent = parentCodeMap[pid];
    if (!parent) { noP++; continue; }
    
    // Find in Supabase by code first, then by doc
    let target = parent.code ? byCode[parent.code.toUpperCase()] : null;
    if (!target && parent.doc) {
      const matches = byDoc[parent.doc.replace(/-/g, '').toUpperCase()];
      if (matches?.length) target = matches[0];
    }
    if (!target) { noP++; continue; }
    
    const childCount = hijos.filter(h => h.parent_id === pid).length;
    const { error } = await supabase.from('inmuebles').update({
      es_condominio: true,
      cant_inmuebles: childCount,
    }).eq('id', target.id);
    
    if (!error) updP++;
    if (i % 50 === 0) process.stdout.write(`   Padres: ${i}/${parentIds.length}\r`);
  }
  console.log(`\n   Padres actualizados: ${updP}, sin match: ${noP}`);
  
  // ── Update children ──
  console.log('\n5. Vinculando hijos...');
  let updH = 0, noH = 0;
  
  for (let i = 0; i < hijos.length; i += 10) {
    const batch = hijos.slice(i, i + 10);
    const promises = batch.map(async (hijo) => {
      const user = userById[hijo.user_id];
      if (!user) { noH++; return; }
      
      // Find hijo in Supabase
      let target = hijo.code ? byCode[hijo.code.toUpperCase()] : null;
      if (!target) {
        const matches = byDoc[user.doc.replace(/-/g, '').toUpperCase()];
        if (matches?.length) target = matches[0];
      }
      if (!target) { noH++; return; }
      
      // Get parent code
      const parentInfo = parentCodeMap[hijo.parent_id];
      if (!parentInfo) { noH++; return; }
      
      const parentCode = parentInfo.code || parentInfo.doc;
      if (!parentCode) { noH++; return; }
      
      const { error } = await supabase.from('inmuebles').update({
        condominio_padre_id: parentCode,
      }).eq('id', target.id);
      
      if (!error) updH++;
    });
    await Promise.all(promises);
    if (i % 1000 === 0) process.stdout.write(`   Hijos: ${i}/${hijos.length}\r`);
  }
  
  console.log(`\n   Hijos vinculados: ${updH}, sin match: ${noH}`);
  
  // Stats
  const { count: cC } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).eq('es_condominio',true);
  const { count: cH } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).not('condominio_padre_id','is',null);
  console.log(`\n✅ M2 COMPLETADA: ${cC} condominios, ${cH} hijos vinculados`);
})();
