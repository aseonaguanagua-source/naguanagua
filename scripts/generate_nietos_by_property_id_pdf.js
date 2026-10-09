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
  console.log(`Found ${naHijos.length} Hijos N/A. Reading 39GB dump to find their Nietos via property_id...`);

  const targetUrbaserCodes = new Set(naHijos.map(h => h.inmueble));
  
  let currentTable = null;
  const properties = {}; // id -> { urbCode, parentId, actId, owner }
  const economicActivities = {}; // id -> name

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
      // 0: id, 4: actId, 6: owner, 10: urbCode, 22: parentId
      const cols = line.split('\t');
      if (cols.length > 22) {
        const id = cols[0];
        const actId = cols[4];
        const owner = cols[6];
        const urbCode = cols[10];
        const parentId = cols[22];
        properties[id] = { urbCode, parentId, actId, owner };
      }
    }
  }

  const oldHijoIds = {}; // urbCode -> id
  for (const id in properties) {
     if (targetUrbaserCodes.has(properties[id].urbCode)) {
        oldHijoIds[properties[id].urbCode] = id;
     }
  }

  // Find Nietos
  const nietosByHijo = {}; // hijoUrbCode -> [{ urbCode, actName, owner }]
  for (const id in properties) {
     const pId = properties[id].parentId;
     if (pId && properties[pId] && targetUrbaserCodes.has(properties[pId].urbCode)) {
        const hijoUrb = properties[pId].urbCode;
        if (!nietosByHijo[hijoUrb]) nietosByHijo[hijoUrb] = [];
        nietosByHijo[hijoUrb].push({
           urbCode: properties[id].urbCode,
           actName: economicActivities[properties[id].actId] || 'Sin Actividad',
           owner: properties[id].owner
        });
     }
  }

  // Group by Padre
  const grouped = {};
  for (const h of naHijos) {
    const pName = padreMap[h.condominio_padre_id] || 'Condominio Desconocido';
    if (!grouped[pName]) grouped[pName] = [];
    grouped[pName].push(h);
  }

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = path.join(__dirname, 'Arbol_Condominios_NA_Real.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(16).fillColor('black').text('Árbol de Condominios Comerciales (Vinculación Directa Histórica)', { align: 'center' });
  doc.fontSize(10).fillColor('gray').text('Padres -> Hijos (N/A) -> Nietos (Vinculados por Código Hijo)', { align: 'center' });
  doc.moveDown(1);

  for (const pName of Object.keys(grouped).sort()) {
    const hijos = grouped[pName];
    // Padre
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a5276').text(`PADRE: ${pName}`);
    doc.moveDown(0.2);
    
    for (const h of hijos) {
       // Hijo
       doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b').text(`    └─ HIJO (N/A): ${h.inmueble} | ${h.contribuyente || 'Sin Nombre'}`);
       
       // Nietos
       const nietos = nietosByHijo[h.inmueble] || [];
       if (nietos.length > 0) {
          for (const n of nietos) {
             doc.fontSize(10).font('Helvetica').fillColor('#2c3e50').text(`            └─ NIETO: ${n.urbCode} | Actividad: ${n.actName}`);
          }
       } else {
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#7f8c8d').text(`            └─ (Sin Nietos vinculados a este código)`);
       }
       doc.moveDown(0.2);
    }
    doc.moveDown(0.5);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}
run().catch(console.error);
