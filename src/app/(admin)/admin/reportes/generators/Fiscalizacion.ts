import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const generarFiscalizacionExcel = async (data: any[], tipo: string) => {
  if (data.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const title = tipo === 'General' ? 'REPORTE DE FISCALIZACIONES' : 'REPORTE POR FISCALIZAR';
  const sheet = workbook.addWorksheet('Fiscalizacion');

  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD35400' } };

  sheet.columns = [
    { header: 'Nº', key: 'num', width: 5 },
    { header: 'RIF', key: 'rif', width: 15 },
    { header: 'Razón Social', key: 'nombre', width: 40 },
    { header: 'Dirección', key: 'direccion', width: 40 },
    { header: 'Actividad Económica', key: 'actividad', width: 30 },
    { header: 'Última Fiscalización', key: 'ultima', width: 20 },
    { header: 'Inspector', key: 'inspector', width: 20 },
    { header: 'Estatus', key: 'estatus', width: 15 }
  ];

  sheet.getRow(3).values = ['Nº', 'RIF', 'Razón Social', 'Dirección', 'Actividad Económica', 'Última Fiscalización', 'Inspector', 'Estatus'];
  const headerRow = sheet.getRow(3);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE67E22' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center' };
  });

  data.forEach((item, index) => {
    const row = sheet.addRow({
      num: index + 1,
      rif: item.Identidad || item.rif || 'N/A',
      nombre: item.Contribuyente || item.nombre || 'N/A',
      direccion: item.Direccion || item.direccion || 'N/A',
      actividad: item.actividad_principal || 'N/A',
      ultima: item.ultima_fiscalizacion ? new Date(item.ultima_fiscalizacion).toLocaleDateString('es-VE') : 'N/A',
      inspector: item.inspector || 'N/A',
      estatus: item.estatus || (tipo === 'General' ? 'Fiscalizado' : 'Pendiente')
    });
    row.eachCell(cell => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `${title.replace(/ /g, '_')}_${new Date().getTime()}.xlsx`);
};
