// Diagnóstico (solo lectura): pagos aprobados afectados por R1/R2/R3 desde el 2026-09-01
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const ps = []; let from = 0;
  for (;;) {
    const { data, error } = await sb.from('pagos_reportados').select('id,identidad,monto,referencia,created_at,tipo,modulo,detalles').eq('estado', 'Aprobado').gte('created_at', '2026-09-01').range(from, from + 999);
    if (error) throw error; ps.push(...data); if (data.length < 1000) break; from += 1000;
  }
  const out = [];
  for (const p of ps) {
    const d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {});
    const sf = Number(d.saldo_favor || d.saldoFavorGenerado || 0);
    const motivo = [];
    if (sf > 0.01 && !d.saldo_favor_acreditado) motivo.push(`excedente ${sf} sin acreditar`);
    if (d.es_abono) motivo.push('abono');
    if (!motivo.length) continue;
    out.push({ id: p.id, identidad: p.identidad, ref: p.referencia, monto: p.monto, fecha: p.created_at.slice(0, 10), tipo: p.tipo, modulo: p.modulo, recibos: (d.recibos || []).join(' '), motivo: motivo.join('; ') });
  }
  // saldo actual de cada identidad
  const ids = [...new Set(out.map(o => o.identidad))];
  const saldo = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from('inmuebles').select('identidad,saldo_favor_bs,deuda_mmv,meses_deuda').in('identidad', ids.slice(i, i + 100));
    for (const x of data || []) { const s = saldo[x.identidad] ||= { saldo: 0, deuda_mmv: 0 }; s.saldo += Number(x.saldo_favor_bs || 0); s.deuda_mmv += Number(x.deuda_mmv || 0); }
  }
  out.forEach(o => Object.assign(o, saldo[o.identidad] || {}));
  console.log({ aprobados: ps.length, sospechosos: out.length });
  console.table(out.slice(0, 60));
  require('fs').writeFileSync(require('path').join(__dirname, 'diag_pagos_afectados.json'), JSON.stringify(out, null, 1));
})();
