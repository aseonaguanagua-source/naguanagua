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

  const naHijos = hijos.filter(h => h.actividad_principal === 'N/A' || !h.actividad_principal);
  console.log(`Found ${hijos.length} total hijos, out of which ${naHijos.length} are N/A.`);

  // Group by Padre
  const grouped = {};
  for (const h of naHijos) {
    const pName = padreMap[h.condominio_padre_id] || 'Condominio Desconocido';
    if (!grouped[pName]) grouped[pName] = [];
    grouped[pName].push(h);
  }

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = path.join(__dirname, 'Hijos_Condominios_NA.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(18).text('Reporte de Locales en Condominios con Actividad N/A', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Total de locales encontrados: ${naHijos.length}`, { align: 'center' });
  doc.moveDown(2);

  for (const pName of Object.keys(grouped).sort()) {
    const locales = grouped[pName];
    doc.fontSize(14).font('Helvetica-Bold').text(`${pName} (${locales.length} locales)`, { underline: true });
    doc.moveDown(0.5);
    for (const loc of locales) {
      doc.fontSize(10).font('Helvetica').text(`• Código: ${loc.inmueble} | Contribuyente: ${loc.contribuyente || 'Sin Nombre'}`);
    }
    doc.moveDown(1);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}
run();
