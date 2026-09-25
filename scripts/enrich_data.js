/**
 * FASE M3 v2: Enriquecer datos con DATA NAGUANAGUA.xlsx + SQL filtrado
 * Optimizado con batching paralelo
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = '', SUPABASE_KEY = '';
try {
  const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
  SUPABASE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || '';
} catch(e) {}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PASO 1: Parsear notas, teléfonos, correos del SQL filtrado ──
function parseUsersFromSQL() {
  console.log('1. Parseando SQL filtrado para notas, teléfonos, correos...');
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  const DOC_TYPES = { '1': 'V', '2': 'E', '3': 'J', '4': 'G', '5': 'P' };
  const users = {};
  
  // Match value tuples in the SQL
  const valuesRegex = /\((\d+),\s*'([^']*(?:''[^']*)*)',\s*(?:'([^']*(?:''[^']*)*)'|NULL),\s*(?:'([^']*(?:''[^']*)*)'|NULL),\s*(?:'[^']*'|NULL),\s*\d+,\s*\d+,\s*(?:'([^']*)'|NULL),\s*(\d+),\s*(?:'([^']*)'|NULL),\s*(\d+),\s*\d+,\s*(?:'[^']*'|NULL),\s*(?:'([^']*)'|NULL),\s*(?:'([^']*)'|NULL),\s*(?:'[^']*'|NULL),\s*(?:'([^']*)'|NULL),\s*(?:'([^']*(?:''[^']*)*)'|NULL),\s*(?:'([^']*(?:''[^']*)*)'|NULL),\s*(?:'([^']*(?:''[^']*)*)'|NULL),\s*(\d+),\s*(?:'[^']*'|NULL),\s*(?:'([\s\S]*?)'|NULL),\s*(?:TRUE|FALSE|NULL),\s*(?:TRUE|FALSE|NULL)\)/g;
  
  let match;
  let count = 0;
  
  // Simpler approach: line by line
  const lines = sql.split('\n');
  for (const line of lines) {
    // Quick check
    if (!line.includes("'") || line.startsWith('--') || line.startsWith('INSERT')) continue;
    
    // Extract tuples from this line
    const tupleRegex = /\((\d+),\s*'((?:[^']|'')*)',\s*(?:'((?:[^']|'')*)'|NULL),\s*(?:'((?:[^']|'')*)'|NULL),\s*(?:'(?:[^']|'')*'|NULL),\s*(\d+),\s*(\d+),\s*(?:'((?:[^']|'')*)'|NULL),\s*(\d+),\s*(?:'((?:[^']|'')*)'|NULL),\s*(\d+)/g;
    
    let m;
    while ((m = tupleRegex.exec(line)) !== null) {
      const id = m[1];
      const name = (m[2] || '').replace(/''/g, "'");
      const phone = (m[7] || '').trim();
      const docTypeId = m[8];
      const document = (m[9] || '').trim();
      const status = m[10];
      
      if (!document || document === '0') continue;
      
      const docPrefix = DOC_TYPES[docTypeId] || 'V';
      const identidad = `${docPrefix}-${document}`;
      const key = identidad.replace(/-/g, '').toUpperCase();
      
      // Extract more fields from the rest of the line after this tuple
      // Find the note field - it's after the retention field
      const afterMatch = line.substring(m.index + m[0].length);
      
      // Extract email from original field (field 4 in tuple)
      let email = (m[4] || '').replace(/''/g, "'").trim();
      if (email && (email.includes('@test.com') || email.includes('\n') || email.includes('\r'))) {
        email = '';
      }
      
      let cleanPhone = phone;
      if (cleanPhone === '0' || cleanPhone === '00000000000') cleanPhone = '';
      
      // Extract more fields
      const usernameMatch = afterMatch.match(/,\s*(?:'((?:[^']|'')*)'|NULL),\s*(?:'((?:[^']|'')*)'|NULL),\s*(?:'((?:[^']|'')*)'|NULL),\s*(?:'((?:[^']|'')*)'|NULL),\s*(\d+)/);
      
      let username = '', economicActivity = '', businessName = '', fiscalAddress = '', retention = 0;
      if (usernameMatch) {
        username = (usernameMatch[1] || '').replace(/''/g, "'");
        economicActivity = (usernameMatch[2] || '').replace(/''/g, "'");
        businessName = (usernameMatch[3] || '').replace(/''/g, "'");
        fiscalAddress = (usernameMatch[4] || '').replace(/''/g, "'");
        retention = parseInt(usernameMatch[5]) || 0;
      }
      
      // Extract note - find the note field (after box, before disincorporate)
      let note = '';
      const noteMatch = afterMatch.match(/,\s*(?:'[^']*'|NULL),\s*'((?:[^']|'')*)',\s*(?:TRUE|FALSE|NULL),\s*(?:TRUE|FALSE|NULL)\)/);
      if (noteMatch) {
        note = (noteMatch[1] || '').replace(/''/g, "'").replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
      }
      
      if (!users[key] || (note && note.length > (users[key].note || '').length)) {
        users[key] = {
          identidad,
          name: businessName || name,
          email: email || (users[key]?.email || ''),
          phone: cleanPhone || (users[key]?.phone || ''),
          note: note || (users[key]?.note || ''),
          fiscalAddress: fiscalAddress || (users[key]?.fiscalAddress || ''),
          retention: retention || (users[key]?.retention || 0),
          username,
        };
      } else if (users[key]) {
        if (email && !users[key].email) users[key].email = email;
        if (cleanPhone && !users[key].phone) users[key].phone = cleanPhone;
        if (note && note !== users[key].note) users[key].note = [users[key].note, note].filter(Boolean).join('\n---\n');
      }
      
      count++;
    }
  }
  
  console.log(`   Parseados: ${count} rows, ${Object.keys(users).length} únicos`);
  return users;
}

(async () => {
  console.log('📊 FASE M3 v2: Enriquecimiento completo\n');
  
  // Parse SQL data
  const sqlUsers = parseUsersFromSQL();
  
  // Get BCV rate
  let tasaBCV = 1;
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/euros/oficial');
    const data = await res.json();
    if (data?.promedio > 0) tasaBCV = data.promedio;
  } catch(e) {}
  console.log(`\n2. Tasa BCV: ${tasaBCV}`);
  
  // Read Excel
  const wb = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx');
  const ws = wb.Sheets['Record de deudas'];
  const rows = xlsx.utils.sheet_to_json(ws);
  console.log(`3. Excel: ${rows.length} registros`);
  
  // Load all inmuebles
  console.log('4. Cargando inmuebles...');
  const allInmuebles = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('inmuebles').select('id, inmueble, identidad').range(from, from + 999);
    if (!data || data.length === 0) break;
    allInmuebles.push(...data);
    from += 1000;
  }
  console.log(`   ${allInmuebles.length} inmuebles cargados`);
  
  // Index
  const byCode = {};
  const byIdentidad = {};
  allInmuebles.forEach(i => {
    if (i.inmueble) byCode[i.inmueble.toUpperCase()] = i;
    if (i.identidad) {
      const k = i.identidad.replace(/-/g, '').toUpperCase();
      if (!byIdentidad[k]) byIdentidad[k] = [];
      byIdentidad[k].push(i);
    }
  });
  
  // ── PASO A: Enriquecer con SQL (notas, teléfonos, correos) ──
  console.log('\n5. Enriqueciendo con datos del SQL (notas, teléfonos, correos)...');
  let sqlUpdated = 0;
  const sqlKeys = Object.keys(sqlUsers);
  
  const CONCURRENCY = 10;
  for (let i = 0; i < sqlKeys.length; i += CONCURRENCY) {
    const batch = sqlKeys.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (key) => {
      const u = sqlUsers[key];
      const targets = byIdentidad[key];
      if (!targets || targets.length === 0) return;
      
      const updateData = {};
      if (u.note) updateData.notas = u.note.substring(0, 8000);
      if (u.email) updateData.correo_electronico = u.email;
      if (u.phone) updateData.telefono = u.phone;
      if (u.name) updateData.contribuyente = u.name;
      if (u.fiscalAddress && u.fiscalAddress !== '0') updateData.direccion = u.fiscalAddress;
      if (u.retention === 1) updateData.agente_retencion = true;
      
      if (Object.keys(updateData).length === 0) return;
      
      for (const t of targets) {
        await supabase.from('inmuebles').update(updateData).eq('id', t.id);
        sqlUpdated++;
      }
    });
    await Promise.all(promises);
    if (i % 500 === 0) process.stdout.write(`   SQL: ${Math.min(i + CONCURRENCY, sqlKeys.length)}/${sqlKeys.length}\r`);
  }
  console.log(`\n   SQL actualizados: ${sqlUpdated}`);
  
  // ── PASO B: Enriquecer con Excel (deudas, clasificación, tarifas) ──
  console.log('\n6. Enriqueciendo con Excel (deudas, clasificación, multas)...');
  let excelUpdated = 0;
  let notFound = 0;
  
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (row) => {
      const codigo = String(row['Código'] || '').trim().toUpperCase();
      const documento = String(row['Documento'] || '').trim();
      const actividad = String(row['Actividad'] || '').trim();
      const tipo = String(row['Tipo'] || '').trim();
      const mesesPendientes = parseInt(row['Meses pendientes'] || 0) || 0;
      const montoPorMes = parseFloat(row['Monto x mes'] || 0) || 0;
      const deudaTotalVes = parseFloat(row['Deuda total Ves'] || 0) || 0;
      const multaTotalVes = parseFloat(row['Multa total Ves'] || 0) || 0;
      const telefono = String(row['Telefono'] || '').trim();
      const direccion = String(row['Dir. fiscal'] || '').trim();
      const nombre = String(row['Nombre / Razón Social'] || '').trim();
      
      let target = byCode[codigo];
      if (!target && documento) {
        const docClean = documento.replace(/-/g, '').toUpperCase();
        const matches = byIdentidad[docClean];
        if (matches?.length > 0) target = matches[0];
      }
      if (!target) { notFound++; return; }
      
      const deudaMMV = tasaBCV > 0 ? deudaTotalVes / tasaBCV : 0;
      const mmvMes = tasaBCV > 0 ? montoPorMes / tasaBCV : 0;
      
      let clasificacion = 'Residencial';
      if (tipo === 'Comercial') clasificacion = 'Comercial';
      else if (tipo === 'Industrial') clasificacion = 'Industrial';
      
      const updateData = {
        deuda_mmv: parseFloat(deudaMMV.toFixed(4)),
        mmv_mes: parseFloat(mmvMes.toFixed(4)),
        clasificacion,
        deuda_congelada_bs: deudaTotalVes,
        multa_bs: multaTotalVes,
        meses_deuda: mesesPendientes,
      };
      
      if (actividad && actividad !== 'undefined') updateData.actividad_principal = actividad;
      if (telefono && telefono !== '0') updateData.telefono = telefono;
      if (direccion && direccion !== '0' && direccion !== 'undefined') updateData.direccion = direccion;
      if (nombre && nombre !== 'undefined') updateData.contribuyente = nombre;
      
      await supabase.from('inmuebles').update(updateData).eq('id', target.id);
      excelUpdated++;
    });
    await Promise.all(promises);
    if (i % 500 === 0) process.stdout.write(`   Excel: ${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}\r`);
  }
  
  console.log(`\n   Excel actualizados: ${excelUpdated}`);
  console.log(`   No encontrados: ${notFound}`);
  
  // ── Stats finales ──
  console.log('\n7. Estadísticas finales...');
  const checks = [
    ['Con notas', 'notas', 'neq', null],
    ['Con correo', 'correo_electronico', 'neq', null],
    ['Con teléfono', 'telefono', 'neq', null],
    ['Con clasificación', 'clasificacion', 'neq', 'Residencial'],
    ['Con deuda > 0', 'deuda_mmv', 'gt', 0],
    ['Con contribuyente', 'contribuyente', 'neq', null],
  ];
  
  for (const [label, col, op, val] of checks) {
    const q = supabase.from('inmuebles').select('id', { count: 'exact', head: true });
    if (op === 'neq') q.not(col, 'is', val);
    else if (op === 'gt') q.gt(col, val);
    const { count } = await q;
    console.log(`   ${label}: ${count || 0}`);
  }
  
  console.log('\n✅ FASE M3 COMPLETADA');
})();
