const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching condominios...");
  const { data: condominios, error: errC } = await sb.from('condominios')
    .select('id, nombre')
    .neq('estado', 'Eliminado');

  if (errC) { console.error("Error fetching condominios:", errC); return; }

  const condoMap = {};
  for (const c of condominios) {
    condoMap[c.id] = c.nombre;
  }

  console.log("Fetching units...");
  const { data: unidades, error: errU } = await sb.from('condominio_unidades')
    .select('id, condominio_id, inmueble, estado')
    .neq('estado', 'Eliminada');

  if (errU) { console.error("Error fetching units:", errU); return; }

  const inmCodes = unidades.map(u => u.inmueble).filter(Boolean);
  
  console.log(`Fetching inmuebles details for ${inmCodes.length} units...`);
  
  // We need to fetch the inmuebles in chunks because of URL length limits in postgrest
  const chunkSize = 500;
  let inmueblesData = [];
  
  for (let i = 0; i < inmCodes.length; i += chunkSize) {
    const chunk = inmCodes.slice(i, i + chunkSize);
    const { data: inms, error: errI } = await sb.from('inmuebles')
      .select('inmueble, contribuyente, actividad_principal, identidad')
      .in('inmueble', chunk)
      .neq('estado', 'Eliminado');
      
    if (errI) { console.error("Error fetching inmuebles:", errI); return; }
    inmueblesData = inmueblesData.concat(inms);
  }

  const inmMap = {};
  for (const inm of inmueblesData) {
    inmMap[inm.inmueble] = inm;
  }

  // Filter and group
  const grouped = {};
  let totalNa = 0;
  
  for (const u of unidades) {
    if (!u.inmueble || !inmMap[u.inmueble]) continue;
    const details = inmMap[u.inmueble];
    const act = (details.actividad_principal || '').trim();
    
    if (act === 'N/A' || act === '') {
       const cName = condoMap[u.condominio_id] || 'Desconocido';
       if (!grouped[cName]) grouped[cName] = [];
       grouped[cName].push({
         codigo: u.inmueble,
         contribuyente: details.contribuyente || 'Sin nombre',
         identidad: details.identidad || 'S/I'
       });
       totalNa++;
    }
  }

  console.log(`Found ${totalNa} N/A units across ${Object.keys(grouped).length} condominios.`);

  // Generate PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = path.join(__dirname, 'Unidades_Condominios_NA.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(18).text('Reporte de Locales en Condominios con Actividad N/A', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Total de locales encontrados: ${totalNa}`, { align: 'center' });
  doc.moveDown(2);

  for (const condoName of Object.keys(grouped).sort()) {
    const locales = grouped[condoName];
    doc.fontSize(14).font('Helvetica-Bold').text(`Condominio: ${condoName} (${locales.length} locales)`, { underline: true });
    doc.moveDown(0.5);
    
    for (const loc of locales) {
      doc.fontSize(10).font('Helvetica').text(`• Código: ${loc.codigo} | Contribuyente: ${loc.contribuyente} (${loc.identidad})`);
    }
    doc.moveDown(1);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}

run();
