import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { cargarCondominio, calcularEstado } from '../src/lib/condominios/servicio';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const data = await cargarCondominio('URB016119');
  if (!data) return;
  // Clear tarifa_mmv for test
  data.condo.tarifa_mmv = null;
  const estado = calcularEstado(data.condo, data.unidades, 979.08, new Date(), data.multas);
  
  console.log("Aseo Base Condominio Bs:", estado.mensual.condominioBs);
  console.log("Unidades cobradas:", estado.mensual.unidadesCobradas);
  console.log("Unidades desocupadas:", estado.mensual.unidadesDesocupadas);
}
run().catch(console.error);
