import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log("Obteniendo contribuyentes con saldo...");
  const { data: inmuebles, error } = await supabase
    .from('inmuebles')
    .select('identidad, contribuyente, saldo')
    .gt('saldo', 0);
  
  if (error || !inmuebles) {
    console.error("Error al obtener inmuebles", error);
    return;
  }

  const recibos = inmuebles.map((inm, index) => {
    return {
      referencia: `HIST-${Date.now().toString().slice(-6)}-${index}`,
      identidad: inm.identidad,
      contribuyente: inm.contribuyente,
      monto: `${inm.saldo} Bs`,
      emision: '2023-12-31', // Fecha historica
      vencimiento: '2024-01-31', // Vencida
      estado: 'Pendiente'
    };
  });

  console.log(`Se migraran ${recibos.length} deudas históricas a recibos. Insertando en lotes...`);
  
  for (let i = 0; i < recibos.length; i += 500) {
    const batch = recibos.slice(i, i + 500);
    const { error: errInsert } = await supabase.from('facturas').insert(batch);
    if (errInsert) {
      console.error(`Error en el lote ${i}:`, errInsert);
    } else {
      console.log(`Lote ${i} a ${i + batch.length} insertado.`);
    }
  }
  
  console.log("¡Migración de deuda histórica completada!");
}

run().catch(console.error);
