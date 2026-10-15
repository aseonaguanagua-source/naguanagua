// Busca pagos APROBADOS hechos como abono sobre inmuebles con meses_deuda=0 y deuda guardada (bug de Caja/Conciliación).
// Uso: node scripts/saneamiento/diag_abonos_residuo.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from('pagos_reportados')
      .select('id, identidad, monto, estado, referencia, created_at, tipo, modulo, detalles')
      .gte('created_at', '2026-09-01').order('created_at').range(from, from + 999);
    if (error) throw error;
    if (!data.length) break;
    for (const p of data) {
      const d = typeof p.detalles === 'string' ? JSON.parse(p.detalles || '{}') : (p.detalles || {});
      if (!d.es_abono) continue;
      const prev = Array.isArray(d.deuda_previa) ? d.deuda_previa : [];
      const afect = prev.filter(x => (parseInt(x.meses_deuda || 0) === 0) && (parseFloat(x.deuda_mmv || 0) > 0 || parseFloat(x.deuda_congelada_bs || 0) > 0));
      if (!afect.length) continue;
      out.push({ id: p.id, identidad: p.identidad, monto: p.monto, estado: p.estado, ref: p.referencia, fecha: p.created_at.slice(0, 10), tipo: p.tipo, modulo: p.modulo,
        cajero: d.cajero, recibos: d.recibos, inmuebles: afect.map(x => x.inmueble), tasa: d.tasa_bcv_aplicada || d.tasa_bcv, retencion: d.monto_retencion_iva || 0 });
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  // Estado actual de los inmuebles
  const cods = [...new Set(out.flatMap(o => o.inmuebles))];
  const est = {};
  for (let i = 0; i < cods.length; i += 200) {
    const { data } = await sb.from('inmuebles').select('inmueble, identidad, contribuyente, meses_deuda, deuda_mmv, deuda_congelada_bs, saldo_favor_bs, mmv_mes, clasificacion, tipo, actividad_principal, agente_retencion').in('inmueble', cods.slice(i, i + 200));
    (data || []).forEach(r => { est[r.inmueble] = r; });
  }
  out.forEach(o => { o.actual = o.inmuebles.map(c => est[c]); });
  fs.writeFileSync('scripts/saneamiento/diag_abonos_residuo.json', JSON.stringify(out, null, 1));
  console.log('Pagos afectados:', out.length);
  out.forEach(o => console.log(o.fecha, o.estado, o.identidad, o.monto, o.ref, o.tipo, o.inmuebles.join(','), '| actual:', o.actual.map(a => a ? `${a.inmueble} m${a.meses_deuda} d${a.deuda_mmv} sf${a.saldo_favor_bs}` : '?').join(' ')));
})().catch(e => { console.error(e); process.exit(1); });
