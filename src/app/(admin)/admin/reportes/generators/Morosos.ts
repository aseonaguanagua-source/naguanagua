import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export function generarPeriodosPorMeses(mesesDeuda: number): string {
  const m = Math.max(0, Math.floor(Number(mesesDeuda) || 0));
  if (m <= 0) return '—';
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0-11

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

  const today = new Date().toLocaleDateString('es-VE');
  const wsData = [
    ['REPORTE DE MOROSOS — IAMEC Naguanagua'],
    [`Fecha: ${today}  |  Tasa BCV: ${tcmmv ? tcmmv + ' Bs/EUR' : 'N/D'}  |  Total morosos: ${rows.length}`],
    [],
    ['N°', 'CÓDIGO', 'CONTRIBUYENTE', 'IDENTIDAD', 'TELÉFONO', 'CLASIFICACIÓN', 'MESES PENDIENTES', 'PERÍODOS', 'DEUDA TOTAL (Bs)'],
    ...rows.map((r, i) => [
      i + 1,
      r.cod_cont,
      r.contribuyente,
      r.identidad,
      r.telefono || '—',
      r.clasificacion,
      r.mesesPendientes,
      r.periodos,
      Number(r.totalDeudaBs || 0),
    ]),
    [],
    ['', '', '', '', '', '', 'TOTAL MOROSOS:', rows.length, ''],
    [
      '',
      '',
      '',
      '',
      '',
      '',
      'TOTAL DEUDA (Bs):',
      '',
      Number(rows.reduce((s, r) => s + (Number(r.totalDeudaBs) || 0), 0).toFixed(2)),
    ],
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 42 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 36 },
    { wch: 20 },
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  ];
  xlsx.utils.book_append_sheet(wb, ws, 'Morosos');
  xlsx.writeFile(wb, `Reporte_Morosos_${today.replace(/\//g, '-')}.xlsx`);
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
      r.contribuyente || 'N/D',
      r.identidad || 'N/D',
      r.telefono || 'N/D',
      r.mesesPendientes,
      Number(r.totalDeudaBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
