// Validación del desglose fiscal usado por el Libro de Ventas (octubre 2026). npx tsx scripts/saneamiento/val_libro.ts
import 'dotenv/config';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { desglosarPago, COLS_INMUEBLE_DESGLOSE } from '../../src/lib/desglosePago';
config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const r2 = (n: number) => Math.round(n * 100) / 100;
(async () => {
  let all: any[] = [];
  for (let f = 0; ; f += 1000) { const { data } = await sb.from('pagos_reportados').select('*').range(f, f + 999); all = all.concat(data || []); if (!data || data.length < 1000) break; }
  const ok = all.filter(p => !['Anulado', 'Reversado', 'Condonado', 'Rechazado'].includes(p.estado) && !/retenci/i.test(p.tipo || ''));
  const det = (p: any) => typeof p.detalles === 'string' ? JSON.parse(p.detalles || '{}') : (p.detalles || {});
  const cods = new Set<string>();
  ok.forEach(p => { const d = det(p); (d.recibos || []).forEach((r: string) => { const m = String(r).toUpperCase().match(/^(?:RECIB-HIST-(.+)-M\d+|MULTA-(.+?)(?:-M\d+)?)$/); if (m) cods.add(m[1] || m[2]); }); (d.deuda_previa || []).forEach((x: any) => x?.inmueble && cods.add(String(x.inmueble).toUpperCase())); });
  const inmMap = new Map<string, any>(); const arr = [...cods];
  for (let i = 0; i < arr.length; i += 200) { const { data } = await sb.from('inmuebles').select(COLS_INMUEBLE_DESGLOSE).in('inmueble', arr.slice(i, i + 200)); (data || []).forEach((r: any) => inmMap.set(String(r.inmueble).toUpperCase(), r)); }
  let cuadra = 0, nocuadra = 0, base = 0, iva = 0, ex = 0, ret = 0, monto = 0;
  for (const p of ok) {
    monto += Number(p.monto) || 0;
    const d = desglosarPago(p, inmMap);
    if (d.cuadra && d.lineas.length) { cuadra++; d.lineas.forEach(l => { ret += l.retencion; if (l.esResidencial) ex += l.base + l.multa; else { base += l.base; iva += l.iva; ex += l.multa; } }); }
    else nocuadra++;
  }
  console.log({ pagos: ok.length, cuadra, nocuadra, monto: r2(monto), base: r2(base), iva: r2(iva), exento: r2(ex), retencion: r2(ret) });
})();
