require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condominios, error } = await supabase.from('inmuebles')
    .select('id, identidad, inmueble, actividad_principal, cant_inmuebles, estado, contribuyente')
    .gt('cant_inmuebles', 1).eq('estado', 'Activo');
    
  if (error) { console.error(error); return; }
  
  const byRif = {};
  for (const c of condominios) {
    if (!byRif[c.identidad]) byRif[c.identidad] = [];
    byRif[c.identidad].push(c);
  }
  
  const rifs = Object.keys(byRif);
  
  let allProps = [];
  for(let i=0; i<rifs.length; i+=100) {
    const batch = rifs.slice(i, i+100);
    const { data } = await supabase.from('inmuebles')
      .select('identidad, inmueble, tipo, actividad_principal, cant_inmuebles, estado, contribuyente')
      .in('identidad', batch).eq('estado', 'Activo');
    if (data) allProps = allProps.concat(data);
  }
  
  const padresHuerfanos = [];
  
  for (const rif of rifs) {
    const props = allProps.filter(p => p.identidad === rif);
    const padres = props.filter(p => p.cant_inmuebles > 1);
    const hijos = props.filter(p => p.cant_inmuebles <= 1);
    
    if (hijos.length === 0) {
      // Get the name from the first padre
      const c = byRif[rif][0];
      const nombre = c.contribuyente || 'SIN NOMBRE';
      const expectedChildren = padres.reduce((acc, p) => acc + p.cant_inmuebles, 0);
      
      padres.forEach(padre => {
        padresHuerfanos.push({
          rif,
          nombre,
          inmueble: padre.inmueble,
          actividad: padre.actividad_principal || 'N/A',
          declarados: padre.cant_inmuebles
        });
      });
    }
  }
  
  // Create PDF
  const doc = new PDFDocument({ margin: 40 });
  const outputPath = 'Padres_Sin_Hijos.pdf';
  doc.pipe(fs.createWriteStream(outputPath));

  doc.fontSize(16).text('REPORTE: PADRES (CONDOMINIOS) SIN HIJOS ACTIVOS', { align: 'center', underline: true });
  doc.moveDown();
  doc.fontSize(10).text(`Total de Padres sin hijos: ${padresHuerfanos.length}`);
  doc.text('Estos inmuebles están como Activos y declaran "cant_inmuebles > 1", pero NO hay ningún inmueble hijo activo bajo su mismo RIF en el sistema.');
  doc.moveDown(2);

  // Table Header
  const top = doc.y;
  doc.font('Helvetica-Bold');
  doc.text('RIF', 40, top);
  doc.text('Razón Social', 130, top, { width: 170 });
  doc.text('Inmueble (Padre)', 310, top);
  doc.text('Declarados', 410, top);
  doc.text('Actividad', 480, top);
  
  doc.moveTo(40, doc.y + 5).lineTo(550, doc.y + 5).stroke();
  doc.moveDown(1);
  
  doc.font('Helvetica');
  let y = doc.y;
  
  padresHuerfanos.sort((a, b) => b.declarados - a.declarados).forEach(p => {
    if (y > 700) {
      doc.addPage();
      y = 40;
    }
    doc.text(p.rif, 40, y);
    doc.text(p.nombre.substring(0, 30), 130, y, { width: 170 });
    doc.text(p.inmueble, 310, y);
    doc.text(p.declarados.toString(), 410, y);
    doc.text(p.actividad.substring(0, 15), 480, y);
    y += 15;
  });

  doc.end();
  console.log(`PDF generado exitosamente en: ${outputPath}`);
}

run();
