const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Leer variables de entorno (puedes pasarlas antes de ejecutar o definirlas aquí)
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: Las variables de entorno de Supabase no están definidas.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function migrate() {
  console.log("Iniciando migración...");
  
  // Leer el archivo JSON
  const dataPath = path.resolve(__dirname, '../src/data/inmuebles.json');
  if (!fs.existsSync(dataPath)) {
    console.error("No se encontró el archivo inmuebles.json");
    return;
  }

  const rawData = fs.readFileSync(dataPath, 'utf8');
  let records = JSON.parse(rawData);

  // El primer elemento parece ser las cabeceras (nombres de las columnas). Lo eliminamos.
  const headers = records.shift();
  
  console.log(`Se encontraron ${records.length} registros para subir.`);

  // Mapear los datos al esquema de Supabase
  const formattedRecords = records.map(row => ({
    cod_cont: row["Unnamed: 0"],
    identidad: row["Unnamed: 1"],
    contribuyente: row["Unnamed: 2"],
    inmueble: row["Unnamed: 3"],
    direccion: row["Unnamed: 4"],
    patente: row["Unnamed: 5"],
    telefono: row["Unnamed: 6"] !== undefined ? String(row["Unnamed: 6"]) : null,
    sector: row["Unnamed: 7"],
    area: Number(row["Unnamed: 8"]) || 0,
    area_operativa: Number(row["Unnamed: 9"]) || 0,
    clasificacion: row["Unnamed: 10"],
    tipo: row["Unnamed: 11"],
    actividad_principal: row["Unnamed: 12"],
    cant_inmuebles: Number(row["Unnamed: 13"]) || 0,
    mmv_mes: Number(row["Unnamed: 14"]) || 0,
    saldo: Number(row["Unnamed: 15"]) || 0,
    correo_electronico: row["Unnamed: 16"]
  }));

  // Subir en lotes (batches) de 500 registros
  const BATCH_SIZE = 500;
  for (let i = 0; i < formattedRecords.length; i += BATCH_SIZE) {
    const batch = formattedRecords.slice(i, i + BATCH_SIZE);
    
    console.log(`Subiendo lote de ${i + 1} a ${Math.min(i + BATCH_SIZE, formattedRecords.length)}...`);
    
    const { data, error } = await supabase
      .from('inmuebles')
      .insert(batch);

    if (error) {
      console.error("Error al insertar el lote:", error.message);
    }
  }

  console.log("Migración finalizada con éxito.");
}

migrate();
