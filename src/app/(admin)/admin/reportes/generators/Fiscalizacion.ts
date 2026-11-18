import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { logos } from '@/lib/logosBase64';

export const generarFiscalizacionExcel = async (data: any[], tipo: string) => {
  if (data.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const title = tipo === 'General' ? 'REPORTE DE FISCALIZACIONES' : 'REPORTE POR FISCALIZAR';
  const sheet = workbook.addWorksheet('Fiscalizacion');

  sheet.columns = [
    { key: 'num', width: 6 },
    { key: 'rif', width: 16 },
    { key: 'nombre', width: 40 },
    { key: 'direccion', width: 40 },
    { key: 'actividad', width: 30 },
    { key: 'ultima', width: 20 },
    { key: 'inspector', width: 20 },
    { key: 'estatus', width: 16 }
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
      console.warn('No se pudo incrustar logo en Fiscalizacion Excel:', e);
    }
  };
  addLogo((logos as any).instituto || logos.alcaldia, 0.15, 0.15, 155, 52);
  addLogo(logos.iamec, 6.1, 0.2, 150, 46);

  const headerLines = [
    { txt: 'REPÚBLICA BOLIVARIANA DE VENEZUELA - ESTADO CARABOBO', size: 10, color: 'FF000000', fill: '' },
    { txt: 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC)', size: 11, color: 'FF000000', fill: '' },
    { txt: title, size: 13, color: 'FFD35400', fill: '' },
    { txt: `RIF: G-20008614-9   |   Fecha de emisión: ${new Date().toLocaleDateString('es-VE')}   |   Registros: ${data.length}`, size: 9.5, color: 'FF334155', fill: '' },
  ];
  headerLines.forEach((l, i) => {
    const rNum = i + 1;
    sheet.mergeCells(rNum, 3, rNum, 6);
    const cell = sheet.getCell(rNum, 3);
    cell.value = l.txt;
    cell.font = { name: 'Arial', size: l.size, bold: true, color: { argb: l.color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  sheet.getRow(6).values = ['Nº', 'RIF', 'Razón Social', 'Dirección', 'Actividad Económica', 'Última Fiscalización', 'Inspector', 'Estatus'];
  const headerRow = sheet.getRow(6);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE67E22' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
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
