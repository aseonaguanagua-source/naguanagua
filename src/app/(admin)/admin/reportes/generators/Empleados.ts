import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { logos } from '@/lib/logosBase64';

export const generarEmpleadosExcel = async (empleados: any[]) => {
  if (empleados.length === 0) {
    alert("No hay empleados registrados.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Empleados');

  sheet.columns = [
    { key: 'num', width: 6 },
    { key: 'cedula', width: 15 },
    { key: 'nombre', width: 30 },
    { key: 'cargo', width: 25 },
    { key: 'departamento', width: 25 },
    { key: 'estatus', width: 15 },
    { key: 'fecha', width: 15 },
    { key: 'tlf', width: 15 },
    { key: 'sueldo', width: 15 },
    { key: 'obs', width: 30 }
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
      console.warn('No se pudo incrustar logo en Empleados Excel:', e);
    }
  };
  addLogo((logos as any).instituto || logos.alcaldia, 0.15, 0.15, 155, 52);
  addLogo(logos.iamec, 8.3, 0.2, 150, 46);

  const headerLines = [
    { txt: 'REPÚBLICA BOLIVARIANA DE VENEZUELA - ESTADO CARABOBO', size: 10, color: 'FF000000' },
    { txt: 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC)', size: 11, color: 'FF000000' },
    { txt: 'REPORTE MENSUAL DE GESTIÓN DE EMPLEADOS', size: 13, color: 'FF34495E' },
    { txt: `RIF: G-20008614-9   |   Fecha de emisión: ${new Date().toLocaleDateString('es-VE')}   |   Total empleados: ${empleados.length}`, size: 9.5, color: 'FF334155' },
  ];
  headerLines.forEach((l, i) => {
    const rNum = i + 1;
    sheet.mergeCells(rNum, 3, rNum, 8);
    const cell = sheet.getCell(rNum, 3);
    cell.value = l.txt;
    cell.font = { name: 'Arial', size: l.size, bold: true, color: { argb: l.color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  sheet.getRow(6).values = ['Nº', 'Cédula', 'Nombre', 'Cargo', 'Departamento', 'Estatus', 'Fecha Ingreso', 'Tlf', 'Sueldo', 'Observaciones'];
  const headerRow = sheet.getRow(6);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8E44AD' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  empleados.forEach((e, index) => {
    const fechaRaw = e.fecha_ingreso || e.created_at;
    const row = sheet.addRow({
      num: index + 1,
      cedula: e.cedula || e.usuario || 'N/A',
      nombre: e.nombre || e.usuario || 'N/A',
      cargo: e.cargo || e.rol || 'Operador',
      departamento: e.departamento || 'IAMEC Naguanagua',
      estatus: e.estatus || e.estado || 'Activo',
      fecha: fechaRaw ? new Date(fechaRaw).toLocaleDateString('es-VE') : 'N/A',
      tlf: e.telefono || e.email || 'N/A',
      sueldo: e.sueldo_base || 0,
      obs: e.observaciones || (e.letra ? `Caja ${e.letra}` : '')
    });
    row.getCell('sueldo').numFmt = '#,##0.00';
    row.eachCell(cell => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `Gestion_Empleados_${new Date().getTime()}.xlsx`);
};
