const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

const dumpPath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/sigyr_prod_20260826.sql';

async function getAllRows(table, select, filters = []) {
  let all = [];
  let step = 1000;
  for (let start = 0; ; start += step) {
    let q = sb.from(table).select(select).range(start, start + step - 1);
    for (const f of filters) q = q[f.method](...f.args);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < step) break;
  }
  return all;
}

async function run() {
  console.log('Fetching all condominios padres...');
  const padres = await getAllRows('inmuebles', 'id, inmueble, contribuyente', [
    { method: 'eq', args: ['es_condominio', true] },
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);
  const padreMap = {};
  padres.forEach(p => padreMap[p.id] = p.contribuyente || p.inmueble);

  console.log('Fetching all Hijos N/A...');
  const todosHijos = await getAllRows('inmuebles', 'id, inmueble, actividad_principal, contribuyente, condominio_padre_id, tipo', [
    { method: 'not', args: ['condominio_padre_id', 'is', null] },
    { method: 'neq', args: ['estado', 'Eliminado'] },
    { method: 'not', args: ['tipo', 'ilike', '%RESIDENCIAL%'] }
  ]);

  const naHijos = todosHijos.filter(h => h.actividad_principal === 'N/A' || !h.actividad_principal);
  console.log(`Found ${naHijos.length} Hijos N/A. Reading 39GB dump to find their Nietos...`);

  const targetUrbaserCodes = new Set(naHijos.map(h => h.inmueble));
  
  let currentTable = null;
  const oldProps = {}; // urbaser_code -> old_id
  const oldPropsById = {}; // old_id -> urbaser_code
  const economicActivities = {}; // id -> name
  const taxpayerActs = {}; // property_id -> [actId1, actId2...]

  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.startsWith('COPY public.')) {
      const match = line.match(/^COPY public\.([^\s]+)/);
      if (match) currentTable = match[1];
      continue;
    }
    if (line === '\\.') { currentTable = null; continue; }

    if (currentTable === 'economic_activities') {
      const cols = line.split('\t');
      if (cols.length > 1) economicActivities[cols[0]] = cols[1];
    } else if (currentTable === 'properties') {
      const cols = line.split('\t');
      if (cols.length > 10) {
        const id = cols[0];
        const urbCode = cols[10];
        if (targetUrbaserCodes.has(urbCode)) {
          oldProps[urbCode] = id;
          oldPropsById[id] = urbCode;
        }
      }
    } else if (currentTable === 'taxpayer_economic_activities') {
      // 0: id, 1: taxpayer_id, 2: economic_activity_id, 3: property_id
      const cols = line.split('\t');
      if (cols.length >= 4) {
        const actId = cols[2];
        const propId = cols[3];
        if (oldPropsById[propId]) {
          if (!taxpayerActs[propId]) taxpayerActs[propId] = [];
          taxpayerActs[propId].push(actId);
        }
      }
    }
  }

  console.log(`Finished reading DB. Found multiple activities for ${Object.keys(taxpayerActs).length} N/A properties.`);

  // Group by Padre
  const grouped = {};
  for (const h of naHijos) {
    const pName = padreMap[h.condominio_padre_id] || 'Condominio Desconocido';
    if (!grouped[pName]) grouped[pName] = [];
    grouped[pName].push(h);
  }

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = path.join(__dirname, 'Arbol_Sigyr_Condominios_NA.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(16).fillColor('black').text('Árbol Histórico (Sigyr): Padres -> Hijos (N/A) -> Nietos (Actividades)', { align: 'center' });
  doc.moveDown(1);

  for (const pName of Object.keys(grouped).sort()) {
    const hijos = grouped[pName];
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a5276').text(`PADRE: ${pName}`);
    doc.moveDown(0.2);
    
    for (const h of hijos) {
       doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b').text(`    └─ HIJO (N/A): ${h.inmueble} | ${h.contribuyente || 'Sin Nombre'}`);
       
       const oldId = oldProps[h.inmueble];
       if (oldId && taxpayerActs[oldId]) {
          const acts = taxpayerActs[oldId];
          for (const actId of acts) {
             const actName = economicActivities[actId] || 'Desconocida';
             doc.fontSize(10).font('Helvetica').fillColor('#2c3e50').text(`            └─ NIETO: Actividad Económica -> ${actName}`);
          }
       } else {
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#7f8c8d').text(`            └─ (Sin actividades vinculadas encontradas en BD vieja)`);
       }
       doc.moveDown(0.2);
    }
    doc.moveDown(0.5);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}

run().catch(console.error);
