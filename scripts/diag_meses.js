require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(t, cols, f) {
  let out = [], from = 0;
  while (true) {
    let q = sb.from(t).select(cols).range(from, from + 999); if (f) q = f(q);
    const { data, error } = await q; if (error) throw new Error(error.message);
    out = out.concat(data); if (data.length < 1000) break; from += 1000;
  }
  return out;
}
(async () => {
  const wb = XLSX.readFile('/Users/davidzara/Documents/naguanagua_zero/documentos/Record de deudas - 20261004174131.xlsx');
  const rec = new Map(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).filter(r => r['Código']).map(r => [String(r['Código']).trim().toUpperCase(), Number(r['Meses pendientes']) || 0]));
  const pagos = await all('pagos_reportados', 'id,identidad,estado,detalles,created_at', q => q.eq('estado', 'Aprobado'));
  const pagados = new Map(); const pagoTotal = new Set();
  for (const p of pagos) for (const rc of (p.detalles?.recibos || [])) {
    const m = String(rc).match(/RECIB-HIST-((?:URB|AURI)\d+)-M\d+/);
    if (m) pagados.set(m[1], (pagados.get(m[1]) || 0) + 1);
    const d = String(rc).match(/RECIB-DEUDA-?((?:URB|AURI)\d+)?/); if (d && d[1]) pagoTotal.add(d[1]);
  }
  const inms = await all('inmuebles', 'id,inmueble,identidad,contribuyente,estado,meses_deuda,condominio_padre_id');
  const res = { igual: 0, mas_meses_que_esperado: 0, menos_meses_que_esperado: 0, sin_record: 0 };
  const volvieron = [], faltan = [];
  for (const i of inms) {
    if (i.condominio_padre_id) continue; // condominios usan su propio libro
    const c = String(i.inmueble).toUpperCase();
    if (!rec.has(c)) { res.sin_record++; continue; }
    const esperado = pagoTotal.has(c) ? 0 : Math.max(0, rec.get(c) - (pagados.get(c) || 0));
    const actual = Number(i.meses_deuda) || 0;
    if (actual === esperado) res.igual++;
    else if (actual > esperado) { res.mas_meses_que_esperado++; volvieron.push({ ...i, record: rec.get(c), pagados_nuevo: pagados.get(c) || 0, esperado }); }
    else { res.menos_meses_que_esperado++; faltan.push({ ...i, record: rec.get(c), pagados_nuevo: pagados.get(c) || 0, esperado }); }
  }
  console.log('Pagos aprobados:', pagos.length, 'códigos con meses pagados en sistema nuevo:', pagados.size);
  console.log(res);
  const conPago = volvieron.filter(v => v.pagados_nuevo > 0);
  console.log('Con MÁS meses que lo esperado Y que pagaron en el sistema nuevo (meses que "volvieron"):', conPago.length);
  conPago.slice(0, 15).forEach(v => console.log(' ', v.inmueble, v.contribuyente?.slice(0, 30), '| record', v.record, '- pagados', v.pagados_nuevo, '= esperado', v.esperado, '| actual', v.meses_deuda, v.estado));
  fs.writeFileSync('diag_meses_volvieron.json', JSON.stringify(volvieron, null, 2));
  fs.writeFileSync('diag_meses_faltan.json', JSON.stringify(faltan, null, 2));
})();
