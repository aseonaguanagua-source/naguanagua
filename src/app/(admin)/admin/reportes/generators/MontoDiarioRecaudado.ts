import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabase';
import { logos } from '@/lib/logosBase64';
import { clasificarBancoDestino } from '@/lib/cuentasBancarias';
import { aplicarMontoReporte } from '../montoReporte';

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

const dmy = (iso: string) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : iso;
};

const fechaVE = (d: any) => {
  const x = new Date(d);
  return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
};

function parseDet(p: any): any {
  if (!p?.detalles) return {};
  if (typeof p.detalles === 'object') return p.detalles;
  try { return JSON.parse(p.detalles); } catch { return {}; }
}

const esAnulado = (p: any) => {
  if (['Anulado', 'Reversado', 'Condonado', 'Rechazado', 'Por Verificar', 'Pendiente'].includes(String(p.estado || ''))) return true;
  if (String(p.estado || '') === 'Aprobado') return false;
  const det = parseDet(p);
  const caj = String(det?.cajero || det?.analista || '').trim();
  if (/^(dz-)?dzara$|^c-dzara$/i.test(caj)) return true;
  return false;
};

function isSaldoPago(p: any) {
  const t = String(p.tipo || '').toUpperCase().trim();
  const det = parseDet(p);
  if (t && !t.includes('SALDO') && !t.includes('NOTA DE CREDITO') && !t.includes('NOTA DE CRÉDITO')) {
    return false;
  }
  const paList = Array.isArray(det.pagos_agregados) ? det.pagos_agregados : [];
  if (paList.some((x: any) => x?.metodo && !String(x.metodo).toUpperCase().includes('SALDO'))) {
    return false;
  }
  const detTipo = String(det.tipo || '').toUpperCase();
  return t.includes('SALDO') || t.includes('NOTA DE CREDITO') || t.includes('NOTA DE CRÉDITO') ||
         detTipo.includes('SALDO') || detTipo.includes('NOTA DE CREDITO') || detTipo.includes('NOTA DE CRÉDITO') ||
         Boolean(det.es_saldo_a_favor || det.es_nota_credito);
}

const esRetencion = (p: any) => /retenci/i.test(String(p.tipo || ''));
const esSaldoFavor = (p: any) => /saldo a favor|nota de cr[eé]dito/i.test(String(p.tipo || '')) || isSaldoPago(p);
const esDebito = (p: any) => !esSaldoFavor(p) && /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta/i.test(String(p.tipo || '').trim());

function parseMontoNumero(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).trim();
  if (s.includes(',') && s.includes('.')) {
    return Number(s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) || 0;
  }
  if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
  return Number(s) || 0;
}

function obtenerMontoTransfCuadre(p: any, det?: any): number {
  const d = det || parseDet(p);
  const mBase = parseMontoNumero(p?.monto);
  const mConc = parseMontoNumero(d?.monto_conciliado);
  const esMultiple = Boolean(
    d?.es_pago_adicional ||
    d?.abono_completado ||
    (Array.isArray(d?.pagos_agregados) && d.pagos_agregados.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1) ||
    (Array.isArray(d?.formasPago) && d.formasPago.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1)
  );
  if (esMultiple && mBase > 0 && mConc > mBase + 1) {
    return mBase;
  }
  if (mConc > 0 && (!Array.isArray(d?.pagos_agregados) || !d.pagos_agregados.some((x: any) => /saldo\s*a\s*favor/i.test(String(x?.referencia || x?.metodo || ''))))) {
    return mConc;
  }
  return mBase || mConc;
}

const parseFechaCaracas = (raw: any): Date | null => {
  if (!raw) return null;
  const str = String(raw).trim();
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const ymd = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    const d = new Date(`${ymd}T12:00:00-04:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?(Z|\+00:00)?)?$/i.test(str)) {
    const d = new Date(`${str.slice(0, 10)}T12:00:00-04:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

const obtenerFechaEfectivaCuadre = (p: any, det: any, pagoPorId: Map<string, any>): Date => {
  const corrList = Array.isArray(det.correcciones_reporte) ? det.correcciones_reporte : [];
  const lastCorr = corrList.length > 0 ? corrList[corrList.length - 1] : null;
  const corrTieneFecha = Boolean(
    lastCorr?.fecha_nueva &&
    String(lastCorr.fecha_anterior || '').slice(0, 10) !== String(lastCorr.fecha_nueva).slice(0, 10)
  );
  if (corrTieneFecha && lastCorr?.fecha_nueva) {
    const dCorr = parseFechaCaracas(lastCorr.fecha_nueva);
    if (dCorr) return dCorr;
  }
  if (!esDebito(p)) {
    const fd = det.factura_digital || {};
    const pagoPadre = det.pago_principal_id ? pagoPorId.get(String(det.pago_principal_id)) : null;
    const detPadre = pagoPadre ? parseDet(pagoPadre) : null;
    const fdPadre = detPadre?.factura_digital || {};
    const rc0 = Array.isArray(det.recibo_caja) ? det.recibo_caja[0] : det.recibo_caja;
    const rcPadre0 = Array.isArray(detPadre?.recibo_caja) ? detPadre.recibo_caja[0] : detPadre?.recibo_caja;

    const candidatos = [
      det.fecha_emision_override,
      (fd.emitida || fd.numero_documento || fd.numero_control) ? fd.fecha_emision : '',
      detPadre?.fecha_emision_override,
      (fdPadre?.emitida || fdPadre?.numero_documento || fdPadre?.numero_control) ? fdPadre.fecha_emision : '',
      rc0?.fechaEmision,
      rcPadre0?.fechaEmision,
      det.fecha_transaccion,
      rc0?.fechaIngresoCaja,
      rcPadre0?.fechaIngresoCaja,
      det.fecha_ingreso_caja,
    ];
    for (const c of candidatos) {
      const dCand = parseFechaCaracas(c);
      if (dCand) return dCand;
    }
    const createdStr = String(p.created_at || '');
    if (createdStr.includes('T16:00:00') && det.recibo_caja_at) {
      const dReal = new Date(det.recibo_caja_at);
      if (!isNaN(dReal.getTime())) return dReal;
    }
  }
  return new Date(p.created_at);
};

const formatDiaCaracas = (d: Date, fallbackCreatedAt?: any): string => {
  try {
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);
    }
  } catch {}
  return fechaVE(fallbackCreatedAt);
};

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
  const dFromStr = String(fechaInicio || '').split('T')[0];
  const dToStr = String(fechaFin || '').split('T')[0];

  // Consultar siempre la base de datos fresca igual que Total Puntos de Venta y Cuadre de Caja
  let rawPagos = (pagos || []).map((p: any) => aplicarMontoReporte(p));
  try {
    const fresh: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('pagos_reportados')
        .select('*')
        .not('estado', 'in', '(Reversado,Condonado)')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      fresh.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (fresh.length > 0) {
      rawPagos = fresh.map((p: any) => aplicarMontoReporte(p));
    }
  } catch {}

  const pagoPorId = new Map<string, any>();
  for (const p of (rawPagos || [])) {
    if (p?.id) pagoPorId.set(String(p.id), p);
  }

  // Agrupar por día YYYY-MM-DD
  interface DiaData {
    fecha: string;
    puntoBs: number;
    transfBs: number;
    banescoBs: number;
    bancamigaBs: number;
    tasasPosDia: number[];
    tasasTodasDia: number[];
  }

  const agrupadoPorDia = new Map<string, DiaData>();
  const ensureDia = (fDia: string): DiaData => {
    if (!agrupadoPorDia.has(fDia)) {
      agrupadoPorDia.set(fDia, {
        fecha: fDia,
        puntoBs: 0,
        transfBs: 0,
        banescoBs: 0,
        bancamigaBs: 0,
        tasasPosDia: [],
        tasasTodasDia: [],
      });
    }
    return agrupadoPorDia.get(fDia)!;
  };

  // 1) PUNTOS DE VENTA (Débito / Crédito / TMD / TVD):
  // Exactamente el mismo filtro y suma que generarTotalPuntosVenta en ReportesCaja.ts
  rawPagos.forEach((p: any) => {
    if (esAnulado(p) || esRetencion(p) || esSaldoFavor(p)) return;
    const det = parseDet(p);

    // Registrar tasa BCV oficial del día de creación para el cálculo de la moda diaria
    const diaCreacion = fechaVE(p.created_at);
    const rate = Number(
      det.tasa_bcv ||
      det.tasaBcv ||
      det.tcmmv ||
      det.tasa ||
      det.tasa_bcv_conciliacion ||
      det.tasa_bcv_original ||
      0
    ) || 0;

    if (esDebito(p)) {
      if (!diaCreacion || (dFromStr && diaCreacion < dFromStr) || (dToStr && diaCreacion > dToStr)) return;
      const montoBs = Number(p.monto) || 0;
      if (montoBs <= 0) return;
      const diaObj = ensureDia(diaCreacion);
      diaObj.puntoBs += montoBs;
      if (rate > 10) {
        diaObj.tasasPosDia.push(r2(rate));
        diaObj.tasasTodasDia.push(r2(rate));
      }
      const bClass = clasificarBancoDestino(p);
      if (bClass === 'Bancamiga') {
        diaObj.bancamigaBs += montoBs;
      } else {
        diaObj.banescoBs += montoBs;
      }
    }
  });

  // 2) TRANSFERENCIAS Y DEPÓSITOS CONCILIADOS:
  // Exactamente la misma fecha efectiva (obtenerFechaEfectivaCuadre) y monto (obtenerMontoTransfCuadre + aplicarMontoReporte) que CuadreCaja.tsx
  const pagosConMontoReporte = (rawPagos || []).map((p: any) => aplicarMontoReporte(p));
  pagosConMontoReporte.forEach((p: any) => {
    if (esAnulado(p) || esRetencion(p) || esSaldoFavor(p) || esDebito(p)) return;
    const det = parseDet(p);
    const dEf = obtenerFechaEfectivaCuadre(p, det, pagoPorId);
    const fDia = formatDiaCaracas(dEf, p.created_at);
    if (!fDia || (dFromStr && fDia < dFromStr) || (dToStr && fDia > dToStr)) return;

    const tUpper = String(p.tipo || '').toUpperCase().trim();
    const isDeposito = tUpper.includes('DEPOSITO') || tUpper.includes('DEPÓSITO');
    const montoBs = isDeposito ? (parseFloat(p.monto) || 0) : obtenerMontoTransfCuadre(p, det);
    if (montoBs <= 0) return;

    const diaObj = ensureDia(fDia);
    diaObj.transfBs += montoBs;

    const rate = Number(
      det.tasa_bcv_conciliacion ||
      det.tasa_bcv ||
      det.tasaBcv ||
      det.tcmmv ||
      det.tasa ||
      det.tasa_bcv_original ||
      0
    ) || 0;
    if (rate > 10) {
      diaObj.tasasTodasDia.push(r2(rate));
    }

    const bClass = clasificarBancoDestino(p);
    if (bClass === 'Bancamiga') {
      diaObj.bancamigaBs += montoBs;
    } else {
      diaObj.banescoBs += montoBs;
    }
  });

  // Cargar ajustes diarios guardados por las analistas desde Conciliación (sistema_config: monto_diario_recaudado_diario)
  let ajustesDiariosGuardados: Record<string, {
    euro?: number | null;
    ucd?: number | null;
    puntoBs?: number | null;
    transfBs?: number | null;
    banescoBs?: number | null;
    bancamigaBs?: number | null;
  }> = {};
  try {
    const { data: cfgMd } = await supabase
      .from('sistema_config')
      .select('valor')
      .eq('id', 'monto_diario_recaudado_diario')
      .maybeSingle();
    if (cfgMd?.valor) {
      ajustesDiariosGuardados = typeof cfgMd.valor === 'string' ? JSON.parse(cfgMd.valor) : cfgMd.valor;
    }
  } catch {}

  // Incluir también cualquier día dentro del rango que haya sido guardado manualmente por las analistas
  Object.keys(ajustesDiariosGuardados).forEach((dKey) => {
    if ((!dFromStr || dKey >= dFromStr) && (!dToStr || dKey <= dToStr)) {
      ensureDia(dKey);
    }
  });

  const diasOrdenados = Array.from(agrupadoPorDia.keys())
    .filter((d) => {
      const obj = agrupadoPorDia.get(d)!;
      const ov = ajustesDiariosGuardados[d];
      const pBs = obj.puntoBs;
      const tBs = obj.transfBs;
      const banBs = ov?.banescoBs !== undefined && ov?.banescoBs !== null && String(ov.banescoBs).trim() !== '' ? Number(ov.banescoBs) : 0;
      const bgaBs = ov?.bancamigaBs !== undefined && ov?.bancamigaBs !== null && String(ov.bancamigaBs).trim() !== '' ? Number(ov.bancamigaBs) : 0;
      return r2(pBs) > 0 || r2(tBs) > 0 || r2(banBs) > 0 || r2(bgaBs) > 0;
    })
    .sort();

  if (!diasOrdenados.length) {
    alert('No hay información diaria de pagos para el período.');
    return;
  }

  // Función para obtener la tasa oficial BCV del día (moda de las operaciones POS del día)
  const obtenerModaTasa = (tasas: number[], fallback: number): number => {
    if (!tasas.length) return fallback;
    const counts = new Map<number, number>();
    let bestRate = tasas[0];
    let bestCount = 0;
    for (const t of tasas) {
      const k = r2(t);
      const c = (counts.get(k) || 0) + 1;
      counts.set(k, c);
      if (c > bestCount) {
        bestCount = c;
        bestRate = k;
      }
    }
    return bestRate;
  };

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

  // Incrustar logos y membrete institucional en filas 1..4
  for (let i = 0; i < 4; i++) {
    const r = ws.addRow([]);
    r.height = 18;
  }

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

  addLogo(logos.instituto || logos.alcaldia, 0.25, 0.15, 160, 68);
  addLogo(logos.iamec, 10.35, 0.15, 155, 65);

  const headerLines = [
    { txt: 'REPÚBLICA BOLIVARIANA DE VENEZUELA - ESTADO CARABOBO', size: 10, bold: true, color: 'FF000000' },
    { txt: 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC)', size: 10.5, bold: true, color: 'FF000000' },
    { txt: 'REPORTE CONSOLIDADO DE RECAUDACIÓN DIARIA (PUNTO DE VENTA Y TRANSFERENCIAS)', size: 11, bold: true, color: 'FF1F4E78' },
    { txt: `RIF: G-20008614-9   |   Período: ${dmy(dFromStr)} al ${dmy(dToStr)}`, size: 9.5, bold: true, color: 'FF334155' },
  ];
  headerLines.forEach((l, idx) => {
    const rowNum = idx + 1;
    ws.mergeCells(rowNum, 3, rowNum, 10);
    const cell = ws.getCell(rowNum, 3);
    cell.value = l.txt;
    cell.font = { name: 'Arial', size: l.size, bold: l.bold, color: { argb: l.color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

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
  let ultimaTasaValida = r2(tcmmvActual || 1007.4);

  // Llenar datos de cada día
  diasOrdenados.forEach((dia) => {
    const dData = agrupadoPorDia.get(dia)!;
    const ov = ajustesDiariosGuardados[dia] || {};
    const [, mm, dd] = dia.split('-');
    const diaNum = parseInt(dd, 10);
    const mesNum = parseInt(mm, 10);

    // Formatear etiqueta de fecha: DD/MM/YY
    const fechaLabel = `${diaNum}/${mesNum}/${String(anio).slice(-2)}`;

    // Tasa oficial BCV del día (si la analista guardó tasa manual para ese día, usarla; si no, moda de operaciones POS del día)
    const autoTasaDia = dData.tasasPosDia.length
      ? obtenerModaTasa(dData.tasasPosDia, ultimaTasaValida)
      : (dData.tasasTodasDia.length ? obtenerModaTasa(dData.tasasTodasDia, ultimaTasaValida) : ultimaTasaValida);
    const tasaBcvDia = (ov.euro !== undefined && ov.euro !== null && Number(ov.euro) > 0)
      ? r2(Number(ov.euro))
      : autoTasaDia;
    ultimaTasaValida = tasaBcvDia;
    const tasaUcdDia = (ov.ucd !== undefined && ov.ucd !== null && Number(ov.ucd) > 0)
      ? r2(Number(ov.ucd))
      : tasaBcvDia;

    // Punto de Venta y Transferencias Conciliadas siempre usan el total real en vivo del sistema (igual que Total Puntos de Venta y Conciliación de Transferencias)
    const pBs = r2(dData.puntoBs);
    const pEur = tasaBcvDia > 0 ? r2(pBs / tasaBcvDia) : 0;
    const tBs = r2(dData.transfBs);
    const tEur = tasaBcvDia > 0 ? r2(tBs / tasaBcvDia) : 0;
    // Estado de Cuenta Banesco y Bancamiga solo muestran los montos cargados manualmente por las analistas (en 0,00 / "-" hasta que se carguen manualmente)
    const hasBanescoManual = ov.banescoBs !== undefined && ov.banescoBs !== null && String(ov.banescoBs).trim() !== '';
    const hasBancamigaManual = ov.bancamigaBs !== undefined && ov.bancamigaBs !== null && String(ov.bancamigaBs).trim() !== '';
    const banBs = hasBanescoManual ? r2(Number(ov.banescoBs)) : 0;
    const banEur = tasaBcvDia > 0 ? r2(banBs / tasaBcvDia) : 0;
    const bgaBs = hasBancamigaManual ? r2(Number(ov.bancamigaBs)) : 0;
    const bgaEur = tasaBcvDia > 0 ? r2(bgaBs / tasaBcvDia) : 0;

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
