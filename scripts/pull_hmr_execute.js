require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB018483').single();
  const { data: hmrUnits } = await supabase.from('condominio_unidades').select('id, propietario').eq('condominio_id', condo.id).ilike('propietario', '%hmr%');
  const { data: hespUnits } = await supabase.from('condominio_unidades').select('id, propietario').eq('condominio_id', condo.id).ilike('propietario', '%hesperia%');
  
  const ids = [...hmrUnits.map(u => u.id), ...hespUnits.map(u => u.id)];
  console.log("Removing units:", ids.length);
  
  // We can set estado = 'Eliminada' instead of deleting
  const { error } = await supabase.from('condominio_unidades').update({ estado: 'Eliminada' }).in('id', ids);
  if (error) console.error("Error updating units", error);
  else console.log("HMR/Hesperia units removed successfully by setting to Eliminada.");
  
  // Update WTC to TARIFA_FIJA
  // WTC needs to be TARIFA_FIJA with tarifa_fija_bs or tarifa_mmv?
  // Wait, the new system for condominios: modalidad = 'TARIFA_FIJA', tarifa_fija_bs = (UCD calculation directly?)
  // Actually, wait! In `motor.ts`, TARIFA_FIJA uses `c.tarifa_fija_bs` DIRECTLY as the Bs amount.
  // BUT the user wants it to fluctuate with the UCD!
  // If we want it to fluctuate with the UCD, we cannot use `tarifa_fija_bs`!
  // We must use `modalidad = 'MIXTO_COMERCIAL'` or something, and set the F.O. (tarifa_mmv) to 918.04.
  // Or `cobro_tarifa_por_unidad = false`, and WTC is billed based on its OWN `tarifa_mmv`!
  
  // Let's check `motor.ts` to see how a condo is billed as a whole if it's not by unit.
}
run();
