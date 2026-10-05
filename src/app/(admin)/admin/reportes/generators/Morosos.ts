import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generarMorososExcel(
  facturasPendientes: any[],
  contribuyentes: any[],
  tcmmv: number
): Promise<void> {
  const grouped: Record<string, { recibos: any[]; contrib: any }> = {};
  for (const f of facturasPendientes) {
    const id = (f.identidad || '').replace(/-/g, '').toUpperCase();
    if (!id) continue;
    if (!grouped[id]) {
      const contrib = contribuyentes.find((c: any) =>
        (c.Identidad || '').replace(/-/g, '').toUpperCase() === id
      );
      grouped[id] = { recibos: [], contrib };
    }
    grouped[id].recibos.push(f);
  }
  const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const getMes = (d: string) => {
    const p = d?.split('-');
    return p?.length >= 2 ? `${MESES[parseInt(p[1])-1]}-${p[0]}` : d || '—';
  };
  const rows = Object.values(grouped)
    .filter(g => g.recibos.length > 0)
    .map(g => {
      const { recibos, contrib } = g;
      let totalDeudaBs = 0;
      for (const f of recibos) totalDeudaBs += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      const periodos = recibos
        .sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime())
        .map((f: any) => getMes(f.emision)).join(', ');
      return {
        cod_cont: contrib?.CodCont || contrib?.cod_cont || '—',
        contribuyente: contrib?.Contribuyente || recibos[0]?.contribuyente || '—',
        identidad: contrib?.Identidad || recibos[0]?.identidad || '—',
        clasificacion: contrib?.Clasificacion || '—',
        mesesPendientes: recibos.length,
        periodos,
        totalDeudaBs,
      };
    })
    .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);

  const today = new Date().toLocaleDateString('es-VE');
  const wsData = [
    ['REPORTE DE MOROSOS — IAMEC Naguanagua'],
    [`Fecha: ${today}  |  Tasa BCV: ${tcmmv ? tcmmv + ' Bs/EUR' : 'N/D'}  |  Total morosos: ${rows.length}`],
    [],
    ['N°','CÓDIGO','CONTRIBUYENTE','IDENTIDAD','CLASIFICACIÓN','RECIBOS PENDIENTES','PERÍODOS','DEUDA TOTAL (Bs)'],
    ...rows.map((r, i) => [i+1, r.cod_cont, r.contribuyente, r.identidad, r.clasificacion, r.mesesPendientes, r.periodos,
      r.totalDeudaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })]),
    [],
    ['','','','','','TOTAL MOROSOS:', rows.length, ''],
    ['','','','','','TOTAL DEUDA (Bs):','', rows.reduce((s, r) => s + r.totalDeudaBs, 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })],
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:5},{wch:12},{wch:40},{wch:15},{wch:18},{wch:18},{wch:50},{wch:20}];
  ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }, { s:{r:1,c:0}, e:{r:1,c:7} }];
  xlsx.utils.book_append_sheet(wb, ws, 'Morosos');
  xlsx.writeFile(wb, `Reporte_Morosos_${today.replace(/\//g, '-')}.xlsx`);
}

export async function generarMorososPDF(
  facturasPendientes: any[],
  contribuyentes: any[],
  tcmmv: number
): Promise<void> {
  const grouped: Record<string, { recibos: any[]; contrib: any }> = {};
  for (const f of facturasPendientes) {
    const id = (f.identidad || '').replace(/-/g, '').toUpperCase();
    if (!id) continue;
    if (!grouped[id]) {
      const contrib = contribuyentes.find((c: any) =>
        (c.Identidad || '').replace(/-/g, '').toUpperCase() === id
      );
      grouped[id] = { recibos: [], contrib };
    }
    grouped[id].recibos.push(f);
  }

  const rows = Object.values(grouped)
    .filter(g => g.recibos.length > 0)
    .map(g => {
      const { recibos, contrib } = g;
      let totalDeudaBs = 0;
      for (const f of recibos) totalDeudaBs += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      return {
        contribuyente:   contrib?.Contribuyente || recibos[0]?.contribuyente || 'N/D',
        identidad:       contrib?.Identidad     || recibos[0]?.identidad     || 'N/D',
        telefono:        contrib?.Telefono      || contrib?.telefono           || 'N/D',
        mesesPendientes: recibos.length,
        totalDeudaBs,
      };
    })
    .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);

  const todayStr = new Date().toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'numeric' });
  const totalDeuda = rows.reduce((s, r) => s + r.totalDeudaBs, 0);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = 210;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('LISTA DE COBRANZAS', pageW / 2, 10, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('IAMEC Naguanagua - Municipio Naguanagua', pageW / 2, 16, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.text('Fecha: ' + todayStr, 14, 28);
  doc.text('Total morosos: ' + rows.length, pageW / 2, 28, { align: 'center' });
  doc.text('Deuda total: Bs. ' + totalDeuda.toLocaleString('es-VE', { minimumFractionDigits: 2 }), pageW - 14, 28, { align: 'right' });
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 30, pageW - 14, 30);

  autoTable(doc, {
    startY: 33,
    margin: { left: 10, right: 10 },
    head: [['N', 'CONTRIBUYENTE / RAZON SOCIAL', 'IDENTIDAD', 'TELEFONO', 'RECIBOS', 'DEUDA (Bs)']],
    body: rows.map((r, i) => [
      i + 1,
      r.contribuyente,
      r.identidad,
      r.telefono,
      r.mesesPendientes,
      r.totalDeudaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 72 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 30, halign: 'right',  fontStyle: 'bold' },
    },
    foot: [[
      '', '', '', '',
      { content: rows.length + ' morosos', styles: { fontStyle: 'bold', halign: 'right', textColor: [15,23,42] } },
      { content: 'Bs. ' + totalDeuda.toLocaleString('es-VE', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', halign: 'right', textColor: [185,28,28] } },
    ]],
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
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(130, 130, 130);
  doc.text('* En rojo: 3 o mas meses pendientes.', 14, finalY);
  doc.text('Sistema IAMEC Naguanagua  |  ' + todayStr, pageW - 14, finalY, { align: 'right' });
  doc.save('CobranzasMorosos_' + todayStr.replace(/\//g, '-') + '.pdf');
}
