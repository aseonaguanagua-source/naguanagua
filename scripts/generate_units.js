import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log("Obteniendo condominios...");
  const { data: condominios, error: errCond } = await supabase.from('condominios').select('*');
  
  if (errCond || !condominios) {
    console.error("Error al obtener condominios", errCond);
    return;
  }

  let toInsert = [];

  for (const c of condominios) {
    const { data: existing } = await supabase.from('unidades_condominio').select('id').eq('condominio_id', c.id);
    if (existing && existing.length > 0) continue;

    const count = parseInt(c.unidades) || 0;
    for (let i = 1; i <= count; i++) {
      toInsert.push({
        condominio_id: c.id,
        numero_unidad: `Unidad ${i}`,
        propietario: 'No asignado',
        estado: 'Solvente',
        ocupacion: 'Ocupada'
      });
    }
  }

  console.log(`Se generaran ${toInsert.length} unidades. Insertando en lotes...`);
  
  for (let i = 0; i < toInsert.length; i += 1000) {
    const batch = toInsert.slice(i, i + 1000);
    const { error } = await supabase.from('unidades_condominio').insert(batch);
    if (error) {
      console.error(`Error en el lote ${i}:`, error);
    } else {
      console.log(`Lote ${i} a ${i + batch.length} insertado.`);
    }
  }
  
  console.log("¡Proceso de autogeneración completado!");
}

run().catch(console.error);
