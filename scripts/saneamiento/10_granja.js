// Fase 10: Granja a Color (J-500542569). Reactiva los 3 N/A y sus actividades vivas en SIGYR.
// El N/A no cobra tarifa propia: cobra la suma de sus actividades (Supermercado + Licorería).
// node 10_granja.js [--apply]
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const fs = require('fs'); const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const FAM = {
  URB033312: ['URB034176', 'URB034177'],
  URB033314: ['URB034150', 'URB034167'],
  URB034225: ['URB034226', 'URB034227'],
};
(async () => {
  const codes = Object.entries(FAM).flatMap(([p, h]) => [p, ...h]);
  const { data: antes, error } = await sb.from('inmuebles').select('*').in('inmueble', codes);
  if (error) throw error;
  const plan = [];
  for (const [p, hijos] of Object.entries(FAM)) {
    plan.push({ inmueble: p, set: { estado: 'Activo' } });
    for (const h of hijos) plan.push({ inmueble: h, set: { estado: 'Activo', padre_id: p } });
  }
  plan.forEach(x => { const a = antes.find(i => i.inmueble === x.inmueble); console.log(x.inmueble, a?.estado, '->', JSON.stringify(x.set), a ? `${a.actividad_principal} meses=${a.meses_deuda}` : 'NO EXISTE'); });
  if (!APPLY) return;
  fs.writeFileSync(path.join(__dirname, `backup_fase10_${Date.now()}.json`), JSON.stringify(antes, null, 1));
  for (const x of plan) {
    const { error: e } = await sb.from('inmuebles').update(x.set).eq('inmueble', x.inmueble);
    console.log(x.inmueble, e ? 'ERROR ' + e.message : 'OK');
  }
})();
