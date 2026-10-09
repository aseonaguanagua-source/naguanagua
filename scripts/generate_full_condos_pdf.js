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

  console.log(`Found ${padres.length} padres. Fetching all hijos...`);
  const hijos = await getAllRows('inmuebles', 'id, inmueble, actividad_principal, contribuyente, condominio_padre_id', [
    { method: 'not', args: ['condominio_padre_id', 'is', null] },
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);

  console.log(`Found ${hijos.length} total hijos.`);

  // Group by Padre
  const grouped = {};
  for (const h of hijos) {
    const pName = padreMap[h.condominio_padre_id] || 'Condominio Desconocido';
    if (!grouped[pName]) grouped[pName] = [];
    grouped[pName].push(h);
  }

  // Sort each group so N/A are first, then sort by contribuyente
  for (const key of Object.keys(grouped)) {
     grouped[key].sort((a,b) => {
        const aNa = (a.actividad_principal === 'N/A' || !a.actividad_principal);
        const bNa = (b.actividad_principal === 'N/A' || !b.actividad_principal);
        if (aNa && !bNa) return -1;
        if (!aNa && bNa) return 1;
        const ac = a.contribuyente || '';
        const bc = b.contribuyente || '';
        return ac.localeCompare(bc);
     });
  }

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = path.join(__dirname, 'Todos_Hijos_Condominios.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(18).fillColor('black').text('Reporte General de Condominios y sus Actividades', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).fillColor('gray').text(`Mostrando todos los locales (con y sin actividad) agrupados por condominio.`, { align: 'center' });
  doc.moveDown(2);

  // We will assign a different color for the condominio header just for aesthetics
  const headerColors = ['#1a5276', '#7b241c', '#117864', '#7d3c98', '#9c640c'];
  let colorIdx = 0;

  for (const pName of Object.keys(grouped).sort()) {
    const locales = grouped[pName];
    const headerColor = headerColors[colorIdx % headerColors.length];
    colorIdx++;

    doc.fontSize(14).fillColor(headerColor).font('Helvetica-Bold').text(`${pName} (${locales.length} locales)`, { underline: true });
    doc.moveDown(0.5);
    
    for (const loc of locales) {
      const act = loc.actividad_principal || 'N/A';
      const isNa = act === 'N/A';
      const text = `• Código: ${loc.inmueble} | Contribuyente: ${loc.contribuyente || 'Sin Nombre'} | Actividad: ${act}`;
      
      // If N/A, print in red to stand out. If regular activity, print in black/dark gray.
      if (isNa) {
         doc.fontSize(10).font('Helvetica-Bold').fillColor('#c0392b').text(text);
      } else {
         doc.fontSize(10).font('Helvetica').fillColor('#2c3e50').text(text);
      }
    }
    doc.moveDown(1);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}
run();
