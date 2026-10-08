const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMetraje() {
  const { data: condo } = await sb.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: units } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const ids = units.map(u => u.inmueble);

  let hasMetraje = 0;
  let totalMetraje = 0;
  let from = 0;
  while (true) {
    const batch = ids.slice(from, from + 100);
    if (batch.length === 0) break;
    const { data: inms, error } = await sb.from('inmuebles').select('inmueble, metraje').in('inmueble', batch);
    if (inms) {
      for (const i of inms) {
        if (i.metraje && i.metraje > 0) {
          hasMetraje++;
          totalMetraje += i.metraje;
        }
      }
    }
    from += 100;
  }
  console.log(`Units with metraje > 0: ${hasMetraje} out of ${ids.length}`);
  console.log(`Total metraje: ${totalMetraje}`);
}
checkMetraje();
