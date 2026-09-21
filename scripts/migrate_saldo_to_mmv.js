import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log("1. Obteniendo tasa BCV (TCMMV) actual...");
  
  // Try dolarapi directly
  const [usdRes, eurRes] = await Promise.all([
    fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
    fetch('https://ve.dolarapi.com/v1/euros/oficial')
  ]);
  
  const usdData = await usdRes.json();
  const eurData = await eurRes.json();
  const tcmmv = Math.max(usdData.promedio, eurData.promedio);
  
  console.log(`Tasa TCMMV obtenida: ${tcmmv}`);

  console.log("2. Obteniendo contribuyentes con saldo > 0...");
  const { data: inmuebles, error } = await supabase
    .from('inmuebles')
    .select('id, saldo, deuda_mmv')
    .gt('saldo', 0);
  
  if (error || !inmuebles) {
    console.error("Error al obtener inmuebles:", error);
    return;
  }

  console.log(`Se encontraron ${inmuebles.length} inmuebles para migrar.`);
  
  let procesados = 0;
  for (const inm of inmuebles) {
    const saldoBs = parseFloat(inm.saldo) || 0;
    
    // Si la deuda_mmv ya es mayor a 0, asumimos que ya se migró
    if ((parseFloat(inm.deuda_mmv) || 0) > 0) continue;

    const deudaMmv = parseFloat((saldoBs / tcmmv).toFixed(2));
    
    const { error: updateError } = await supabase
      .from('inmuebles')
      .update({
        deuda_mmv: deudaMmv,
        saldo: 0 // Reseteamos a 0 porque ahora vive en deuda_mmv
      })
      .eq('id', inm.id);
      
    if (updateError) {
      console.error(`Error actualizando inmueble ${inm.id}:`, updateError);
    } else {
      procesados++;
    }
  }
  
  console.log(`¡Migración completada! ${procesados} registros actualizados a MMV.`);
}

run().catch(console.error);
