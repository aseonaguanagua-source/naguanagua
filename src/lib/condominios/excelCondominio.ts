import { saveAs } from 'file-saver';
import { EstadoCuenta } from './servicio';
import { valorUCD } from '@/lib/tasaHistorica';
import { cleanClasificacionActividad } from '@/lib/calculos';

/**
 * Estado de cuenta de condominio en Excel (modelos "ESTADO DE CUENTA DE CONDOMINIOS.xls" y "ESTADO DE CUENTA UCD.xls").
 * Hojas: 1) Resumen + glosario  2) Deuda consolidada mes a mes  3) Detalle por unidad.
 * moneda 'UCD' = montos ÷ (tasa Euro × 57) — sólo para administradores.
 * Los grupos N/A no suman: su tarifa es la suma de sus actividades (que vienen como renglones propios).
 */
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { const [y, m] = String(p || '').split('-'); return m ? `${MESES[parseInt(m) - 1]} ${y}` : p; };

export async function exportarExcelEstadoCuenta(c: any, e: EstadoCuenta, cajero: string, moneda: 'BS' | 'EUR' | 'UCD' = 'BS') {
  const exceljsModule = await import('exceljs');
  const ExcelJS = (exceljsModule as any).default || exceljsModule;
  const WorkbookClass = ExcelJS.Workbook || (exceljsModule as any).Workbook;
  if (!WorkbookClass) {
    throw new Error('No se pudo inicializar el generador de Excel (ExcelJS).');
  }

  const { logos } = await import('@/lib/logosBase64');
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
  const tasaNum = r2(Number(e?.tasa) || 0);
  const ucd = valorUCD(tasaNum);
  const enUCD = moneda === 'UCD' && ucd > 0;
  const enEUR = moneda === 'EUR' && tasaNum > 0;
  const rnd = (n: number) => enUCD ? r4(n) : r2(n);
  const conv = (bs: number) => {
    const v = Number(bs) || 0;
    if (enUCD) return r4(v / ucd);
    if (enEUR) return r2(v / tasaNum);
    return r2(v);
  };
  const convMensualConIva = (mensualBaseBs: number, residencial?: boolean) => {
    const b = conv(mensualBaseBs);
    const iv = residencial ? 0 : (enEUR || enUCD ? rnd(b * 0.16) : conv(r2((Number(mensualBaseBs) || 0) * 0.16)));
    return rnd(b + iv);
  };
  const tasaStr = tasaNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numFmt = enUCD ? '#,##0.0000' : (enEUR ? '€ #,##0.00' : '#,##0.00');
  const bsFmt = '"Bs" #,##0.00';
  const mon = enUCD ? 'UCD' : (enEUR ? '€' : 'Bs');

  const wb = new WorkbookClass();
  const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as any;
  const cabecera = (ws: any, fila: number, valores: string[]) => {
    const r = ws.getRow(fila);
    valores.forEach((v, i) => {
      if (v === '') return;
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = borde;
    });
    r.height = 32;
  };
  const logosEn = (ws: any) => {
    try {
      if (logos.alcaldia) {
        const al = wb.addImage({ base64: logos.alcaldia, extension: 'jpeg' });
        ws.addImage(al, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 80 } });
      }
      if (logos.iamec) {
        const ia = wb.addImage({ base64: logos.iamec, extension: 'jpeg' });
        ws.addImage(ia, { tl: { col: 2.4, row: 0 }, ext: { width: 80, height: 80 } });
      }
    } catch { /* sin logos */ }
  };
  const encabezado = (ws: any, titulo: string, ancho: number) => {
    logosEn(ws);
    ws.mergeCells(1, 4, 1, ancho); ws.getCell(1, 4).value = 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC)';
    ws.getCell(1, 4).font = { bold: true, size: 12 };
    const sufijoMon = enUCD ? ' (EXPRESADO EN UCD)' : (enEUR ? ' (EXPRESADO EN EUROS €)' : ' (EXPRESADO EN BOLÍVARES)');
    ws.mergeCells(2, 4, 2, ancho); ws.getCell(2, 4).value = titulo + sufijoMon;
    ws.getCell(2, 4).font = { bold: true, size: 11 };
    ws.mergeCells(3, 4, 3, ancho); ws.getCell(3, 4).value = `CONDOMINIO: ${c?.nombre || ''} (${c?.codigo || ''})${c?.identidad ? ' · RIF ' + c.identidad : ''}`;
    ws.getCell(3, 4).font = { bold: true, size: 10 };
    ws.mergeCells(4, 4, 4, ancho);
    ws.getCell(4, 4).value = `Fecha: ${new Date().toLocaleString('es-VE')} · Tasa Euro BCV: ${tasaStr} · Valor UCD (Euro × 57): ${ucd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Emitido por: ${cajero || 'Administrador'}`;
    ws.getCell(4, 4).font = { size: 9 };
  };

  const renglones = e?.renglones || [];
  const cobran = renglones.filter(r => !r.esGrupo);

  // ── Hoja 1: Resumen ──
  const ws1 = wb.addWorksheet('Resumen');
  ws1.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 46 }, { width: 22 }] as any;
  encabezado(ws1, 'ESTADO DE CUENTA DE CONDOMINIO - RESUMEN', 5);
  const multasManuales = renglones.reduce((s, r) => s + (r.multasManualesBs || 0), 0);
  const multaExtra = renglones.reduce((s, r) => s + (r.multaExtraBs || 0), 0);
  const totales = e?.totales || { baseBs: 0, multaBs: 0, ivaBs: 0, retencionBs: 0, totalBs: 0, mesesMax: 0, unidadesConDeuda: 0 };
  const totalBrutoResumenBs = (totales.baseBs || 0) + (totales.multaBs || 0) + (totales.ivaBs || 0);
  const resBase = conv(totales.baseBs || 0);
  const resMulta = conv(totales.multaBs || 0);
  const resIva = conv(totales.ivaBs || 0);
  const resBruto = rnd(resBase + resMulta + resIva);
  const resRet = conv(totales.retencionBs || 0);
  const resNeto = rnd(resBruto - resRet);
  const filasRes: [string, number | string, string?][] = [
    ['Unidades registradas', renglones.filter(r => r.clave !== '__SIN_REGISTRAR__').length],
    ['Unidades con deuda', totales.unidadesConDeuda || 0],
    ['Meses máximos adeudados', totales.mesesMax || 0],
    [`Servicio de aseo (${mon})`, resBase, numFmt],
    [`Multas por mora (${mon})`, resMulta, numFmt],
    [`IVA 16% (${mon})`, resIva, numFmt],
    ...(totales.retencionBs ? [
      [`Subtotal Bruto (${mon})`, resBruto, numFmt] as [string, number, string],
      [`(-) Retención IVA 75% (${mon})`, -resRet, numFmt] as [string, number, string],
    ] : []),
    [`TOTAL NETO A COBRAR (${mon})`, resNeto, numFmt],
    ...((enEUR || enUCD) ? [
      ['Tasa Euro BCV aplicada (Bs/€)', tasaNum, bsFmt] as [string, number, string],
      ...(totales.retencionBs ? [
        ['Subtotal Bruto en Caja (Bs)', r2(totalBrutoResumenBs), bsFmt] as [string, number, string],
        ['(-) Retención IVA 75% en Caja (Bs)', -r2(totales.retencionBs || 0), bsFmt] as [string, number, string],
      ] : []),
      ['MONTO EXACTO A COBRAR EN CAJA (Bs)', r2(totales.totalBs || 0), bsFmt] as [string, number, string],
    ] : []),
  ];
  let f = 7;
  cabecera(ws1, f++, ['', '', '', 'CONCEPTO', `MONTO (${mon})`]);
  filasRes.forEach(([k, v, fmt]) => {
    const r = ws1.getRow(f++);
    r.getCell(4).value = k; r.getCell(4).border = borde;
    r.getCell(5).value = v; r.getCell(5).border = borde;
    if (typeof v === 'number' && fmt) r.getCell(5).numFmt = fmt;
    if (/TOTAL|MONTO EXACTO/.test(k)) { r.getCell(4).font = { bold: true }; r.getCell(5).font = { bold: true }; }
  });
  f++;
  ws1.getCell(f++, 4).value = 'GLOSARIO';
  ws1.getCell(f - 1, 4).font = { bold: true };
  [
    'Serv. Aseo: tarifa mensual del servicio de aseo urbano (F.O. × 57 × Tasa Euro × FAC/FAR).',
    'Multa: recargo por mora (12% comercial / 10% residencial) por mes vencido; el último mes no lleva multa.',
    'IVA: 16% sobre el servicio de aseo comercial. Residencial exento.',
    'UCD: Unidad de Cuenta Dinámica = tasa oficial Euro BCV × 57.',
    'N/A (grupo): local con varias actividades; su tarifa es la SUMA de sus actividades (no se cobra dos veces).',
    `Multas adicionales / manuales incluidas en el total: ${conv(multasManuales + multaExtra).toLocaleString('es-VE', { minimumFractionDigits: enUCD ? 4 : 2 })} ${mon}.`,
  ].forEach(t => { ws1.mergeCells(f, 4, f, 5); ws1.getCell(f, 4).value = t; ws1.getCell(f, 4).alignment = { wrapText: true }; ws1.getRow(f).height = 28; f++; });

  // ── Hoja 2: Deuda consolidada mes a mes ──
  const ws2 = wb.addWorksheet('Deuda consolidada');
  ws2.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }] as any;
  encabezado(ws2, 'DEUDA CONSOLIDADA MES A MES', 8);
  const porPeriodo = new Map<string, { unidades: number; base: number; multa: number; iva: number; total: number }>();
  cobran.forEach(r => {
    const pm = r.deuda?.porMes || [];
    pm.forEach((m, i) => {
      const per = r.periodos?.[i] || `#${m?.n ?? i + 1}`;
      if (!porPeriodo.has(per)) porPeriodo.set(per, { unidades: 0, base: 0, multa: 0, iva: 0, total: 0 });
      const p = porPeriodo.get(per)!;
      p.unidades++;
      p.base += Number(m?.baseBs) || 0;
      p.multa += Number(m?.multaBs) || 0;
      p.iva += Number(m?.ivaBs) || 0;
      p.total += (Number(m?.baseBs) || 0) + (Number(m?.multaBs) || 0) + (Number(m?.ivaBs) || 0);
    });
  });
  cabecera(ws2, 7, ['', '', '', 'PERÍODO', 'UNIDADES', `SERV. ASEO (${mon})`, `MULTA (${mon})`, `IVA (${mon})`, `TOTAL (${mon})`]);
  ws2.getColumn(9).width = 18;
  let f2 = 8;
  const tot2 = { base: 0, multa: 0, iva: 0, total: 0 };
  [...porPeriodo.keys()].sort().forEach(per => {
    const p = porPeriodo.get(per)!;
    const r = ws2.getRow(f2++);
    const cB = conv(p.base);
    const cM = conv(p.multa);
    const cI = conv(p.iva);
    const cT = rnd(cB + cM + cI);
    const vals = [fmtPeriodo(per), p.unidades, cB, cM, cI, cT];
    vals.forEach((v, i) => { const cell = r.getCell(i + 4); cell.value = v; cell.border = borde; if (i >= 2) cell.numFmt = numFmt; });
    tot2.base = rnd(tot2.base + cB); tot2.multa = rnd(tot2.multa + cM); tot2.iva = rnd(tot2.iva + cI); tot2.total = rnd(tot2.total + cT);
  });
  if (multasManuales + multaExtra > 0) {
    const r = ws2.getRow(f2++);
    const cMExtra = conv(multasManuales + multaExtra);
    r.getCell(4).value = 'Multas adicionales / manuales'; r.getCell(7).value = cMExtra; r.getCell(9).value = cMExtra;
    [4, 5, 6, 7, 8, 9].forEach(k => { r.getCell(k).border = borde; if (k >= 6) r.getCell(k).numFmt = numFmt; });
    tot2.multa = rnd(tot2.multa + cMExtra); tot2.total = rnd(tot2.total + cMExtra);
  }
  const rt2 = ws2.getRow(f2);
  ['TOTAL', '', tot2.base, tot2.multa, tot2.iva, tot2.total].forEach((v, i) => {
    const cell = rt2.getCell(i + 4); cell.value = v; cell.font = { bold: true }; cell.border = borde;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
    if (i >= 2) cell.numFmt = numFmt;
  });

  // ── Mapeo de Jerarquía y Agrupación de N/A ──
  const hijosPorPadre = new Map<string, typeof renglones>();
  const idSet = new Set(renglones.map(r => r.clave));

  // 1. Relacionar hijos con sus padres explícitos
  renglones.forEach(r => {
    if (r.padreId && idSet.has(r.padreId)) {
      if (!hijosPorPadre.has(r.padreId)) hijosPorPadre.set(r.padreId, []);
      hijosPorPadre.get(r.padreId)!.push(r);
    }
  });

  // 2. Agrupar unidades sin padre explícito que comparten mismo número de local y RIF (ej: N/A comerciales)
  const byLocalRif = new Map<string, typeof renglones>();
  renglones.forEach(r => {
    if (!r.padreId || !idSet.has(r.padreId)) {
      const num = String(r.numero || '').trim().toUpperCase();
      const rif = String(r.identidad || '').trim().toUpperCase();
      if (num && rif && num !== 'N/A' && num !== '—') {
        const key = `${rif}__${num}`;
        if (!byLocalRif.has(key)) byLocalRif.set(key, []);
        byLocalRif.get(key)!.push(r);
      }
    }
  });

  byLocalRif.forEach(grupo => {
    if (grupo.length > 1) {
      // Solo agrupar como sub-actividades cuando exista un contenedor explícito (esGrupo o actividad N/A).
      // Si son códigos independientes (ej. URB034333 y URB034337 en Via Veneto con distinta actividad y propio código), se mantienen individuales.
      const parent = grupo.find(g => g.esGrupo || /^N\/?A$/i.test(String(g.actividad || '')));
      if (!parent) return;
      const children = grupo.filter(g => g.clave !== parent.clave);
      if (children.length > 0 && !hijosPorPadre.has(parent.clave)) {
        hijosPorPadre.set(parent.clave, children);
      }
    }
  });

  // Identificar qué renglones son hijos para no duplicarlos como filas raíz en Hoja 3
  const childClaves = new Set<string>();
  hijosPorPadre.forEach(children => {
    children.forEach(c => childClaves.add(c.clave));
  });

  const raices = renglones.filter(r => !childClaves.has(r.clave));

  // ── Hoja 3: Detalle por unidad (Consolidado por Local / N/A agrupados) ──
  const ws3 = wb.addWorksheet('Detalle por unidad');
  ws3.columns = [
    { width: 14 }, { width: 14 }, { width: 34 }, { width: 15 }, { width: 44 }, { width: 12 }, { width: 18 },
    { width: 11 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 14 }, { width: 16 }, { width: 16 },
  ] as any;
  encabezado(ws3, 'DETALLE POR UNIDAD', 14);
  cabecera(ws3, 7, [
    'Código/Unidad', 'Número Local', 'Propietario', 'Cédula/RIF', 'Actividad', 'Estado', `Mensualidad con IVA (${mon})`,
    'Meses Aseo', 'Meses Multa', `Serv. Aseo (${mon})`, `Multa (${mon})`, `IVA (${mon})`, `Multas Manuales (${mon})`, `Total (${mon})`,
  ]);
  let f3 = 8;
  let sumBaseCol = 0;
  let sumMultaCol = 0;
  let sumIvaCol = 0;
  let sumManualesCol = 0;
  let sumTotalCol = 0;
  for (const r of raices) {
    const hijos = hijosPorPadre.get(r.clave) || [];
    const sinReg = r.clave === '__SIN_REGISTRAR__';
    const cleanAct = cleanClasificacionActividad(r.actividad);

    let actividadStr = cleanAct || 'N/A';
    let cMensual = convMensualConIva(Number(r.mensualBs) || 0, r.residencial);
    let mesesAseo = Number(r.deuda?.meses) || 0;
    let mesesMulta = Number(r.multaMeses) || 0;
    let cBase = conv(Number(r.deuda?.baseBs) || 0);
    let cMulta = conv((Number(r.deuda?.multaBs) || 0) + (Number(r.multaExtraBs) || 0));
    let cIva = conv(Number(r.deuda?.ivaBs) || 0);
    let cManuales = conv(Number(r.multasManualesBs) || 0);

    if (hijos.length > 0) {
      // Consolidar la suma completa de todas las sub-actividades en las columnas de la unidad/local
      const actsHijos = [...new Set(hijos.map(h => cleanClasificacionActividad(h.actividad)).filter(Boolean))];
      actividadStr = actsHijos.length > 0 ? actsHijos.join(' / ') : (cleanAct || 'Múltiples Actividades');

      cMensual = rnd(cMensual + hijos.reduce((acc, h) => rnd(acc + convMensualConIva(Number(h.mensualBs) || 0, h.residencial)), 0));
      mesesAseo = Math.max(mesesAseo, ...hijos.map(h => Number(h.deuda?.meses) || 0));
      mesesMulta = Math.max(mesesMulta, ...hijos.map(h => Number(h.multaMeses) || 0));
      cBase = rnd(cBase + hijos.reduce((acc, h) => rnd(acc + conv(Number(h.deuda?.baseBs) || 0)), 0));
      cMulta = rnd(cMulta + hijos.reduce((acc, h) => rnd(acc + conv((Number(h.deuda?.multaBs) || 0) + (Number(h.multaExtraBs) || 0))), 0));
      cIva = rnd(cIva + hijos.reduce((acc, h) => rnd(acc + conv(Number(h.deuda?.ivaBs) || 0)), 0));
      cManuales = rnd(cManuales + hijos.reduce((acc, h) => rnd(acc + conv(Number(h.multasManualesBs) || 0)), 0));
    }

    // Total por fila asegurando cuadre perfecto con la suma de las columnas: Serv. Aseo + Multa + IVA + Multas Manuales
    const cTotalFila = rnd(cBase + cMulta + cIva + cManuales);
    sumBaseCol = rnd(sumBaseCol + cBase);
    sumMultaCol = rnd(sumMultaCol + cMulta);
    sumIvaCol = rnd(sumIvaCol + cIva);
    sumManualesCol = rnd(sumManualesCol + cManuales);
    sumTotalCol = rnd(sumTotalCol + cTotalFila);

    const row = ws3.getRow(f3++);
    const vals: any[] = [
      sinReg ? 'Declaradas sin registrar' : (r.inmueble || r.clave),
      r.numero || (hijos.map(h => h.numero).find(Boolean) || ''),
      r.propietario || '',
      r.identidad || '',
      actividadStr,
      r.estado,
      cMensual,
      mesesAseo,
      mesesMulta,
      cBase,
      cMulta,
      cIva,
      cManuales,
      cTotalFila,
    ];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = borde;
      cell.font = { size: 9, bold: hijos.length > 0 };
      if ([6, 9, 10, 11, 12, 13].includes(i)) cell.numFmt = numFmt;
    });
  }
  const rt3 = ws3.getRow(f3++);
  rt3.getCell(1).value = totales.retencionBs > 0 ? 'SUBTOTAL BRUTO' : 'TOTALES';
  const tvConv: Record<number, number> = {
    10: sumBaseCol,
    11: sumMultaCol,
    12: sumIvaCol,
    13: sumManualesCol,
    14: sumTotalCol
  };
  for (let k = 1; k <= 14; k++) {
    const cell = rt3.getCell(k);
    if (tvConv[k] !== undefined) { cell.value = tvConv[k]; cell.numFmt = numFmt; }
    cell.font = { bold: true }; cell.border = borde;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
  }

  // Si aplica Retención de IVA (75%), mostrar el descuento y el TOTAL NETO A COBRAR igual que en Caja
  const cRetTotal = conv(totales.retencionBs);
  const cNetoTotal = rnd(sumTotalCol - cRetTotal);
  if (totales.retencionBs > 0) {
    const rRet = ws3.getRow(f3++);
    rRet.getCell(1).value = '(-) RETENCIÓN IVA 75%';
    rRet.getCell(12).value = -cRetTotal;
    rRet.getCell(12).numFmt = numFmt;
    rRet.getCell(14).value = -cRetTotal;
    rRet.getCell(14).numFmt = numFmt;
    for (let k = 1; k <= 14; k++) {
      const cell = rRet.getCell(k);
      cell.font = { bold: true, color: { argb: 'FF7C3AED' } };
      cell.border = borde;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
    }

    const rNeto = ws3.getRow(f3++);
    rNeto.getCell(1).value = `TOTAL A COBRAR (${mon})`;
    rNeto.getCell(10).value = sumBaseCol;
    rNeto.getCell(10).numFmt = numFmt;
    rNeto.getCell(11).value = sumMultaCol;
    rNeto.getCell(11).numFmt = numFmt;
    rNeto.getCell(12).value = rnd(sumIvaCol - cRetTotal);
    rNeto.getCell(12).numFmt = numFmt;
    rNeto.getCell(13).value = sumManualesCol;
    rNeto.getCell(13).numFmt = numFmt;
    rNeto.getCell(14).value = cNetoTotal;
    rNeto.getCell(14).numFmt = numFmt;
    for (let k = 1; k <= 14; k++) {
      const cell = rNeto.getCell(k);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.border = borde;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    }
  }

  // Si el reporte fue emitido en Euros o UCD, dejar una fila en blanco y mostrar el equivalente en Bolívares (Total × Tasa)
  if (enEUR || enUCD) {
    f3++; // fila separadora en blanco para no confundir con la columna en Euros al seleccionar
    const factorBs = enUCD ? ucd : tasaNum;
    const rBs = ws3.getRow(f3++);
    rBs.getCell(1).value = `EQUIVALENTE EN CAJA (Bs · × Tasa ${tasaStr})`;
    rBs.getCell(10).value = r2(sumBaseCol * factorBs);
    rBs.getCell(10).numFmt = bsFmt;
    rBs.getCell(11).value = r2((sumMultaCol + sumManualesCol) * factorBs);
    rBs.getCell(11).numFmt = bsFmt;
    rBs.getCell(12).value = r2(rnd(sumIvaCol - cRetTotal) * factorBs);
    rBs.getCell(12).numFmt = bsFmt;
    rBs.getCell(14).value = r2(cNetoTotal * factorBs);
    rBs.getCell(14).numFmt = bsFmt;
    for (let k = 1; k <= 14; k++) {
      const cell = rBs.getCell(k);
      cell.font = { bold: true, color: { argb: 'FF065F46' } };
      cell.border = borde;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    }
  }
  ws3.views = [{ state: 'frozen', ySplit: 7 }];

  // ── Hoja 4: Desglose de actividades si existen grupos ──
  if (childClaves.size > 0) {
    const ws4 = wb.addWorksheet('Desglose sub-actividades');
    ws4.columns = [
      { width: 14 }, { width: 14 }, { width: 16 }, { width: 34 }, { width: 15 }, { width: 40 }, { width: 12 },
      { width: 18 }, { width: 11 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 14 }, { width: 16 }
    ] as any;
    encabezado(ws4, 'DESGLOSE DE SUB-ACTIVIDADES (N/A)', 14);
    cabecera(ws4, 7, [
      'Número Local', 'Inmueble Padre', 'Inmueble Actividad', 'Propietario / Razón Social', 'Cédula/RIF', 'Actividad', 'Estado',
      `Mensualidad con IVA (${mon})`, 'Meses Aseo', 'Meses Multa', `Serv. Aseo (${mon})`, `Multa (${mon})`, `IVA (${mon})`, `Total (${mon})`
    ]);
    let f4 = 8;
    for (const [padreClave, hijos] of hijosPorPadre.entries()) {
      const padre = renglones.find(r => r.clave === padreClave);
      const numLocal = padre?.numero || hijos.map(h => h.numero).find(Boolean) || '';
      for (const h of hijos) {
        const row = ws4.getRow(f4++);
        const hBaseBs = Number(h.deuda?.baseBs) || 0;
        const hMultaBs = (Number(h.deuda?.multaBs) || 0) + (Number(h.multaExtraBs) || 0);
        const hIvaBs = Number(h.deuda?.ivaBs) || 0;
        const chBase = conv(hBaseBs);
        const chMulta = conv(hMultaBs);
        const chIva = conv(hIvaBs);
        const chTotal = rnd(chBase + chMulta + chIva);
        const vals: any[] = [
          numLocal,
          padre?.inmueble || padre?.clave || '—',
          h.inmueble || h.clave,
          h.propietario || padre?.propietario || '',
          h.identidad || padre?.identidad || '',
          cleanClasificacionActividad(h.actividad) || 'Actividad Comercial',
          h.estado,
          convMensualConIva(Number(h.mensualBs) || 0, h.residencial),
          Number(h.deuda?.meses) || 0,
          Number(h.multaMeses) || 0,
          chBase,
          chMulta,
          chIva,
          chTotal
        ];
        vals.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          cell.border = borde;
          cell.font = { size: 9 };
          if ([7, 10, 11, 12, 13].includes(i)) cell.numFmt = numFmt;
        });
      }
    }
    ws4.views = [{ state: 'frozen', ySplit: 7 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const nombreArchivo = `Estado_Cuenta_${c?.codigo || 'Condominio'}${enUCD ? '_UCD' : (enEUR ? '_EUR' : '')}.xlsx`;
  try {
    saveAs(blob, nombreArchivo);
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
