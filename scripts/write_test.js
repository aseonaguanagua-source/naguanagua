require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// I need to use the TS compiler to run the actual TS code from `src/lib/condominios/servicio.ts`.
// I will write a simple TS script and run it with `tsx`.

const tsCode = `
import { supabaseAdmin as sb } from './src/lib/supabaseAdmin.ts';
import { cargarCondominio, calcularEstado, tasaVigente } from './src/lib/condominios/servicio.ts';

async function main() {
  console.log('Cargando condominio URB004304...');
  const datos = await cargarCondominio('URB004304');
  console.log('Condominio agente_retencion:', datos.condo.agente_retencion);
  
  const tasa = await tasaVigente();
  const estado = calcularEstado(datos.condo, datos.unidades, tasa, new Date(), datos.multas);
  
  console.log('Totales de la deuda:', estado.totales);
}

main().catch(console.error);
`;
require('fs').writeFileSync('./scripts/test_calculo.ts', tsCode);
