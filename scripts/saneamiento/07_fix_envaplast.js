// Fase 7: corrige pago Envaplast URB008385 (agente de retención, abono no aplicado por R3)
// node 07_fix_envaplast.js [--apply]
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const fs = require('fs'); const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const PAGO = '33ed6ce2-42e5-4e73-914c-fd63b02bd39a';
const r2 = n => Math.round(n * 100) / 100;
(async () => {
  const { data: p } = await sb.from('pagos_reportados').select('*').eq('id', PAGO).single();
  const { data: inm } = await sb.from('inmuebles').select('*').eq('inmueble', 'URB008385').single();
  const det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles;
  if (det.monto_retencion_iva) { console.log('Ya corregido'); return; }
  const total = Number(det.total_seleccionado);
  const iva = r2(total * 16 / 116), ret = r2(iva * 0.75), neto = r2(total - ret);
  const excedente = r2(Number(p.monto) - neto);
  const plan = { total, iva, ret, neto, pagado: Number(p.monto), excedente, inm_antes: { deuda_mmv: inm.deuda_mmv, meses_deuda: inm.meses_deuda, saldo_favor_bs: inm.saldo_favor_bs } };
  console.log(APPLY ? 'APLICAR' : 'SIMULACION', plan);
  if (!APPLY) return;
  if (excedente < 0) throw new Error('excedente negativo');
  fs.writeFileSync(path.join(__dirname, `backup_fase7_${Date.now()}.json`), JSON.stringify({ pago: p, inmueble: inm }, null, 1));
  const nuevoDet = { ...det, es_agente_retencion: true, iva_total: iva, monto_retencion_iva: ret, retencion_iva: ret, saldo_favor: excedente, saldo_favor_acreditado: true, correccion_saneamiento: new Date().toISOString() };
  let e = (await sb.from('pagos_reportados').update({ detalles: nuevoDet }).eq('id', PAGO)).error; if (e) throw e;
  e = (await sb.from('inmuebles').update({ deuda_mmv: 0, meses_deuda: 0, saldo_favor_bs: r2(Number(inm.saldo_favor_bs || 0) + excedente) }).eq('id', inm.id)).error; if (e) throw e;
  e = (await sb.from('documentos').insert([{ identidad: p.identidad, contribuyente: det.contribuyente || p.contribuyente || '', tipo: 'Nota de Credito', estado: 'Vigente',
    detalles: JSON.stringify({ monto: excedente.toFixed(2), origen_referencia: `Excedente conciliado (agente de retención 75% IVA). Referencia: ${p.referencia}`, fecha_emision: new Date().toISOString(), analista: 'Saneamiento' }) }])).error; if (e) throw e;
  console.log('OK');
})();
