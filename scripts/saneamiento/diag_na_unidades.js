// Diagnóstico: unidades N/A en condominio_unidades que COBRAN (posible doble cobro con sus actividades) — solo lectura
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(t, sel) {
  const out = []; let from = 0;
  for (;;) { const { data, error } = await sb.from(t).select(sel).range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}
const sinAct = a => !a || /^(N\/?A|NA|NINGUNA|SIN ACTIVIDAD|-)$/i.test(String(a).trim());
(async () => {
  const { data: one } = await sb.from('condominio_unidades').select('*').limit(1);
  console.log('cols:', Object.keys(one[0]).join(','));
  const us = await all('condominio_unidades', '*');
  const vivas = us.filter(u => u.estado !== 'Eliminada');
  const na = vivas.filter(u => sinAct(u.actividad));
  const naCobran = na.filter(u => !u.es_grupo && u.estado !== 'Desocupada' && Number(u.tarifa_mmv) > 0);
  const naGrupo = na.filter(u => u.es_grupo);
  // unidades cuyo inmueble es hijo (padre_id) de otra unidad N/A
  const inms = await all('inmuebles', 'inmueble,padre_id,condominio_padre_id,actividad_principal,estado');
  const padreDe = Object.fromEntries(inms.map(i => [i.inmueble, i.padre_id || null]));
  const codNA = new Set(na.map(u => u.inmueble).filter(Boolean));
  const nietosComoUnidad = vivas.filter(u => u.inmueble && codNA.has(padreDe[u.inmueble]));
  const naConNietos = new Set(nietosComoUnidad.map(u => padreDe[u.inmueble]));
  const dobles = naCobran.filter(u => naConNietos.has(u.inmueble));
  console.log({ unidades: us.length, vivas: vivas.length, na: na.length, naGrupo: naGrupo.length, naCobran: naCobran.length, nietosComoUnidad: nietosComoUnidad.length, naConNietos: naConNietos.size, DOBLE_COBRO: dobles.length });
  console.log(dobles.slice(0, 20).map(u => `${u.condominio_codigo || u.condominio_id} ${u.inmueble} mmv=${u.tarifa_mmv} grupo=${u.es_grupo}`).join('\n'));
  // N/A grupo marcadas que NO tienen nietos (no cobran nada)
  const grupoSinNietos = naGrupo.filter(u => !naConNietos.has(u.inmueble));
  console.log('N/A es_grupo sin nietos cargados:', grupoSinNietos.length);
  require('fs').writeFileSync(require('path').join(__dirname, 'diag_na_unidades.json'), JSON.stringify({ dobles, naCobran, grupoSinNietos }, null, 1));
})();
