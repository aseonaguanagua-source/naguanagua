import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const generarLibroVentas = async (pagosFiltrados: any[], contribuyentes: any[], tipo: 'Diario' | 'Semanal' | 'Mensual', fechaInicio: string, fechaFin: string) => {
  if (pagosFiltrados.length === 0) {
    alert("No hay pagos para exportar.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Libro de Ventas');

  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `LIBRO DE VENTAS ${tipo.toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  
  sheet.mergeCells('A2:F2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `Periodo: ${fechaInicio} - ${fechaFin}`;
  subtitleCell.font = { name: 'Arial', size: 10 };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.columns = [
    { header: 'Nº', key: 'num', width: 5 },
    { header: 'Fecha', key: 'fecha', width: 15 },
    { header: 'Recibo / Doc', key: 'recibo', width: 20 },
    { header: 'Contribuyente', key: 'contribuyente', width: 40 },
    { header: 'RIF / CI', key: 'rif', width: 20 },
    { header: 'Monto (Bs)', key: 'monto', width: 20 }
  ];

  sheet.getRow(4).values = ['Nº', 'Fecha', 'Recibo / Doc', 'Contribuyente', 'RIF / CI', 'Monto (Bs)'];
  const headerRow = sheet.getRow(4);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center' };
  });

  let totalMonto = 0;
  pagosFiltrados.forEach((p, index) => {
    const cInfo = contribuyentes.find((c: any) => c.Identidad === p.identidad);
    const monto = parseFloat(p.monto) || 0;
    totalMonto += monto;
    
    const row = sheet.addRow({
      num: index + 1,
      fecha: new Date(p.created_at).toLocaleDateString('es-VE'),
      recibo: p.factura_ref || p.referencia || 'N/A',
      contribuyente: cInfo ? cInfo.Contribuyente : p.identidad,
      rif: p.identidad,
      monto: monto
    });

    row.getCell('monto').numFmt = '#,##0.00';
    row.eachCell(cell => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });

  const footerRow = sheet.addRow(['', '', '', '', 'TOTAL', totalMonto]);
  footerRow.font = { bold: true };
  footerRow.getCell(6).numFmt = '#,##0.00';
  footerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `Libro_Ventas_${tipo}_${new Date().getTime()}.xlsx`);
};
