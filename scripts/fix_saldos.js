/**
 * Fix: Actualizar saldo_favor_bs desde credit_notes (user_id, no property_id)
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
const EXTRACTED = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/extracted';

(async () => {
  console.log('💰 Fix: Saldos a favor desde credit_notes\n');
  
  // credit_notes: id, user_id, amount, status, ...
  const cnLines = fs.readFileSync(path.join(EXTRACTED, 'credit_notes.tsv'), 'utf8').split('\n').filter(l => l.trim());
  console.log(`1. ${cnLines.length} notas de crédito`);
  
  // Aggregate by user_id (field 1) where status=0 (active)
  const saldoByUser = {};
  for (const line of cnLines) {
    const f = line.split('\t');
    const userId = f[1];
    const amount = parseFloat(f[2]) || 0;
    const status = f[3];
    if (amount > 0 && status === '0') {
      saldoByUser[userId] = (saldoByUser[userId] || 0) + amount;
    }
  }
  console.log(`   Usuarios con saldo activo: ${Object.keys(saldoByUser).length}`);
  
  // Build user_id → document from SQL
  console.log('\n2. Mapeando user_id → identidad...');
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
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
  
  const userBlocks = sql.match(/INSERT INTO public\."users"[^;]+;/g) || [];
  const userIdToDoc = {};
  for (const block of userBlocks) {
    for (const t of parseTuples(block)) {
      const f = splitFields(t);
      if (f.length < 10) continue;
      if (f[0] && f[9] && f[9] !== '0') {
        userIdToDoc[f[0]] = f[9]; // user_id → document number
      }
    }
  }
  console.log(`   ${Object.keys(userIdToDoc).length} usuarios mapeados`);
  
  // Load Supabase inmuebles
  console.log('\n3. Cargando inmuebles...');
  const allInm = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('inmuebles').select('id, identidad').range(from, from + 999);
    if (!data || data.length === 0) break;
    allInm.push(...data);
    from += 1000;
  }
  
  const byDoc = {};
  allInm.forEach(i => {
    if (i.identidad) {
      const k = i.identidad.replace(/-/g, '').toUpperCase();
      if (!byDoc[k]) byDoc[k] = [];
      byDoc[k].push(i);
    }
  });
  console.log(`   ${allInm.length} inmuebles`);
  
  // Update saldo_favor_bs
  console.log('\n4. Actualizando saldos...');
  let updated = 0, noMatch = 0;
  const userIds = Object.keys(saldoByUser);
  
  for (let i = 0; i < userIds.length; i += 10) {
    const batch = userIds.slice(i, i + 10);
    const promises = batch.map(async (userId) => {
      const doc = userIdToDoc[userId];
      if (!doc) { noMatch++; return; }
      
      const targets = byDoc[doc.replace(/-/g, '').toUpperCase()];
      if (!targets?.length) { noMatch++; return; }
      
      const saldo = saldoByUser[userId];
      // Update first matching inmueble
      const { error } = await supabase.from('inmuebles').update({
        saldo_favor_bs: parseFloat(saldo.toFixed(6)),
      }).eq('id', targets[0].id);
      if (!error) updated++;
    });
    await Promise.all(promises);
    if (i % 200 === 0) process.stdout.write(`   ${Math.min(i+10, userIds.length)}/${userIds.length}\r`);
  }
  
  console.log(`\n\n✅ Saldos actualizados: ${updated}`);
  console.log(`   Sin match: ${noMatch}`);
  
  const { count } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).gt('saldo_favor_bs', 0);
  console.log(`   Total con saldo a favor en Supabase: ${count}`);
})();
