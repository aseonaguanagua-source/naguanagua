// Saneamiento GLOBAL (todos los contribuyentes y condominios). Solo LEE y genera SQL (no escribe en la BD).
// npx tsx scripts/saneamiento/global_sql.ts
// Salidas en naguanagua_zero/SQL_GLOBAL/: 01..N .sql + resumen.json
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/global';
const OUT = '/Users/davidzara/Documents/naguanagua_zero/SQL_GLOBAL';
const CORTE_SIGYR = '2026-10-05T22:07:05Z'; // fecha del export de SIGYR usado en la migración

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { calcularMensualidad, isResidencialInm } = await import('../../src/lib/calculos');
  const K = 57 * 0.128; // con tasa 1: base = F.O. × K
  const foOrd = (act: string) => calcularMensualidad({ tipo: 'COMERCIAL', clasificacion: 'COMERCIAL', actividad_principal: act || '', mmv_mes: undefined, cant_inmuebles: 1 }, 1) / K;
  const all = async (t: string, cols: string, filt?: (q: any) => any) => {
    const out: any[] = []; let o = 0;
    for (;;) { let q = sb.from(t).select(cols).range(o, o + 999); if (filt) q = filt(q); const { data, error } = await q; if (error) throw new Error(t + ': ' + error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; o += 1000; }
    return out;
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const q = (s: any) => s == null || s === '' ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;

  const sig: any[] = JSON.parse(fs.readFileSync(`${SCR}/sigyr_props.json`, 'utf8'));
  const S = new Map<string, { padre: string | null; borrado: number; casa: string; act: string; pend: number | null; pendMan: number | null }>();
  sig.forEach(([code, padre, borrado, casa, act, pend, pendMan]) => S.set(code, { padre, borrado, casa, act, pend, pendMan }));

  const inm = await all('inmuebles', 'inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, estado, mmv_mes, meses_deuda, deuda_mmv, padre_id, condominio_padre_id, numero_local');
  const condos = await all('condominios', 'id, codigo, modalidad, tarifa_mmv, estado, aseo_pendiente_desde');
  const unis = await all('condominio_unidades', 'id, condominio_id, inmueble, numero, actividad, tarifa_mmv, estado, padre_unidad_id, es_grupo');
  const pagos = await all('pagos_reportados', 'id, estado, detalles, created_at, modulo', (x: any) => x.eq('estado', 'Aprobado'));
  console.log({ inm: inm.length, condos: condos.length, unis: unis.length, pagos: pagos.length });

  const res: any = {};
  const sql: Record<string, string[]> = { '01_tarifas_FO': [], '02_locales': [], '03_padres_NA': [], '04_meses_pagados': [] };

  // ── 1) F.O. guardado en UCD (F.O. × 0,137) → F.O. oficial. Solo comerciales y solo si la razón es exacta.
  let n1 = 0;
  for (const r of inm) {
    if (isResidencialInm(r)) continue;
    const mmv = parseFloat(r.mmv_mes) || 0; if (mmv <= 0) continue;
    const fo = foOrd(r.actividad_principal); if (!(fo > 0)) continue;
    const ratio = mmv / fo;
    if (ratio > 0.1355 && ratio < 0.1385) { sql['01_tarifas_FO'].push(`UPDATE inmuebles SET mmv_mes=${r2(fo)} WHERE inmueble=${q(r.inmueble)} AND mmv_mes=${mmv};`); n1++; }
  }
  let n1u = 0;
  for (const u of unis) {
    if (u.es_grupo || !u.actividad) continue;
    const mmv = parseFloat(u.tarifa_mmv) || 0; if (mmv <= 0) continue;
    if (/RESIDENC|APARTAMENTO|CASA|QUINTA|TOWN|ANEXO/i.test(u.actividad)) continue;
    const fo = foOrd(u.actividad); if (!(fo > 0)) continue;
    const ratio = mmv / fo;
    if (ratio > 0.1355 && ratio < 0.1385) { sql['01_tarifas_FO'].push(`UPDATE condominio_unidades SET tarifa_mmv=${r2(fo)} WHERE id='${u.id}';`); n1u++; }
  }
  res.tarifasUCDaFO = { inmuebles: n1, unidades: n1u };

  // ── 2) Número de local desde SIGYR (solo donde está vacío)
  const malo = (c: string) => !c || /^(S\/?N|0+|N\/?A|-+|\.)$/i.test(c.trim());
  let n2i = 0, n2u = 0;
  for (const r of inm) { const s = S.get(r.inmueble); if (s && !malo(s.casa) && !String(r.numero_local || '').trim()) { sql['02_locales'].push(`UPDATE inmuebles SET numero_local=${q(s.casa)} WHERE inmueble=${q(r.inmueble)} AND coalesce(numero_local,'')='';`); n2i++; } }
  for (const u of unis) { const s = S.get(u.inmueble); if (s && !malo(s.casa) && !String(u.numero || '').trim()) { sql['02_locales'].push(`UPDATE condominio_unidades SET numero=${q(s.casa)} WHERE id='${u.id}' AND coalesce(numero,'')='';`); n2u++; } }
  res.locales = { inmuebles: n2i, unidades: n2u };

  // ── 3) Estructura N/A: hijo→padre según SIGYR (inmuebles.padre_id) y nietos ligados en el módulo
  const inmMap = new Map(inm.map(r => [r.inmueble, r]));
  const esNA = (act: string) => /^N\/?A$/i.test(String(act || '').trim());
  const hijosVivos = new Map<string, number>();
  S.forEach(v => { if (!v.borrado && v.padre) hijosVivos.set(v.padre, (hijosVivos.get(v.padre) || 0) + 1); });
  const esCondoInm = new Map<string, boolean>();
  { const { data } = await sb.from('inmuebles').select('inmueble').eq('es_condominio', true).limit(5000); (data || []).forEach((x: any) => esCondoInm.set(x.inmueble, true)); }
  let n3 = 0; const padresGrandes = new Map<string, number>();
  for (const r of inm) {
    const s = S.get(r.inmueble); if (!s || s.borrado || !s.padre) continue;
    const p = inmMap.get(s.padre); const sp = S.get(s.padre);
    if (!p || !sp || sp.borrado) continue;
    if (!esNA(p.actividad_principal) && !esNA(sp.act)) continue; // solo actividades dentro de un N/A
    if (condos.some(c => c.codigo === s.padre)) continue; // condominio del módulo: lo maneja el módulo
    if (esCondoInm.get(s.padre) || (hijosVivos.get(s.padre) || 0) > 15) { padresGrandes.set(s.padre, hijosVivos.get(s.padre) || 0); continue; }
    if (r.padre_id !== s.padre) { sql['03_padres_NA'].push(`UPDATE inmuebles SET padre_id=${q(s.padre)} WHERE inmueble=${q(r.inmueble)};`); n3++; }
  }
  res.condominiosFueraDelModulo = Object.fromEntries(padresGrandes);
  const uByCondoCode = new Map<string, any>(); unis.forEach(u => uByCondoCode.set(`${u.condominio_id}|${u.inmueble}`, u));
  let n3u = 0, n3g = 0; const grupos = new Set<string>();
  for (const u of unis) {
    if (u.estado === 'Eliminada') continue;
    const s = S.get(u.inmueble); if (!s || s.borrado || !s.padre) continue;
    const pu = uByCondoCode.get(`${u.condominio_id}|${s.padre}`);
    if (!pu || pu.id === u.id) continue;
    const sp = S.get(s.padre); if (!esNA(pu.actividad) && !esNA(sp?.act || '')) continue;
    if (u.padre_unidad_id !== pu.id) { sql['03_padres_NA'].push(`UPDATE condominio_unidades SET padre_unidad_id='${pu.id}' WHERE id='${u.id}';`); n3u++; }
    grupos.add(pu.id);
  }
  for (const id of grupos) { const pu = unis.find(x => x.id === id); if (pu && !pu.es_grupo) { sql['03_padres_NA'].push(`UPDATE condominio_unidades SET es_grupo=true WHERE id='${id}';`); n3g++; } }
  res.padresNA = { inmueblesPadre: n3, nietosLigados: n3u, gruposMarcados: n3g };

  // ── 4) Meses ya pagados que volvieron. Por cada código se toma su ÚLTIMO pago aprobado:
  //    esperado = meses que debía justo antes de ese pago (detalles.deuda_previa) − meses pagados en ese pago.
  //    Si hoy debe MÁS que eso (y no ha habido facturación nueva ni ajuste manual), los meses volvieron.
  const ultimo = new Map<string, { fecha: string; previa: number; pagados: number }>();
  for (const p of [...pagos].sort((x, z) => String(x.created_at).localeCompare(String(z.created_at)))) {
    let d: any = {}; try { d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch { /* */ }
    const cnt = new Map<string, number>();
    (Array.isArray(d.recibos) ? d.recibos : []).forEach((ref: string) => {
      const m = String(ref).toUpperCase().match(/^RECIB-HIST-(.+)-M\d+$/); if (m) cnt.set(m[1], (cnt.get(m[1]) || 0) + 1);
    });
    const prev = Array.isArray(d.deuda_previa) ? d.deuda_previa : [];
    cnt.forEach((k, cod) => {
      const pv = prev.find((x: any) => String(x.inmueble).toUpperCase() === cod);
      if (pv && pv.meses_deuda != null) ultimo.set(cod, { fecha: p.created_at, previa: parseInt(pv.meses_deuda, 10) || 0, pagados: k });
    });
  }
  const notasDe = new Map<string, string>();
  { const cods = [...ultimo.keys()]; for (let i = 0; i < cods.length; i += 150) { const { data } = await sb.from('inmuebles').select('inmueble, notas').in('inmueble', cods.slice(i, i + 150)); (data || []).forEach((x: any) => notasDe.set(x.inmueble, x.notas || '')); } }
  let n4 = 0; const casos4: any[] = []; const casosRevisar: any[] = [];
  for (const r of inm) {
    const u = ultimo.get(r.inmueble); if (!u) continue;
    const esperado = Math.max(0, u.previa - u.pagados);
    const actual = parseInt(String(r.meses_deuda || 0), 10);
    if (actual <= esperado) continue;
    if (/AJUSTE DE DEUDA/i.test(notasDe.get(r.inmueble) || '')) { casosRevisar.push({ cod: r.inmueble, previa: u.previa, pagados: u.pagados, actual, motivo: 'ajuste manual de deuda en notas' }); continue; }
    const dm = parseFloat(r.deuda_mmv) || 0;
    const nuevaDm = actual > 0 ? Math.round(dm * esperado / actual * 10000) / 10000 : 0;
    sql['04_meses_pagados'].push(`UPDATE inmuebles SET meses_deuda=${esperado}, deuda_mmv=${nuevaDm} WHERE inmueble=${q(r.inmueble)} AND meses_deuda=${actual}; -- debía ${u.previa}, pagó ${u.pagados} el ${u.fecha.slice(0, 10)}`);
    casos4.push({ cod: r.inmueble, previa: u.previa, pagados: u.pagados, actual, esperado }); n4++;
  }
  res.mesesPagadosQueVolvieron = { revisados: ultimo.size, casos: n4, corregidos: casos4, revisarManual: casosRevisar };
  void CORTE_SIGYR;

  // ── 4b) Condominios: pagaron completo en el módulo pero siguen pendientes desde 09/2026 o antes
  const condoPorCod = new Map(condos.map(c => [c.codigo, c]));
  const condoRevisar: any[] = []; const modos: Record<string, number> = {};
  for (const p of pagos) {
    let d: any = {}; try { d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch { /* */ }
    const m = (Array.isArray(d.recibos) ? d.recibos : []).map((x: string) => String(x).match(/^CONDO-(.+)-\d+$/)?.[1]).find(Boolean);
    if (!m) continue;
    modos[String(d.modo)] = (modos[String(d.modo)] || 0) + 1;
    const c = condoPorCod.get(m); if (!c) continue;
    if (!/abono/i.test(String(d.modo || '')) && c.aseo_pendiente_desde && c.aseo_pendiente_desde <= '2026-09-01' && p.created_at >= '2026-10-01')
      condoRevisar.push({ condominio: m, pago: p.id, fecha: p.created_at.slice(0, 10), modo: d.modo, pendiente_desde: c.aseo_pendiente_desde });
  }
  res.condominiosPagadosAunPendientes = { modos, casos: condoRevisar };

  // ── 4c) Condominios: un período pagado NO puede volver. desde_esperado = mes siguiente al último período pagado.
  sql['05_condominios_pagados'] = [];
  const sigMes = (p: string) => { const [y, m] = p.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 10); };
  const espUni = new Map<string, string>(); const espCondo = new Map<string, string>();
  for (const p of pagos) {
    let d: any = {}; try { d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch { /* */ }
    const c = d.condominio; if (!c || typeof c !== 'object' || !Array.isArray(c.lineas)) continue;
    const cd = condoPorCod.get(c.codigo); if (!cd) continue;
    for (const l of c.lineas) {
      const per = (Array.isArray(l.periodos) ? l.periodos : []).filter((x: any) => /^\d{4}-\d{2}$/.test(String(x))).sort();
      if (!per.length) continue;
      const desde = sigMes(per[per.length - 1]);
      const key = l.inmueble ? `${cd.id}|${l.inmueble}` : cd.id;
      const mapa = l.inmueble ? espUni : espCondo;
      if (!mapa.has(key) || mapa.get(key)! < desde) mapa.set(key, desde);
    }
  }
  let n5u = 0, n5c = 0; const ej5: any[] = [];
  // aseo_pendiente_desde de unidades no se cargó arriba: consulta puntual
  const uniIds = [...espUni.keys()].map(k => uByCondoCode.get(k)?.id).filter(Boolean) as string[];
  const desdeUni = new Map<string, string | null>();
  for (let i = 0; i < uniIds.length; i += 200) { const { data } = await sb.from('condominio_unidades').select('id, aseo_pendiente_desde').in('id', uniIds.slice(i, i + 200)); (data || []).forEach((x: any) => desdeUni.set(x.id, x.aseo_pendiente_desde)); }
  espUni.forEach((desde, key) => {
    const u = uByCondoCode.get(key); if (!u || u.estado === 'Eliminada') return;
    const act = desdeUni.get(u.id);
    if (act && act < desde) { sql['05_condominios_pagados'].push(`UPDATE condominio_unidades SET aseo_pendiente_desde='${desde}' WHERE id='${u.id}' AND aseo_pendiente_desde='${act}'; -- ${u.inmueble}: pagó hasta ${desde.slice(0, 7)} (excl.)`); n5u++; if (ej5.length < 10) ej5.push({ unidad: u.inmueble, actual: act, esperado: desde }); }
  });
  espCondo.forEach((desde, id) => {
    const c = condos.find(x => x.id === id); if (!c) return;
    if (c.aseo_pendiente_desde && c.aseo_pendiente_desde < desde) { sql['05_condominios_pagados'].push(`UPDATE condominios SET aseo_pendiente_desde='${desde}' WHERE id='${id}' AND aseo_pendiente_desde='${c.aseo_pendiente_desde}'; -- ${c.codigo}`); n5c++; }
  });
  res.condominiosPeriodosPagadosQueVolvieron = { unidades: n5u, condominios: n5c, ejemplos: ej5 };

  // ── 6) Locales que faltan en el módulo: hijos vivos del condominio en SIGYR (y nietos de sus N/A)
  sql['06_locales_faltantes'] = [];
  const hijosDe = new Map<string, string[]>();
  S.forEach((v, code) => { if (!v.borrado && v.padre) { if (!hijosDe.has(v.padre)) hijosDe.set(v.padre, []); hijosDe.get(v.padre)!.push(code); } });
  const enCondo = new Set(unis.map(u => `${u.condominio_id}|${u.inmueble}`));
  let n6 = 0, n6n = 0; const n6porCondo: Record<string, number> = {};
  const insertar = (cd: any, code: string, padreCode: string | null, grupo: boolean) => {
    const s = S.get(code)!; const r = inmMap.get(code);
    const act = s.act || r?.actividad_principal || '';
    const res_ = /RESIDENC|APARTAMENTO|CASA|QUINTA|TOWN|ANEXO|ZONA [A-Z]/i.test(act);
    const fo = grupo || res_ ? 'NULL' : (foOrd(act) > 0 ? String(r2(foOrd(act))) : 'NULL');
    const padre = padreCode ? `(SELECT id FROM condominio_unidades WHERE condominio_id='${cd.id}' AND inmueble=${q(padreCode)} LIMIT 1)` : 'NULL';
    sql['06_locales_faltantes'].push(`INSERT INTO condominio_unidades (condominio_id, inmueble, numero, identidad, propietario, actividad, tarifa_mmv, estado, es_grupo, padre_unidad_id, aseo_pendiente_desde, multa_exonerada_hasta) SELECT '${cd.id}', ${q(code)}, ${q(malo(s.casa) ? null : s.casa)}, ${q(r?.identidad)}, ${q(r?.contribuyente)}, ${q(grupo ? 'N/A' : act)}, ${fo}, 'Activa', ${grupo}, ${padre}, ${q(cd.aseo_pendiente_desde || '2026-09-01')}, ${q(cd.aseo_pendiente_desde || '2026-09-01')} WHERE NOT EXISTS (SELECT 1 FROM condominio_unidades WHERE condominio_id='${cd.id}' AND inmueble=${q(code)});`);
  };
  for (const cd of condos) {
    if (cd.estado && cd.estado !== 'Activo') continue;
    for (const h of hijosDe.get(cd.codigo) || []) {
      const nietos = hijosDe.get(h) || [];
      const grupo = nietos.length > 0 && esNA(S.get(h)?.act || inmMap.get(h)?.actividad_principal || '');
      if (!enCondo.has(`${cd.id}|${h}`)) { insertar(cd, h, null, grupo); n6++; n6porCondo[cd.codigo] = (n6porCondo[cd.codigo] || 0) + 1; }
      if (grupo) {
        // Aplanar N/A anidados: el N/A contenedor no se cobra, sus actividades cuelgan del grupo
        const hojas = (c: string, d = 0): string[] => {
          const sub = hijosDe.get(c) || [];
          return sub.length && d < 5 && esNA(S.get(c)?.act || inmMap.get(c)?.actividad_principal || '') ? sub.flatMap(x => hojas(x, d + 1)) : [c];
        };
        for (const n of nietos.flatMap(x => hojas(x))) if (!enCondo.has(`${cd.id}|${n}`)) { insertar(cd, n, h, false); n6n++; n6porCondo[cd.codigo] = (n6porCondo[cd.codigo] || 0) + 1; }
      }
    }
  }
  res.localesFaltantesEnModulo = { hijos: n6, nietos: n6n, condominios: Object.keys(n6porCondo).length, top: Object.entries(n6porCondo).sort((a, b) => b[1] - a[1]).slice(0, 10) };

  // ── Escribir
  fs.mkdirSync(OUT, { recursive: true });
  const CH = 4000;
  for (const [k, lines] of Object.entries(sql)) {
    for (let i = 0, part = 1; i < Math.max(lines.length, 1); i += CH, part++) {
      const chunk = lines.slice(i, i + CH);
      if (!chunk.length) continue;
      const tabla = k.startsWith('01') || k.startsWith('03') ? 'inmuebles + condominio_unidades' : k.startsWith('02') ? 'inmuebles + condominio_unidades' : 'inmuebles';
      fs.writeFileSync(`${OUT}/${k}_parte${part}.sql`, [`-- ${k} parte ${part} (${chunk.length} cambios) — generado ${new Date().toISOString()}`, `-- Tablas: ${tabla}. Ejecutar DESPUÉS de 00_respaldo.sql`, 'BEGIN;', ...chunk, 'COMMIT;'].join('\n'));
    }
  }
  fs.writeFileSync(`${OUT}/resumen.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
})();
