const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
const { createClient } = require('@supabase/supabase-js');
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  for (const t of ['inmuebles', 'contribuyentes']) {
    const key = t === 'inmuebles' ? 'inmueble' : 'identidad';
    const val = t === 'inmuebles' ? 'URB006130' : 'J-075232879';
    const { data: cur } = await anon.from(t).select('*').eq(key, val).maybeSingle();
    if (!cur) { console.log(t, 'no leído'); continue; }
    const campo = t === 'inmuebles' ? 'actividad_principal' : 'nombre';
    const { data, error } = await anon.from(t).update({ [campo]: cur[campo] }).eq(key, val).select(key);
    console.log(t, 'filas actualizadas (no-op):', data?.length, error?.message || '');
  }
  const { data: hijos } = await anon.from('inmuebles').select('inmueble,actividad_principal,estado,mmv_mes,identidad').eq('identidad', 'J-075232879');
  console.log(hijos);
})();
