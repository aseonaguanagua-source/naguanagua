const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: Las variables de entorno de Supabase no están definidas.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function assignEmails() {
  console.log("Iniciando asignación de correos...");
  
  const excelPath = path.resolve('C:/Users/david/Desktop/tucacas/Nuevo_Reporte_Inmuebles_inmuebles_inscritos.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error("No se encontró el archivo Excel en la ruta especificada.");
    return;
  }

  // Leer Excel
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convertir a JSON
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // Extraer las filas saltando la primera si es cabecera
  const dataRows = rawData.slice(1);
  
  let totalUpdated = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    // Asumiendo que el excel tiene: 
    // Indice 1: R.I.F. / Identidad
    // Indice 16: Correo Electrónico
    const identidad = row[1];
    let correo = row[16];

    if (identidad && correo && correo.toString().trim() !== '') {
      correo = correo.toString().trim().toLowerCase();
      
      const { error } = await supabase
        .from('inmuebles')
        .update({ correo_electronico: correo })
        .eq('identidad', identidad.toString().trim());
      
      if (error) {
        console.error(`Error actualizando ${identidad}:`, error.message);
      } else {
        totalUpdated++;
      }
    }
  }

  console.log(`Finalizado. Se actualizaron los correos de ${totalUpdated} contribuyentes.`);
}

assignEmails();
