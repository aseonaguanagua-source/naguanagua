import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { logos } from '@/lib/logosBase64';

export const generarSaldosFavorExcel = async (saldos: any[], mes: string) => {
  if (saldos.length === 0) {
    alert("No hay saldos a favor en el mes seleccionado.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Saldos a Favor');

  sheet.columns = [
    { key: 'num', width: 6 },
    { key: 'fecha', width: 20 },
    { key: 'identidad', width: 20 },
    { key: 'nombre', width: 40 },
    { key: 'concepto', width: 40 },
    { key: 'estado', width: 15 },
    { key: 'monto', width: 20 }
  ];

  for (let r = 1; r <= 4; r++) {
    sheet.getRow(r).height = 18;
  }
  const addLogo = (base64Str: string, colFrom: number, rowFrom: number, width: number, height: number) => {
    try {
      if (!base64Str) return;
      const base64Data = base64Str.split(',')[1] || base64Str;
      const imageId = workbook.addImage({ base64: base64Data, extension: 'png' });
      sheet.addImage(imageId, {
        tl: { col: colFrom, row: rowFrom } as any,
        ext: { width, height },
      });
    } catch (e) {
      console.warn('No se pudo incrustar logo en SaldoAFavor Excel:', e);
    }
  };
  addLogo((logos as any).instituto || logos.alcaldia, 0.15, 0.15, 155, 52);
  addLogo(logos.iamec, 5.6, 0.2, 150, 46);

  const headerLines = [
    { txt: 'REPÚBLICA BOLIVARIANA DE VENEZUELA - ESTADO CARABOBO', size: 10, color: 'FF000000' },
    { txt: 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC)', size: 11, color: 'FF000000' },
    { txt: `REPORTE DE SALDOS A FAVOR - ${mes.toUpperCase()}`, size: 13, color: 'FF166534' },
    { txt: `RIF: G-20008614-9   |   Fecha de emisión: ${new Date().toLocaleDateString('es-VE')}   |   Registros: ${saldos.length}`, size: 9.5, color: 'FF334155' },
  ];
  headerLines.forEach((l, i) => {
    const rNum = i + 1;
    sheet.mergeCells(rNum, 3, rNum, 5);
    const cell = sheet.getCell(rNum, 3);
    cell.value = l.txt;
    cell.font = { name: 'Arial', size: l.size, bold: true, color: { argb: l.color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  sheet.getRow(6).values = ['Nº', 'Fecha Generación', 'Identidad/RIF', 'Nombre', 'Concepto Original', 'Estado', 'Monto (Bs)'];
  const headerRow = sheet.getRow(6);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27AE60' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let totalMonto = 0;
  saldos.forEach((s, index) => {
    const monto = parseFloat(s.monto_restante || s.saldo_favor_bs || s.monto || '0') || 0;
    totalMonto += monto;
    const fechaRaw = s.created_at || s.updated_at || new Date().toISOString();
    
    const row = sheet.addRow({
      num: index + 1,
      fecha: new Date(fechaRaw).toLocaleString('es-VE'),
      identidad: s.identidad || 'N/A',
      nombre: s.nombre || s.contribuyente || 'N/A',
      concepto: s.concepto_original || (s.inmueble ? `Saldo a favor en inmueble ${s.inmueble}` : 'Saldo a favor'),
      estado: s.estado || 'Disponible',
      monto: monto
    });
    row.getCell('monto').numFmt = '#,##0.00';
    row.eachCell(cell => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });

  const footerRow = sheet.addRow(['', '', '', '', '', 'TOTAL', totalMonto]);
  footerRow.font = { bold: true };
  footerRow.getCell(7).numFmt = '#,##0.00';
  footerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `Saldo_Favor_${mes}_${new Date().getTime()}.xlsx`);
};
