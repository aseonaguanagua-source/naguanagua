import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const generarEmpleadosExcel = async (empleados: any[]) => {
  if (empleados.length === 0) {
    alert("No hay empleados registrados.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Empleados');

  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'REPORTE MENSUAL DE GESTIÓN DE EMPLEADOS';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };

  sheet.columns = [
    { header: 'Nº', key: 'num', width: 5 },
    { header: 'Cédula', key: 'cedula', width: 15 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Cargo', key: 'cargo', width: 25 },
    { header: 'Departamento', key: 'departamento', width: 25 },
    { header: 'Estatus', key: 'estatus', width: 15 },
    { header: 'Fecha Ingreso', key: 'fecha', width: 15 },
    { header: 'Tlf', key: 'tlf', width: 15 },
    { header: 'Sueldo', key: 'sueldo', width: 15 },
    { header: 'Observaciones', key: 'obs', width: 30 }
  ];

  sheet.getRow(3).values = ['Nº', 'Cédula', 'Nombre', 'Cargo', 'Departamento', 'Estatus', 'Fecha Ingreso', 'Tlf', 'Sueldo', 'Observaciones'];
  const headerRow = sheet.getRow(3);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8E44AD' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center' };
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
