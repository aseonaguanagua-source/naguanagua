const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('auditoria').select('created_at,accion,usuario,detalles').gte('created_at', '2026-10-07T12:00:00Z').order('created_at', { ascending: false }).limit(40);
  for (const a of data || []) console.log(a.created_at, a.accion, a.usuario, JSON.stringify(a.detalles).slice(0, 400));
  const { data: cu } = await sb.from('condominio_unidades').select('inmueble,actividad,estado,condominio_id').in('inmueble', ['URB006130','URB006134','URB006141','URB033271']);
  console.log('en modulo condominios:', cu);
})();
