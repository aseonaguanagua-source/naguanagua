import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { logos } from './logosBase64';

export const exportMontoRecaudadoExcel = async (
  pagos: any[],
  filename: string
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Monto Recaudado');

  const addLogo = (base64Str: string, col: number, row: number, width: number, height: number) => {
    try {
      const base64Data = base64Str.split(',')[1] || base64Str;
      const imageId = workbook.addImage({ base64: base64Data, extension: 'png' });
      worksheet.addImage(imageId, {
        tl: { col: col, row: row },
        ext: { width, height }
      });
    } catch (e) {
      console.warn('Could not add image to excel', e);
    }
  };

  addLogo(logos.alcaldia, 0.5, 0.5, 150, 90);
  addLogo(logos.global_rec, 7, 0.5, 120, 50);

  for (let i = 0; i < 5; i++) {
    worksheet.addRow([]);
  }

  worksheet.columns = [
    { key: 'mes', width: 15 },
    { key: 'fecha', width: 15 },
    { key: 'euro', width: 15 },
    { key: 'recaudado_punto_bs', width: 25 },
    { key: 'recaudado_punto_eur', width: 25 },
    { key: 'conciliado_transf_bs', width: 25 },
    { key: 'conciliado_transf_eur', width: 25 },
    { key: 'total_cuenta_bs', width: 25 },
    { key: 'total_cuenta_eur', width: 25 }
  ];

  const titleRow = worksheet.addRow(['MONTO DIARIO RECAUDADO']);
  worksheet.mergeCells('A' + titleRow.number + ':I' + titleRow.number);
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4E79' } };
  titleRow.getCell(1).font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 14 };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 25;

  const yearRow = worksheet.addRow(['A�O ' + new Date().getFullYear()]);
  worksheet.mergeCells('A' + yearRow.number + ':I' + yearRow.number);
  yearRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
  yearRow.getCell(1).font = { bold: true, size: 12 };
  yearRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  const headerRow = worksheet.addRow([
    'MES', 'FECHA PAGO', 'EURO (TCMMV)', 'RECAUDADO POR PUNTO Bs.', 'CONCILIADO POR PUNTO EN �',
    'CONCILIADO POR TRANSFERENCIA Y/O DEPOSITOS (Bs)', 'CONCILIADO POR TRANSFERENCIA Y/O DEPOSITOS (�)',
    'RECAUDADO EN EL ESTADO DE CUENTA (Bs)', 'RECAUDADO EN EL ESTADO DE CUENTA (�)'
  ]);
  
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });
  headerRow.height = 40;

  let totalPuntoBs = 0;
  let totalPuntoEur = 0;
  let totalTransfBs = 0;
  let totalTransfEur = 0;
  let totalCuentaBs = 0;
  let totalCuentaEur = 0;

  pagos.forEach((p: any) => {
    let detalles: any = {};
    try { detalles = JSON.parse(p.detalles); } catch (e) {}
    const tcmmvRate = detalles.tcmmv || 1;
    const montoBs = parseFloat(p.monto) || 0;
    const montoEuro = montoBs / tcmmvRate;

    const isPunto = p.metodo === 'Punto';
    const pBs = isPunto ? montoBs : 0;
    const pEur = isPunto ? montoEuro : 0;
    const tBs = !isPunto ? montoBs : 0;
    const tEur = !isPunto ? montoEuro : 0;

    const totBs = pBs + tBs;
    const totEur = pEur + tEur;

    totalPuntoBs += pBs;
    totalPuntoEur += pEur;
    totalTransfBs += tBs;
    totalTransfEur += tEur;
    totalCuentaBs += totBs;
    totalCuentaEur += totEur;

    const row = worksheet.addRow([
      p.created_at ? new Date(p.created_at).toLocaleDateString('es-ES', { month: 'long' }).toUpperCase() : '---',
      p.created_at ? new Date(p.created_at).toLocaleDateString() : '---',
      tcmmvRate,
      pBs,
      pEur,
      tBs,
      tEur,
      totBs,
      totEur
    ]);

    row.eachCell((cell: any, colNumber: number) => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNumber >= 3) {
        cell.numFmt = '#,##0.00';
      }
    });
  });

  const totRow = worksheet.addRow([
    'TOTAL', '', '',
    totalPuntoBs, totalPuntoEur, totalTransfBs, totalTransfEur, totalCuentaBs, totalCuentaEur
  ]);
  worksheet.mergeCells('A' + totRow.number + ':C' + totRow.number);
  totRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  totRow.getCell(1).font = { bold: true };
  
  totRow.eachCell((cell: any, colNumber: number) => {
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
    if (colNumber >= 4) {
      cell.font = { bold: true };
      cell.numFmt = '#,##0.00';
      if (colNumber === 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      if (colNumber === 5) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      if (colNumber === 6) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      if (colNumber === 7) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      if (colNumber === 8) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      if (colNumber === 9) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4DFEC' } };
    }
  });

  worksheet.addRow([]);
  worksheet.addRow([]);

  const summaryData = [
    { label: 'TOTAL CONCILIADO EN BOLIVARES (Bs.)', val: totalPuntoBs + totalTransfBs, color: 'FFE2EFDA' },
    { label: 'TOTAL CONCILIADO EN EURO (�)', val: totalPuntoEur + totalTransfEur, color: 'FFD9E1F2' },
    { label: 'TOTAL RECAUDADO EN CUENTA EN BOLIVARES (Bs.)', val: totalCuentaBs, color: 'FFFFF2CC' },
    { label: 'TOTAL RECAUDADO EN CUENTA EN EURO (�)', val: totalCuentaEur, color: 'FFE4DFEC' }
  ];

  summaryData.forEach((s) => {
    const sRow = worksheet.addRow(['', '', s.label, s.val]);
    worksheet.mergeCells('C' + sRow.number + ':E' + sRow.number);
    
    sRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.color } };
    sRow.getCell(3).font = { bold: true };
    sRow.getCell(3).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    sRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    sRow.getCell(6).value = s.val;
    sRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.color } };
    sRow.getCell(6).font = { bold: true };
    sRow.getCell(6).numFmt = '#,##0.00';
    sRow.getCell(6).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  worksheet.addRow([]);
  const noteRow = worksheet.addRow(['NOTA IMPORTANTE: Las conciliaciones bancarias correspondientes a transferencias electr�nicas se efect�an conforme a la recepci�n de los estados de cuenta emitidos; en consecuencia, los saldos registrados est�n sujetos a variaciones diarias.']);
  worksheet.mergeCells('A' + noteRow.number + ':I' + noteRow.number);
  noteRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  noteRow.getCell(1).font = { bold: true, size: 9 };
  noteRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  noteRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), filename);
};
