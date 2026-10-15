// ESCANEO (solo lectura): ¿Caja (funcionario), Cobro Móvil y Soy Contribuyente (Pagos y Estado de Cuenta)
// muestran la misma deuda para cada contribuyente? Replica la lógica de selección y cálculo de cada módulo.
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { getIdentidadVariants, getIdentidadVariantsExact } from '../../src/lib/formatters';
import { calcularMensualidad, isResidencialInm, isCondominioPagoIndividual } from '../../src/lib/calculos';
import { calcularDeudaInmueble, esUltimoMesHist, reglaCobroInmueble, codigosContenedoresNA, r2 } from '../../src/lib/deudaMensual';
dotenv.config({ path: '.env.local', quiet: true } as any);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OUT = process.argv[2] || '.';
const num = (v: any) => parseFloat(String(v ?? 0).replace(/[^\d.-]/g, '')) || 0;

async function todo(tabla: string, cols: string, filtro?: (q: any) => any) {
  const out: any[] = [];
  for (let p = 0; ; p++) {
    let q = sb.from(tabla).select(cols).range(p * 1000, p * 1000 + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q; if (error) throw new Error(tabla + ': ' + error.message);
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}

const hoy = new Date();
const mesesDummy = (inm: any, n: number) => Array.from({ length: n }, (_, k) => {
  const i = k + 1; const d = new Date(hoy.getFullYear(), hoy.getMonth() - n + i - 1, 1, 12, 0, 0);
  return { ref: `RECIB-HIST-${inm.inmueble}-M${i}`, emision: d.toISOString() };
});
const valorHist = (inm: any, n: number, tasa: number) => {
  if (n <= 0) return 0;
  const ms = mesesDummy(inm, n).map(m => ({ emision: m.emision, esUltimo: esUltimoMesHist(m.ref, inm) }));
  const d = calcularDeudaInmueble(inm, tasa, ms, hoy);
  return d.base + d.iva + d.multa;
};
const mesesDesde = (e: string) => { const x = new Date(e); return (hoy.getFullYear() - x.getFullYear()) * 12 + (hoy.getMonth() - x.getMonth()); };

(async () => {
  const tasa = (await (await fetch('https://naguanagua.globalgreenrec.com/api/bcv')).json()).tcmmv;
  console.log('tasa', tasa);
  const inms = await todo('inmuebles', 'id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,padre_id,notas,estado,saldo_favor_bs');
  const facPend = await todo('facturas', 'identidad,referencia,estado,monto,emision', q => q.in('estado', ['Pendiente', 'Por Verificar', 'Abonado']));
  const facIds = new Set((await todo('facturas', 'identidad')).map((f: any) => String(f.identidad || '').toUpperCase()));
  console.log('inmuebles', inms.length, 'facturas pendientes', facPend.length);

  const porId = new Map<string, any[]>(); inms.forEach(i => { const k = String(i.identidad || '').toUpperCase(); if (!porId.has(k)) porId.set(k, []); porId.get(k)!.push(i); });
  const facPorId = new Map<string, any[]>(); facPend.forEach(f => { const k = String(f.identidad || '').toUpperCase(); if (!facPorId.has(k)) facPorId.set(k, []); facPorId.get(k)!.push(f); });
  const porCpid = new Map<string, any[]>(); inms.forEach(i => { if (i.condominio_padre_id) { const k = i.condominio_padre_id; if (!porCpid.has(k)) porCpid.set(k, []); porCpid.get(k)!.push(i); } });
  const juntar = (vars: string[], m: Map<string, any[]>) => { const s = new Map<string, any>(); vars.forEach(v => (m.get(v.toUpperCase()) || []).forEach(x => s.set(x.id ?? x.referencia + x.emision, x))); return [...s.values()]; };
  const tieneDeuda = (i: any) => num(i.deuda_mmv) > 0 || num(i.deuda_congelada_bs) > 0 || parseInt(i.meses_deuda || 0) > 0;

  // ── CAJA ──
  const caja = (I: string) => {
    const all = juntar(getIdentidadVariantsExact(I), porId);
    const act = all.filter(i => i.estado !== 'Eliminado' && !i.condominio_padre_id && !i.es_condominio);
    if (!act.length && all.some(i => i.condominio_padre_id || i.es_condominio)) return { total: 0, bloq: 'condominio', det: {} as any };
    const fac = juntar(getIdentidadVariantsExact(I), facPorId);
    const na = codigosContenedoresNA(act); const bill = act.filter(i => !na.includes(i.inmueble));
    let total = 0; const det: Record<string, number> = {};
    for (const f of fac) { const v = facturaCaja(f, bill, tasa); total += v; det['FAC:' + f.referencia] = r2(v); }
    if (bill.some(tieneDeuda)) for (const inm of bill) {
      if (isCondominioPagoIndividual(inm)) { const m = num(inm.multa_bs) + num(inm.deuda_congelada_bs); if (m > 0) { total += m; det['MULTA:' + inm.inmueble] = r2(m); } }
      const meses = parseInt(inm.meses_deuda || 0); const formales = fac.filter(f => String(f.referencia || '').includes(inm.inmueble) && !String(f.referencia).startsWith('RECIB-HIST-') && !String(f.referencia).startsWith('MULTA-')).length;
      const n = Math.max(0, (meses > 0 ? meses : (num(inm.deuda_mmv) > 0 ? 1 : 0)) - formales);
      const v = valorHist(inm, n, tasa); if (v) { total += v; det[inm.inmueble] = r2(v); }
    }
    return { total: r2(total), bloq: '', det };
  };
  const facturaCaja = (f: any, bill: any[], t: number) => {
    if (f.estado === 'Abonado' || f.estado === 'Pagado') return num(f.monto);
    const ref = String(f.referencia || '');
    if (ref.startsWith('CM-')) {
      let ti = bill.filter(i => ref.includes(i.inmueble)); if (!ti.length) ti = bill;
      let s = 0; ti.forEach(i => { const es = isResidencialInm(i); const bm = +calcularMensualidad(i, t).toFixed(2); const md = mesesDesde(f.emision); s += bm + (es ? 0 : +(bm * 0.16).toFixed(2)) + (md > 1 ? +(bm * (es ? 0.1 : 0.12)).toFixed(2) : 0); });
      return s > 0 ? s : num(f.monto);
    }
    return num(f.monto);
  };

  // ── COBRO MÓVIL (escribe la cédula; el prefijo se separa y se busca solo el número) ──
  const cobro = (I: string) => {
    const numero = I.replace(/^[VEJPG][-_\s]?/i, '');
    const vars = getIdentidadVariants(numero);
    let all = juntar(vars, porId);
    if (!all.length) return { total: 0, bloq: 'no_encontrado', det: {} as any };
    const act = all.filter(i => !i.condominio_padre_id && !i.es_condominio);
    if (!act.length) return { total: 0, bloq: 'condominio', det: {} as any };
    const p = act[0];
    const fac = (facPorId.get(String(p.identidad).toUpperCase()) || []);
    const naCodes = act.filter(i => String(i.actividad_principal || '').trim().toUpperCase() === 'N/A' && parseInt(i.cant_inmuebles || 0) > 0).map(i => i.inmueble);
    const bill0 = act.filter(i => !naCodes.includes(i.inmueble)); const bill = bill0.length ? bill0 : act;
    let total = 0; const det: Record<string, number> = {};
    for (const f of fac) {
      const ref = String(f.referencia || ''); let v = num(f.monto);
      if (f.estado !== 'Abonado' && ref.startsWith('CM-')) { let ti = bill.filter(i => ref.includes(i.inmueble)); if (!ti.length) ti = bill; v = 0; ti.forEach(i => { const bm = +calcularMensualidad(i, tasa).toFixed(2); v += bm + (isResidencialInm(i) ? 0 : bm * 0.16); }); }
      total += v; det['FAC:' + ref] = r2(v);
    }
    if (!fac.length && bill.some(tieneDeuda)) for (const inm of bill) {
      const m = num(inm.multa_bs) + num(inm.deuda_congelada_bs);
      if (isCondominioPagoIndividual(inm) && m > 0) { total += m; det['MULTA:' + inm.inmueble] = r2(m); }
      const meses = parseInt(inm.meses_deuda || 1);
      if (num(inm.deuda_mmv) > 0 || num(inm.deuda_congelada_bs) > 0 || num(inm.multa_bs) > 0 || meses > 0) { const v = valorHist(inm, Math.max(1, meses), tasa); total += v; det[inm.inmueble] = r2(v); }
    }
    return { total: r2(total), bloq: '', det, ids: [...new Set(all.map(i => i.identidad))] };
  };

  // ── SOY CONTRIBUYENTE ── (modo: 'pagos' | 'estado')
  const portal = (I: string, modo: 'pagos' | 'estado') => {
    const vars = getIdentidadVariants(I);
    let all = juntar(vars, porId).map(i => ({ ...i, padre_id: undefined })); // el portal no lee padre_id
    if (all.some(i => i.es_condominio === true || String(i.actividad_principal || '').toLowerCase().includes('condominio'))) {
      const ids = new Set(all.map(i => i.id)); all.map(i => i.inmueble).forEach(c => (porCpid.get(c) || []).forEach(h => { if (!ids.has(h.id)) { ids.add(h.id); all.push({ ...h, padre_id: undefined }); } }));
    }
    const na = codigosContenedoresNA(all); let bill = all.filter(i => !na.includes(i.inmueble));
    if (modo === 'estado' && !bill.length) bill = all;
    const fac = juntar(vars, facPorId);
    const hayFacturasCualquiera = modo === 'estado' ? vars.some(v => facIds.has(v.toUpperCase())) : fac.length > 0;
    let total = 0; const det: Record<string, number> = {};
    for (const f of fac) {
      const ref = String(f.referencia || ''); let v = num(f.monto);
      if (f.estado !== 'Abonado' && ref.startsWith('CM-')) { const inm = bill.find(i => ref.includes(i.inmueble)) || bill[0]; if (inm) { const bm = +calcularMensualidad(inm, tasa).toFixed(2); v = bm + (isResidencialInm(inm) ? 0 : +(bm * 0.16).toFixed(2)); } }
      total += v; det['FAC:' + ref] = r2(v);
    }
    if (bill.some(tieneDeuda) && !hayFacturasCualquiera) for (const inm of bill) {
      const m = num(inm.multa_bs) + num(inm.deuda_congelada_bs); const regla = reglaCobroInmueble(inm, na, I);
      if (regla === 'solo_multa' || (isCondominioPagoIndividual(inm) && m > 0)) { if (m > 0) { total += m; det['MULTA:' + inm.inmueble] = r2(m); } if (regla === 'solo_multa') continue; }
      if (modo === 'pagos') { const v = valorHist(inm, Math.max(1, parseInt(inm.meses_deuda || '1') || 1), tasa); total += v; det[inm.inmueble] = r2(v); }
      else { const meses = parseInt(inm.meses_deuda || 1); if (num(inm.deuda_mmv) > 0 || num(inm.deuda_congelada_bs) > 0 || num(inm.multa_bs) > 0 || meses > 0) { const v = valorHist(inm, Math.max(1, meses), tasa); total += v; det[inm.inmueble] = r2(v); } }
    }
    return { total: r2(total), bloq: '', det };
  };

  // Población: identidades con deuda o con facturas pendientes
  const ids = new Set<string>();
  inms.forEach(i => { if (i.identidad && i.estado !== 'Eliminado' && (tieneDeuda(i) || num(i.multa_bs) > 0)) ids.add(String(i.identidad).toUpperCase()); });
  facPend.forEach(f => { if (f.identidad) ids.add(String(f.identidad).toUpperCase()); });
  console.log('contribuyentes a revisar', ids.size);

  const filas: any[] = []; const causas: Record<string, number> = {};
  for (const I of ids) {
    if (!/^[VEJPG]-?\d+$/.test(I)) continue;
    const c = caja(I), m = cobro(I), pp = portal(I, 'pagos'), pe = portal(I, 'estado');
    const tot = { caja: c.total, cobro: m.total, portalPagos: pp.total, portalEstado: pe.total };
    const ok = (x: number) => Math.abs(x - c.total) <= 0.05;
    if (c.bloq === 'condominio') continue; // se cobra por Caja Condominios
    if (ok(m.total) && ok(pp.total) && ok(pe.total)) continue;
    // causas
    const cs: string[] = [];
    const all = juntar(getIdentidadVariantsExact(I), porId);
    if ((m as any).ids && (m as any).ids.length > 1) cs.push('cobro_movil_mezcla_cedulas_V/J/E');
    if (all.some(i => i.estado === 'Eliminado' && tieneDeuda(i))) cs.push('inmueble_eliminado_con_deuda_(portal/cobro_lo_cobran)');
    if (all.some(i => i.estado !== 'Eliminado' && !tieneDeuda(i) && !i.condominio_padre_id && !i.es_condominio) && all.some(tieneDeuda)) cs.push('portal_pagos_cobra_1_mes_a_inmueble_sin_deuda');
    if (juntar(getIdentidadVariantsExact(I), facPorId).length) cs.push('tiene_facturas_pendientes_(portal/cobro_no_generan_meses)');
    if (all.some(i => i.padre_id && all.some(p => p.inmueble === i.padre_id))) cs.push('NA_por_padre_id_(cobro/portal_no_lo_detectan)');
    if (all.some(i => i.condominio_padre_id) && all.some(i => !i.condominio_padre_id)) cs.push('mixto_condominio_e_individual');
    if (!juntar(getIdentidadVariantsExact(I), facPorId).length && [...facIds].some(x => getIdentidadVariants(I).map(v => v.toUpperCase()).includes(x)) && !ok(pe.total)) cs.push('portal_estado_no_genera_meses_si_tuvo_facturas_pagadas');
    if (!cs.length) cs.push('otra');
    cs.forEach(k => (causas[k] = (causas[k] || 0) + 1));
    filas.push({ identidad: I, ...tot, causas: cs.join(' | '), detCaja: c.det, detCobro: m.det, detPortal: pp.det });
  }
  const resumen = { fecha: new Date().toISOString(), tasa, revisados: ids.size, diferentes: filas.length, causas,
    porModulo: { cobroMovil: filas.filter(f => Math.abs(f.cobro - f.caja) > 0.05).length, portalPagos: filas.filter(f => Math.abs(f.portalPagos - f.caja) > 0.05).length, portalEstado: filas.filter(f => Math.abs(f.portalEstado - f.caja) > 0.05).length } };
  writeFileSync(`${OUT}/escaneo_modulos.json`, JSON.stringify({ resumen, filas }, null, 1));
  console.log(JSON.stringify(resumen, null, 1));
  filas.slice(0, 8).forEach(f => console.log(f.identidad, f.caja, f.cobro, f.portalPagos, f.portalEstado, f.causas));
})();
