import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { codigosDePago, parseDet } from './LibroVentas';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const dmy = (iso: string) => {
  const [y, m, d] = String(iso || '').split('-');
  return d ? `${d}/${m}/${y}` : iso;
};
const fechaISO = (d: any) => {
  const x = new Date(d);
  return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
};

const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

/**
 * REPORTE DE RECIBOS DE PAGOS
 * Estructura oficial según plantilla: REPORTE DE RECIBOS DE PAGOS.xlsx
 * Columnas:
 * [1: vacía (3)]
 * [2: N° Op.]
 * [3: CODIGO]
 * [4: Fecha Doc.]
 * [5: N° RIF/CI]
 * [6: Nombre o Razón Social]
 * [7: N° DE RECIBO]
 * [8: SERVICIO DE ASEO]
 * [9: MULTAS]
 * [10: TOTAL]
 * Pie:
 * TOTAL SERVICIO DE ASEO
 * TOTAL MULTAS
 * TOTAL CONCILIADO
 */
export async function generarReporteRecibosPagos(
  pagos: any[],
  contribuyentes: any[],
  fechaInicio: string,
  fechaFin: string
) {
  // Filtrar pagos que sean recibos (no tienen factura digital con número de documento emitido)
  // y que no sean retenciones puras o pagos anulados
  const recibosList = pagos.filter(p => {
    const estado = String(p.estado || '').toLowerCase();
    if (estado.includes('anulad') || estado.includes('rechaz') || estado.includes('revers')) return false;
    if (/retenci/i.test(String(p.tipo || ''))) return false;
    const det = parseDet(p);
    const fd = det.factura_digital || {};
    // Si tiene factura digital formal con número de documento y no está anulada, es factura (va al Libro de Ventas)
    if (fd.emitida && fd.numero_documento && !fd.anulada) {
      return false;
    }
    return true;
  }).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  if (recibosList.length === 0) {
    alert('No se encontraron recibos de pago en el rango seleccionado.');
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');

  // Configuración de anchos de columna
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 10;  // N° Op.
  ws.getColumn(3).width = 16;  // CODIGO
  ws.getColumn(4).width = 14;  // Fecha Doc.
  ws.getColumn(5).width = 16;  // N° RIF/CI
  ws.getColumn(6).width = 38;  // Nombre o Razón Social
  ws.getColumn(7).width = 24;  // N° DE RECIBO
  ws.getColumn(8).width = 18;  // SERVICIO DE ASEO
  ws.getColumn(9).width = 15;  // MULTAS
  ws.getColumn(10).width = 18; // TOTAL

  // Título: Fila 1 (Merge B1:J1)
  ws.mergeCells('B1:J1');
  const titCell = ws.getCell('B1');
  titCell.value = 'REPORTE DE RECIBOS DE PAGOS';
  titCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F4E78' } };
  titCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Subtítulo con período: Fila 2 (Merge B2:J2)
  ws.mergeCells('B2:J2');
  const subTit = ws.getCell('B2');
  subTit.value = `Período: ${dmy(fechaInicio.slice(0, 10))} al ${dmy(fechaFin.slice(0, 10))}`;
  subTit.font = { name: 'Arial', size: 10, italic: true };
  subTit.alignment = { horizontal: 'center', vertical: 'middle' };

  // Cabecera: Fila 3
  const headers = [
    'N° Op.',
    'CODIGO',
    'Fecha Doc.',
    'N° RIF/CI',
    'Nombre o Razón Social',
    'N° DE RECIBO',
    'SERVICIO DE ASEO',
    'MULTAS',
    'TOTAL'
  ];

  const hRow = ws.getRow(3);
  hRow.height = 24;
  headers.forEach((h, idx) => {
    const colIdx = idx + 2; // Empezando en columna B (2)
    const cell = hRow.getCell(colIdx);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDE;
  });

  const nombreDe = (id: string, det: any) => {
    const c = contribuyentes.find((x: any) => String(x.Identidad || x.identidad).trim().toUpperCase() === String(id).trim().toUpperCase());
    return c?.Contribuyente || c?.contribuyente || det.contribuyente_nombre || det.recibo_caja?.[0]?.razonSocial || (det.contribuyente && det.contribuyente !== id ? det.contribuyente : '') || id;
  };

  let rowIdx = 4;
  let totalAseo = 0;
  let totalMultas = 0;
  let totalGeneral = 0;

  recibosList.forEach((p, idx) => {
    const det = parseDet(p);
    const montoTotal = r2(Number(p.monto) || 0);

    // Calcular desglose de multas y aseo
    let montoMultas = 0;
    let montoAseo = montoTotal;

    // 1. Si tiene detalle de recibos de caja con desglose de conceptos
    if (Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0) {
      let sumMulta = 0;
      let sumBase = 0;
      det.recibo_caja.forEach((rc: any) => {
        if (Array.isArray(rc.conceptos)) {
          rc.conceptos.forEach((c: any) => {
            const m = Number(c.monto || c.total || c.precioUnit) || 0;
            if (/multa/i.test(String(c.descripcion || c.concepto || ''))) {
              sumMulta += m;
            } else {
              sumBase += m;
            }
          });
        }
      });
      if (sumMulta > 0) {
        montoMultas = r2(sumMulta);
      }
    }

    // 2. Si no se obtuvo de recibo_caja, revisar campos directos o líneas de condominio
    if (!montoMultas) {
      if (Number(det.monto_multas || det.multa || 0) > 0) {
        montoMultas = r2(Number(det.monto_multas || det.multa));
      } else if (det.condominio && Array.isArray(det.condominio.lineas)) {
        let sumCondoMulta = 0;
        det.condominio.lineas.forEach((l: any) => {
          if (Number(l.multaBs || 0) > 0) sumCondoMulta += Number(l.multaBs);
        });
        if (sumCondoMulta > 0) montoMultas = r2(sumCondoMulta);
      } else if (Array.isArray(det.deuda_previa) && det.deuda_previa.length > 0) {
        // En deuda previa del pago registrado en caja
        let sumPrevMulta = 0;
        det.deuda_previa.forEach((dp: any) => {
          if (Number(dp.multa_bs || 0) > 0) sumPrevMulta += Number(dp.multa_bs);
        });
        if (sumPrevMulta > 0) montoMultas = r2(Math.min(sumPrevMulta, montoTotal));
      }
    }

    // Asegurar que multas no exceda el total pagado y calcular aseo
    if (montoMultas > montoTotal) montoMultas = montoTotal;
    montoAseo = r2(Math.max(0, montoTotal - montoMultas));

    // Código del inmueble o condominio principal (sin desglosar hijos)
    const codigos = codigosDePago(det, p);
    const codigoPrincipal = codigos[0] || det.codigo_inmueble || det.cod_inmueble || p.inmueble || '-';

    // Número de recibo
    const nroRecibo = det.recibo_caja?.[0]?.controlWeb || 
                      det.recibo_caja?.[0]?.reciboNo || 
                      det.recibo_no || 
                      det.recibo_digital?.numero ||
                      p.referencia || 
                      '-';

    const fechaDoc = fechaISO(p.created_at);
    const rifCi = p.identidad || '-';
    const nombre = nombreDe(p.identidad, det);

    const row = ws.getRow(rowIdx++);
    const vals = [
      idx + 1,
      codigoPrincipal,
      dmy(fechaDoc),
      rifCi,
      nombre,
      nroRecibo,
      montoAseo,
      montoMultas,
      montoTotal
    ];

    vals.forEach((v, cIdx) => {
      const cell = row.getCell(cIdx + 2);
      cell.value = v;
      cell.border = BORDE;
      cell.font = { size: 9 };
      if (cIdx === 0 || cIdx === 1 || cIdx === 2 || cIdx === 3 || cIdx === 5) {
        cell.alignment = { horizontal: 'center' };
      }
      if (cIdx >= 6) {
        cell.numFmt = '"Bs. "#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }
    });

    totalAseo += montoAseo;
    totalMultas += montoMultas;
    totalGeneral += montoTotal;
  });

  // Espacio antes de los totales del pie
  rowIdx++;

  // Pie de totales según formato:
  // TOTAL SERVICIO DE ASEO
  const rAseo = ws.getRow(rowIdx++);
  rAseo.getCell(7).value = 'TOTAL SERVICIO DE ASEO';
  rAseo.getCell(7).font = { bold: true, size: 9 };
  rAseo.getCell(8).value = r2(totalAseo);
  rAseo.getCell(8).font = { bold: true, size: 9 };
  rAseo.getCell(8).numFmt = '"Bs. "#,##0.00';
  rAseo.getCell(7).border = BORDE;
  rAseo.getCell(8).border = BORDE;

  // TOTAL MULTAS
  const rMultas = ws.getRow(rowIdx++);
  rMultas.getCell(7).value = 'TOTAL MULTAS';
  rMultas.getCell(7).font = { bold: true, size: 9 };
  rMultas.getCell(8).value = r2(totalMultas);
  rMultas.getCell(8).font = { bold: true, size: 9 };
  rMultas.getCell(8).numFmt = '"Bs. "#,##0.00';
  rMultas.getCell(7).border = BORDE;
  rMultas.getCell(8).border = BORDE;

  // TOTAL CONCILIADO
  const rTot = ws.getRow(rowIdx++);
  rTot.getCell(7).value = 'TOTAL CONCILIADO';
  rTot.getCell(7).font = { bold: true, size: 10, color: { argb: 'FF1F4E78' } };
  rTot.getCell(8).value = r2(totalGeneral);
  rTot.getCell(8).font = { bold: true, size: 10, color: { argb: 'FF1F4E78' } };
  rTot.getCell(8).numFmt = '"Bs. "#,##0.00';
  rTot.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
  rTot.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
  rTot.getCell(7).border = BORDE;
  rTot.getCell(8).border = BORDE;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `REPORTE_DE_RECIBOS_DE_PAGOS_${fechaInicio.slice(0, 10)}_${fechaFin.slice(0, 10)}.xlsx`);
}
