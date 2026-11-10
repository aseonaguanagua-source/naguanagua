import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabase';
import { logos } from '@/lib/logosBase64';

const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const cleanId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const fechaVE = (d: any): string => {
  if (!d) return '';
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const x = new Date(s);
  return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
};

const dmy = (iso: string): string => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

const TIPO_LABEL: Record<string, string> = {
  especial: 'Servicio Especial',
  extraordinario: 'Servicio Extraordinario',
  inspeccion: 'Inspección',
  visto_bueno: 'Visto Bueno Ambiental',
  tala_poda: 'Permisos (Tala/Poda)',
};

export interface GenerarReporteServiciosOptions {
  servicios?: any[];
  pagos?: any[];
  contribuyentes?: any[];
  fechaInicio?: string;
  fechaFin?: string;
  tipoFiltro?: string; // 'Todos' | 'esp_ext' | 'especial' | 'extraordinario' | 'inspeccion' | 'visto_bueno' | 'tala_poda'
  estadoFiltro?: string; // 'Todos' | 'Pagado' | 'Pendiente' | 'Por Verificar'
}

export async function generarReporteServiciosExcel(opts: GenerarReporteServiciosOptions = {}) {
  const {
    contribuyentes = [],
    fechaInicio = '',
    fechaFin = '',
    tipoFiltro = 'Todos',
    estadoFiltro = 'Todos',
  } = opts;

  // 1. Obtener registros frescos de servicios_especiales desde Supabase si no se pasaron
  let listaServicios: any[] = Array.isArray(opts.servicios) && opts.servicios.length > 0 ? opts.servicios : [];
  if (listaServicios.length === 0) {
    const { data, error } = await supabase
      .from('servicios_especiales')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      alert('Error al consultar los servicios en base de datos: ' + error.message);
      return;
    }
    listaServicios = data || [];
  }

  // 2. Filtrar por rango de fechas, tipo y estado
  const filtrados = listaServicios.filter((s: any) => {
    const fCreacion = s.created_at ? fechaVE(s.created_at) : '';
    const fBase = (s.fecha && s.fecha_evento && s.fecha === s.fecha_evento && fCreacion)
      ? fCreacion
      : (fechaVE(s.fecha) || fCreacion);

    if (fechaInicio && fBase && fBase < fechaInicio) return false;
    if (fechaFin && fBase && fBase > fechaFin) return false;

    const t = String(s.tipo || '').toLowerCase();
    if (tipoFiltro === 'esp_ext') {
      if (t !== 'especial' && t !== 'extraordinario') return false;
    } else if (tipoFiltro && tipoFiltro !== 'Todos') {
      if (t !== tipoFiltro) return false;
    }

    if (estadoFiltro && estadoFiltro !== 'Todos') {
      const est = String(s.estado || 'Pendiente');
      if (estadoFiltro === 'Por Verificar') {
        if (est !== 'Por Verificar' && est !== 'En Revisión') return false;
      } else if (est !== estadoFiltro) {
        return false;
      }
    }

    return true;
  });

  if (filtrados.length === 0) {
    alert('No hay servicios registrados con los filtros seleccionados.');
    return;
  }

  // Ordenar cronológicamente por fecha de emisión/creación
  filtrados.sort((a: any, b: any) => {
    const fa = a.created_at || a.fecha || '';
    const fb = b.created_at || b.fecha || '';
    return String(fa).localeCompare(String(fb));
  });

  // 3. Cargar mapa de inmuebles por identidad para resolver código URB y dirección cuando no estén en el servicio
  const inmByIdentidad = new Map<string, { codigo: string; direccion: string }>();
  try {
    const idents = Array.from(
      new Set(
        filtrados
          .filter((s: any) => !s.inmueble && s.identidad)
          .map((s: any) => String(s.identidad).trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (idents.length > 0) {
      const { data: inms } = await supabase
        .from('inmuebles')
        .select('inmueble, identidad, direccion, padre_id')
        .in('identidad', idents);
      (inms || []).forEach((r: any) => {
        const cid = cleanId(r.identidad);
        if (cid && (!inmByIdentidad.has(cid) || !r.padre_id)) {
          inmByIdentidad.set(cid, {
            codigo: String(r.inmueble || '').trim().toUpperCase(),
            direccion: String(r.direccion || '').trim(),
          });
        }
      });
    }
  } catch (e) {
    console.warn('No se pudo cargar mapa de inmuebles para ReporteServicios:', e);
  }

  // 4. Cargar pagos vinculados para determinar fecha de pago exacta
  const pagoFechaPorRef = new Map<string, string>();
  const pagoFechaPorId = new Map<string, string>();
  try {
    let pagosFuente = Array.isArray(opts.pagos) && opts.pagos.length > 0 ? opts.pagos : [];
    if (pagosFuente.length === 0) {
      const { data: pData } = await supabase
        .from('pagos_reportados')
        .select('id, referencia, estado, created_at, detalles')
        .not('estado', 'in', '(Rechazado,Reversado,Condonado,Anulado)')
        .order('created_at', { ascending: false })
        .limit(3000);
      pagosFuente = pData || [];
    }
    pagosFuente.forEach((p: any) => {
      if (['Rechazado', 'Reversado', 'Condonado', 'Anulado'].includes(String(p.estado || ''))) return;
      let det: any = {};
      try {
        det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {});
      } catch {}
      const fPago = fechaVE(det.fecha_banco || det.fecha_transaccion || p.created_at);
      if (p.id && fPago) pagoFechaPorId.set(String(p.id), fPago);
      const servsEnPago = [
        ...(Array.isArray(det.servicios) ? det.servicios : []),
        ...(Array.isArray(det.tala_poda) ? det.tala_poda : []),
        ...(Array.isArray(det.recibos) ? det.recibos : []),
      ];
      servsEnPago.forEach((item: any) => {
        const refS = String(typeof item === 'string' ? item : (item?.referencia || item?.id || '')).trim().toUpperCase();
        if (refS && fPago) pagoFechaPorRef.set(refS, fPago);
      });
    });
  } catch (e) {
    console.warn('No se pudo cruzar pagos para ReporteServicios:', e);
  }

  // 5. Construir libro de Excel con el formato exacto de "Reporte de Servicios Especiales y Extraordinarios.xlsx"
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reporte Servicios Esp-Ext', {
    views: [{ showGridLines: true }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: 'tipo', width: 20 },
    { key: 'fecha', width: 13 },
    { key: 'codigo', width: 15 },
    { key: 'nombre', width: 52 },
    { key: 'direccion', width: 42 },
    { key: 'fecha_realizar', width: 20 },
    { key: 'monto', width: 16 },
    { key: 'pagado', width: 14 },
  ];

  const addLogo = (base64Str: string, colFrom: number, rowFrom: number, width: number, height: number) => {
    try {
      if (!base64Str) return;
      const base64Data = base64Str.split(',')[1] || base64Str;
      const imageId = wb.addImage({ base64: base64Data, extension: 'png' });
      ws.addImage(imageId, {
        tl: { col: colFrom, row: rowFrom } as any,
        ext: { width, height },
      });
    } catch (e) {
      console.warn('No se pudo incrustar logo en ReporteServicios:', e);
    }
  };

  // Filas 1 a 8 de encabezado con altura explícita (15pt) para que el anclaje de imágenes sea exacto en Excel, Numbers y QuickLook
  for (let r = 1; r <= 8; r++) {
    const emptyRow = ws.addRow([]);
    emptyRow.height = 15;
  }
  ['A2:F2', 'A3:F3', 'A4:F4', 'A5:F5', 'A6:F6'].forEach(range => {
    try { ws.mergeCells(range); } catch {}
  });

  // Logos superiores (Instituto a la izquierda, IAMEC a la derecha dentro del ancho de la tabla)
  addLogo((logos as any).instituto || logos.alcaldia, 0.18, 1.05, 151, 54);
  addLogo(logos.iamec, 6.3, 1.05, 140, 43);

  // Fila 9: Cinta verde "SERVICIOS ESPECIALES Y EXTRAORDINARIOS"
  const tituloCinta =
    tipoFiltro && tipoFiltro !== 'Todos' && tipoFiltro !== 'esp_ext' && TIPO_LABEL[tipoFiltro]
      ? `REPORTE DE ${TIPO_LABEL[tipoFiltro].toUpperCase()}`
      : 'SERVICIOS ESPECIALES Y EXTRAORDINARIOS';

  const row9 = ws.getRow(9);
  row9.height = 18;
  ws.mergeCells('A9:H9');
  for (let c = 1; c <= 8; c++) {
    const cell = row9.getCell(c);
    cell.value = tituloCinta;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDE;
  }

  // Fila 10: Encabezados de tabla
  const headers = [
    'Tipo de Servicio',
    'Fecha',
    'Código',
    'Nombre',
    'Dirección',
    'Fecha a Realizar ',
    'Monto a Pagar',
    'Pagado',
  ];
  const row10 = ws.getRow(10);
  row10.height = 30.75;
  headers.forEach((h, idx) => {
    const cell = row10.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDE;
  });

  // Filas de datos (desde fila 11)
  const startDataRow = 11;
  let sumaMonto = 0;

  filtrados.forEach((s: any) => {
    const tipoKey = String(s.tipo || '').toLowerCase();
    const tipoLabel = TIPO_LABEL[tipoKey] || String(s.tipo || 'Servicio Especial');

    // Fecha de emisión
    const fCreacion = s.created_at ? fechaVE(s.created_at) : '';
    const fEmisionISO = (s.fecha && s.fecha_evento && s.fecha === s.fecha_evento && fCreacion)
      ? fCreacion
      : (fechaVE(s.fecha) || fCreacion);
    const fechaEmisionTexto = fEmisionISO ? dmy(fEmisionISO) : '';

    // Código (URB... si existe, o referencia del servicio)
    const cid = cleanId(s.identidad);
    const inmInfo = cid ? inmByIdentidad.get(cid) : undefined;
    const cnt = cid ? contribuyentes.find((x: any) => cleanId(x.Identidad || x.identidad) === cid) : undefined;
    const codContrib = String(cnt?.CodCont || cnt?.cod_cont || '').split(/\s+/).filter(Boolean)[0] || '';
    const codigoFinal = String(s.inmueble || inmInfo?.codigo || codContrib || s.referencia || 'S/C').trim().toUpperCase();

    // Nombre (Contribuyente; y únicamente si es Servicio Especial con nombre_evento corto, agregarlo entre paréntesis)
    const contribNombre = String(s.contribuyente || cnt?.Contribuyente || s.identidad || '').trim();
    const eventoRaw = tipoKey === 'especial' ? String(s.nombre_evento || '').trim() : '';
    const esDescGenerica = /^(Servicio Especial|Servicio Extraordinario|Inspecci[oó]n|Visto Bueno|Permiso|Tala|Poda|Verificaci[oó]n|Material)/i.test(eventoRaw);
    const mostrarEvento =
      eventoRaw &&
      eventoRaw.length <= 50 &&
      !esDescGenerica &&
      eventoRaw.toUpperCase() !== contribNombre.toUpperCase() &&
      !contribNombre.toUpperCase().includes(eventoRaw.toUpperCase());
    const nombreFinal = mostrarEvento ? `${contribNombre} (${eventoRaw})` : contribNombre;

    // Dirección
    let direccionRaw = String(
      s.direccion_evento ||
      s.lugar ||
      s.direccion ||
      inmInfo?.direccion ||
      cnt?.Direccion ||
      ''
    ).trim();
    if (!direccionRaw && s.descripcion) {
      const mDir = String(s.descripcion).match(/Dir:\s*([^(]+)/i);
      if (mDir && mDir[1]) direccionRaw = mDir[1].trim();
    }
    const direccionFinal = direccionRaw;

    // Fecha a Realizar
    const fDesde = fechaVE(s.fecha_evento || s.fecha || '');
    const fHasta = fechaVE(
      s.fecha_evento_hasta ||
      String(s.notas || '').match(/\[FECHA_HASTA:([^\]]*)\]/)?.[1] ||
      ''
    );
    let fechaRealizarTexto = fDesde ? dmy(fDesde) : '';
    if (fDesde && fHasta && fDesde !== fHasta) {
      const [y1, m1, d1] = fDesde.split('-');
      const [y2, m2, d2] = fHasta.split('-');
      if (y1 === y2 && m1 === m2) {
        fechaRealizarTexto = `${d1}-${d2}/${m1}/${y1}`;
      } else if (y1 === y2) {
        fechaRealizarTexto = `${d1}/${m1} al ${d2}/${m2}/${y2}`;
      } else {
        fechaRealizarTexto = `${d1}/${m1}/${y1} al ${d2}/${m2}/${y2}`;
      }
    }

    // Monto a Pagar
    const montoNum = r2(Number(s.monto ?? s.monto_bs ?? 0));
    sumaMonto = r2(sumaMonto + montoNum);

    // Pagado (fecha de pago si está pagado, o estado actual)
    const refUpper = String(s.referencia || '').trim().toUpperCase();
    const fPagoDetectada =
      (s.pago_id ? pagoFechaPorId.get(String(s.pago_id)) : '') ||
      (refUpper ? pagoFechaPorRef.get(refUpper) : '');

    let pagadoTexto = '';
    if (String(s.estado || '') === 'Pagado' || fPagoDetectada) {
      const fPagISO = fPagoDetectada || fechaVE(s.updated_at) || fEmisionISO;
      pagadoTexto = fPagISO ? dmy(fPagISO) : 'Pagado';
    } else if (String(s.estado || '') === 'Por Verificar' || String(s.estado || '') === 'En Revisión') {
      pagadoTexto = 'Por Verificar';
    } else {
      pagadoTexto = 'Pendiente';
    }

    const r = ws.addRow([
      tipoLabel,
      fechaEmisionTexto,
      codigoFinal,
      nombreFinal,
      direccionFinal,
      fechaRealizarTexto,
      montoNum,
      pagadoTexto,
    ]);

    // Calcular altura explícita de la fila considerando texto en mayúsculas (Nombre ancho 52, Dirección ancho 42)
    // para que los visores de Excel/Numbers/QuickLook posicionen los logos inferiores siempre debajo del TOTAL.
    const linesNombre = Math.max(1, Math.ceil(nombreFinal.length / 36));
    const linesDir = Math.max(1, Math.ceil(direccionFinal.length / 28));
    const maxLines = Math.max(linesNombre, linesDir);
    r.height = maxLines === 1 ? 22 : maxLines === 2 ? 36 : maxLines * 17 + 6;

    r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = BORDE;
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: colNumber === 7,
        color: { argb: 'FF000000' },
      };
      if (colNumber === 4) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
      if (colNumber === 7) {
        cell.numFmt = '[$Bs.-46B] #,##0.00';
      }
    });
  });

  const endDataRow = ws.rowCount;

  // Fila de TOTAL (amarilla en columnas F y G)
  const totalRow = ws.addRow(['', '', '', '', '', 'TOTAL', { formula: `SUM(G${startDataRow}:G${endDataRow})`, result: sumaMonto }, '']);
  totalRow.height = 22;
  const cellTotalLabel = totalRow.getCell(6);
  cellTotalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  cellTotalLabel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
  cellTotalLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  cellTotalLabel.border = BORDE;

  const cellTotalVal = totalRow.getCell(7);
  cellTotalVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  cellTotalVal.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
  cellTotalVal.numFmt = '[$Bs.-46B] #,##0.00';
  cellTotalVal.alignment = { horizontal: 'center', vertical: 'middle' };
  cellTotalVal.border = BORDE;

  // Filas inferiores explícitas e incrustación de los 3 logos institucionales debajo de la tabla
  for (let i = 0; i < 5; i++) {
    const fr = ws.addRow([]);
    fr.height = 18;
  }
  const footerStartRow = totalRow.number + 1;
  addLogo((logos as any).naguanaguaTeQuiero, 0.30, footerStartRow + 0.2, 113, 45);
  addLogo((logos as any).lacava, 3.8, footerStartRow + 0.8, 93, 24);
  addLogo((logos as any).elizabeth, 6.3, footerStartRow + 0.8, 120, 23);

  const buffer = await wb.xlsx.writeBuffer();
  const rangoNombre = fechaInicio && fechaFin ? `_${fechaInicio}_al_${fechaFin}` : '';
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Reporte_de_Servicios_Especiales_y_Extraordinarios${rangoNombre}.xlsx`
  );
}
