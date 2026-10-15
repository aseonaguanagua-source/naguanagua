// Fase 8: familias N/A según SIGYR
//  A) Hijos Activos sin padre_id -> padre_id del SIGYR (solo agrupa; un N/A con hijos deja de cobrar tarifa propia)
//  B) Hijos Inactivos con deuda que en SIGYR ya están eliminados -> deuda en 0 (duplicaban el cobro del padre)
//  C) (solo informe) hijos Eliminados aquí pero vivos y facturando en SIGYR -> Excel para aprobar
// node 08_familias_na.js [--apply]
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const fs = require('fs'); const path = require('path'); const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
async function all(t, sel) {
  const out = []; let from = 0;
  for (;;) { const { data, error } = await sb.from(t).select(sel).range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const sig = JSON.parse(fs.readFileSync(path.join(__dirname, 'sigyr_vivas.json'), 'utf8').replace(/\bNaN\b/g, 'null'));
  const sigBy = new Map(sig.map(s => [String(s.code).toUpperCase(), s]));
  const inms = await all('inmuebles', 'id,inmueble,identidad,contribuyente,estado,actividad_principal,padre_id,condominio_padre_id,es_condominio,mmv_mes,meses_deuda,deuda_mmv');
  const byCode = new Map(); for (const i of inms) { const k = String(i.inmueble).toUpperCase(); if (!byCode.has(k) || byCode.get(k).estado !== 'Activo') byCode.set(k, i); }
  const A = [], B = [], C = [];
  for (const s of sig) {
    if (!s.padre) continue;
    const P = String(s.padre).toUpperCase(); const pi = byCode.get(P);
    if (!pi || pi.es_condominio || pi.condominio_padre_id) continue;
    const h = byCode.get(String(s.code).toUpperCase()); if (!h) continue;
    if (h.estado === 'Activo' && !h.padre_id && !h.condominio_padre_id && !h.es_condominio && h.inmueble !== pi.inmueble)
      A.push({ id: h.id, hijo: h.inmueble, identidad: h.identidad, actividad: h.actividad_principal, padre: pi.inmueble, padre_act: pi.actividad_principal, padre_ident: pi.identidad });
    if (h.estado === 'Eliminado' && pi.estado === 'Activo' && Number(s.debt_ucd) > 0)
      C.push({ hijo: h.inmueble, identidad: h.identidad, actividad: h.actividad_principal, padre: pi.inmueble, padre_ident: pi.identidad, sigyr_doc: s.doc, sigyr_meses: s.pend, sigyr_deuda_ucd: s.debt_ucd, meses_aqui: h.meses_deuda });
  }
  const B2 = [];
  for (const h of inms) {
    if (h.estado !== 'Inactivo' || !h.padre_id) continue;
    if (!(Number(h.meses_deuda) > 0 || Number(h.deuda_mmv) > 0)) continue;
    if (sigBy.has(String(h.inmueble).toUpperCase())) continue; // vivo en SIGYR: no se toca
    const pi = byCode.get(String(h.padre_id).toUpperCase());
    const row = { id: h.id, hijo: h.inmueble, identidad: h.identidad, actividad: h.actividad_principal, padre: h.padre_id, padre_act: pi?.actividad_principal, meses_antes: h.meses_deuda, deuda_mmv_antes: h.deuda_mmv };
    const mismaAct = pi && pi.estado === 'Activo' && String(pi.actividad_principal || '').trim() === String(h.actividad_principal || '').trim();
    const hijoDeNA = pi && pi.estado === 'Activo' && String(pi.actividad_principal || '').trim().toUpperCase() === 'N/A';
    (mismaAct || hijoDeNA ? B : B2).push(row);
  }
  console.log({ modo: APPLY ? 'APLICAR' : 'SIMULACION', A_enlazar_padre: A.length, B_inactivos_deuda_0: B.length, C_para_aprobar: C.length });
  const stamp = Date.now();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(A), 'A Enlazar padre (aplicado)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(B), 'B Inactivos deuda 0 (aplicado)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(C), 'C Reactivar (APROBAR)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(B2), 'D Inactivos deuda (APROBAR)');
  console.log({ D_inactivos_para_aprobar: B2.length });
  XLSX.writeFile(wb, path.join(__dirname, '../../../Familias_NA_SIGYR.xlsx'));
  if (!APPLY) return;
  const ids = new Set([...A.map(x => x.id), ...B.map(x => x.id)]);
  fs.writeFileSync(path.join(__dirname, `backup_fase8_${stamp}.json`), JSON.stringify(inms.filter(i => ids.has(i.id)), null, 1));
  let ok = 0, err = 0;
  for (const x of A) { const { error } = await sb.from('inmuebles').update({ padre_id: x.padre }).eq('id', x.id); error ? (err++, console.error(x.hijo, error.message)) : ok++; }
  for (const x of B) { const { error } = await sb.from('inmuebles').update({ meses_deuda: 0, deuda_mmv: 0 }).eq('id', x.id); error ? (err++, console.error(x.hijo, error.message)) : ok++; }
  console.log({ ok, err, respaldo: `backup_fase8_${stamp}.json` });
})();
