const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

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
  const todosHijos = await getAllRows('inmuebles', 'id, inmueble, actividad_principal, contribuyente, identidad, condominio_padre_id, tipo', [
    { method: 'not', args: ['condominio_padre_id', 'is', null] },
    { method: 'neq', args: ['estado', 'Eliminado'] },
    { method: 'not', args: ['tipo', 'ilike', '%RESIDENCIAL%'] } // Omitir residencial
  ]);

  const naHijos = todosHijos.filter(h => h.actividad_principal === 'N/A' || !h.actividad_principal);
  console.log(`Found ${naHijos.length} Hijos N/A (excluyendo residenciales).`);

  // We need the identities of the N/A Hijos to find their Nietos
  const identidades = [...new Set(naHijos.map(h => h.identidad).filter(Boolean))];
  console.log(`Fetching Nietos for ${identidades.length} identidades únicas...`);

  // Fetch all potential Nietos (same identidad, but not N/A, not residencial)
  let todosNietos = [];
  const chunkSize = 200;
  for (let i = 0; i < identidades.length; i += chunkSize) {
    const chunk = identidades.slice(i, i + chunkSize);
    const { data } = await sb.from('inmuebles')
       .select('inmueble, actividad_principal, identidad, tipo, contribuyente')
       .in('identidad', chunk)
       .neq('estado', 'Eliminado')
       .not('tipo', 'ilike', '%RESIDENCIAL%')
       .neq('actividad_principal', 'N/A');
    if (data) todosNietos = todosNietos.concat(data);
  }

  // Map identidades to their Nietos
  const nietoMap = {};
  for (const n of todosNietos) {
    if (!nietoMap[n.identidad]) nietoMap[n.identidad] = [];
    nietoMap[n.identidad].push(n);
  }

  // Group Hijos by Padre
  const grouped = {};
  for (const h of naHijos) {
    const pName = padreMap[h.condominio_padre_id] || 'Condominio Desconocido';
    if (!grouped[pName]) grouped[pName] = [];
    grouped[pName].push(h);
  }

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = path.join(__dirname, 'Arbol_Condominios_NA.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(16).fillColor('black').text('Árbol de Condominios Comerciales: Padres -> Hijos (N/A) -> Nietos', { align: 'center' });
  doc.moveDown(1);

  for (const pName of Object.keys(grouped).sort()) {
    const hijos = grouped[pName];
    // Padre
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a5276').text(`PADRE: ${pName}`);
    doc.moveDown(0.2);
    
    for (const h of hijos) {
       // Hijo
       const hId = h.identidad || 'Sin RIF';
       doc.fontSize(11).font('Helvetica-Bold').fillColor('#c0392b').text(`    └─ HIJO (N/A): ${h.inmueble} | ${h.contribuyente || 'Sin Nombre'} (${hId})`);
       
       // Nietos
       const nietos = nietoMap[h.identidad] || [];
       if (nietos.length > 0) {
          for (const n of nietos) {
             const act = n.actividad_principal || 'Sin Actividad';
             doc.fontSize(10).font('Helvetica').fillColor('#2c3e50').text(`            └─ NIETO: ${n.inmueble} | Actividad: ${act}`);
          }
       } else {
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#7f8c8d').text(`            └─ (Sin Nietos comerciales encontrados)`);
       }
       doc.moveDown(0.2);
    }
    doc.moveDown(0.5);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}
run();
