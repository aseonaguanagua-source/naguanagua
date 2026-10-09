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
  console.log('Fetching data...');
  
  // 1. Fetch ALL inmuebles
  const inmuebles = await getAllRows('inmuebles', 'id, inmueble, contribuyente, actividad_principal, es_condominio, condominio_padre_id', [
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);
  
  // 2. Condominios migrados al nuevo sistema
  const condos = new Set((await getAllRows('condominios', 'codigo')).map(c => c.codigo));
  
  // 3. Identificar Padres (fuera del nuevo sistema)
  const padresMap = new Map();
  const hijosMap = new Map();
  
  for (const loc of inmuebles) {
    // Si ya es un condominio en el nuevo sistema, lo saltamos completamente.
    if (condos.has(loc.inmueble)) continue;
    
    // Si es un hijo (tiene condominio_padre_id) y su padre NO ESTÁ en el nuevo sistema
    if (loc.condominio_padre_id && !condos.has(loc.condominio_padre_id)) {
      if (!hijosMap.has(loc.condominio_padre_id)) hijosMap.set(loc.condominio_padre_id, []);
      hijosMap.get(loc.condominio_padre_id).push(loc);
    }
    
    // Si es un padre (es_condominio = true)
    if (loc.es_condominio) {
      padresMap.set(loc.inmueble, loc);
    }
  }

  // Add any implicit padres that have children but didn't have es_condominio=true
  for (const [padreId, _] of hijosMap.entries()) {
    if (!padresMap.has(padreId)) {
      const p = inmuebles.find(i => i.inmueble === padreId);
      if (p) padresMap.set(padreId, p);
    }
  }

  const padresSorted = Array.from(padresMap.values()).sort((a,b) => (a.contribuyente || '').localeCompare(b.contribuyente || ''));

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const pdfPath = '/Users/davidzara/.gemini/antigravity-ide/brain/6a066753-1797-4184-82b0-cb4743aaa35f/Padres_e_Hijos_Fuera_Condominios.pdf';
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(18).fillColor('black').text('Reporte de Padres (N/A) e Hijos (Actividades)', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).fillColor('gray').text(`Mostrando las agrupaciones por fuera de los Condominios oficiales.`, { align: 'center' });
  doc.moveDown(2);

  for (const padre of padresSorted) {
    const hijos = hijosMap.get(padre.inmueble) || [];
    
    const actPadre = padre.actividad_principal || 'N/A';
    const isNaPadre = actPadre.toUpperCase() === 'N/A' || actPadre.trim() === '';
    
    // Titulo del Padre (Rojo si es N/A)
    const colorPadre = isNaPadre ? '#c0392b' : '#2c3e50';
    doc.fontSize(12).font('Helvetica-Bold').fillColor(colorPadre).text(`PADRE: [${padre.inmueble}] ${padre.contribuyente || 'Sin Nombre'} (Actividad: ${actPadre})`);
    doc.moveDown(0.2);
    
    if (hijos.length === 0) {
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('gray').text('  (Sin unidades hijas registradas)', { indent: 20 });
    } else {
      hijos.sort((a,b) => (a.contribuyente || '').localeCompare(b.contribuyente || ''));
      for (const hijo of hijos) {
        const actHijo = hijo.actividad_principal || 'N/A';
        const isNaHijo = actHijo.toUpperCase() === 'N/A' || actHijo.trim() === '';
        const colorHijo = isNaHijo ? '#e67e22' : '#117864'; // Naranjoso si el hijo no tiene actividad, Verde si sí tiene.
        
        doc.fontSize(10).font('Helvetica').fillColor(colorHijo).text(`  • HIJO: [${hijo.inmueble}] ${hijo.contribuyente || 'Sin Nombre'} (Actividad: ${actHijo})`, { indent: 20 });
      }
    }
    
    doc.moveDown(1);
  }

  doc.end();
  console.log(`PDF successfully generated at: ${pdfPath}`);
}
run();
