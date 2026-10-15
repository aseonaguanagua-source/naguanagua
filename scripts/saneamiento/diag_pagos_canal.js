require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(t, cols, f) {
  let out = [], from = 0;
  while (true) { let q = sb.from(t).select(cols).range(from, from + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const wb = XLSX.readFile('/Users/davidzara/Documents/naguanagua_zero/documentos/Record de deudas - 20261004174131.xlsx');
  const rec = new Map(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).filter(r => r['Código']).map(r => [String(r['Código']).trim().toUpperCase(), Number(r['Meses pendientes']) || 0]));
  const pagos = await all('pagos_reportados', 'id,identidad,estado,tipo,detalles,created_at', q => q.eq('estado', 'Aprobado'));
  const porCod = new Map();
  for (const p of pagos) for (const rc of (p.detalles?.recibos || [])) {
    const m = String(rc).match(/RECIB-HIST-((?:URB|AURI)\d+)-M(\d+)/); if (!m) continue;
    if (!porCod.has(m[1])) porCod.set(m[1], { n: 0, pagos: new Map() });
    const e = porCod.get(m[1]); e.n++; e.pagos.set(p.id, { tipo: p.tipo, fecha: p.created_at, cajero: p.detalles?.cajero, analista: p.detalles?.analista, abono: !!p.detalles?.es_abono });
  }
  const inms = await all('inmuebles', 'id,inmueble,identidad,contribuyente,estado,meses_deuda,condominio_padre_id');
  const malos = [];
  for (const i of inms) {
    const c = String(i.inmueble).toUpperCase(); const e = porCod.get(c);
    if (!e || i.condominio_padre_id || !rec.has(c)) continue;
    const esperado = Math.max(0, rec.get(c) - 1 - e.n);
    const actual = Number(i.meses_deuda) || 0;
    if (actual !== esperado) malos.push({ inmueble: c, contribuyente: i.contribuyente, record: rec.get(c), meses_pagados: e.n, esperado, actual, diferencia: actual - esperado, pagos: [...e.pagos.values()].map(p => `${p.tipo}${p.abono ? '(abono)' : ''} ${p.fecha.slice(0, 16)} ${p.cajero || p.analista || ''}`).join(' | ') });
  }
  const t = {}; malos.forEach(m => { const k = (m.diferencia > 0 ? 'MAS' : 'MENOS') + ' ' + (m.pagos.includes('Transferencia') ? 'transf' : m.pagos.includes('abono') ? 'abono' : 'caja'); t[k] = (t[k] || 0) + 1; });
  console.log('Pagaron en sistema nuevo y la deuda NO cuadra:', malos.length, t);
  malos.filter(m => m.diferencia > 0).slice(0, 20).forEach(m => console.log(' ', m.inmueble, '| rec', m.record, 'pag', m.meses_pagados, 'esp', m.esperado, 'act', m.actual, '|', m.pagos.slice(0, 120)));
  fs.writeFileSync('diag_pagados_no_cuadran.json', JSON.stringify(malos, null, 2));
})();
