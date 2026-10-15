// FASE 2 — Analizar códigos Activos en SIGYR pero Eliminados aquí
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const num = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
async function all(t, cols) {
  let out = [], from = 0;
  while (true) { const { data, error } = await sb.from(t).select(cols).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const sig = JSON.parse(fs.readFileSync('sigyr_estado_por_codigo.json', 'utf8'));
  const sigBy = new Map(); sig.forEach(r => { const p = sigBy.get(r.urbaser_code); if (!p || (p.old_estado !== 'Activo' && r.old_estado === 'Activo')) sigBy.set(r.urbaser_code, r); });
  const inms = await all('inmuebles', 'id,inmueble,identidad,contribuyente,estado,actividad_principal,direccion,meses_deuda,condominio_padre_id,es_condominio');
  const byOwner = new Map(); inms.forEach(i => { const k = num(i.identidad); if (!byOwner.has(k)) byOwner.set(k, []); byOwner.get(k).push(i); });
  // eliminaciones intencionales: auditoría + revisión del 06/10
  const { data: aud } = await sb.from('auditoria').select('*').or('accion.ilike.%ELIMINAR%,accion.ilike.%Elimin%').limit(5000);
  const manual = new Set(); (aud || []).forEach(a => { const t = JSON.stringify(a); (t.match(/(URB|AURI)\d{6}/g) || []).forEach(c => manual.add(c)); (t.match(/[VEJG]-?\d{5,10}/g) || []).forEach(c => manual.add('ID' + num(c))); });
  const rev = XLSX.readFile('../Revision_Eliminados_Desactivados_Duplicados.xlsx');
  const revisados = new Set();
  rev.SheetNames.forEach(s => XLSX.utils.sheet_to_json(rev.Sheets[s], { defval: '' }).forEach(r => (JSON.stringify(r).match(/(URB|AURI)\d{6}/g) || []).forEach(c => revisados.add(c))));
  const recWb = XLSX.readFile('/Users/davidzara/Documents/naguanagua_zero/documentos/Record de deudas - 20261004174131.xlsx');
  const recCodes = new Set(XLSX.utils.sheet_to_json(recWb.Sheets[recWb.SheetNames[0]], { defval: '' }).map(r => String(r['Código']).trim().toUpperCase()));
  const out = { reactivar: [], revisar_no_facturado_en_sigyr: [], duplicado: [], hijo_condominio: [], manual: [], otro_dueno: [] };
  for (const i of inms) {
    if (i.estado !== 'Eliminado') continue;
    const s = sigBy.get(String(i.inmueble).toUpperCase()); if (!s || s.old_estado !== 'Activo') continue;
    const row = { id: i.id, inmueble: i.inmueble, identidad: i.identidad, contribuyente: i.contribuyente, actividad: i.actividad_principal, meses: i.meses_deuda, sigyr_ident: s.document, sigyr_nombre: s.name };
    if (manual.has(i.inmueble) || manual.has('ID' + num(i.identidad)) || revisados.has(i.inmueble)) { out.manual.push(row); continue; }
    if (i.condominio_padre_id || i.es_condominio) { out.hijo_condominio.push(row); continue; }
    if (num(s.document) !== num(i.identidad) && num(s.document).length >= 5) { out.otro_dueno.push(row); continue; }
    const hermanos = (byOwner.get(num(i.identidad)) || []).filter(h => h.id !== i.id && h.estado === 'Activo' && String(h.actividad_principal || '').trim() === String(i.actividad_principal || '').trim());
    if (hermanos.length) { out.duplicado.push({ ...row, activo_equivalente: hermanos.map(h => h.inmueble).join(',') }); continue; }
    (recCodes.has(String(i.inmueble).toUpperCase()) ? out.reactivar : out.revisar_no_facturado_en_sigyr).push(row);
  }
  Object.entries(out).forEach(([k, v]) => console.log(k, v.length));
  const wb = XLSX.utils.book_new();
  Object.entries(out).forEach(([k, v]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(v.map(({ id, ...r }) => r)), k));
  XLSX.writeFile(wb, `../Saneamiento_Fase2_${APPLY ? 'APLICADA' : 'SIMULACION'}.xlsx`);
  console.log('Ejemplos a reactivar:'); out.reactivar.slice(0, 12).forEach(r => console.log(' ', r.inmueble, r.identidad, r.contribuyente, '|', r.actividad, '| meses', r.meses));
  if (!APPLY) return;
  fs.writeFileSync(`../respaldos/fase2_antes_${Date.now()}.json`, JSON.stringify(out.reactivar.map(r => ({ id: r.id, inmueble: r.inmueble, estado: 'Eliminado' }))));
  const ids = out.reactivar.map(r => r.id);
  for (let k = 0; k < ids.length; k += 200) await sb.from('inmuebles').update({ estado: 'Activo' }).in('id', ids.slice(k, k + 200));
  console.log('Reactivados:', ids.length);
})();
