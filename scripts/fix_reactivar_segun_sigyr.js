require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const digits = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

(async () => {
  const list = JSON.parse(fs.readFileSync('estado_vs_sigyr.json', 'utf8'));
  // Desactivaciones hechas a propósito por usuarios en el sistema nuevo
  let aud = [], from = 0;
  while (true) {
    const { data, error } = await sb.from('auditoria').select('*').or('accion.ilike.%DESACTIVAR%,accion.ilike.%INACTIV%').range(from, from + 999);
    if (error) { console.log('auditoria err', error.message); break; }
    aud = aud.concat(data); if (data.length < 1000) break; from += 1000;
  }
  const intencional = new Set();
  for (const a of aud) {
    const txt = JSON.stringify(a);
    (txt.match(/[VEJGP]-?\d{5,10}/g) || []).forEach(m => intencional.add(digits(m)));
    (txt.match(/(URB|AURI)\d{6}/g) || []).forEach(m => intencional.add(m));
  }
  console.log('Eventos de desactivación manual en auditoria:', aud.length);

  const cand = list.filter(x => x.old_estado === 'Activo' && x.db_estado === 'Inactivo');
  const ids = cand.map(c => c.id);
  const det = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('inmuebles').select('id,condominio_padre_id,padre_id,es_condominio').in('id', ids.slice(i, i + 200));
    (data || []).forEach(d => det.set(d.id, d));
  }
  const skip = { hijoCondominio: 0, otroDueno: 0, manual: 0 };
  const fix = [];
  for (const c of cand) {
    const d = det.get(c.id) || {};
    if (d.condominio_padre_id) { skip.hijoCondominio++; continue; }
    const placeholder = /URB|AURI/i.test(c.db_ident) || digits(c.old_ident).length < 5;
    if (!placeholder && digits(c.db_ident) !== digits(c.old_ident)) { skip.otroDueno++; continue; }
    if (intencional.has(digits(c.db_ident)) || intencional.has(c.inmueble)) { skip.manual++; continue; }
    fix.push(c);
  }
  console.log('Candidatos Activo(SIGYR)->Inactivo(DB):', cand.length, 'omitidos:', skip, 'a reactivar:', fix.length);
  fs.writeFileSync('reactivar_sigyr_plan.json', JSON.stringify(fix, null, 2));
  ['URB005955', 'URB033055', 'AURI000735', 'URB008099'].forEach(k => console.log(k, fix.some(f => f.inmueble === k) ? 'SI' : 'no'));
  if (!APPLY) return console.log('Dry run');
  fs.writeFileSync(`backup_reactivar_${Date.now()}.json`, JSON.stringify(fix.map(f => ({ id: f.id, inmueble: f.inmueble, estado: 'Inactivo' })), null, 2));
  const fid = fix.map(f => f.id);
  for (let i = 0; i < fid.length; i += 200) {
    const { error } = await sb.from('inmuebles').update({ estado: 'Activo' }).in('id', fid.slice(i, i + 200));
    if (error) return console.error(error.message);
  }
  console.log('Reactivados:', fid.length);
})();
