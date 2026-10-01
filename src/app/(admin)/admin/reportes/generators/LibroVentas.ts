import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export const generarLibroVentas = async (pagosFiltrados: any[], contribuyentes: any[], tipo: 'Diario' | 'Semanal' | 'Mensual', fechaInicio: string, fechaFin: string) => {
  if (pagosFiltrados.length === 0) {
    alert("No hay pagos para exportar.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Libro de Ventas');

  // Título
  sheet.mergeCells('A1:M1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Libro de Ventas - Desde ${fechaInicio} hasta ${fechaFin}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Fila vacía
  sheet.addRow([]);
  sheet.addRow([]);

  // Headers (fila 4) — formato del Libro de Ventas real
  const headers = [
    'Fecha', 'N° RIF', 'Cliente', 'N° Factura', 'N° Control', 
    'N° Nota de crédito', 'Tipo de transacción', 'Total Ventas incluyendo IVA',
    'Ventas Internas no Gravadas', 'Base Imponible', '% de Alícuota', 'IVA', 'Monto Retenido'
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });

  // Anchos de columna
  sheet.columns = [
    { width: 14 }, // Fecha
    { width: 16 }, // N° RIF
    { width: 42 }, // Cliente
    { width: 14 }, // N° Factura
    { width: 14 }, // N° Control
    { width: 16 }, // N° Nota crédito
    { width: 8 },  // Tipo transacción
    { width: 20 }, // Total Ventas con IVA
    { width: 20 }, // Ventas no Gravadas
    { width: 18 }, // Base Imponible
    { width: 12 }, // % Alícuota
    { width: 15 }, // IVA
    { width: 16 }, // Monto Retenido
  ];

  let totalVentasIVA = 0;
  let totalNoGravadas = 0;
  let totalBase = 0;
  let totalIVA = 0;
  let totalRetenido = 0;

  pagosFiltrados.forEach((p) => {
    const cInfo = contribuyentes.find((c: any) => c.Identidad === p.identidad);
    const monto = parseFloat(p.monto) || 0;
    const det = typeof p.detalles === 'string' ? JSON.parse(p.detalles || '{}') : (p.detalles || {});
    
    // Calcular IVA y base
    const ivaPercent = det.iva_percent || 16;
    const esExento = ivaPercent === 0;
    const base = esExento ? 0 : parseFloat((monto / (1 + ivaPercent / 100)).toFixed(2));
    const iva = esExento ? 0 : parseFloat((monto - base).toFixed(2));
    const noGravadas = esExento ? monto : 0;
    const retenido = parseFloat(det.monto_retencion_iva || 0);

    // Datos de factura digital
    const fd = det.factura_digital || {};
    const nroFactura = fd.numero_documento || p.referencia || 'N/A';
    const nroControl = fd.numero_control || '';

    totalVentasIVA += (esExento ? 0 : monto);
    totalNoGravadas += noGravadas;
    totalBase += base;
    totalIVA += iva;
    totalRetenido += retenido;

    const row = sheet.addRow([
      new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      p.identidad || '',
      cInfo ? cInfo.Contribuyente : (p.identidad || ''),
      nroFactura,
      nroControl,
      null, // Nota crédito
      '01', // Tipo transacción (factura)
      esExento ? 0 : monto,
      noGravadas,
      base,
      esExento ? null : `${ivaPercent},00%`,
      iva,
      retenido,
    ]);

    // Formato numérico
    [8, 9, 10, 12, 13].forEach(col => {
      const cell = row.getCell(col);
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
    });

    row.eachCell(cell => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });
  });

  // Fila vacía
  sheet.addRow([]);

  // Totales
  const totalesRow = sheet.addRow([
    'TOTALES:', null, null, null, null, null, null,
    totalVentasIVA,
    totalNoGravadas,
    totalBase,
    null,
    totalIVA,
    totalRetenido,
  ]);
  totalesRow.font = { bold: true };
  [8, 9, 10, 12, 13].forEach(col => {
    const cell = totalesRow.getCell(col);
    if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
  });
  totalesRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `Libro_Ventas_${fechaInicio}_${fechaFin}.xlsx`);
};
