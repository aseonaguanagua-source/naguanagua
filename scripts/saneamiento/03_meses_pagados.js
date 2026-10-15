// FASE 3A — Corregir meses que "volvieron" a quienes pagaron en el sistema nuevo
// meses correctos = Record(04/10) − 1 (oct aún no facturado) − meses pagados (recibos aprobados)
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
(async () => {
  const malos = JSON.parse(fs.readFileSync('diag_pagados_no_cuadran.json', 'utf8'));
  // Excluir códigos con ajustes manuales del personal (deuda modificada a propósito o pago eliminado)
  const { data: aud } = await sb.from('auditoria').select('*').or('accion.ilike.%Ajuste de deuda%,accion.ilike.%Eliminación de pago%,accion.ilike.%deuda restablecida%').limit(5000);
  const manual = new Set();
  (aud || []).forEach(a => (JSON.stringify(a).match(/(URB|AURI)\d{6}/g) || []).forEach(c => manual.add(c)));
  const plan = [], omitidos = [];
  for (const m of malos) {
    if (manual.has(m.inmueble)) { omitidos.push({ ...m, motivo: 'Ajuste manual del personal en auditoría' }); continue; }
    plan.push(m);
  }
  const { data: cur } = await sb.from('inmuebles').select('id,inmueble,meses_deuda,deuda_mmv,multa_bs,deuda_congelada_bs').in('inmueble', plan.map(p => p.inmueble));
  const byCode = new Map((cur || []).map(c => [c.inmueble, c]));
  const filas = [];
  for (const p of plan) {
    const c = byCode.get(p.inmueble); if (!c) continue;
    const a = Number(c.meses_deuda) || 0, b = p.esperado;
    if (a === b) continue; // ya corregido
    const f = a > 0 ? b / a : 0;
    const patch = b === 0
      ? { meses_deuda: 0, deuda_mmv: 0, multa_bs: 0, deuda_congelada_bs: 0 }
      : { meses_deuda: b, deuda_mmv: +(Number(c.deuda_mmv || 0) * f).toFixed(6), multa_bs: +(Number(c.multa_bs || 0) * f).toFixed(2), deuda_congelada_bs: +(Number(c.deuda_congelada_bs || 0) * f).toFixed(2) };
    filas.push({ id: c.id, inmueble: p.inmueble, contribuyente: p.contribuyente, record_0410: p.record, meses_pagados: p.meses_pagados, meses_antes: a, meses_despues: b, deuda_mmv_antes: c.deuda_mmv, multa_antes: c.multa_bs, congelada_antes: c.deuda_congelada_bs, ...patch, pagos: p.pagos });
  }
  console.log('A corregir:', filas.length, '| omitidos por ajuste manual:', omitidos.length);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.map(({ id, ...r }) => r)), 'Corregidos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(omitidos), 'Omitidos (revisar)');
  XLSX.writeFile(wb, `../Saneamiento_Fase3A_${APPLY ? 'APLICADA' : 'SIMULACION'}.xlsx`);
  if (!APPLY) return;
  fs.writeFileSync(`../respaldos/fase3a_antes_${Date.now()}.json`, JSON.stringify(cur, null, 2));
  let ok = 0;
  for (const f of filas) {
    const { error } = await sb.from('inmuebles').update({ meses_deuda: f.meses_deuda, deuda_mmv: f.deuda_mmv, multa_bs: f.multa_bs, deuda_congelada_bs: f.deuda_congelada_bs }).eq('id', f.id);
    if (!error) ok++; else console.log(f.inmueble, error.message);
  }
  await sb.from('auditoria').insert({ accion: 'Saneamiento Fase 3A: meses restaurados a pagos aprobados', detalles: JSON.stringify({ total: ok }) }).then(() => {}, () => {});
  console.log('Corregidos:', ok);
})();
