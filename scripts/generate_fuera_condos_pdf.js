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
  console.log('Fetching all unidades en condominios...');
  const unidadesCondo = await getAllRows('condominio_unidades', 'inmueble');
  const enCondoSet = new Set(unidadesCondo.map(u => u.inmueble).filter(Boolean));

  console.log('Fetching all condominios padres...');
  const condominios = await getAllRows('condominios', 'codigo');
  const condoSet = new Set(condominios.map(c => c.codigo).filter(Boolean));

  console.log('Fetching all inmuebles...');
  const inmuebles = await getAllRows('inmuebles', 'id, inmueble, actividad_principal, contribuyente, estado', [
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);

  console.log(`Total inmuebles found: ${inmuebles.length}`);

  const fueraDeCondo = inmuebles.filter(i => 
    !enCondoSet.has(i.inmueble) && !condoSet.has(i.inmueble)
  );

  console.log(`Total inmuebles fuera de condominios: ${fueraDeCondo.length}`);

  const conNa = [];
  const conAct = [];

  for (const loc of fueraDeCondo) {
    const act = loc.actividad_principal || 'N/A';
    const isNa = act.toUpperCase() === 'N/A' || act.trim() === '';
    if (isNa) conNa.push(loc);
    else conAct.push(loc);
  }

  // Sort by contribuyente
  conNa.sort((a,b) => (a.contribuyente || '').localeCompare(b.contribuyente || ''));
  conAct.sort((a,b) => (a.contribuyente || '').localeCompare(b.contribuyente || ''));

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = '/Users/davidzara/.gemini/antigravity-ide/brain/6a066753-1797-4184-82b0-cb4743aaa35f/Inmuebles_Fuera_Condominios.pdf';
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(18).fillColor('black').text('Reporte de Inmuebles fuera de Condominios', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).fillColor('gray').text(`Mostrando inmuebles que NO pertenecen a ningún condominio, agrupados por actividad.`, { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(14).fillColor('#c0392b').font('Helvetica-Bold').text(`Inmuebles con Actividad N/A (${conNa.length})`, { underline: true });
  doc.moveDown(0.5);
  for (const loc of conNa) {
    const text = `• Código: ${loc.inmueble} | Contribuyente: ${loc.contribuyente || 'Sin Nombre'} | Actividad: N/A`;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#c0392b').text(text);
  }
  doc.moveDown(2);

  doc.fontSize(14).fillColor('#117864').font('Helvetica-Bold').text(`Inmuebles con Actividades Económicas (${conAct.length})`, { underline: true });
  doc.moveDown(0.5);
  for (const loc of conAct) {
    const text = `• Código: ${loc.inmueble} | Contribuyente: ${loc.contribuyente || 'Sin Nombre'} | Actividad: ${loc.actividad_principal}`;
    doc.fontSize(10).font('Helvetica').fillColor('#2c3e50').text(text);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}
run();
