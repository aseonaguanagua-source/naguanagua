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
  const padreMap = {}; // id -> { name, code }
  padres.forEach(p => {
     padreMap[p.id] = { name: p.contribuyente || 'Sin Nombre', code: p.inmueble };
  });

  console.log('Fetching ALL Hijos (sin filtros)...');
  const todosHijos = await getAllRows('inmuebles', 'id, inmueble, actividad_principal, contribuyente, condominio_padre_id, tipo', [
    { method: 'not', args: ['condominio_padre_id', 'is', null] },
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);
  console.log(`Found ${todosHijos.length} Hijos en total.`);

  // Only the N/A ones need DB lookup
  const naHijos = todosHijos.filter(h => h.actividad_principal === 'N/A' || !h.actividad_principal);
  const targetUrbaserCodes = new Set(naHijos.map(h => h.inmueble));
  console.log(`${naHijos.length} son N/A. Leyendo 39GB dump para resolverlos...`);
  
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

  // Group ALL Hijos by Padre
  const grouped = {};
  for (const h of todosHijos) {
    const pId = h.condominio_padre_id;
    const pInfo = padreMap[pId] || { name: 'Condominio Desconocido', code: 'N/A' };
    const pKey = `${pInfo.name} (${pInfo.code})`;
    if (!grouped[pKey]) grouped[pKey] = [];
    grouped[pKey].push(h);
  }

  // Create PDF
  console.log('Generating PDF...');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = path.join(__dirname, 'Todos_Condominios_Completo.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(16).fillColor('black').text('Reporte Completo: Condominios, Hijos y Nietos', { align: 'center' });
  doc.moveDown(1);

  // We assign some colors for the headers
  const headerColors = ['#1a5276', '#7b241c', '#117864', '#7d3c98', '#9c640c'];
  let colorIdx = 0;

  for (const pKey of Object.keys(grouped).sort()) {
    const hijos = grouped[pKey];
    const headerColor = headerColors[colorIdx % headerColors.length];
    colorIdx++;

    // Padre
    doc.fontSize(14).font('Helvetica-Bold').fillColor(headerColor).text(`PADRE: ${pKey} - [${hijos.length} Hijos]`, { underline: true });
    doc.moveDown(0.2);
    
    // Sort hijos so N/A are first
    hijos.sort((a,b) => {
       const aNa = (a.actividad_principal === 'N/A' || !a.actividad_principal);
       const bNa = (b.actividad_principal === 'N/A' || !b.actividad_principal);
       if(aNa && !bNa) return -1;
       if(!aNa && bNa) return 1;
       return (a.inmueble||'').localeCompare(b.inmueble||'');
    });

    for (const h of hijos) {
       const actNueva = h.actividad_principal || 'N/A';
       const isNa = (actNueva === 'N/A');

       if (!isNa) {
          // Hijo normal
          doc.fontSize(11).font('Helvetica').fillColor('#34495e').text(`    └─ HIJO: ${h.inmueble} | ${h.contribuyente || 'Sin Nombre'} -> Actividad: ${actNueva}`);
       } else {
          // Hijo N/A
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b').text(`    └─ HIJO (N/A): ${h.inmueble} | ${h.contribuyente || 'Sin Nombre'}`);
          
          const oldId = oldHijoIds[h.inmueble];
          let hijoOldAct = 'No encontrada en histórico';
          if (oldId && properties[oldId]) {
             hijoOldAct = economicActivities[properties[oldId].actId] || 'Actividad Histórica Vacía';
          }

          const nietos = nietosByHijo[h.inmueble] || [];
          if (nietos.length > 0) {
             for (const n of nietos) {
                doc.fontSize(10).font('Helvetica').fillColor('#2c3e50').text(`            └─ NIETO: ${n.urbCode} | Actividad: ${n.actName}`);
             }
          } else {
             doc.fontSize(10).font('Helvetica-Oblique').fillColor('#7f8c8d').text(`            └─ (Sin Nietos) -> Actividad Histórica: ${hijoOldAct}`);
          }
       }
       doc.moveDown(0.2);
    }
    doc.moveDown(0.8);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}
run().catch(console.error);
