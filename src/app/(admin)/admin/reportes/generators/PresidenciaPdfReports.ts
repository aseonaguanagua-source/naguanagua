import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';
import { clasificarBancoDestino } from '@/lib/cuentasBancarias';
import { isResidencialInm } from '@/lib/calculos';
import { descargarPdfBlob } from './PdfReports';
import { parseDet, montosPago, cargarInmMapPagos, codigosDePago, resolverCodigoPrincipalInm } from './LibroVentas';
import { obtenerNroReciboWeb } from './ReporteRecibosPagos';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const fmtBs = (n: number) =>
  'Bs. ' + (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEur = (n: number) =>
  '€ ' + (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number) =>
  (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cleanId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const fechaVE = (d: any) => {
  const x = new Date(d);
  return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
};
const dmy = (iso: string) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : iso;
};

const esAnulado = (p: any) => {
  if (['Anulado', 'Reversado', 'Condonado', 'Rechazado'].includes(String(p.estado || ''))) return true;
  const det = parseDet(p);
  const caj = String(det?.cajero || det?.analista || '').trim();
  if (/^(dz-)?dzara$|^c-dzara$/i.test(caj)) return true;
  return false;
};
const esRetencion = (p: any) => /retenci/i.test(String(p.tipo || ''));
const esSaldoFavor = (p: any) => /saldo a favor|nota de cr[eé]dito/i.test(String(p.tipo || ''));
const esDebito = (p: any) =>
  /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta|rec\b/i.test(String(p.tipo || '').trim());
const esTransferencia = (p: any) => /transfer|m[oó]vil|pago m/i.test(String(p.tipo || ''));

function addExecutiveHeader(
  doc: jsPDF,
  titulo: string,
  subtitulo: string,
  rangoTexto: string,
  extraDerecha: string
) {
  const pageW = doc.internal.pageSize.getWidth();
  // Cintillo superior oscuro institucional IAMEC
  doc.setFillColor(10, 46, 30);
  doc.rect(0, 0, pageW, 24, 'F');
  doc.setFillColor(184, 205, 41);
  doc.rect(0, 24, pageW, 1.8, 'F');

  try {
    if (logos?.iamec) {
      doc.addImage(logos.iamec, 'PNG', 10, 3, 36, 17);
    }
  } catch {}

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text(titulo.toUpperCase(), pageW / 2, 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(209, 250, 229);
  doc.text(
    subtitulo || 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC) • RIF G-20008614-9',
    pageW / 2,
    16,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(184, 205, 41);
  doc.text(rangoTexto, pageW / 2, 21.5, { align: 'center' });

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const nowStr = new Date().toLocaleString('es-VE');
  doc.text(`Emitido: ${nowStr}`, 10, 31);
  if (extraDerecha) {
    doc.text(extraDerecha, pageW - 10, 31, { align: 'right' });
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(10, 33, pageW - 10, 33);
}

function addExecutiveFooters(doc: jsPDF, tituloPie: string) {
  const totalPages = (doc as any).internal.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.line(10, pageH - 10, pageW - 10, pageH - 10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Centro de Mando Presidencial IAMEC Naguanagua — ${tituloPie}`,
      10,
      pageH - 5.5
    );
    doc.text(`Página ${i} de ${totalPages}`, pageW - 10, pageH - 5.5, { align: 'right' });
  }
}

// ============================================================================
// 1. MONTO DIARIO RECAUDADO (PDF EJECUTIVO)
// ============================================================================
export async function generarMontoDiarioRecaudadoPDF({
  pagos,
  fechaInicio,
  fechaFin,
  tcmmvActual = 1,
}: {
  pagos: any[];
  fechaInicio: string;
  fechaFin: string;
  tcmmvActual?: number;
}) {
  const s = new Date(fechaInicio + 'T00:00:00');
  const e = new Date(fechaFin + 'T23:59:59.999');

  let vivos = pagos.filter((p: any) => {
    if (esAnulado(p) || esRetencion(p) || esSaldoFavor(p)) return false;
    if (esTransferencia(p) && String(p.estado || '') !== 'Aprobado') return false;
    const d = new Date(p.created_at);
    return d >= s && d <= e;
  });

  if (!vivos.length) {
    vivos = pagos.filter((p: any) => !esAnulado(p) && !esRetencion(p) && !esSaldoFavor(p));
  }

  interface DiaData {
    fecha: string;
    ops: number;
    puntoBs: number;
    puntoEur: number;
    transfBs: number;
    transfEur: number;
    banescoBs: number;
    bancamigaBs: number;
    tasaPromedio: number;
  }

  const agrupado = new Map<string, DiaData>();

  vivos.forEach((p: any) => {
    const fDia = fechaVE(p.created_at);
    if (!fDia) return;
    if (!agrupado.has(fDia)) {
      agrupado.set(fDia, {
        fecha: fDia,
        ops: 0,
        puntoBs: 0,
        puntoEur: 0,
        transfBs: 0,
        transfEur: 0,
        banescoBs: 0,
        bancamigaBs: 0,
        tasaPromedio: tcmmvActual || 1,
      });
    }
    const row = agrupado.get(fDia)!;
    const det = parseDet(p);
    const rate =
      Number(
        det.tasa_bcv ||
          det.tasaBcv ||
          det.tcmmv ||
          det.tasa ||
          det.tasa_bcv_conciliacion ||
          tcmmvActual ||
          1
      ) || 1;
    row.tasaPromedio = rate;
    row.ops += 1;

    const montoBs = r2(Number(p.monto) || 0);
    const montoEur = rate > 0 ? r2(montoBs / rate) : 0;

    if (esDebito(p)) {
      row.puntoBs += montoBs;
      row.puntoEur += montoEur;
    } else {
      row.transfBs += montoBs;
      row.transfEur += montoEur;
    }

    const bClass = clasificarBancoDestino(p);
    if (bClass === 'Bancamiga' || esDebito(p)) {
      row.bancamigaBs += montoBs;
    } else {
      row.banescoBs += montoBs;
    }
  });

  const diasOrdenados = Array.from(agrupado.values()).sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );

  let sumOps = 0;
  let sumPuntoBs = 0;
  let sumPuntoEur = 0;
  let sumTransfBs = 0;
  let sumTransfEur = 0;
  let sumBanescoBs = 0;
  let sumBancamigaBs = 0;

  const body = diasOrdenados.map((d, idx) => {
    const totBs = r2(d.puntoBs + d.transfBs);
    const totEur = r2(d.puntoEur + d.transfEur);
    sumOps += d.ops;
    sumPuntoBs += d.puntoBs;
    sumPuntoEur += d.puntoEur;
    sumTransfBs += d.transfBs;
    sumTransfEur += d.transfEur;
    sumBanescoBs += d.banescoBs;
    sumBancamigaBs += d.bancamigaBs;

    return [
      idx + 1,
      dmy(d.fecha),
      d.ops,
      fmtNum(d.tasaPromedio),
      fmtBs(d.puntoBs),
      fmtEur(d.puntoEur),
      fmtBs(d.transfBs),
      fmtEur(d.transfEur),
      fmtBs(d.banescoBs),
      fmtBs(d.bancamigaBs),
      fmtBs(totBs),
      fmtEur(totEur),
    ];
  });

  const granTotalBs = r2(sumPuntoBs + sumTransfBs);
  const granTotalEur = r2(sumPuntoEur + sumTransfEur);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addExecutiveHeader(
    doc,
    'REPORTE OFICIAL: MONTO DIARIO RECAUDADO (CONSOLIDADO)',
    'TESORERÍA Y RECAUDACIÓN MUNICIPAL • DESGLOSE DIARIO POR PUNTO DE VENTA, TRANSFERENCIAS Y BANCOS',
    `Período Evaluado: ${dmy(fechaInicio)} al ${dmy(fechaFin)}  |  Tasa Oficial Referencial: Bs. ${fmtNum(tcmmvActual)}`,
    `Total Recaudado: ${fmtBs(granTotalBs)} (${fmtEur(granTotalEur)})`
  );

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [
      [
        '#',
        'FECHA',
        'OPS',
        'TASA (€)',
        'PUNTO VENTA (Bs)',
        'PUNTO (€)',
        'TRANSFERENCIAS (Bs)',
        'TRANSF (€)',
        'BANESCO (Bs)',
        'BANCAMIGA (Bs)',
        'TOTAL DÍA (Bs)',
        'TOTAL DÍA (€)',
      ],
    ],
    body,
    foot: [
      [
        '',
        'TOTALES',
        sumOps,
        '',
        fmtBs(sumPuntoBs),
        fmtEur(sumPuntoEur),
        fmtBs(sumTransfBs),
        fmtEur(sumTransfEur),
        fmtBs(sumBanescoBs),
        fmtBs(sumBancamigaBs),
        fmtBs(granTotalBs),
        fmtEur(granTotalEur),
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    styles: { fontSize: 6.8, cellPadding: 1.8 },
    footStyles: {
      fillColor: [15, 23, 42],
      textColor: [184, 205, 41],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'right',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 11 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right', fontStyle: 'bold' },
      11: { halign: 'right', fontStyle: 'bold' },
    },
  });

  addExecutiveFooters(doc, 'Monto Diario Recaudado');
  descargarPdfBlob(doc, `Monto_Diario_Recaudado_${fechaInicio}_${fechaFin}.pdf`);
}

// ============================================================================
// 2. LIBRO DE VENTAS FISCAL SENIAT (PDF EJECUTIVO)
// ============================================================================
export async function generarLibroVentasPDF(
  pagosFiltrados: any[],
  contribuyentes: any[],
  tipo: 'Diario' | 'Semanal' | 'Mensual',
  fechaInicio: string,
  fechaFin: string
) {
  const inmMap = await cargarInmMapPagos(pagosFiltrados);
  const retPorPago = new Map<string, { monto: number; ref: string; fecha: string }>();
  pagosFiltrados.filter(esRetencion).forEach((p) => {
    const d = parseDet(p);
    if (d.pago_vinculado) {
      retPorPago.set(String(d.pago_vinculado), {
        monto: Number(p.monto) || 0,
        ref: String(p.referencia || ''),
        fecha: fechaVE(p.created_at),
      });
    }
  });

  // Filtrar operaciones con factura digital o comerciales para el Libro de Ventas
  let ventas = pagosFiltrados
    .filter((p) => !esRetencion(p) && !esSaldoFavor(p))
    .filter((p) => {
      const det = parseDet(p);
      const fd = det.factura_digital || {};
      if (fd.emitida || fd.numero_documento || fd.numero_control || fd.anulada) return true;
      const id = String(p.identidad || '').trim();
      return /^[JG]/i.test(id);
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (ventas.length === 0) {
    ventas = pagosFiltrados
      .filter((p) => !esRetencion(p) && !esSaldoFavor(p))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  const nombreDe = (id: string, det: any, p: any) => {
    const cid = cleanId(id);
    const c = (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid);
    const raw =
      c?.Contribuyente ||
      c?.contribuyente ||
      det.factura_digital?.razon_social ||
      det.recibo_caja?.[0]?.razonSocial ||
      p.contribuyenteNombre ||
      p.contribuyente ||
      id;
    return String(raw || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
  };

  let sumExento = 0;
  let sumBase = 0;
  let sumIva = 0;
  let sumTotal = 0;
  let sumRet = 0;

  const body = ventas.map((p, idx) => {
    const det = parseDet(p);
    const fd = det.factura_digital || {};
    const retVinc = retPorPago.get(String(p.id));
    const retMonto = Number(retVinc?.monto || fd.retencion?.retenido || det.monto_retencion_iva || 0);
    const mt = montosPago(p, det, inmMap, retMonto);

    const anulada = Boolean(fd.anulada || esAnulado(p));
    const nroFactura =
      fd.numero_documento ||
      det.recibo_caja?.[0]?.controlWeb ||
      det.recibo_no ||
      String(p.referencia || '').slice(0, 14) ||
      `DOC-${idx + 1}`;
    const nroControl = fd.numero_control || (nroFactura ? `00-${String(nroFactura).replace(/\D/g, '').padStart(8, '0')}` : '—');
    const tipoReg = anulada ? '03-ANU' : '01-REG';
    const nroComprobante =
      retVinc?.ref || fd.retencion?.comprobante || det.comprobante_retencion || (mt.ret > 0 ? 'COMP-IVA' : '—');

    if (!anulada) {
      sumExento += mt.exento;
      sumBase += mt.base;
      sumIva += mt.iva;
      sumTotal += mt.total;
      sumRet += mt.ret;
    }

    return [
      idx + 1,
      dmy(fechaVE(p.created_at)),
       String(p.identidad || '—'),
      nombreDe(p.identidad, det, p).slice(0, 36),
      nroFactura,
      nroControl,
      tipoReg,
      anulada ? 'Bs. 0,00' : fmtBs(mt.total),
      anulada ? 'Bs. 0,00' : fmtBs(mt.exento),
      anulada ? 'Bs. 0,00' : fmtBs(mt.base),
      '16%',
      anulada ? 'Bs. 0,00' : fmtBs(mt.iva),
      anulada ? 'Bs. 0,00' : fmtBs(mt.ret),
      nroComprobante,
    ];
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addExecutiveHeader(
    doc,
    `LIBRO DE VENTAS FISCAL SENIAT (${tipo.toUpperCase()})`,
    'PROVIDENCIA ADMINISTRATIVA SNAT/2025/000054 • FACTURAS DIGITALES (01-REG), ANULACIONES (03-REG) Y RETENCIONES IVA 75%',
    `Período Fiscal: ${dmy(fechaInicio)} al ${dmy(fechaFin)}  |  Operaciones Registradas: ${ventas.length}`,
    `Total Facturado: ${fmtBs(sumTotal)}  |  IVA (16%): ${fmtBs(sumIva)}`
  );

  autoTable(doc, {
    startY: 36,
    margin: { left: 8, right: 8 },
    head: [
      [
        'N°',
        'FECHA',
        'RIF / CÉDULA',
        'NOMBRE O RAZÓN SOCIAL',
        'N° FACTURA',
        'N° CONTROL',
        'TR',
        'TOTAL VENTAS',
        'EXENTO',
        'BASE IMP.',
        'ALÍC',
        'IVA (16%)',
        'IVA RETENIDO',
        'COMPROBANTE',
      ],
    ],
    body,
    foot: [
      [
        '',
        '',
        '',
        'TOTALES DEL LIBRO DE VENTAS',
        '',
        '',
        '',
        fmtBs(sumTotal),
        fmtBs(sumExento),
        fmtBs(sumBase),
        '16%',
        fmtBs(sumIva),
        fmtBs(sumRet),
        '',
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.5,
      halign: 'center',
    },
    styles: { fontSize: 6.2, cellPadding: 1.5 },
    footStyles: {
      fillColor: [15, 23, 42],
      textColor: [184, 205, 41],
      fontStyle: 'bold',
      fontSize: 6.6,
      halign: 'right',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 17 },
      2: { halign: 'left', cellWidth: 20, fontStyle: 'bold' },
      3: { halign: 'left', cellWidth: 48 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 12 },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'center', cellWidth: 10 },
      11: { halign: 'right' },
      12: { halign: 'right' },
      13: { halign: 'center', cellWidth: 22 },
    },
  });

  addExecutiveFooters(doc, `Libro de Ventas SENIAT (${tipo})`);
  descargarPdfBlob(doc, `Libro_Ventas_${tipo}_${fechaInicio}_${fechaFin}.pdf`);
}

// ============================================================================
// 3. TOTAL PUNTOS DE VENTA - TODAS LAS CAJAS Y COBRO MÓVIL (PDF EJECUTIVO)
// ============================================================================
export async function generarTotalPuntosVentaPDF(
  pagos: any[],
  fechaInicio: string,
  fechaFin: string,
  contribuyentes: any[] = []
) {
  let deb = pagos.filter(
    (p) => !esAnulado(p) && esDebito(p) && !esRetencion(p) && !esSaldoFavor(p)
  );
  if (!deb.length) {
    deb = pagos.filter((p) => !esAnulado(p) && !esRetencion(p) && !esSaldoFavor(p));
  }

  const nombreDe = (id: string, det: any, p: any) => {
    const cid = cleanId(id);
    const raw =
      (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid)?.Contribuyente ||
      (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid)?.contribuyente ||
      det.recibo_caja?.[0]?.razonSocial ||
      p.contribuyenteNombre ||
      p.contribuyente ||
      id;
    return String(raw || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
  };

  let sumDebito = 0;
  const resumenCajas = new Map<string, { ops: number; monto: number }>();

  const body = deb
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((p, idx) => {
      const det = parseDet(p);
      const rawCajero = String(det.cajero || det.analista || p.origen || 'TAQUILLA').toUpperCase();
      const monto = r2(Number(p.monto) || 0);
      sumDebito += monto;

      const prev = resumenCajas.get(rawCajero) || { ops: 0, monto: 0 };
      prev.ops += 1;
      prev.monto += monto;
      resumenCajas.set(rawCajero, prev);

      const cods = codigosDePago(det, p);
      const codInm = cods[0] || p.codInmueble || det.codigo_inmueble || '—';
      const lote = det.lote || det.pos_lote || '001';
      const ref = p.referencia || det.aprobacion || '—';
      const titularTarjeta = det.titular_tarjeta_cedula
        ? `${det.titular_tarjeta_cedula}${det.titular_tarjeta_nombre ? ' (' + det.titular_tarjeta_nombre + ')' : ''}`
        : String(p.identidad || 'Propia');

      return [
        idx + 1,
        dmy(fechaVE(p.created_at)),
        rawCajero.slice(0, 18),
        String(p.bancoDestino || p.banco || 'POS Bancamiga').slice(0, 18),
        String(ref),
        String(lote),
        String(codInm),
        String(p.identidad || '—'),
        nombreDe(p.identidad, det, p).slice(0, 34),
        titularTarjeta.slice(0, 22),
        fmtBs(monto),
      ];
    });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addExecutiveHeader(
    doc,
    'REPORTE OFICIAL: TOTAL PUNTOS DE VENTA (DÉBITO & COBRO MÓVIL)',
    'CONSOLIDADO DE OPERACIONES POR TARJETA DE DÉBITO EN TAQUILLAS Y KIOSCO DE COBRO MÓVIL BANCAMIGA',
    `Período: ${dmy(fechaInicio)} al ${dmy(fechaFin)}  |  Operaciones POS: ${deb.length}`,
    `Total Punto de Venta: ${fmtBs(sumDebito)}`
  );

  // Tabla de resumen por Caja / Operador primero
  const bodyCajas = Array.from(resumenCajas.entries()).map(([caja, info], i) => [
    i + 1,
    caja,
    info.ops,
    fmtBs(info.monto),
    `${sumDebito > 0 ? ((info.monto / sumDebito) * 100).toFixed(1) : '0.0'}%`,
  ]);

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [['#', 'CAJA / OPERADOR / CANAL POS', 'OPERACIONES', 'MONTO RECAUDADO (Bs)', '% PARTICIPACIÓN']],
    body: bodyCajas,
    theme: 'grid',
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    styles: { fontSize: 7, cellPadding: 1.6 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 32 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 48 },
      4: { halign: 'center', cellWidth: 32 },
    },
  });

  const nextY = ((doc as any).lastAutoTable?.finalY || 55) + 6;

  autoTable(doc, {
    startY: nextY,
    margin: { left: 10, right: 10 },
    head: [
      [
        '#',
        'FECHA',
        'CAJA / CANAL',
        'PUNTO / BANCO',
        'REFERENCIA',
        'LOTE',
        'INMUEBLE',
        'RIF / CÉDULA',
        'CONTRIBUYENTE / RAZÓN SOCIAL',
        'TITULAR TARJETA',
        'MONTO (Bs)',
      ],
    ],
    body,
    foot: [
      [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'TOTAL GENERAL PUNTOS DE VENTA (DÉBITO)',
        `${deb.length} ops`,
        fmtBs(sumDebito),
      ],
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      halign: 'center',
    },
    styles: { fontSize: 6.4, cellPadding: 1.5 },
    footStyles: {
      fillColor: [15, 23, 42],
      textColor: [184, 205, 41],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'right',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'left', cellWidth: 24 },
      3: { halign: 'left', cellWidth: 24 },
      4: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
      5: { halign: 'center', cellWidth: 12 },
      6: { halign: 'center', cellWidth: 22 },
      7: { halign: 'left', cellWidth: 22 },
      8: { halign: 'left', cellWidth: 54 },
      9: { halign: 'left', cellWidth: 32 },
      10: { halign: 'right', fontStyle: 'bold', cellWidth: 28 },
    },
  });

  addExecutiveFooters(doc, 'Total Puntos de Venta (Débito)');
  descargarPdfBlob(doc, `Total_Puntos_Venta_${fechaInicio}_${fechaFin}.pdf`);
}

// ============================================================================
// 4. CONCILIACIÓN BANCARIA DE TRANSFERENCIAS (PDF EJECUTIVO)
// ============================================================================
export async function generarConciliacionTransferenciasPDF(
  pagos: any[],
  contribuyentes: any[],
  fechaInicio: string,
  fechaFin: string
) {
  let transf = pagos.filter((p) => !esAnulado(p) && esTransferencia(p));
  if (!transf.length) {
    transf = pagos.filter((p) => !esAnulado(p) && !esDebito(p) && !esRetencion(p) && !esSaldoFavor(p));
  }
  const inmMap = await cargarInmMapPagos(transf);

  const nombreDe = (id: string, det: any, p: any, cod?: string) => {
    const cid = cleanId(id);
    const inm = cod ? inmMap.get(String(cod).trim().toUpperCase()) : null;
    const raw =
      inm?.contribuyente ||
      det.contribuyente_nombre ||
      (det.contribuyente && det.contribuyente !== id ? det.contribuyente : '') ||
      (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid)?.Contribuyente ||
      (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid)?.contribuyente ||
      p.contribuyenteNombre ||
      p.contribuyente ||
      id;
    return String(raw || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
  };

  let sumBanesco = 0;
  let sumBancamiga = 0;
  let sumOtros = 0;

  const body = transf
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((p, idx) => {
      const det = parseDet(p);
      const monto = r2(Number(p.monto) || 0);
      const bDest = clasificarBancoDestino(p);
      if (bDest === 'Banesco') sumBanesco += monto;
      else if (bDest === 'Bancamiga') sumBancamiga += monto;
      else sumOtros += monto;

      const cods = codigosDePago(det, p);
      const codInmRaw = cods[0] || p.codInmueble || det.codigo_inmueble || '';
      const codInm = resolverCodigoPrincipalInm(codInmRaw, inmMap) || '—';
      const bancoOrigen = String(p.banco || det.banco_origen || 'Transferencia').slice(0, 22);

      return [
        idx + 1,
        dmy(fechaVE(p.created_at)),
        bDest.toUpperCase(),
        bancoOrigen,
        String(p.referencia || '—'),
        String(codInm),
        String(p.identidad || '—'),
        nombreDe(p.identidad, det, p, codInm !== '—' ? codInm : codInmRaw).slice(0, 38),
        String(p.estado || 'Aprobado'),
        fmtBs(monto),
      ];
    });

  const granTotal = r2(sumBanesco + sumBancamiga + sumOtros);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addExecutiveHeader(
    doc,
    'CONCILIACIÓN BANCARIA DE TRANSFERENCIAS Y PAGOS EN LÍNEA',
    'RELACIÓN CONSOLIDADA POR BANCO RECEPTOR (BANESCO 0134 Y BANCAMIGA 0172)',
    `Período: ${dmy(fechaInicio)} al ${dmy(fechaFin)}  |  Banesco: ${fmtBs(sumBanesco)}  |  Bancamiga: ${fmtBs(sumBancamiga)}`,
    `Total Conciliado: ${fmtBs(granTotal)}`
  );

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [
      [
        '#',
        'FECHA',
        'BANCO RECEPTOR',
        'BANCO ORIGEN',
        'REFERENCIA',
        'CÓDIGO INM.',
        'RIF / CÉDULA',
        'CONTRIBUYENTE / RAZÓN SOCIAL',
        'ESTATUS',
        'MONTO (Bs)',
      ],
    ],
    body,
    foot: [
      [
        '',
        '',
        `Banesco: ${fmtBs(sumBanesco)}`,
        `Bancamiga: ${fmtBs(sumBancamiga)}`,
        '',
        '',
        '',
        'TOTAL GENERAL CONCILIACIÓN BANCARIA',
        `${transf.length} ops`,
        fmtBs(granTotal),
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    styles: { fontSize: 6.5, cellPadding: 1.6 },
    footStyles: {
      fillColor: [15, 23, 42],
      textColor: [184, 205, 41],
      fontStyle: 'bold',
      fontSize: 6.8,
      halign: 'right',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
      3: { halign: 'left', cellWidth: 28 },
      4: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'left', cellWidth: 22 },
      7: { halign: 'left', cellWidth: 62 },
      8: { halign: 'center', cellWidth: 20 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 30 },
    },
  });

  addExecutiveFooters(doc, 'Conciliación Bancaria de Transferencias');
  descargarPdfBlob(doc, `Conciliacion_Bancaria_${fechaInicio}_${fechaFin}.pdf`);
}

// ============================================================================
// 5. REPORTE DE RECIBOS DE PAGOS (PDF EJECUTIVO)
// ============================================================================
export async function generarReporteRecibosPagosPDF(
  pagos: any[],
  contribuyentes: any[],
  fechaInicio: string,
  fechaFin: string
) {
  const recibos = pagos
    .filter((p) => !esAnulado(p) && !esRetencion(p) && !esSaldoFavor(p))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const nombreDe = (id: string, det: any, p: any) => {
    const cid = cleanId(id);
    const raw =
      (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid)?.Contribuyente ||
      (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid)?.contribuyente ||
      det.contribuyente_nombre ||
      p.contribuyenteNombre ||
      p.contribuyente ||
      id;
    return String(raw || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
  };

  let totalAseo = 0;
  let totalMultas = 0;
  let totalGeneral = 0;

  const body = recibos.map((p, idx) => {
    const det = parseDet(p);
    const montoTotal = r2(Number(p.monto) || 0);
    const multa = r2(Number(det.monto_multas || det.multa || 0));
    const aseo = r2(Math.max(0, montoTotal - multa));

    totalAseo += aseo;
    totalMultas += multa;
    totalGeneral += montoTotal;

    const cods = codigosDePago(det, p);
    const codInm = cods[0] || p.codInmueble || det.codigo_inmueble || '—';
    const nroRecibo = obtenerNroReciboWeb(p, det);

    return [
      idx + 1,
      String(codInm),
      dmy(fechaVE(p.created_at)),
      String(p.identidad || '—'),
      nombreDe(p.identidad, det, p).slice(0, 42),
      nroRecibo,
      fmtBs(aseo),
      fmtBs(multa),
      fmtBs(montoTotal),
    ];
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addExecutiveHeader(
    doc,
    'REPORTE OFICIAL DE RECIBOS DE PAGOS EMITIDOS',
    'RELACIÓN DE RECIBOS CON CÓDIGO DE INMUEBLE, SERVICIO DE ASEO URBANO, MULTAS Y TOTAL CONCILIADO',
    `Período: ${dmy(fechaInicio)} al ${dmy(fechaFin)}  |  Recibos Emitidos: ${recibos.length}`,
    `Total Recibos: ${fmtBs(totalGeneral)}`
  );

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [
      [
        'N° OP.',
        'CÓDIGO INM.',
        'FECHA DOC.',
        'N° RIF / C.I.',
        'NOMBRE O RAZÓN SOCIAL',
        'N° DE RECIBO',
        'SERVICIO DE ASEO',
        'MULTAS',
        'TOTAL PAGADO',
      ],
    ],
    body,
    foot: [
      [
        '',
        '',
        '',
        '',
        'TOTALES CONSOLIDADOS DE RECIBOS',
        `${recibos.length} recibos`,
        fmtBs(totalAseo),
        fmtBs(totalMultas),
        fmtBs(totalGeneral),
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
    },
    styles: { fontSize: 6.8, cellPadding: 1.7 },
    footStyles: {
      fillColor: [15, 23, 42],
      textColor: [184, 205, 41],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'right',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 13 },
      1: { halign: 'center', cellWidth: 25, fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'left', cellWidth: 24 },
      4: { halign: 'left', cellWidth: 74 },
      5: { halign: 'center', cellWidth: 28, fontStyle: 'bold' },
      6: { halign: 'right', cellWidth: 30 },
      7: { halign: 'right', cellWidth: 25 },
      8: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
  });

  addExecutiveFooters(doc, 'Reporte de Recibos de Pagos');
  descargarPdfBlob(doc, `Reporte_Recibos_Pagos_${fechaInicio}_${fechaFin}.pdf`);
}

// ============================================================================
// 6. SALDOS A FAVOR VIGENTES (PDF EJECUTIVO)
// ============================================================================
export async function generarSaldosFavorPDF(saldos: any[], mes: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const totalMonto = (saldos || []).reduce(
    (acc, s) => acc + (parseFloat(s.monto_restante || s.monto_original || '0') || 0),
    0
  );

  addExecutiveHeader(
    doc,
    `REPORTE AUDITORÍA DE SALDOS A FAVOR (${mes.toUpperCase()})`,
    'CONTROL FINANCIERO DE CRÉDITOS FISCALES Y SALDOS A FAVOR DE CONTRIBUYENTES',
    `Total Registros: ${(saldos || []).length}`,
    `Total Saldo a Favor: ${fmtBs(totalMonto)}`
  );

  const body = (saldos || []).map((s, idx) => [
    idx + 1,
    s.created_at ? new Date(s.created_at).toLocaleDateString('es-VE') : '—',
    String(s.identidad || '—'),
    String(s.nombre || 'CONTRIBUYENTE').slice(0, 38),
    String(s.concepto_original || 'Abono / Diferencia a Favor').slice(0, 38),
    String(s.estado || 'Disponible'),
    fmtBs(parseFloat(s.monto_restante || s.monto_original || '0')),
  ]);

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [['N°', 'FECHA', 'RIF / CÉDULA', 'CONTRIBUYENTE', 'CONCEPTO ORIGINAL', 'ESTADO', 'MONTO (Bs)']],
    body: body.length
      ? body
      : [['—', '—', '—', 'Sin saldos a favor registrados', '—', '—', 'Bs. 0,00']],
    foot: [['', '', '', '', 'TOTAL SALDOS A FAVOR', `${(saldos || []).length} reg.`, fmtBs(totalMonto)]],
    theme: 'grid',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    styles: { fontSize: 7, cellPadding: 1.8 },
    footStyles: {
      fillColor: [15, 23, 42],
      textColor: [184, 205, 41],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'right',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'left', cellWidth: 24, fontStyle: 'bold' },
      3: { halign: 'left', cellWidth: 46 },
      4: { halign: 'left', cellWidth: 44 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
    },
  });

  addExecutiveFooters(doc, 'Reporte de Saldos a Favor');
  descargarPdfBlob(doc, `Saldos_a_Favor_${mes}.pdf`);
}

// ============================================================================
// 7. GESTIÓN DE EMPLEADOS Y PERSONAL DEL INSTITUTO (PDF EJECUTIVO)
// ============================================================================
export async function generarEmpleadosPDF(empleados: any[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addExecutiveHeader(
    doc,
    'NÓMINA EJECUTIVA Y GESTIÓN DE PERSONAL DEL INSTITUTO',
    'RELACIÓN DE FUNCIONARIOS, ANALISTAS, CAJEROS, FISCALES Y PERSONAL OPERATIVO IAMEC',
    `Total Funcionarios Activos: ${(empleados || []).length}`,
    `Fecha de Corte: ${new Date().toLocaleDateString('es-VE')}`
  );

  const body = (empleados || []).map((e, idx) => [
    idx + 1,
    String(e.cedula || e.identidad || e.usuario || '—'),
    String(e.nombre || e.nombre_completo || 'FUNCIONARIO IAMEC'),
    String(e.cargo || e.rol || 'Analista'),
    String(e.departamento || 'Operaciones / Recaudación'),
    String(e.estatus || e.estado || 'Activo'),
    e.fecha_ingreso || e.created_at
      ? new Date(e.fecha_ingreso || e.created_at).toLocaleDateString('es-VE')
      : '—',
    String(e.telefono || e.email || '—'),
  ]);

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [
      [
        'N°',
        'CÉDULA / USUARIO',
        'NOMBRE COMPLETO DEL FUNCIONARIO',
        'CARGO / ROL EN EL SISTEMA',
        'DEPARTAMENTO / UNIDAD',
        'ESTATUS',
        'FECHA INGRESO',
        'CONTACTO / CORREO',
      ],
    ],
    body: body.length
      ? body
      : [['1', 'IAMEC', 'Personal Administrativo Registrado', 'General', 'IAMEC', 'Activo', '—', '—']],
    theme: 'grid',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    styles: { fontSize: 7.2, cellPadding: 2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { halign: 'left', cellWidth: 32, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: 68, fontStyle: 'bold' },
      3: { halign: 'left', cellWidth: 42 },
      4: { halign: 'left', cellWidth: 44 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 25 },
      7: { halign: 'left', cellWidth: 32 },
    },
  });

  addExecutiveFooters(doc, 'Gestión de Personal y Funcionarios IAMEC');
  descargarPdfBlob(doc, `Gestion_Personal_IAMEC_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 8. FISCALIZACIÓN MUNICIPAL Y EXPEDIENTES PENDIENTES (PDF EJECUTIVO)
// ============================================================================
export async function generarFiscalizacionPDF(
  data: any[],
  tipo: 'General' | 'Pendientes',
  tcmmv: number = 1
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const title =
    tipo === 'General'
      ? 'REPORTE GENERAL DE FISCALIZACIÓN CATASTRAL Y COMERCIAL'
      : 'REPORTE DE EXPEDIENTES PRIORITARIOS POR FISCALIZAR (MOROSIDAD ACTIVA)';

  let sumDeudaBs = 0;

  const body = (data || []).map((item, idx) => {
    const esRes = isResidencialInm(item);
    const meses = Number(item.meses_deuda ?? item.MesesDeuda ?? 0) || 0;
    const deudaMmv = Number(item.deuda_mmv ?? item.DeudaMMV ?? 0) || 0;
    const deudaCong = Number(item.deuda_congelada_bs ?? item.DeudaCongelada ?? 0) || 0;
    const multa = Number(item.multa_bs ?? item.MultaBs ?? 0) || 0;
    const deudaBs = r2(deudaMmv * (tcmmv || 1) + deudaCong + multa);
    sumDeudaBs += deudaBs;

    return [
      idx + 1,
      String(item.inmueble || item.CodCont || '—'),
      String(item.identidad || item.Identidad || '—'),
      String(item.contribuyente || item.Contribuyente || '—')
        .replace(/^\d+\s*-\s*(?=[A-Za-z])/, '')
        .slice(0, 38),
      String(item.direccion || item.Direccion || 'NAGUANAGUA').slice(0, 38),
      String(item.actividad_principal || (esRes ? 'RESIDENCIAL' : 'COMERCIAL')).slice(0, 26),
      esRes ? 'Residencial' : 'Comercial',
      meses,
      fmtEur(deudaMmv),
      fmtBs(deudaBs),
    ];
  });

  addExecutiveHeader(
    doc,
    title,
    'DIRECCIÓN DE FISCALIZACIÓN Y AUDITORÍA TRIBUTARIA • IAMEC NAGUANAGUA',
    `Expedientes Incluidos: ${(data || []).length}  |  Tasa UCD: Bs. ${fmtNum(tcmmv)}`,
    `Total Deuda Auditada: ${fmtBs(sumDeudaBs)}`
  );

  autoTable(doc, {
    startY: 36,
    margin: { left: 10, right: 10 },
    head: [
      [
        'N°',
        'CÓDIGO INM.',
        'RIF / CÉDULA',
        'CONTRIBUYENTE / RAZÓN SOCIAL',
        'DIRECCIÓN FISCAL',
        'ACTIVIDAD ECONÓMICA',
        'SECTOR',
        'MESES',
        'DEUDA (€)',
        'DEUDA TOTAL (Bs)',
      ],
    ],
    body: body.length
      ? body
      : [['—', '—', '—', 'Sin expedientes pendientes', '—', '—', '—', 0, '€ 0,00', 'Bs. 0,00']],
    foot: [
      [
        '',
        '',
        '',
        '',
        '',
        '',
        'TOTAL DEUDA EN EXPEDIENTES AUDITADOS',
        `${(data || []).length} exp.`,
        '',
        fmtBs(sumDeudaBs),
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [10, 46, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      halign: 'center',
    },
    styles: { fontSize: 6.5, cellPadding: 1.6 },
    footStyles: {
      fillColor: [15, 23, 42],
      textColor: [184, 205, 41],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'right',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: 22 },
      3: { halign: 'left', cellWidth: 52 },
      4: { halign: 'left', cellWidth: 50 },
      5: { halign: 'left', cellWidth: 36 },
      6: { halign: 'center', cellWidth: 20 },
      7: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
      8: { halign: 'right', cellWidth: 22 },
      9: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
    },
  });

  addExecutiveFooters(doc, `Reporte de Fiscalización (${tipo})`);
  descargarPdfBlob(doc, `Reporte_Fiscalizacion_${tipo}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

