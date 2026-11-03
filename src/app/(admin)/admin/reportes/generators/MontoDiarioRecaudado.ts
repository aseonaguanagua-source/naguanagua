import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { logos } from '@/lib/logosBase64';
import { clasificarBancoDestino } from '@/lib/cuentasBancarias';

/**
 * Generador del reporte oficial en Excel: "MONTO DIARIO RECAUDADO"
 * Formato idéntico a la planilla de tesorería IAMEC (año, tasas, punto Bs/€, transferencias Bs/€,
 * estado de cuenta Banesco Bs/€ y Bancamiga Bs/€, totales consolidados y logos oficiales).
 */

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const BORDE = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' }
} as const;

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const fechaVE = (d: any) => {
  const x = new Date(d);
  return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
};

const esAnulado = (p: any) => {
  if (['Anulado', 'Reversado', 'Condonado', 'Rechazado'].includes(String(p.estado || ''))) return true;
  let det: any = {};
  try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch {}
  const caj = String(det?.cajero || det?.analista || '').trim();
  if (/^(dz-)?dzara$|^c-dzara$/i.test(caj)) return true;
  return false;
};
const esRetencion = (p: any) => /retenci/i.test(String(p.tipo || ''));
const esSaldoFavor = (p: any) => /saldo a favor|nota de cr[eé]dito/i.test(String(p.tipo || ''));
const esDebito = (p: any) => /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta/i.test(String(p.tipo || '').trim());
const esTransferencia = (p: any) => /transfer|m[oó]vil|pago m/i.test(String(p.tipo || ''));

export interface MontoDiarioParams {
  pagos: any[];
  fechaInicio: string;
  fechaFin: string;
  tcmmvActual?: number;
}

export async function generarMontoDiarioRecaudado({
  pagos,
  fechaInicio,
  fechaFin,
  tcmmvActual = 0
}: MontoDiarioParams) {
  const s = new Date(fechaInicio + 'T00:00:00');
  const e = new Date(fechaFin + 'T23:59:59');

  const vivos = pagos.filter((p: any) => {
    if (esAnulado(p) || esRetencion(p) || esSaldoFavor(p)) return false;
    if (esTransferencia(p) && String(p.estado || '') !== 'Aprobado') return false;
    const d = new Date(p.created_at);
    return d >= s && d <= e;
  });

  if (!vivos.length) {
    alert('No hay pagos registrados en el rango de fechas seleccionado.');
    return;
  }

  // Agrupar por día YYYY-MM-DD
  interface DiaData {
    fecha: string;
    puntoBs: number;
    puntoEur: number;
    transfBs: number;
    transfEur: number;
    banescoBs: number;
    banescoEur: number;
    bancamigaBs: number;
    bancamigaEur: number;
    tasasBcv: number[];
    tasaUcd: number[];
  }

  const agrupadoPorDia = new Map<string, DiaData>();

  vivos.forEach((p: any) => {
    const fDia = fechaVE(p.created_at);
    if (!fDia) return;

    if (!agrupadoPorDia.has(fDia)) {
      agrupadoPorDia.set(fDia, {
        fecha: fDia,
        puntoBs: 0,
        puntoEur: 0,
        transfBs: 0,
        transfEur: 0,
        banescoBs: 0,
        banescoEur: 0,
        bancamigaBs: 0,
        bancamigaEur: 0,
        tasasBcv: [],
        tasaUcd: []
      });
    }

    const diaObj = agrupadoPorDia.get(fDia)!;
    let det: any = {};
    try {
      det = typeof p.detalles === 'object' ? p.detalles : JSON.parse(p.detalles || '{}');
    } catch {
      det = {};
    }

    // Tasa BCV / Euro aplicada al pago
    const rate = Number(
      det.tasa_bcv ||
      det.tasaBcv ||
      det.tcmmv ||
      det.tasa ||
      det.tasa_bcv_conciliacion ||
      det.tasa_bcv_original ||
      tcmmvActual ||
      1
    ) || 1;

    diaObj.tasasBcv.push(rate);
    if (det.tcmmv || det.tasaUcd) {
      diaObj.tasaUcd.push(Number(det.tcmmv || det.tasaUcd) || rate);
    }

    const fpMatch = (Array.isArray(det.formasPago) ? det.formasPago : []).find(
      (fp: any) => String(fp?.referencia || '').trim() === String(p.referencia || '').trim()
    );
    const montoBs = esTransferencia(p)
      ? (Number(det.monto_conciliado || fpMatch?.monto || (Array.isArray(det.formasPago) && det.formasPago.length === 1 ? det.formasPago[0]?.monto : 0) || p.monto) || 0)
      : (Number(p.monto) || 0);
    const montoEur = rate > 0 ? r2(montoBs / rate) : 0;

    if (esDebito(p)) {
      diaObj.puntoBs += montoBs;
      diaObj.puntoEur += montoEur;
    } else if (esTransferencia(p)) {
      diaObj.transfBs += montoBs;
      diaObj.transfEur += montoEur;
    } else {
      diaObj.transfBs += montoBs;
      diaObj.transfEur += montoEur;
    }

    const bClass = clasificarBancoDestino(p);
    if (bClass === 'Bancamiga') {
      diaObj.bancamigaBs += montoBs;
      diaObj.bancamigaEur += montoEur;
    } else {
      diaObj.banescoBs += montoBs;
      diaObj.banescoEur += montoEur;
    }
  });

  const diasOrdenados = Array.from(agrupadoPorDia.keys()).sort();
  if (!diasOrdenados.length) {
    alert('No hay información diaria de pagos para el período.');
    return;
  }

  const primerDia = diasOrdenados[0];
  const fechaObj = new Date(primerDia + 'T12:00:00');
  const mesNombre = MESES[fechaObj.getMonth()] || 'PERÍODO';
  const anio = fechaObj.getFullYear() || new Date().getFullYear();

  // Crear libro y hoja
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('MONTO DIARIO RECAUDADO', {
    views: [{ showGridLines: true }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // Configurar anchos de columnas (A a L: 12 columnas)
  ws.columns = [
    { key: 'mes', width: 14 },
    { key: 'semana', width: 16 },
    { key: 'euro', width: 15 },
    { key: 'ucd', width: 15 },
    { key: 'punto_bs', width: 24 },
    { key: 'punto_eur', width: 22 },
    { key: 'transf_bs', width: 26 },
    { key: 'transf_eur', width: 24 },
    { key: 'banesco_bs', width: 26 },
    { key: 'banesco_eur', width: 24 },
    { key: 'bancamiga_bs', width: 26 },
    { key: 'bancamiga_eur', width: 24 },
  ];

  // Incrustar logos en encabezado
  const addLogo = (base64Str: string, colFrom: number, rowFrom: number, width: number, height: number) => {
    try {
      if (!base64Str) return;
      const base64Data = base64Str.split(',')[1] || base64Str;
      const imageId = wb.addImage({ base64: base64Data, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: colFrom, row: rowFrom },
        ext: { width, height }
      });
    } catch (e) {
      console.warn('No se pudo incrustar logo en Excel:', e);
    }
  };

  addLogo(logos.instituto || logos.alcaldia, 0.4, 0.2, 170, 75);
  addLogo(logos.iamec, 10.2, 0.2, 160, 70);

  // Dejar 4 filas para el encabezado con logos
  for (let i = 0; i < 4; i++) {
    ws.addRow([]);
  }

  // Título: MONTO DIARIO RECAUDADO
  const titleRow = ws.addRow(['MONTO DIARIO RECAUDADO']);
  ws.mergeCells(`A${titleRow.number}:L${titleRow.number}`);
  titleRow.height = 24;
  titleRow.getCell(1).font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF000000' } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtítulo: AÑO 2026
  const yearRow = ws.addRow([`AÑO ${anio}`]);
  ws.mergeCells(`A${yearRow.number}:L${yearRow.number}`);
  yearRow.height = 22;
  yearRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F75FE' } }; // Azul brillante oficial
  yearRow.getCell(1).font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  yearRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  yearRow.getCell(1).border = BORDE;

  // Fila de encabezados de tabla
  const headerRow = ws.addRow([
    'MES',
    'SEMANA',
    'EURO',
    'UCD (Bs.)',
    'RECAUDADO POR PUNTO Bs.',
    'CONCILIADO POR PUNTO EN €',
    'CONCILIADO POR TRANSFERENCIA Y/O DEPOSITOS (Bs)',
    'CONCILIADO POR TRANSFERENCIA Y/O DEPOSITOS (€)',
    'RECAUDADO EN EL ESTADO DE CUENTA BANESCO (Bs)',
    'RECAUDADO EN EL ESTADO DE CUENTA BANESCO (€)',
    'RECAUDADO EN EL ESTADO DE CUENTA BANCAMIGA (Bs)',
    'RECAUDADO EN EL ESTADO DE CUENTA BANCAMIGA (€)',
  ]);
  headerRow.height = 38;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; // Azul grisáceo claro
    cell.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDE;
  });

  const startDataRow = ws.rowCount + 1;

  let sumPuntoBs = 0;
  let sumPuntoEur = 0;
  let sumTransfBs = 0;
  let sumTransfEur = 0;
  let sumBanescoBs = 0;
  let sumBanescoEur = 0;
  let sumBancamigaBs = 0;
  let sumBancamigaEur = 0;

  // Llenar datos de cada día
  diasOrdenados.forEach((dia) => {
    const dData = agrupadoPorDia.get(dia)!;
    const [, mm, dd] = dia.split('-');
    const diaNum = parseInt(dd, 10);
    const mesNum = parseInt(mm, 10);

    // Formatear etiqueta de fecha: DD/MM/YY
    const fechaLabel = `${diaNum}/${mesNum}/${String(anio).slice(-2)}`;

    // Tasas promedio del día o última tasa
    const tasaBcvDia = dData.tasasBcv.length
      ? dData.tasasBcv.reduce((acc, t) => acc + t, 0) / dData.tasasBcv.length
      : tcmmvActual || 1;

    const tasaUcdDia = dData.tasaUcd.length
      ? dData.tasaUcd.reduce((acc, t) => acc + t, 0) / dData.tasaUcd.length
      : tasaBcvDia;

    const pBs = r2(dData.puntoBs);
    const pEur = r2(dData.puntoEur);
    const tBs = r2(dData.transfBs);
    const tEur = r2(dData.transfEur);
    const banBs = r2(dData.banescoBs);
    const banEur = r2(dData.banescoEur);
    const bgaBs = r2(dData.bancamigaBs);
    const bgaEur = r2(dData.bancamigaEur);

    sumPuntoBs += pBs;
    sumPuntoEur += pEur;
    sumTransfBs += tBs;
    sumTransfEur += tEur;
    sumBanescoBs += banBs;
    sumBanescoEur += banEur;
    sumBancamigaBs += bgaBs;
    sumBancamigaEur += bgaEur;

    const r = ws.addRow([
      '', // MES (se unirá al final para toda la columna A del mes)
      fechaLabel,
      r2(tasaBcvDia),
      r2(tasaUcdDia),
      pBs,
      pEur,
      tBs,
      tEur,
      banBs,
      banEur,
      bgaBs,
      bgaEur,
    ]);

    r.height = 20;
    r.eachCell((cell, colNumber) => {
      cell.border = BORDE;
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { horizontal: colNumber <= 2 ? 'center' : 'right', vertical: 'middle' };

      if (colNumber === 3 || colNumber === 4) {
        cell.numFmt = '"Bs. "#,##0.00';
      } else if (colNumber === 5 || colNumber === 7 || colNumber === 9 || colNumber === 11) {
        cell.numFmt = '"Bs. "#,##0.00;("Bs. "#,##0.00);"-"';
      } else if (colNumber === 6 || colNumber === 8 || colNumber === 10 || colNumber === 12) {
        cell.numFmt = '"EUR "#,##0.00;("EUR "#,##0.00);"-"';
      }
    });
  });

  const endDataRow = ws.rowCount;

  // Unir la columna A para mostrar el MES vertical y centrado con fondo suave
  if (endDataRow >= startDataRow) {
    ws.mergeCells(`A${startDataRow}:A${endDataRow}`);
    const mesCell = ws.getCell(`A${startDataRow}`);
    mesCell.value = mesNombre;
    mesCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF000000' } };
    mesCell.alignment = { horizontal: 'center', vertical: 'middle' };
    mesCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
    mesCell.border = BORDE;
  }

  // Fila de TOTALES
  const totRow = ws.addRow([
    'TOTAL',
    '',
    '',
    '',
    r2(sumPuntoBs),
    r2(sumPuntoEur),
    r2(sumTransfBs),
    r2(sumTransfEur),
    r2(sumBanescoBs),
    r2(sumBanescoEur),
    r2(sumBancamigaBs),
    r2(sumBancamigaEur),
  ]);
  totRow.height = 24;
  ws.mergeCells(`A${totRow.number}:D${totRow.number}`);
  totRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  totRow.getCell(1).font = { name: 'Arial', bold: true, size: 10 };
  totRow.getCell(1).border = BORDE;

  totRow.eachCell((cell, colNumber) => {
    cell.border = BORDE;
    cell.font = { name: 'Arial', bold: true, size: 10 };
    if (colNumber >= 5) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (colNumber === 5 || colNumber === 7) {
        cell.numFmt = '"Bs. "#,##0.00';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }; // Verde suave
      } else if (colNumber === 6 || colNumber === 8) {
        cell.numFmt = '"EUR "#,##0.00';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; // Azul suave
      } else if (colNumber === 9 || colNumber === 11) {
        cell.numFmt = '"Bs. "#,##0.00';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; // Amarillo suave
      } else if (colNumber === 10 || colNumber === 12) {
        cell.numFmt = '"EUR "#,##0.00';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4DFEC' } }; // Morado suave
      }
    }
  });

  // Espacio
  ws.addRow([]);

  // Cuadro de Resumen inferior (Totales Conciliados y en Cuenta por Banco)
  const totalConciliadoBs = r2(sumPuntoBs + sumTransfBs);
  const totalConciliadoEur = r2(sumPuntoEur + sumTransfEur);
  const totalRecaudadoCuentaBs = r2(sumBanescoBs + sumBancamigaBs);
  const totalRecaudadoCuentaEur = r2(sumBanescoEur + sumBancamigaEur);

  const summaryData = [
    { label: 'TOTAL CONCILIADO EN BOLIVARES (Bs.)', val: totalConciliadoBs, numFmt: '"Bs. "#,##0.00', color: 'FFE2EFDA' },
    { label: 'TOTAL CONCILIADO EN EURO (€)', val: totalConciliadoEur, numFmt: '"EUR "#,##0.00', color: 'FFD9E1F2' },
    { label: 'TOTAL RECAUDADO EN CUENTA BANESCO EN BOLIVARES (Bs.)', val: r2(sumBanescoBs), numFmt: '"Bs. "#,##0.00', color: 'FFFFF2CC' },
    { label: 'TOTAL RECAUDADO EN CUENTA BANESCO EN EURO (€)', val: r2(sumBanescoEur), numFmt: '"EUR "#,##0.00', color: 'FFE4DFEC' },
    { label: 'TOTAL RECAUDADO EN CUENTA BANCAMIGA EN BOLIVARES (Bs.)', val: r2(sumBancamigaBs), numFmt: '"Bs. "#,##0.00', color: 'FFFFF2CC' },
    { label: 'TOTAL RECAUDADO EN CUENTA BANCAMIGA EN EURO (€)', val: r2(sumBancamigaEur), numFmt: '"EUR "#,##0.00', color: 'FFE4DFEC' },
    { label: 'TOTAL RECAUDADO EN CUENTA GENERAL EN BOLIVARES (Bs.)', val: totalRecaudadoCuentaBs, numFmt: '"Bs. "#,##0.00', color: 'FFFFF2CC' },
    { label: 'TOTAL RECAUDADO EN CUENTA GENERAL EN EURO (€)', val: totalRecaudadoCuentaEur, numFmt: '"EUR "#,##0.00', color: 'FFE4DFEC' },
  ];

  summaryData.forEach((sItem) => {
    const sRow = ws.addRow(['', '', sItem.label, '', sItem.val]);
    sRow.height = 20;
    ws.mergeCells(`C${sRow.number}:D${sRow.number}`);

    const labelCell = sRow.getCell(3);
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sItem.color } };
    labelCell.font = { name: 'Arial', bold: true, size: 9 };
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    labelCell.border = BORDE;

    const valCell = sRow.getCell(5);
    valCell.value = sItem.val;
    valCell.numFmt = sItem.numFmt;
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sItem.color } };
    valCell.font = { name: 'Arial', bold: true, size: 10 };
    valCell.alignment = { horizontal: 'right', vertical: 'middle' };
    valCell.border = BORDE;
  });

  // Espacio
  ws.addRow([]);

  // Nota importante al pie
  const noteRow = ws.addRow([
    'NOTA IMPORTANTE: Las conciliaciones bancarias correspondientes a transferencias electrónicas se efectúan conforme a la recepción de los estados de cuenta emitidos por el IAMEC; en consecuencia, los saldos registrados están sujetos a variaciones diarias.'
  ]);
  ws.mergeCells(`A${noteRow.number}:L${noteRow.number}`);
  noteRow.height = 30;
  const noteCell = noteRow.getCell(1);
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  noteCell.font = { name: 'Arial', bold: true, size: 9 };
  noteCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  noteCell.border = BORDE;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Monto_Diario_Recaudado_${mesNombre}_${anio}.xlsx`);
}
