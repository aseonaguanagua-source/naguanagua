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

export async function exportarExcelEstadoCuenta(c: any, e: EstadoCuenta, cajero: string, moneda: 'BS' | 'UCD' = 'BS') {
  const ExcelJS = (await import('exceljs')).default;
  const { logos } = await import('@/lib/logosBase64');
  const ucd = valorUCD(e.tasa);
  const enUCD = moneda === 'UCD' && ucd > 0;
  const conv = (bs: number) => {
    const v = Number(bs) || 0;
    return enUCD ? Math.round((v / ucd) * 10000) / 10000 : Math.round(v * 100) / 100;
  };
  const numFmt = enUCD ? '#,##0.0000' : '#,##0.00';
  const mon = enUCD ? 'UCD' : 'Bs';

  const wb = new ExcelJS.Workbook();
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
      const al = wb.addImage({ base64: logos.alcaldia, extension: 'jpeg' });
      ws.addImage(al, { tl: { col: 0, row: 0 }, ext: { width: 80, height: 80 } });
      const ia = wb.addImage({ base64: logos.iamec, extension: 'jpeg' });
      ws.addImage(ia, { tl: { col: 2.4, row: 0 }, ext: { width: 80, height: 80 } });
    } catch { /* sin logos */ }
  };
  const encabezado = (ws: any, titulo: string, ancho: number) => {
    logosEn(ws);
    ws.mergeCells(1, 4, 1, ancho); ws.getCell(1, 4).value = 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC)';
    ws.getCell(1, 4).font = { bold: true, size: 12 };
    ws.mergeCells(2, 4, 2, ancho); ws.getCell(2, 4).value = titulo + (enUCD ? ' (EXPRESADO EN UCD)' : ' (EXPRESADO EN BOLÍVARES)');
    ws.getCell(2, 4).font = { bold: true, size: 11 };
    ws.mergeCells(3, 4, 3, ancho); ws.getCell(3, 4).value = `CONDOMINIO: ${c.nombre || ''} (${c.codigo || ''})${c.identidad ? ' · RIF ' + c.identidad : ''}`;
    ws.getCell(3, 4).font = { bold: true, size: 10 };
    ws.mergeCells(4, 4, 4, ancho);
    ws.getCell(4, 4).value = `Fecha: ${new Date().toLocaleString('es-VE')} · Tasa Euro BCV: ${e.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} · Valor UCD (Euro × 57): ${ucd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Emitido por: ${cajero}`;
    ws.getCell(4, 4).font = { size: 9 };
  };

  const renglones = e.renglones || [];
  const cobran = renglones.filter(r => !r.esGrupo);

  // ── Hoja 1: Resumen ──
  const ws1 = wb.addWorksheet('Resumen');
  ws1.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 46 }, { width: 22 }] as any;
  encabezado(ws1, 'ESTADO DE CUENTA DE CONDOMINIO - RESUMEN', 5);
  const multasManuales = renglones.reduce((s, r) => s + (r.multasManualesBs || 0), 0);
  const multaExtra = renglones.reduce((s, r) => s + (r.multaExtraBs || 0), 0);
  const filasRes: [string, number | string][] = [
    ['Unidades registradas', renglones.filter(r => r.clave !== '__SIN_REGISTRAR__').length],
    ['Unidades con deuda', e.totales.unidadesConDeuda],
    ['Meses máximos adeudados', e.totales.mesesMax],
    [`Servicio de aseo (${mon})`, conv(e.totales.baseBs)],
    [`Multas por mora (${mon})`, conv(e.totales.multaBs)],
    [`IVA 16% (${mon})`, conv(e.totales.ivaBs)],
    ...(e.totales.retencionBs ? [[`IVA retenido 75% (${mon})`, -conv(e.totales.retencionBs)] as [string, number]] : []),
    [`TOTAL A PAGAR (${mon})`, conv(e.totales.totalBs)],
  ];
  let f = 7;
  cabecera(ws1, f++, ['', '', '', 'CONCEPTO', mon === 'UCD' ? 'MONTO (UCD)' : 'MONTO (Bs)']);
  filasRes.forEach(([k, v]) => {
    const r = ws1.getRow(f++);
    r.getCell(4).value = k; r.getCell(4).border = borde;
    r.getCell(5).value = v; r.getCell(5).border = borde;
    if (typeof v === 'number' && /\((Bs|UCD)\)/.test(k)) r.getCell(5).numFmt = numFmt;
    if (/TOTAL/.test(k)) { r.getCell(4).font = { bold: true }; r.getCell(5).font = { bold: true }; }
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
      const per = r.periodos?.[i] || `#${m.n}`;
      if (!porPeriodo.has(per)) porPeriodo.set(per, { unidades: 0, base: 0, multa: 0, iva: 0, total: 0 });
      const p = porPeriodo.get(per)!;
      p.unidades++; p.base += m.baseBs; p.multa += m.multaBs; p.iva += m.ivaBs; p.total += m.baseBs + m.multaBs + m.ivaBs;
    });
  });
  cabecera(ws2, 7, ['', '', '', 'PERÍODO', 'UNIDADES', `SERV. ASEO (${mon})`, `MULTA (${mon})`, `IVA (${mon})`, `TOTAL (${mon})`]);
  ws2.getColumn(9).width = 18;
  let f2 = 8;
  const tot2 = { base: 0, multa: 0, iva: 0, total: 0 };
  [...porPeriodo.keys()].sort().forEach(per => {
    const p = porPeriodo.get(per)!;
    const r = ws2.getRow(f2++);
    const vals = [fmtPeriodo(per), p.unidades, conv(p.base), conv(p.multa), conv(p.iva), conv(p.total)];
    vals.forEach((v, i) => { const cell = r.getCell(i + 4); cell.value = v; cell.border = borde; if (i >= 2) cell.numFmt = numFmt; });
    tot2.base += p.base; tot2.multa += p.multa; tot2.iva += p.iva; tot2.total += p.total;
  });
  if (multasManuales + multaExtra > 0) {
    const r = ws2.getRow(f2++);
    r.getCell(4).value = 'Multas adicionales / manuales'; r.getCell(7).value = conv(multasManuales + multaExtra); r.getCell(9).value = conv(multasManuales + multaExtra);
    [4, 5, 6, 7, 8, 9].forEach(k => { r.getCell(k).border = borde; if (k >= 6) r.getCell(k).numFmt = numFmt; });
    tot2.multa += multasManuales + multaExtra; tot2.total += multasManuales + multaExtra;
  }
  const rt2 = ws2.getRow(f2);
  ['TOTAL', '', conv(tot2.base), conv(tot2.multa), conv(tot2.iva), conv(tot2.total)].forEach((v, i) => {
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
      const parent = grupo.find(g => g.esGrupo || /^N\/?A$/i.test(String(g.actividad || ''))) || grupo[0];
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
  for (const r of raices) {
    const hijos = hijosPorPadre.get(r.clave) || [];
    const sinReg = r.clave === '__SIN_REGISTRAR__';
    const cleanAct = cleanClasificacionActividad(r.actividad);

    let actividadStr = cleanAct || 'N/A';
    let mensualBs = r.mensualBs * (r.residencial ? 1 : 1.16);
    let mesesAseo = r.deuda.meses;
    let mesesMulta = r.multaMeses;
    let baseBs = r.deuda.baseBs;
    let multaBs = r.deuda.multaBs + r.multaExtraBs;
    let ivaBs = r.deuda.ivaBs;
    let manualesBs = r.multasManualesBs || 0;
    let totalBs = r.totalBs;

    if (hijos.length > 0) {
      // Consolidar la suma completa de todas las sub-actividades en las columnas de la unidad/local
      const actsHijos = [...new Set(hijos.map(h => cleanClasificacionActividad(h.actividad)).filter(Boolean))];
      actividadStr = actsHijos.length > 0 ? actsHijos.join(' / ') : (cleanAct || 'Múltiples Actividades');

      mensualBs += hijos.reduce((acc, h) => acc + (h.mensualBs * (h.residencial ? 1 : 1.16)), 0);
      mesesAseo = Math.max(mesesAseo, ...hijos.map(h => h.deuda.meses));
      mesesMulta = Math.max(mesesMulta, ...hijos.map(h => h.multaMeses));
      baseBs += hijos.reduce((acc, h) => acc + h.deuda.baseBs, 0);
      multaBs += hijos.reduce((acc, h) => acc + (h.deuda.multaBs + h.multaExtraBs), 0);
      ivaBs += hijos.reduce((acc, h) => acc + h.deuda.ivaBs, 0);
      manualesBs += hijos.reduce((acc, h) => acc + (h.multasManualesBs || 0), 0);
      totalBs += hijos.reduce((acc, h) => acc + h.totalBs, 0);
    }

    const row = ws3.getRow(f3++);
    const vals: any[] = [
      sinReg ? 'Declaradas sin registrar' : (r.inmueble || r.clave),
      r.numero || (hijos.map(h => h.numero).find(Boolean) || ''),
      r.propietario || '',
      r.identidad || '',
      actividadStr,
      r.estado,
      conv(mensualBs),
      mesesAseo,
      mesesMulta,
      conv(baseBs),
      conv(multaBs),
      conv(ivaBs),
      conv(manualesBs),
      conv(totalBs),
    ];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = borde;
      cell.font = { size: 9, bold: hijos.length > 0 };
      if ([6, 9, 10, 11, 12, 13].includes(i)) cell.numFmt = numFmt;
    });
  }
  const rt3 = ws3.getRow(f3);
  rt3.getCell(1).value = 'TOTALES';
  const tv: Record<number, number> = { 10: e.totales.baseBs, 11: e.totales.multaBs, 12: e.totales.ivaBs, 14: e.totales.totalBs };
  for (let k = 1; k <= 14; k++) {
    const cell = rt3.getCell(k);
    if (tv[k] !== undefined) { cell.value = conv(tv[k]); cell.numFmt = numFmt; }
    cell.font = { bold: true }; cell.border = borde;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
  }
  ws3.views = [{ state: 'frozen', ySplit: 7 }];

  // ── Hoja 4: Desglose de actividades (N/A) si existen grupos ──
  if (childClaves.size > 0) {
    const ws4 = wb.addWorksheet('Desglose actividades N/A');
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
        const vals: any[] = [
          numLocal,
          padre?.inmueble || padre?.clave || '—',
          h.inmueble || h.clave,
          h.propietario || padre?.propietario || '',
          h.identidad || padre?.identidad || '',
          cleanClasificacionActividad(h.actividad) || 'Actividad Comercial',
          h.estado,
          conv(h.mensualBs * (h.residencial ? 1 : 1.16)),
          h.deuda.meses,
          h.multaMeses,
          conv(h.deuda.baseBs),
          conv(h.deuda.multaBs + h.multaExtraBs),
          conv(h.deuda.ivaBs),
          conv(h.totalBs)
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
  saveAs(blob, `Estado_Cuenta_${c.codigo}${enUCD ? '_UCD' : ''}.xlsx`);
}
