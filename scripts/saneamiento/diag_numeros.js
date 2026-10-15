require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(t, sel, f) {
  const out = []; let from = 0;
  for (;;) { let q = sb.from(t).select(sel).order('id').range(from, from + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const { data: one } = await sb.from('inmuebles').select('*').limit(1);
  console.log('inmuebles cols:', Object.keys(one[0]).join(','));
  const us = await all('condominio_unidades', 'id,inmueble,numero,estado');
  const vacios = us.filter(u => u.estado !== 'Eliminada' && (!u.numero || !String(u.numero).trim() || /^N\/?A$/i.test(String(u.numero).trim())));
  console.log('unidades vivas sin numero:', vacios.length, 'de', us.filter(u => u.estado !== 'Eliminada').length);
})();
