/**
 * FASE M1: Migrar contribuyentes del SQL filtrado a Supabase
 * 
 * Fuente: filtered_naguanagua_data.sql (34,045 users)
 * Destino: tabla `inmuebles` en Supabase
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load env
let SUPABASE_URL = '', SUPABASE_KEY = '';
try {
  const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
  SUPABASE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || '';
} catch(e) {}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// document_type_id mapping
const DOC_TYPES = { 1: 'V', 2: 'E', 3: 'J', 4: 'G', 5: 'P' };

function parseInsertValues(sql, tableName) {
  const regex = new RegExp(`INSERT INTO public\\."${tableName}".*?VALUES\\s*`, 'g');
  const match = sql.match(regex);
  if (!match) return [];
  
  // Find all value tuples
  const startIdx = sql.indexOf(match[0]) + match[0].length;
  const restSql = sql.substring(startIdx);
  
  const rows = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < restSql.length; i++) {
    const ch = restSql[i];
    
    if (escaped) { escaped = false; current += ch; continue; }
    if (ch === '\\') { escaped = true; current += ch; continue; }
    
    if (ch === "'" && !escaped) {
      inString = !inString;
      current += ch;
      continue;
    }
    
    if (!inString) {
      if (ch === '(') {
        if (depth === 0) current = '';
        depth++;
        if (depth > 1) current += ch;
        continue;
      }
      if (ch === ')') {
        depth--;
        if (depth === 0) {
          rows.push(current);
          current = '';
        } else {
          current += ch;
        }
        continue;
      }
      if (ch === ';' && depth === 0) break;
    }
    
    current += ch;
  }
  
  return rows;
}

function parseCSVValues(row) {
  const values = [];
  let current = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    
    if (escaped) { escaped = false; current += ch; continue; }
    
    if (ch === "'" && !escaped) {
      if (inString && row[i+1] === "'") {
        current += "'";
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    
    if (!inString && ch === ',') {
      values.push(current.trim());
      current = '';
      continue;
    }
    
    current += ch;
  }
  values.push(current.trim());
  
  return values.map(v => {
    if (v === 'NULL' || v === 'null') return null;
    if (v === 'TRUE' || v === 'true') return true;
    if (v === 'FALSE' || v === 'false') return false;
    return v;
  });
}

(async () => {
  console.log('📦 FASE M1: Migración de Contribuyentes\n');
  
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Parse property types
  console.log('1. Parseando property_types...');
  const ptRows = parseInsertValues(sql, 'property_types');
  const propertyTypes = {};
  ptRows.forEach(r => {
    const v = parseCSVValues(r);
    propertyTypes[v[0]] = v[1]; // id → name
  });
  console.log('   Tipos:', propertyTypes);
  
  // Parse property uses
  const puRows = parseInsertValues(sql, 'property_uses');
  const propertyUses = {};
  puRows.forEach(r => {
    const v = parseCSVValues(r);
    propertyUses[v[0]] = v[1];
  });
  console.log('   Usos:', propertyUses);
  
  // Parse users
  console.log('\n2. Parseando users (34,045 registros)...');
  const userRows = parseInsertValues(sql, 'users');
  console.log(`   Encontrados: ${userRows.length} rows`);
  
  // Columns: id, name, lastname, email, password, level_id, phone_code_id, phone, document_type_id, document, status, verified, remember_token, created_at, updated_at, deleted_at, username, economic_activity, business_name, fiscal_address, retention, box, note, disincorporate, verified_email
  const users = {};
  let skipped = 0;
  
  for (const row of userRows) {
    const v = parseCSVValues(row);
    const id = v[0];
    const name = v[1] || '';
    const lastname = v[2] || '';
    const email = v[3] || '';
    const phone = v[7] || '';
    const docTypeId = v[8];
    const document = v[9] || '';
    const status = v[10];
    const username = v[16] || '';
    const economicActivity = v[17] || '';
    const businessName = v[18] || '';
    const fiscalAddress = v[19] || '';
    const retention = v[20];
    const note = v[22] || '';
    const disincorporate = v[23];
    const updatedAt = v[14] || v[13];
    
    // Skip if no document
    if (!document || document === '0') { skipped++; continue; }
    
    // Build identidad
    const docPrefix = DOC_TYPES[docTypeId] || 'V';
    const identidad = `${docPrefix}-${document}`;
    
    // Build contribuyente name
    let contribuyente = businessName || name;
    if (lastname) contribuyente = `${name} ${lastname}`.trim();
    if (!contribuyente) contribuyente = 'SIN NOMBRE';
    
    // Clean email (exclude test emails)
    let correo = email;
    if (correo && (correo.includes('@test.com') || correo.includes('\n') || correo.includes('\r'))) {
      correo = null;
    }
    
    // Clean phone
    let telefono = phone;
    if (telefono === '0' || telefono === '00000000000') telefono = null;
    
    // Determine estado
    let estado = 'Activo';
    if (status === '0' || status === 0) estado = 'Inactivo';
    if (disincorporate === true || disincorporate === 'true') estado = 'Eliminado';
    
    // Deduplicate: keep most recent by updated_at
    const key = identidad.toUpperCase();
    if (users[key]) {
      const existingDate = new Date(users[key].updated_at || '2000-01-01');
      const newDate = new Date(updatedAt || '2000-01-01');
      if (newDate > existingDate) {
        // Merge notes
        const combinedNote = [users[key].note, note].filter(n => n && n.trim()).join('\n---\n');
        users[key] = {
          ...users[key],
          contribuyente,
          correo: correo || users[key].correo,
          telefono: telefono || users[key].telefono,
          direccion: fiscalAddress || users[key].direccion,
          actividad_principal: economicActivity || users[key].actividad_principal,
          note: combinedNote,
          estado,
          updated_at: updatedAt,
          inmueble: username || users[key].inmueble,
          sigyr_ids: [...(users[key].sigyr_ids || []), id],
        };
      } else {
        // Just merge the note
        if (note && note.trim()) {
          users[key].note = [users[key].note, note].filter(n => n && n.trim()).join('\n---\n');
        }
        users[key].sigyr_ids.push(id);
      }
    } else {
      users[key] = {
        identidad,
        contribuyente,
        correo,
        telefono,
        direccion: fiscalAddress || null,
        actividad_principal: economicActivity || null,
        note: note || null,
        estado,
        inmueble: username || null,
        retention: retention === '1' || retention === 1,
        updated_at: updatedAt,
        sigyr_ids: [id],
      };
    }
  }
  
  const uniqueUsers = Object.values(users);
  console.log(`   Únicos (deduplicados): ${uniqueUsers.length}`);
  console.log(`   Omitidos (sin documento): ${skipped}`);
  
  // Stats
  const withEmail = uniqueUsers.filter(u => u.correo).length;
  const withPhone = uniqueUsers.filter(u => u.telefono).length;
  const withAddress = uniqueUsers.filter(u => u.direccion).length;
  const withNotes = uniqueUsers.filter(u => u.note).length;
  const withActivity = uniqueUsers.filter(u => u.actividad_principal).length;
  
  console.log(`\n   📊 Estadísticas:`);
  console.log(`      Con correo: ${withEmail} (${(withEmail/uniqueUsers.length*100).toFixed(1)}%)`);
  console.log(`      Con teléfono: ${withPhone} (${(withPhone/uniqueUsers.length*100).toFixed(1)}%)`);
  console.log(`      Con dirección: ${withAddress} (${(withAddress/uniqueUsers.length*100).toFixed(1)}%)`);
  console.log(`      Con notas: ${withNotes} (${(withNotes/uniqueUsers.length*100).toFixed(1)}%)`);
  console.log(`      Con actividad: ${withActivity} (${(withActivity/uniqueUsers.length*100).toFixed(1)}%)`);
  
  // Check existing data in Supabase
  console.log('\n3. Verificando datos existentes en Supabase...');
  const { count: existingCount } = await supabase.from('inmuebles').select('id', { count: 'exact', head: true });
  console.log(`   Registros existentes: ${existingCount || 0}`);
  
  // Get existing identidades to avoid duplicates
  let existingIds = new Set();
  let from = 0;
  const step = 999;
  while (true) {
    const { data } = await supabase.from('inmuebles').select('identidad').range(from, from + step);
    if (!data || data.length === 0) break;
    data.forEach(d => existingIds.add((d.identidad || '').replace(/-/g, '').toUpperCase()));
    from += step + 1;
  }
  console.log(`   Identidades ya registradas: ${existingIds.size}`);
  
  // Filter out existing users
  const newUsers = uniqueUsers.filter(u => {
    const cleanId = u.identidad.replace(/-/g, '').toUpperCase();
    return !existingIds.has(cleanId);
  });
  console.log(`   Nuevos a insertar: ${newUsers.length}`);
  
  if (newUsers.length === 0) {
    console.log('\n✅ No hay nuevos contribuyentes para insertar.');
    return;
  }
  
  // Insert in batches of 500
  console.log(`\n4. Insertando ${newUsers.length} contribuyentes en Supabase...`);
  const batchSize = 500;
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < newUsers.length; i += batchSize) {
    const batch = newUsers.slice(i, i + batchSize).map(u => ({
      identidad: u.identidad,
      contribuyente: u.contribuyente,
      correo_electronico: u.correo,
      telefono: u.telefono,
      direccion: u.direccion,
      actividad_principal: u.actividad_principal,
      inmueble: u.inmueble || `SIN-COD-${Math.floor(Math.random()*100000)}`,
      estado: u.estado,
      notas: u.note ? u.note.substring(0, 5000) : null, // Limitar a 5000 chars
      deuda_mmv: 0,
      mmv_mes: 0,
    }));
    
    const { error } = await supabase.from('inmuebles').insert(batch);
    if (error) {
      console.error(`   ⚠️ Error en batch ${i/batchSize + 1}:`, error.message);
      errors++;
    } else {
      inserted += batch.length;
    }
    
    if ((i / batchSize) % 5 === 0) {
      process.stdout.write(`   Progreso: ${Math.min(i + batchSize, newUsers.length)}/${newUsers.length}\r`);
    }
  }
  
  console.log(`\n\n✅ FASE M1 COMPLETADA`);
  console.log(`   Insertados: ${inserted}`);
  console.log(`   Errores: ${errors}`);
  console.log(`   Total en Supabase: ${(existingCount || 0) + inserted}`);
})();
