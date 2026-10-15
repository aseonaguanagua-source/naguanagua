require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

(async () => {
  const rows = JSON.parse(fs.readFileSync('condo_audit.json', 'utf8'));
  const targets = rows.filter(r => ['COMERCIO_MULTI_ACTIVIDAD', 'SOSPECHOSO_SIN_HIJOS'].includes(r.verdict));
  console.log('A corregir (es_condominio -> false):', targets.length);
  const codes = targets.map(t => t.inmueble);
  const { data: before } = await sb.from('inmuebles').select('id,inmueble,es_condominio,cant_inmuebles').in('inmueble', codes);
  fs.writeFileSync(`backup_es_condominio_${Date.now()}.json`, JSON.stringify(before, null, 2));
  console.log('Backup guardado:', before.length);
  if (!APPLY) return console.log('Dry run. Use --apply');
  for (let i = 0; i < codes.length; i += 100) {
    const { error } = await sb.from('inmuebles').update({ es_condominio: false }).in('inmueble', codes.slice(i, i + 100));
    if (error) return console.error(error);
  }
  const { count } = await sb.from('inmuebles').select('inmueble', { count: 'exact', head: true }).eq('es_condominio', true);
  console.log('Listo. Total es_condominio=true ahora:', count);
})();
