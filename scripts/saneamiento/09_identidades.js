// Fase 9: correcciones puntuales de identidad pedidas en el documento del 10/10 (#20)
// node 09_identidades.js [--apply]
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const fs = require('fs'); const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const CAMBIOS = [{ inmueble: 'URB003504', nueva: 'V-3186485' }];
(async () => {
  const { data: antes } = await sb.from('inmuebles').select('*').in('inmueble', CAMBIOS.map(c => c.inmueble));
  console.log(APPLY ? 'APLICAR' : 'SIMULACION', antes.map(i => `${i.inmueble}: ${i.identidad} -> ${CAMBIOS.find(c => c.inmueble === i.inmueble).nueva}`));
  if (!APPLY) return;
  fs.writeFileSync(path.join(__dirname, `backup_fase9_${Date.now()}.json`), JSON.stringify(antes, null, 1));
  for (const c of CAMBIOS) {
    const inm = antes.find(i => i.inmueble === c.inmueble);
    const { data: ex } = await sb.from('contribuyentes').select('identidad').eq('identidad', c.nueva).maybeSingle();
    if (!ex) {
      const { error: e2 } = await sb.from('contribuyentes').insert([{ identidad: c.nueva, nombre: inm.contribuyente }]);
      if (e2) { console.error('contribuyente', e2.message); continue; }
    }
    const { error } = await sb.from('inmuebles').update({ identidad: c.nueva }).eq('id', inm.id);
    if (error) { console.error(c.inmueble, error.message); continue; }
    console.log('OK', c.inmueble);
  }
})();
