import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import {
  isResidencialInm,
  isTerrenoInm,
  calcularMensualidad,
  isExoneradoTotalMultas,
  getMesesExoneradosCount,
} from '@/lib/calculos';

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function generarPeriodosPorMeses(mesesDeuda: number): string {
  const m = Math.max(1, Math.floor(Number(mesesDeuda) || 1));
  const now = new Date();
  // El último mes facturado al corte actual (noviembre 2026) es octubre 2026 (mes anterior al mes en curso)
  const baseDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const curYear = baseDate.getFullYear();
  const curMonth = baseDate.getMonth(); // 0-11 (9 = OCT)

  const getLabel = (offsetBack: number) => {
    const d = new Date(curYear, curMonth - offsetBack, 1);
    return `${MESES[d.getMonth()]}-${d.getFullYear()}`;
  };

  if (m <= 4) {
    const list: string[] = [];
    for (let i = m - 1; i >= 0; i--) {
      list.push(getLabel(i));
    }
    return list.join(', ');
  }
  return `${getLabel(m - 1)} a ${getLabel(0)} (${m} meses)`;
}

export function construirListaMorosos(
  facturasOrMorosos: any[],
  contribuyentes: any[],
  tcmmv: number
): any[] {
  // Caso 1: Ya viene la lista procesada desde MorososView
  if (
    Array.isArray(facturasOrMorosos) &&
    facturasOrMorosos.length > 0 &&
    typeof facturasOrMorosos[0]?.mesesPendientes === 'number' &&
    typeof facturasOrMorosos[0]?.totalDeudaBs === 'number'
  ) {
    return facturasOrMorosos;
  }

  // Caso 2: Viene de la lista de contribuyentes en memoria (fuente canónica de deuda)
  if (Array.isArray(contribuyentes) && contribuyentes.length > 0) {
    const rowsFromContrib = contribuyentes
      .filter((c: any) => {
        const estado = String(c.Estado || c.estado || 'Activo').trim().toLowerCase();
        if (['eliminado', 'inactivo', 'desactivado'].includes(estado)) return false;
        if (c.isChildNormal || c.padre_id) return false;
        const meses = parseInt(String(c.MesesDeuda ?? c.meses_deuda ?? 0), 10) || 0;
        const deudaBs =
          typeof c.DeudaBs === 'number'
            ? c.DeudaBs
            : parseFloat(String(c.DeudaCongelada || 0)) +
              parseFloat(String(c.MultaBs || 0)) +
              parseFloat(String(c.DeudaMMV || 0)) * 57 * 0.128 * (tcmmv || 1);
        return meses > 0 && deudaBs > 0.01;
      })
      .map((c: any) => {
        const meses = parseInt(String(c.MesesDeuda ?? c.meses_deuda ?? 0), 10) || 0;
        const totalDeudaBs =
          typeof c.DeudaBs === 'number' && c.DeudaBs > 0
            ? c.DeudaBs
            : Math.round(
                (parseFloat(String(c.DeudaCongelada || 0)) +
                  parseFloat(String(c.MultaBs || 0)) +
                  parseFloat(String(c.DeudaMMV || 0)) * 57 * 0.128 * (tcmmv || 1)) *
                  100
              ) / 100;
        const clasificacion = c.isCondominio
          ? 'Condominio'
          : c.Clasificacion || c.clasificacion || 'Residencial';
        return {
          id: c.id || c.CodCont || c.Identidad || '—',
          cod_cont: c.CodCont || c.cod_cont || c.inmueble || '—',
          contribuyente: c.Contribuyente || c.contribuyente || '—',
          identidad: c.Identidad || c.identidad || '—',
          clasificacion,
          telefono: c.Telefono || c.telefono || '—',
          mesesPendientes: meses,
          periodos: generarPeriodosPorMeses(meses),
          totalDeudaBs,
        };
      })
      .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);

    if (rowsFromContrib.length > 0) return rowsFromContrib;
  }

  // Caso 3: Fallback a recibos/facturas pendientes si existen
  const grouped: Record<string, { recibos: any[]; contrib: any }> = {};
  for (const f of facturasOrMorosos || []) {
    const id = (f.identidad || '').replace(/-/g, '').toUpperCase();
    if (!id) continue;
    if (!grouped[id]) {
      const contrib = (contribuyentes || []).find(
        (c: any) => (c.Identidad || '').replace(/-/g, '').toUpperCase() === id
      );
      grouped[id] = { recibos: [], contrib };
    }
    grouped[id].recibos.push(f);
  }
  const getMes = (d: string) => {
    const p = d?.split('-');
    return p?.length >= 2 ? `${MESES[parseInt(p[1]) - 1]}-${p[0]}` : d || '—';
  };
  return Object.values(grouped)
    .filter((g) => g.recibos.length > 0)
    .map((g) => {
      const { recibos, contrib } = g;
      let totalDeudaBs = 0;
      for (const f of recibos)
        totalDeudaBs += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      const periodos = recibos
        .sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime())
        .map((f: any) => getMes(f.emision))
        .join(', ');
      return {
        cod_cont: contrib?.CodCont || contrib?.cod_cont || '—',
        contribuyente: contrib?.Contribuyente || recibos[0]?.contribuyente || '—',
        identidad: contrib?.Identidad || recibos[0]?.identidad || '—',
        clasificacion: contrib?.Clasificacion || '—',
        telefono: contrib?.Telefono || contrib?.telefono || '—',
        mesesPendientes: recibos.length,
        periodos,
        totalDeudaBs,
      };
    })
    .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);
}

export async function generarMorososExcel(
  facturasPendientesOrMorosos: any[],
  contribuyentes: any[],
  tcmmv: number
): Promise<void> {
  const rows = construirListaMorosos(facturasPendientesOrMorosos, contribuyentes, tcmmv);
  const tasa = tcmmv > 0 ? tcmmv : 1;

  // Enriquecer con datos de la tabla inmuebles si faltan columnas del formato "Record de deudas"
  const codigos = [...new Set(rows.map((r: any) => String(r.cod_cont || '').trim()).filter(Boolean))];
  const inmByCode = new Map<string, any>();
  if (codigos.length > 0) {
    for (let i = 0; i < codigos.length; i += 250) {
      const { data: chunk } = await supabase
        .from('inmuebles')
        .select(
          'id,inmueble,identidad,contribuyente,direccion,telefono,actividad_principal,clasificacion,tipo,agente_retencion,meses_deuda,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,multa_bs,saldo_favor_bs,es_condominio,notas'
        )
        .in('inmueble', codigos.slice(i, i + 250));
      (chunk || []).forEach((inm: any) => {
        if (inm.inmueble) inmByCode.set(String(inm.inmueble).trim(), inm);
      });
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Record de deudas');

  const headers = [
    'id',
    'Código',
    'Documento',
    'Nombre / Razón Social',
    'Dir. fiscal',
    'Telefono',
    'Actividad',
    'Uso',
    'Tipo',
    'Agente de retencion',
    'Meses pendientes',
    'Monto x mes',
    'Deuda total Ves',
    'Multa total Ves',
    'Total Ves',
  ];

  ws.columns = headers.map(() => ({ width: 30 }));

  const hRow = ws.getRow(1);
  hRow.height = 18;
  headers.forEach((h, idx) => {
    const cell = hRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true };
  });

  let sumMontoMes = 0;
  let sumDeudaSinMulta = 0;
  let sumMulta = 0;
  let sumTotal = 0;

  rows.forEach((r: any, idx: number) => {
    const cod = String(r.cod_cont || '').trim();
    const inm = inmByCode.get(cod) || r._rawInm || {};
    const esRes = inm.inmueble ? isResidencialInm(inm) : String(r.clasificacion || '').toLowerCase() !== 'comercial';
    const meses = Math.max(1, parseInt(String(r.mesesPendientes || inm.meses_deuda || 1), 10) || 1);

    // Calcular Monto x mes, Deuda total Ves (sin multa), Multa total Ves y Total Ves
    let montoMes = Number(r.montoMes || 0);
    let deudaSinMulta = Number(r.deudaSinMultaBs || 0);
    let multaVes = Number(r.multaTotalBs ?? -1);
    let totalVes = r2(Number(r.totalDeudaBs || 0));

    if (!montoMes || multaVes < 0) {
      const bMes = inm.inmueble ? calcularMensualidad(inm, tasa) : 0;
      const ivaMes = esRes ? 0 : bMes * 0.16;
      const retMes = !esRes && inm.agente_retencion === true ? ivaMes * 0.75 : 0;
      const netoMes = r2(bMes + ivaMes - retMes);

      const exoneradoTotal = isExoneradoTotalMultas(inm.notas);
      const exoneradosCount = getMesesExoneradosCount(inm.notas);
      const mesesConMora = exoneradoTotal ? 0 : Math.max(0, meses - 1 - exoneradosCount);
      const tasaMora = esRes ? 0.1 : 0.12;
      const multaCalc = exoneradoTotal
        ? 0
        : r2(bMes * tasaMora * mesesConMora + (parseFloat(String(inm.multa_bs || 0)) || 0));

      montoMes = netoMes > 0 ? netoMes : r2(totalVes / meses);
      multaVes = Math.min(totalVes, Math.max(0, multaCalc));
      deudaSinMulta = r2(Math.max(0, totalVes - multaVes));
    }

    const uso =
      r.uso ||
      inm.clasificacion ||
      (inm.es_condominio ? 'Condominio' : esRes ? 'Residencial' : 'Comercial');
    const tipoInm =
      r.tipoInm ||
      inm.tipo ||
      (esRes ? 'Unifamiliar' : 'Comercial');
    const dirFiscal = r.direccion || inm.direccion || 'NAGUANAGUA';
    const actividad = r.actividad || inm.actividad_principal || (esRes ? 'VIVIENDA UNIFAMILIAR' : 'COMERCIAL');
    const agenteRet = Boolean(r.agenteRetencion ?? inm.agente_retencion ?? false);
    const idNum = typeof inm.id === 'number' ? inm.id : typeof r.id === 'number' ? r.id : idx + 1;
    const cleanNombre = String(r.contribuyente || inm.contribuyente || '—')
      .replace(/^\d+\s*-\s*(?=[A-Za-z])/, '')
      .trim();

    const row = ws.getRow(idx + 2);
    row.height = 15;
    const vals = [
      idNum,
      cod || '—',
      r.identidad || inm.identidad || '—',
      cleanNombre,
      dirFiscal,
      r.telefono && r.telefono !== '—' ? r.telefono : inm.telefono || 'Sin Telefono',
      actividad,
      uso,
      tipoInm,
      agenteRet,
      meses,
      r2(montoMes),
      r2(deudaSinMulta),
      r2(multaVes),
      r2(totalVes),
    ];

    vals.forEach((v, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = v as any;
      if (cIdx >= 11) {
        cell.font = { name: 'Calibri', size: 11, bold: true };
        cell.numFmt = '"Bs." #,##0.00';
      } else {
        cell.font = { name: 'Calibri', size: 10 };
      }
    });

    sumMontoMes += r2(montoMes);
    sumDeudaSinMulta += r2(deudaSinMulta);
    sumMulta += r2(multaVes);
    sumTotal += r2(totalVes);
  });

  // Fila de totales al final
  const totRow = ws.getRow(rows.length + 2);
  totRow.height = 18;
  totRow.getCell(10).value = 'TOTAL GENERAL:';
  totRow.getCell(10).font = { name: 'Calibri', size: 11, bold: true };
  totRow.getCell(11).value = rows.length;
  totRow.getCell(11).font = { name: 'Calibri', size: 11, bold: true };

  const totalsCols: [number, number][] = [
    [12, r2(sumMontoMes)],
    [13, r2(sumDeudaSinMulta)],
    [14, r2(sumMulta)],
    [15, r2(sumTotal)],
  ];
  totalsCols.forEach(([colIdx, val]) => {
    const cell = totRow.getCell(colIdx);
    cell.value = val;
    cell.font = { name: 'Calibri', size: 11, bold: true };
    cell.numFmt = '"Bs." #,##0.00';
  });

  const today = new Date().toLocaleDateString('es-VE').replace(/\//g, '-');
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Record_de_Morosos_${today}.xlsx`);
}

export async function generarMorososPDF(
  facturasPendientesOrMorosos: any[],
  contribuyentes: any[],
  tcmmv: number
): Promise<void> {
  const rows = construirListaMorosos(facturasPendientesOrMorosos, contribuyentes, tcmmv);

  const todayStr = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const totalDeuda = rows.reduce((s, r) => s + (Number(r.totalDeudaBs) || 0), 0);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = 210;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('LISTA DE COBRANZAS / REPORTE DE MOROSOS', pageW / 2, 10, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('IAMEC Naguanagua - Municipio Naguanagua', pageW / 2, 16, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text('Fecha: ' + todayStr, 14, 28);
  doc.text('Total morosos: ' + rows.length.toLocaleString('es-VE'), pageW / 2, 28, { align: 'center' });
  doc.text(
    'Deuda total: Bs. ' + totalDeuda.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    pageW - 14,
    28,
    { align: 'right' }
  );
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 30, pageW - 14, 30);

  autoTable(doc, {
    startY: 33,
    margin: { left: 10, right: 10 },
    head: [['N°', 'CÓDIGO', 'CONTRIBUYENTE / RAZÓN SOCIAL', 'IDENTIDAD', 'TELÉFONO', 'MESES', 'DEUDA (Bs)']],
    body: rows.map((r, i) => [
      i + 1,
      r.cod_cont || '—',
      String(r.contribuyente || 'N/D').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim(),
      r.identidad || 'N/D',
      r.telefono || 'N/D',
      r.mesesPendientes,
      'Bs. ' + Number(r.totalDeudaBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ]),
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    styles: { fontSize: 6.8, cellPadding: 1.6 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 64 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25 },
      5: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    foot: [
      [
        '',
        '',
        '',
        '',
        '',
        {
          content: rows.length.toLocaleString('es-VE') + ' morosos',
          styles: { fontStyle: 'bold', halign: 'right', textColor: [15, 23, 42] },
        },
        {
          content: 'Bs. ' + totalDeuda.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          styles: { fontStyle: 'bold', halign: 'right', textColor: [185, 28, 28] },
        },
      ],
    ],
    footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold', fontSize: 7.5 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index < rows.length) {
        const r = rows[data.row.index];
        if (r && r.mesesPendientes >= 3) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 5;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(130, 130, 130);
  doc.text('* En rojo: 3 o más meses pendientes.', 14, finalY);
  doc.text('Sistema IAMEC Naguanagua  |  ' + todayStr, pageW - 14, finalY, { align: 'right' });
  doc.save('CobranzasMorosos_' + todayStr.replace(/\//g, '-') + '.pdf');
}
