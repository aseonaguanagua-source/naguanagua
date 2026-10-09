import { saveAs } from 'file-saver';
import { EstadoCuenta } from './servicio';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { const [y, m] = p.split('-'); return `${MESES[parseInt(m) - 1]} ${y}`; };

export async function exportarExcelEstadoCuenta(c: any, e: EstadoCuenta, cajero: string) {
  // Use dynamic import to keep bundle small
  const ExcelJS = (await import('exceljs')).default;
  const { logos } = await import('@/lib/logosBase64');
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Locales');
  
  try {
    const al = workbook.addImage({ base64: logos.alcaldia, extension: 'jpeg' });
    worksheet.addImage(al, { tl: { col: 0, row: 0 }, ext: { width: 100, height: 100 } });
    const ia = workbook.addImage({ base64: logos.iamec, extension: 'jpeg' });
    worksheet.addImage(ia, { tl: { col: 1, row: 0 }, ext: { width: 100, height: 100 } });
  } catch (e) {}
  
  worksheet.addRow([]); worksheet.addRow([]); worksheet.addRow([]); worksheet.addRow([]); worksheet.addRow([]);
  
  worksheet.addRow([`CONDOMINIO: ${c.nombre} (${c.codigo})`]).font = { size: 14, bold: true };
  worksheet.addRow([`Fecha: ${new Date().toLocaleString('es-VE')}`]);
  worksheet.addRow([]);
  
  worksheet.addRow([
    'Código/Unidad',
    'Número Local',
    'Propietario',
    'Cédula/RIF',
    'Actividad',
    'Estado',
    'Mensualidad (Bs)',
    'Meses Aseo',
    'Meses Multa',
    'Base Aseo (Bs)',
    'Multa Aseo (Bs)',
    'IVA Aseo (Bs)',
    'Multas Manuales (Bs)',
    'Total (Bs)'
  ]).font = { bold: true };
  
  for (const r of e.renglones) {
    if (r.clave === 'SIN_REGISTRAR') continue;
    worksheet.addRow([
      r.inmueble || r.clave,
      r.numero || '',
      r.propietario || '',
      r.identidad || '',
      r.actividad || '',
      r.estado,
      r.mensualBs,
      r.deuda.meses,
      r.multaMeses,
      r.deuda.baseBs,
      r.deuda.multaBs + r.multaExtraBs,
      r.deuda.ivaBs,
      r.multasManualesBs,
      r.totalBs
    ]);
  }
  
  worksheet.addRow([]);
  worksheet.addRow(['TOTALES DEL CONDOMINIO']).font = { bold: true };
  worksheet.addRow(['Base', e.totales.baseBs]);
  worksheet.addRow(['Multas', e.totales.multaBs]);
  worksheet.addRow(['IVA', e.totales.ivaBs]);
  worksheet.addRow(['Total A Pagar', e.totales.totalBs]).font = { bold: true };
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Estado_Cuenta_${c.codigo}.xlsx`);
}
