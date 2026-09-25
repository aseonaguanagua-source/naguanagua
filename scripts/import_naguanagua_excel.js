const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function importContribuyentes() {
  console.log('Importing Contribuyentes...');
  const filePath = path.join(__dirname, '..', '..', 'bd naguanagua', 'Reporte_Contribuyentes.xlsx');
  if (!fs.existsSync(filePath)) {
    console.log('No Reporte_Contribuyentes.xlsx found.');
    return;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    const identidad = row.getCell(1).text?.trim();
    const nombre = row.getCell(2).text?.trim() || 'Desconocido';
    const direccion = row.getCell(3).text?.trim() || '';
    if (identidad) {
      rows.push({ identidad, nombre, direccion });
    }
  });

  console.log(`Found ${rows.length} contribuyentes. Upserting in batches...`);
  // Process in batches
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('contribuyentes').upsert(batch, { onConflict: 'identidad', ignoreDuplicates: true });
    if (error) {
      console.error('Error upserting contribuyentes:', error);
    } else {
      console.log(`Upserted batch ${i / 500 + 1}`);
    }
  }
}

async function importInmuebles() {
  console.log('Importing Inmuebles (Condominios y Hijos)...');
  const filePath = path.join(__dirname, '..', '..', 'bd naguanagua', 'Reporte_Condominios_y_Hijos.xlsx');
  if (!fs.existsSync(filePath)) {
    console.log('No Reporte_Condominios_y_Hijos.xlsx found.');
    return;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  const rows = [];
  const missingIdentidades = new Set();
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    const inmueble = row.getCell(1).text?.trim(); // Catastro/Inmueble ID
    const identidad = row.getCell(2).text?.trim();
    const tipo = row.getCell(3).text?.trim() || 'Residencial';
    const actividad = row.getCell(4).text?.trim() || '';
    const cant = parseFloat(row.getCell(5).value) || 1;
    const mmv = parseFloat(row.getCell(6).value) || 0;

    if (inmueble && identidad) {
      missingIdentidades.add(identidad);
      rows.push({
        inmueble,
        identidad,
        tipo,
        actividad_principal: actividad,
        cant_inmuebles: cant,
        mmv_mes: mmv,
        estado: 'Activo'
      });
    }
  });

  if (missingIdentidades.size > 0) {
     const dummyContribuyentes = Array.from(missingIdentidades).map(id => ({ identidad: id, nombre: 'DESCONOCIDO (Autogenerado)' }));
     for (let i = 0; i < dummyContribuyentes.length; i += 500) {
        await supabase.from('contribuyentes').upsert(dummyContribuyentes.slice(i, i+500), { onConflict: 'identidad', ignoreDuplicates: true });
     }
  }

  console.log(`Found ${rows.length} inmuebles. Upserting in batches...`);
  // Process in batches
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('inmuebles').upsert(batch, { onConflict: 'inmueble', ignoreDuplicates: true });
    if (error) {
      console.error('Error upserting inmuebles:', error);
    } else {
      console.log(`Upserted batch ${i / 500 + 1}`);
    }
  }
}

async function main() {
  await importContribuyentes();
  await importInmuebles();
  console.log('Data import complete!');
}

main();
