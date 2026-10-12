// Genera el PDF comparativo del Sambil y el SQL para corregir el condominio en Supabase.
// npx tsx scripts/saneamiento/pdf_sql_sambil.ts
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/sambil';
const OUT = '/Users/davidzara/Documents/naguanagua_zero';

(async () => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const { logos } = await import('../../src/lib/logosBase64');
  const c = JSON.parse(fs.readFileSync(`${SCR}/comparativo.json`, 'utf8'));
  const a = JSON.parse(fs.readFileSync(`${SCR}/analisis.json`, 'utf8'));
  const tree: any[] = JSON.parse(fs.readFileSync(`${SCR}/sigyr_tree.json`, 'utf8'));
  const K: number = c.K, tasa: number = c.tasa;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const f2 = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f3 = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const filas: any[] = c.filas;
  const condo = a.condo;

  // ── Escenarios ──
  const foViejo = r2(c.totales.viejoBase / K * 100) / 100;
  const terreno = filas.find(f => f.viejoTotal === 0 && f.nuevoTotal > 0);
  const foCorrecto = r2(filas.filter(f => f !== terreno).reduce((s, f) => s + f.nuevoFO, 0) * 100) / 100;
  const esc = (fo: number, agente: boolean) => {
    const base = r2(fo * K), iva = r2(base * 0.16), ret = agente ? r2(iva * 0.75) : 0;
    return { fo, base, iva, total: r2(base + iva), ret, neto: r2(base + iva - ret) };
  };
  const E = {
    viejo: { fo: foViejo, base: c.totales.viejoBase, iva: c.totales.viejoIva, total: c.totales.viejoTotal, ret: r2(c.totales.viejoIva * 0.75), neto: r2(c.totales.viejoTotal - c.totales.viejoIva * 0.75) },
    nuevoTarifas: esc(foCorrecto, true),
    moduloHoy: esc(Number(condo.tarifa_mmv), true),
    moduloSQL: esc(foCorrecto, true),
  };

  // ── PDF ──
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297;
  try { doc.addImage(logos.iamec, 'PNG', 10, 4, 26, 14); } catch { /* sin logo */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('COMPARATIVO ESTADO DE CUENTA - C.C. SAMBIL VALENCIA (URB016119)', W / 2, 13, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Propietario: ${condo.nombre} · RIF ${condo.identidad} · Agente de retención: SÍ · Período: 09/2026 (1 mes)`, W / 2, 19, { align: 'center' });
  doc.text(`Tasa Euro BCV usada (la misma del Excel del sistema viejo): Bs ${f2(tasa)} · UCD = Euro × 57 = Bs ${f2(tasa * 57)} · Comercial: F.O. × 57 × Tasa × 0,128`, W / 2, 24, { align: 'center' });

  autoTable(doc, {
    startY: 29,
    head: [['CONCEPTO', 'SISTEMA VIEJO (SIGYR)', 'SISTEMA NUEVO - TARIFAS ORDENANZA (N/A = suma de actividades)', 'MÓDULO CONDOMINIO HOY (tarifa fija)', 'MÓDULO TRAS APLICAR EL SQL']],
    body: [
      ['F.O. total (unidades tributarias)', f3(E.viejo.fo), f3(E.nuevoTarifas.fo), f3(E.moduloHoy.fo), f3(E.moduloSQL.fo)],
      ['Servicio de aseo (base)', f2(E.viejo.base), f2(E.nuevoTarifas.base), f2(E.moduloHoy.base), f2(E.moduloSQL.base)],
      ['IVA 16%', f2(E.viejo.iva), f2(E.nuevoTarifas.iva), f2(E.moduloHoy.iva), f2(E.moduloSQL.iva)],
      ['TOTAL con IVA', f2(E.viejo.total), f2(E.nuevoTarifas.total), f2(E.moduloHoy.total), f2(E.moduloSQL.total)],
      ['IVA retenido 75% (agente de retención)', `- ${f2(E.viejo.ret)}`, `- ${f2(E.nuevoTarifas.ret)}`, `- ${f2(E.moduloHoy.ret)}`, `- ${f2(E.moduloSQL.ret)}`],
      ['NETO A PAGAR', f2(E.viejo.neto), f2(E.nuevoTarifas.neto), f2(E.moduloHoy.neto), f2(E.moduloSQL.neto)],
      ['Diferencia del total vs sistema viejo', '—', f2(E.nuevoTarifas.total - E.viejo.total), f2(E.moduloHoy.total - E.viejo.total), f2(E.moduloSQL.total - E.viejo.total)],
    ],
    theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [22, 101, 52], fontSize: 7.5, halign: 'center' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d: any) => { if (d.section === 'body' && (d.row.index === 3 || d.row.index === 5)) d.cell.styles.fontStyle = 'bold'; },
  });
  let y = (doc as any).lastAutoTable.finalY + 4;
  doc.setFontSize(8);
  const notas = [
    `• El sistema viejo cobra ${filas.length} unidades (hijos) del Sambil. ${filas.filter(f => f.esNA).length} son N/A: su monto es la SUMA de sus actividades (nietos, ${filas.filter(f => f.esNA).reduce((s, f) => s + f.nietos.length, 0)} en total). Las actividades NO se cobran aparte: no hay doble cobro.`,
    `• Con las tarifas de la ordenanza del sistema nuevo, ${filas.length - 1} de ${filas.length} unidades dan EXACTAMENTE el mismo monto que el sistema viejo (diferencias de céntimos por redondeo). Los 23 N/A cuadran exacto con la suma de sus nietos.`,
    `• Única diferencia: ${terreno?.codigo} (${terreno?.actividad}, local ${terreno?.numero}) el sistema viejo lo cobra en 0; la ordenanza lo llevaría a local desocupado (1,98 F.O. = Bs ${f2(terreno?.nuevoTotal)}). Se deja en 0 como el sistema viejo.`,
    `• El módulo de condominios hoy tiene una tarifa fija de ${f3(Number(condo.tarifa_mmv))} F.O.; la suma correcta es ${f3(foCorrecto)} F.O.: hoy se cobra Bs ${f2(E.viejo.total - E.moduloHoy.total)} menos al mes (con IVA). El SQL la corrige.`,
    `• En SIGYR hay 2 locales desocupados vivos que no salen en el Excel viejo: ${c.faltanEnViejo.map((x: any) => `${x.codigo} (${x.numero})`).join(' y ')}. Sus números están dentro de locales N/A / unidos (F-17 en "F-17, F-22, F-24 y F-26"; F-50 en "F-50 y F-51"): no se cobran.`,
  ];
  notas.forEach(t => { const s = doc.splitTextToSize(t, W - 24); doc.text(s, 12, y); y += s.length * 3.6; });

  // Detalle por hijo (+ nietos)
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('DETALLE POR UNIDAD (HIJOS DEL SAMBIL) Y ACTIVIDADES DE CADA N/A (NIETOS)', W / 2, 12, { align: 'center' });
  const body: any[] = [];
  const ord = [...filas].sort((x, z) => String(x.numero).localeCompare(String(z.numero), 'es', { numeric: true }));
  ord.forEach((f, i) => {
    body.push([
      i + 1, f.codigo, f.numero, String(f.nombre).slice(0, 34), f.esNA ? `N/A (${f.nietos.length} actividades)` : String(f.actividad).slice(0, 44),
      f3(f.nuevoFO), f2(f.viejoTotal), f2(f === terreno ? 0 : f.nuevoTotal), f2(f === terreno ? 0 : f.dif), f.estadoModulo,
    ]);
    if (f.esNA) {
      f.nietos.forEach((n: any) => body.push([
        '', { content: `   > ${n.codigo}`, styles: { textColor: [71, 85, 105] } }, n.numero || '', '', { content: String(n.actividad).slice(0, 44), styles: { textColor: [71, 85, 105], fontStyle: 'italic' } },
        f3(n.fo), '', { content: f2(n.baseBs * 1.16), styles: { textColor: [71, 85, 105] } }, '', n.enModulo === 'NO' ? 'NO ESTÁ' : `${n.enModulo}${n.ligado ? '' : ' (sin ligar)'}`,
      ]));
    }
  });
  autoTable(doc, {
    startY: 16,
    head: [['#', 'Código', 'Local', 'Razón social', 'Actividad', 'F.O.', 'Viejo (Bs c/IVA)', 'Nuevo (Bs c/IVA)', 'Dif.', 'En módulo hoy']],
    body,
    foot: [['', '', '', '', 'TOTALES', f3(foCorrecto), f2(c.totales.viejoTotal), f2(E.nuevoTarifas.total), f2(E.nuevoTarifas.total - c.totales.viejoTotal), '']],
    showFoot: 'lastPage', theme: 'grid', styles: { fontSize: 6.6, cellPadding: 0.9 }, headStyles: { fillColor: [22, 101, 52], fontSize: 7 }, footStyles: { fillColor: [231, 230, 230], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 20 }, 2: { cellWidth: 26 }, 3: { cellWidth: 52 }, 4: { cellWidth: 70 }, 5: { halign: 'right', cellWidth: 14 }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', cellWidth: 16 }, 9: { cellWidth: 24 } },
    didParseCell: (d: any) => { if (d.section === 'body' && String(d.row.raw?.[4] || '').startsWith('N/A')) d.cell.styles.fillColor = [254, 249, 195]; },
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(7); doc.text(`Página ${p} de ${pages} · Generado ${new Date().toLocaleString('es-VE')}`, W - 12, 205, { align: 'right' }); }
  fs.writeFileSync(`${OUT}/Comparativo_Sambil_URB016119.pdf`, Buffer.from(doc.output('arraybuffer')));

  // ── SQL ──
  const q = (s: any) => s == null || s === '' ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
  const vivos = tree.filter(t => !t.deleted);
  const cobrables = new Set(filas.map(f => f.codigo));
  const naSet = new Set(filas.filter(f => f.esNA).map(f => f.codigo));
  const nietos = filas.filter(f => f.esNA).flatMap(f => f.nietos.map((n: any) => ({ ...n, padre: f.codigo })));
  const enArbol = new Set([...cobrables, ...nietos.map(n => n.codigo)]);
  const fueraArbol = a.unidades.filter((u: any) => u.estado !== 'Eliminada' && !enArbol.has(u.inmueble)).map((u: any) => u.inmueble);
  const inms = a.inmuebles || {};
  const CID = condo.id;
  const L: string[] = [];
  L.push('-- ════════════════════════════════════════════════════════════════════════');
  L.push('-- CORRECCIÓN C.C. SAMBIL (URB016119) — generado ' + new Date().toISOString());
  L.push('-- Fuente: estado de cuenta del sistema viejo (SIGYR) + árbol SIGYR (hijos y nietos vivos).');
  L.push(`-- Resultado esperado: tarifa del condominio ${foCorrecto} F.O. = Bs ${f2(E.moduloSQL.total)} con IVA a tasa ${f2(tasa)}.`);
  L.push('-- Ejecutar completo en el SQL Editor de Supabase. Crea respaldos antes de tocar nada.');
  L.push('-- ════════════════════════════════════════════════════════════════════════');
  L.push('BEGIN;');
  L.push('');
  L.push('-- 0) RESPALDOS');
  L.push(`CREATE TABLE IF NOT EXISTS respaldo_sambil_20261012_condominio AS SELECT * FROM condominios WHERE codigo = 'URB016119';`);
  L.push(`CREATE TABLE IF NOT EXISTS respaldo_sambil_20261012_unidades AS SELECT * FROM condominio_unidades WHERE condominio_id = '${CID}';`);
  const todosCod = [...enArbol];
  L.push(`CREATE TABLE IF NOT EXISTS respaldo_sambil_20261012_inmuebles AS SELECT * FROM inmuebles WHERE inmueble IN (${todosCod.map(q).join(',')});`);
  L.push('');
  L.push(`-- 1) TARIFA DEL CONDOMINIO = suma de las ${filas.length - 1} unidades que cobran (N/A = suma de sus actividades; terreno ${terreno?.codigo} en 0 como SIGYR)`);
  L.push(`UPDATE condominios SET tarifa_mmv = ${foCorrecto}, cant_declarada = ${filas.length}, updated_at = now() WHERE codigo = 'URB016119';`);
  L.push('');
  L.push('-- 2) HIJOS (unidades del Sambil): activos, con su local, actividad y F.O. oficial. Los N/A quedan como GRUPO (no cobran: cobran sus actividades).');
  for (const f of filas) {
    const inm = inms[f.codigo] || {};
    const fo = f === terreno ? 0 : f.nuevoFO;
    const act = f.esNA ? 'N/A' : f.actividad;
    const ident = inm.identidad || f.rif; const prop = inm.contribuyente || f.nombre;
    L.push(`UPDATE condominio_unidades SET estado='Activa', numero=${q(f.numero)}, actividad=${q(act)}, tarifa_mmv=${fo}, es_grupo=${f.esNA}, padre_unidad_id=NULL, updated_at=now() WHERE condominio_id='${CID}' AND inmueble=${q(f.codigo)};`);
    L.push(`INSERT INTO condominio_unidades (condominio_id, inmueble, numero, identidad, propietario, actividad, tarifa_mmv, estado, es_grupo, aseo_pendiente_desde, multa_exonerada_hasta) SELECT '${CID}', ${q(f.codigo)}, ${q(f.numero)}, ${q(ident)}, ${q(prop)}, ${q(act)}, ${fo}, 'Activa', ${f.esNA}, '2026-09-01', '2026-09-01' WHERE NOT EXISTS (SELECT 1 FROM condominio_unidades WHERE condominio_id='${CID}' AND inmueble=${q(f.codigo)});`);
  }
  L.push('');
  L.push('-- 3) NIETOS (actividades dentro de cada N/A): ligados a su N/A, con F.O. oficial.');
  for (const n of nietos) {
    const inm = inms[n.codigo] || {};
    const padreF = filas.find(f => f.codigo === n.padre);
    L.push(`UPDATE condominio_unidades SET estado='Activa', numero=${q(n.numero || padreF?.numero)}, actividad=${q(n.actividad)}, tarifa_mmv=${r2(n.fo * 100) / 100}, es_grupo=false, padre_unidad_id=(SELECT id FROM condominio_unidades WHERE condominio_id='${CID}' AND inmueble=${q(n.padre)} LIMIT 1), updated_at=now() WHERE condominio_id='${CID}' AND inmueble=${q(n.codigo)};`);
    L.push(`INSERT INTO condominio_unidades (condominio_id, inmueble, numero, identidad, propietario, actividad, tarifa_mmv, estado, es_grupo, padre_unidad_id, aseo_pendiente_desde, multa_exonerada_hasta) SELECT '${CID}', ${q(n.codigo)}, ${q(n.numero || padreF?.numero)}, ${q(inm.identidad || padreF?.rif)}, ${q(inm.contribuyente || padreF?.nombre)}, ${q(n.actividad)}, ${r2(n.fo * 100) / 100}, 'Activa', false, (SELECT id FROM condominio_unidades WHERE condominio_id='${CID}' AND inmueble=${q(n.padre)} LIMIT 1), '2026-09-01', '2026-09-01' WHERE NOT EXISTS (SELECT 1 FROM condominio_unidades WHERE condominio_id='${CID}' AND inmueble=${q(n.codigo)});`);
  }
  L.push('');
  L.push(`-- 4) UNIDADES QUE NO SON DEL SAMBIL EN SIGYR (${fueraArbol.length}): borradas en SIGYR, de otros padres o agregadas por dirección. Se sacan del condominio (el inmueble NO se borra).`);
  if (fueraArbol.length) L.push(`UPDATE condominio_unidades SET estado='Eliminada', updated_at=now() WHERE condominio_id='${CID}' AND inmueble IN (${fueraArbol.map(q).join(',')});`);
  L.push(`-- Locales desocupados de SIGYR cuyo número está dentro de un local N/A / unido (no se cobran):`);
  L.push(`UPDATE condominio_unidades SET estado='Eliminada', updated_at=now() WHERE condominio_id='${CID}' AND inmueble IN (${c.faltanEnViejo.map((x: any) => q(x.codigo)).join(',')});`);
  L.push('');
  L.push('-- 5) INMUEBLES: F.O. oficial guardado (hoy muchos tienen la tarifa en UCD del SIGYR, ej. restaurante 4,48 en vez de 32,73) y N/A como padre de sus actividades.');
  for (const f of filas) {
    if (f.esNA || f === terreno) continue;
    const inm = inms[f.codigo];
    if (inm && Math.abs((parseFloat(inm.mmv_mes) || 0) - f.nuevoFO) > 0.01) L.push(`UPDATE inmuebles SET mmv_mes=${f.nuevoFO} WHERE inmueble=${q(f.codigo)};`);
  }
  for (const n of nietos) {
    L.push(`UPDATE inmuebles SET mmv_mes=${r2(n.fo * 100) / 100}, padre_id=${q(n.padre)} WHERE inmueble=${q(n.codigo)};`);
  }
  L.push('');
  L.push('-- 6) VERIFICACIÓN (debe dar ' + foCorrecto + ' F.O. en unidades que cobran)');
  L.push(`SELECT round(sum(tarifa_mmv)::numeric, 2) AS fo_unidades_cobran, count(*) AS unidades FROM condominio_unidades WHERE condominio_id='${CID}' AND estado='Activa' AND padre_unidad_id IS NULL AND coalesce(es_grupo,false)=false;`);
  L.push(`SELECT round(sum(tarifa_mmv)::numeric, 2) AS fo_nietos, count(*) AS nietos FROM condominio_unidades WHERE condominio_id='${CID}' AND estado='Activa' AND padre_unidad_id IS NOT NULL;`);
  L.push('');
  L.push('COMMIT;');
  L.push('-- Para deshacer: restaurar desde las tablas respaldo_sambil_20261012_*');
  fs.writeFileSync(`${OUT}/SQL_Sambil_URB016119.sql`, L.join('\n'));
  console.log({ E, foCorrecto, fueraArbol: fueraArbol.length, nietos: nietos.length, sqlLineas: L.length });
})();
