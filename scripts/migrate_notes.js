/**
 * FASE M3b-FINAL: Migrar notas, teléfonos, correos — TODOS los INSERT blocks
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

function splitFields(tuple) {
  const fields = [];
  let field = '', inS = false;
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    if (ch === "'" && !inS) { inS = true; continue; }
    if (ch === "'" && inS) {
      if (tuple[i+1] === "'") { field += "'"; i++; continue; }
      inS = false; continue;
    }
    if (!inS && ch === ',') { fields.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  fields.push(field.trim());
  return fields.map(f => f === 'NULL' ? null : f);
}

(async () => {
  console.log('📝 FASE M3b-FINAL: Notas, teléfonos, correos (TODOS los bloques)\n');
  
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Find ALL INSERT INTO users blocks
  const regex = /INSERT INTO public\."users"[^;]+;/g;
  const blocks = sql.match(regex) || [];
  console.log(`1. Encontrados ${blocks.length} bloques INSERT INTO users`);
  
  // Parse ALL tuples from ALL blocks
  let allTuples = [];
  for (const block of blocks) {
    const t = parseTuples(block);
    allTuples.push(...t);
  }
  console.log(`   Total tuplas: ${allTuples.length}`);
  
  // Build user map
  const usersMap = {};
  let parsed = 0;
  
  for (const tuple of allTuples) {
    const f = splitFields(tuple);
    if (f.length < 20) continue;
    
    const document = (f[9] || '').trim();
    if (!document || document === '0') continue;
    
    const key = document.replace(/-/g, '').toUpperCase();
    
    let email = (f[3] || '').trim();
    if (email && (email.includes('@test.com') || email.includes('\n') || email.includes('\r'))) email = '';
    
    let phone = (f[7] || '').trim();
    if (phone === '0' || phone === '00000000000') phone = '';
    
    const name = f[18] || f[1] || '';
    const address = f[19] || '';
    const retention = f[20] === '1';
    const note = f[22] || '';
    
    if (!usersMap[key]) {
      usersMap[key] = { name, email, phone, address, retention, note };
    } else {
      if (email && !usersMap[key].email) usersMap[key].email = email;
      if (phone && !usersMap[key].phone) usersMap[key].phone = phone;
      if (address && address !== '0' && (!usersMap[key].address || usersMap[key].address === '0')) usersMap[key].address = address;
      if (name && (!usersMap[key].name || usersMap[key].name.length < name.length)) usersMap[key].name = name;
      if (note?.trim() && note !== usersMap[key].note) {
        usersMap[key].note = [usersMap[key].note, note].filter(n => n?.trim()).join('\n---\n');
      }
    }
    parsed++;
  }
  
  const keys = Object.keys(usersMap);
  console.log(`2. ${parsed} rows → ${keys.length} únicos`);
  console.log(`   Notas: ${keys.filter(k=>usersMap[k].note).length}`);
  console.log(`   Correos: ${keys.filter(k=>usersMap[k].email).length}`);
  console.log(`   Teléfonos: ${keys.filter(k=>usersMap[k].phone).length}`);
  console.log(`   Nombres: ${keys.filter(k=>usersMap[k].name).length}`);
  console.log(`   Direcciones: ${keys.filter(k=>usersMap[k].address && usersMap[k].address!=='0').length}`);
  
  // Load inmuebles
  console.log('\n3. Cargando inmuebles...');
  const allInm = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('inmuebles').select('id, identidad').range(from, from + 999);
    if (!data || data.length === 0) break;
    allInm.push(...data);
    from += 1000;
  }
  
  const byId = {};
  allInm.forEach(i => {
    if (!i.identidad) return;
    // Index by raw value, and by stripping V/J prefix
    const raw = i.identidad.replace(/-/g, '').toUpperCase();
    if (!byId[raw]) byId[raw] = [];
    byId[raw].push(i);
    const stripped = raw.replace(/^[VEJGP]/i, '');
    if (stripped !== raw) {
      if (!byId[stripped]) byId[stripped] = [];
      byId[stripped].push(i);
    }
  });
  console.log(`   ${allInm.length} inmuebles, ${Object.keys(byId).length} keys`);
  
  // Update
  console.log('\n4. Actualizando...');
  let updated = 0, noMatch = 0, errors = 0;
  
  for (let i = 0; i < keys.length; i += 10) {
    const batch = keys.slice(i, i + 10);
    const promises = batch.map(async (key) => {
      const u = usersMap[key];
      const targets = byId[key];
      if (!targets?.length) { noMatch++; return; }
      
      const upd = {};
      if (u.note?.trim()) upd.notas = u.note.substring(0, 8000);
      if (u.email) upd.correo_electronico = u.email;
      if (u.phone) upd.telefono = u.phone;
      if (u.name) upd.contribuyente = u.name;
      if (u.address && u.address !== '0') upd.direccion = u.address;
      if (u.retention) upd.agente_retencion = true;
      
      if (!Object.keys(upd).length) return;
      
      for (const t of targets) {
        const { error } = await supabase.from('inmuebles').update(upd).eq('id', t.id);
        if (!error) updated++;
        else errors++;
      }
    });
    await Promise.all(promises);
    if (i % 1000 === 0) process.stdout.write(`   ${Math.min(i+10,keys.length)}/${keys.length}\r`);
  }
  
  console.log(`\n\n✅ COMPLETADO`);
  console.log(`   Actualizados: ${updated} inmuebles`);
  console.log(`   Sin match: ${noMatch}`);
  console.log(`   Errores: ${errors}`);
  
  // Stats
  const { count: cN } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).not('notas','is',null);
  const { count: cC } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).not('correo_electronico','is',null);
  const { count: cT } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).not('contribuyente','is',null);
  console.log(`\n📊 Notas=${cN}, Correos=${cC}, Contribuyentes=${cT}`);
})();
