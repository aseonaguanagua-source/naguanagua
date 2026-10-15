// Diagnóstico (solo lectura): familias padre/hijo SIGYR vs base actual
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const fs = require('fs'); const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(t, sel) {
  const out = []; let from = 0;
  for (;;) { const { data, error } = await sb.from(t).select(sel).range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const sig = JSON.parse(fs.readFileSync(path.join(__dirname, 'sigyr_vivas.json'), 'utf8').replace(/\bNaN\b/g, 'null'));
  const sigBy = new Map(sig.map(s => [String(s.code).toUpperCase(), s]));
  const inms = await all('inmuebles', 'id,inmueble,identidad,estado,actividad_principal,padre_id,condominio_padre_id,es_condominio,mmv_mes,meses_deuda,deuda_mmv,cant_inmuebles');
  const byCode = new Map(); for (const i of inms) { const k = String(i.inmueble).toUpperCase(); if (!byCode.has(k) || byCode.get(k).estado !== 'Activo') byCode.set(k, i); }
  const idToCode = new Map(inms.map(i => [i.id, String(i.inmueble).toUpperCase()]));
  const r = { hijo_falta: [], hijo_no_activo: [], hijo_padre_distinto: [], padre_no_activo: [] };
  const padresNA = new Set();
  for (const s of sig) {
    if (!s.padre) continue;
    const P = String(s.padre).toUpperCase(); const pi = byCode.get(P);
    if (!pi) continue;
    if (pi.es_condominio || pi.condominio_padre_id) continue; // condominios: módulo aparte
    padresNA.add(P);
    const h = byCode.get(String(s.code).toUpperCase());
    const row = { padre: P, padre_estado: pi.estado, padre_act: pi.actividad_principal, hijo: s.code, act: s.act, doc: s.doc, pend: s.pend };
    if (!h) r.hijo_falta.push(row);
    else if (h.estado !== 'Activo') r.hijo_no_activo.push({ ...row, estado: h.estado, ident: h.identidad });
    else if (String(h.padre_id || '').toUpperCase() !== P && idToCode.get(h.condominio_padre_id) !== P) r.hijo_padre_distinto.push({ ...row, padre_actual: h.padre_id });
  }
  for (const P of padresNA) { const pi = byCode.get(P); if (pi.estado !== 'Activo') r.padre_no_activo.push({ padre: P, estado: pi.estado, act: pi.actividad_principal, ident: pi.identidad }); }
  // Hijos activos en nuestra base que SIGYR ya no tiene vivos (siguen cobrando aquí)
  r.hijo_activo_muerto_sigyr = inms.filter(i => i.padre_id && i.estado === 'Activo' && !sigBy.has(String(i.inmueble).toUpperCase())).map(i => ({ hijo: i.inmueble, padre: i.padre_id, act: i.actividad_principal }));
  const fams = new Set([...r.hijo_falta, ...r.hijo_no_activo, ...r.hijo_padre_distinto].map(x => x.padre).concat(r.padre_no_activo.map(x => x.padre)));
  Object.entries(r).forEach(([k, v]) => console.log(k, v.length));
  console.log('familias N/A afectadas:', fams.size, 'de', padresNA.size);
  fs.writeFileSync(path.join(__dirname, 'diag_familias_sigyr.json'), JSON.stringify(r, null, 1));
  for (const c of ['URB033414', 'URB033288', 'URB033312', 'URB033314', 'URB034225', 'URB033271', 'URB006552']) {
    console.log(c, Object.entries(r).map(([k, v]) => `${k}:${v.filter(x => x.padre === c).length}`).join(' '));
  }
})();
