import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const generarSaldosFavorExcel = async (saldos: any[], mes: string) => {
  if (saldos.length === 0) {
    alert("No hay saldos a favor en el mes seleccionado.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Saldos a Favor');

  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `SALDO A FAVOR - ${mes.toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  sheet.columns = [
    { header: 'Nº', key: 'num', width: 5 },
    { header: 'Fecha Generación', key: 'fecha', width: 20 },
    { header: 'Identidad/RIF', key: 'identidad', width: 20 },
    { header: 'Nombre', key: 'nombre', width: 40 },
    { header: 'Concepto Original', key: 'concepto', width: 40 },
    { header: 'Estado', key: 'estado', width: 15 },
    { header: 'Monto (Bs)', key: 'monto', width: 20 }
  ];

  sheet.getRow(3).values = ['Nº', 'Fecha Generación', 'Identidad/RIF', 'Nombre', 'Concepto Original', 'Estado', 'Monto (Bs)'];
  const headerRow = sheet.getRow(3);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27AE60' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center' };
  });

  let totalMonto = 0;
  saldos.forEach((s, index) => {
    const monto = parseFloat(s.monto_restante || '0');
    totalMonto += monto;
    
    const row = sheet.addRow({
      num: index + 1,
      fecha: new Date(s.created_at).toLocaleString('es-VE'),
      identidad: s.identidad,
      nombre: s.nombre || 'N/A',
      concepto: s.concepto_original || 'N/A',
      estado: s.estado || 'N/A',
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
