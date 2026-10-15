// Fase 6: N/A dentro de condominios -> condominio > N/A (es_grupo) > actividades (padre_unidad_id)
// Uso: node 06_fix_na_unidades.js            (simulación)
//      node 06_fix_na_unidades.js --apply    (respaldo + aplica)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const fs = require('fs'); const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
async function all(t, sel) {
  const out = []; let from = 0;
  for (;;) { const { data, error } = await sb.from(t).select(sel).range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}
const sinAct = a => !a || /^(N\/?A|NA|NINGUNA|SIN ACTIVIDAD|-)$/i.test(String(a).trim());
(async () => {
  const us = (await all('condominio_unidades', '*')).filter(u => u.estado !== 'Eliminada');
  const inms = await all('inmuebles', 'inmueble,padre_id');
  const padreDe = Object.fromEntries(inms.map(i => [i.inmueble, i.padre_id || null]));
  // índice N/A por condominio + código
  const naPor = new Map();
  for (const u of us) if (sinAct(u.actividad) && u.inmueble) naPor.set(`${u.condominio_id}|${u.inmueble}`, u);
  const setPadre = []; const grupos = new Map();
  for (const u of us) {
    const p = u.inmueble && padreDe[u.inmueble];
    if (!p) continue;
    const na = naPor.get(`${u.condominio_id}|${p}`);
    if (!na || na.id === u.id) continue;
    grupos.set(na.id, na);
    if (u.padre_unidad_id !== na.id) setPadre.push({ id: u.id, inmueble: u.inmueble, antes: u.padre_unidad_id || null, despues: na.id, na: na.inmueble });
  }
  const setGrupo = [...grupos.values()].filter(n => !n.es_grupo).map(n => ({ id: n.id, inmueble: n.inmueble, tarifa_mmv: n.tarifa_mmv }));
  console.log({ modo: APPLY ? 'APLICAR' : 'SIMULACION', nietos_a_enlazar: setPadre.length, na_a_marcar_grupo: setGrupo.length, na_con_actividades: grupos.size });
  console.log(setGrupo.map(g => `${g.inmueble} mmv=${g.tarifa_mmv}`).join('\n'));
  const stamp = Date.now();
  fs.writeFileSync(path.join(__dirname, `fase6_plan_${stamp}.json`), JSON.stringify({ setPadre, setGrupo }, null, 1));
  if (!APPLY) return;
  const ids = [...new Set([...setPadre.map(x => x.id), ...setGrupo.map(x => x.id)])];
  fs.writeFileSync(path.join(__dirname, `backup_fase6_${stamp}.json`), JSON.stringify(us.filter(u => ids.includes(u.id)), null, 1));
  let ok = 0, err = 0;
  for (const x of setPadre) { const { error } = await sb.from('condominio_unidades').update({ padre_unidad_id: x.despues }).eq('id', x.id); error ? (err++, console.error(x.inmueble, error.message)) : ok++; }
  for (const x of setGrupo) { const { error } = await sb.from('condominio_unidades').update({ es_grupo: true }).eq('id', x.id); error ? (err++, console.error(x.inmueble, error.message)) : ok++; }
  console.log({ ok, err, respaldo: `backup_fase6_${stamp}.json` });
})();
