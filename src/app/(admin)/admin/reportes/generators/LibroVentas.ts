import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabase';
import { desglosarPago, COLS_INMUEBLE_DESGLOSE } from '@/lib/desglosePago';
import { isResidencialInm } from '@/lib/calculos';

/**
 * Libro de Ventas (formato Providencia SNAT/2025/000054) — modelo "Formato Libro de Ventas Agosto 2026.xlsx".
 * Hoja 1 "Resumen y Declaración" + Hoja 2 "Libro de Ventas" (24 columnas).
 * - Contribuyente = RIF J/G ; No contribuyente = cédula V/E/P.
 * - Las retenciones de IVA (pagos tipo "Retencion de IVA") no son ventas: se asocian a su pago (pago_vinculado).
 */
const RIF_IAMEC = 'G-20008614-9';
const ORGANISMO = 'INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO DE NAGUANAGUA (IAMEC)';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const parseDet = (p: any) => { try { return typeof p.detalles === 'string' ? JSON.parse(p.detalles || '{}') : (p.detalles || {}); } catch { return {}; } };
const esRetencion = (p: any) => /retenci/i.test(String(p.tipo || ''));
const esContribuyente = (id: string) => /^[JG]/i.test(String(id || '').trim());
const fechaISO = (d: any) => {
  const x = new Date(d);
  return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
};
const dmy = (iso: string) => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : iso; };

export const codigosDePago = (det: any, p?: any): string[] => {
  const s = new Set<string>();
  if (!det && !p) return [];
  const d = det || {};

  // 1. Campos directos de inmueble
  if (d.cod_inmueble) s.add(String(d.cod_inmueble).trim().toUpperCase());
  if (d.codigo_inmueble) s.add(String(d.codigo_inmueble).trim().toUpperCase());
  if (d.inmueble) s.add(String(d.inmueble).trim().toUpperCase());
  if (p?.inmueble) s.add(String(p.inmueble).trim().toUpperCase());

  // 2. Condominios
  if (d.condominio?.codigo) s.add(String(d.condominio.codigo).trim().toUpperCase());
  if (d.condominio_codigo) s.add(String(d.condominio_codigo).trim().toUpperCase());
  // Solo incluir lineas hijas si no se ha detectado ningún código de inmueble o condominio
  if (s.size === 0 && Array.isArray(d.condominio?.lineas)) {
    d.condominio.lineas.forEach((l: any) => {
      if (l?.inmueble) s.add(String(l.inmueble).trim().toUpperCase());
    });
  }

  // 3. Array de recibos
  (Array.isArray(d.recibos) ? d.recibos : []).forEach((ref: string) => {
    const str = String(ref || '').toUpperCase().trim();
    const m = str.match(/^(?:RECIB-HIST-(.+)-M\d+|MULTA-(.+?)(?:-M\d+)?|CM-(.+?)-\d{4}-\d{2}|CONDO-(.+?)-\d+)$/);
    if (m) {
      s.add(m[1] || m[2] || m[3] || m[4]);
    } else if (/^[A-Z]{3,4}\d{4,8}$/.test(str)) {
      s.add(str);
    } else if (/^(?:SRV|SERV)[-_]/i.test(str)) {
      s.add(str);
    }
  });

  // 4. Recibos de caja
  (Array.isArray(d.recibo_caja) ? d.recibo_caja : []).forEach((rc: any) => {
    if (rc?.inmueble) s.add(String(rc.inmueble).trim().toUpperCase());
    if (rc?.codigo_inmueble) s.add(String(rc.codigo_inmueble).trim().toUpperCase());
    if (rc?.cod_inmueble) s.add(String(rc.cod_inmueble).trim().toUpperCase());
    if (rc?.codContribuyente) s.add(String(rc.codContribuyente).trim().toUpperCase());
  });

  // 5. Deuda previa
  (Array.isArray(d.deuda_previa) ? d.deuda_previa : []).forEach((dp: any) => {
    if (dp?.inmueble) s.add(String(dp.inmueble).trim().toUpperCase());
    if (dp?.codigo) s.add(String(dp.codigo).trim().toUpperCase());
  });

  // 6. Servicios especiales o tala y poda
  (Array.isArray(d.servicios) ? d.servicios : []).forEach((srv: any) => {
    if (typeof srv === 'object') {
      if (srv?.inmueble) s.add(String(srv.inmueble).trim().toUpperCase());
      else if (srv?.referencia) s.add(String(srv.referencia).trim().toUpperCase());
    } else if (typeof srv === 'string' && srv.trim()) {
      s.add(srv.trim().toUpperCase());
    }
  });
  (Array.isArray(d.tala_poda) ? d.tala_poda : []).forEach((srv: any) => {
    if (typeof srv === 'object') {
      if (srv?.inmueble) s.add(String(srv.inmueble).trim().toUpperCase());
      else if (srv?.referencia) s.add(String(srv.referencia).trim().toUpperCase());
    } else if (typeof srv === 'string' && srv.trim()) {
      s.add(srv.trim().toUpperCase());
    }
  });

  // 7. Convenios
  (Array.isArray(d.cuotas) ? d.cuotas : []).forEach((cuo: any) => {
    if (typeof cuo === 'object') {
      if (cuo?.inmueble) s.add(String(cuo.inmueble).trim().toUpperCase());
      else if (cuo?.numeroConv) s.add(String(cuo.numeroConv).trim().toUpperCase());
      else if (cuo?.convId) s.add(`CONV-${String(cuo.convId).slice(0, 8).toUpperCase()}`);
    } else if (typeof cuo === 'string' && cuo.trim()) {
      s.add(cuo.trim().toUpperCase());
    }
  });

  return [...s].filter(Boolean);
};

/** Inmuebles (columnas de desglose) de los códigos que aparecen en los pagos. */
export async function cargarInmMapPagos(pagos: any[]): Promise<Map<string, any>> {
  const inmMap = new Map<string, any>();
  const todosCods = [...new Set(pagos.flatMap(p => codigosDePago(parseDet(p))))];
  for (let i = 0; i < todosCods.length; i += 200) {
    const { data } = await supabase.from('inmuebles').select(COLS_INMUEBLE_DESGLOSE).in('inmueble', todosCods.slice(i, i + 200));
    (data || []).forEach((r: any) => inmMap.set(String(r.inmueble).toUpperCase(), r));
  }
  return inmMap;
}

/**
 * Montos fiscales de un pago: base gravada, IVA, exento (residencial + multas) y total con IVA.
 * Usa el desglose oficial de Caja (misma fórmula del cobro); si no cuadra (abonos, pagos sin detalle)
 * reparte el monto según el tipo de inmueble.
 */
export function montosPago(p: any, det: any, inmMap: Map<string, any>, retConocida: number) {
  const monto = Number(p.monto) || 0;
  try {
    const d = desglosarPago(p, inmMap);
    if (d.cuadra && d.lineas.length) {
      let base = 0, iva = 0, exento = 0, ret = 0;
      d.lineas.forEach(l => {
        ret += l.retencion;
        if (l.tipo === 'otro' && !l.esResidencial) { const b = l.base / 1.16; base += b; iva += l.base - b; return; }
        if (l.esResidencial) exento += l.base + l.multa;
        else { base += l.base; iva += l.iva; exento += l.multa; }
      });
      return { base: r2(base), iva: r2(iva), exento: r2(exento), total: r2(base + iva + exento), ret: r2(retConocida || ret) };
    }
  } catch { /* respaldo abajo */ }
  const cods = codigosDePago(det);
  const inms = cods.map(c => inmMap.get(c)).filter(Boolean);
  const comercial = inms.length ? inms.some((i: any) => !isResidencialInm(i)) : esContribuyente(p.identidad);
  if (!comercial) return { base: 0, iva: 0, exento: r2(monto), total: r2(monto), ret: 0 };
  const bruto = monto + (retConocida || 0);
  const base = r2(bruto / 1.16);
  return { base, iva: r2(bruto - base), exento: 0, total: r2(bruto), ret: r2(retConocida || 0) };
}

export const generarLibroVentas = async (pagosFiltrados: any[], contribuyentes: any[], tipo: 'Diario' | 'Semanal' | 'Mensual', fechaInicio: string, fechaFin: string) => {
  if (pagosFiltrados.length === 0) {
    alert('No hay pagos para exportar.');
    return;
  }

  // Retenciones por pago vinculado
  const retPorPago = new Map<string, { monto: number; ref: string; fecha: string }>();
  pagosFiltrados.filter(esRetencion).forEach(p => {
    const d = parseDet(p);
    if (d.pago_vinculado) retPorPago.set(String(d.pago_vinculado), { monto: Number(p.monto) || 0, ref: String(p.referencia || ''), fecha: fechaISO(p.created_at) });
  });

  const ventas = pagosFiltrados
    .filter(p => !esRetencion(p))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  // Inmuebles de los pagos (para el desglose fiscal)
  const inmMap = await cargarInmMapPagos(ventas);

  const nombreDe = (id: string, det: any) => {
    const c = contribuyentes.find((x: any) => x.Identidad === id);
    return c?.Contribuyente || det.contribuyente_nombre || det.recibo_caja?.[0]?.razonSocial || (det.contribuyente && det.contribuyente !== id ? det.contribuyente : '') || id;
  };

  const wb = new ExcelJS.Workbook();
  const wsRes = wb.addWorksheet('Resumen y Declaración');
  const ws = wb.addWorksheet('Libro de Ventas');

  // ── Hoja Libro de Ventas ──
  const headers = [
    'N° Op.', 'Fecha Doc.', 'N° RIF', 'Nombre o Razón Social', 'N° Planilla Export.', 'N° Factura / Doc.', 'N° Control',
    'N° Nota Débito', 'N° Nota Crédito', 'Tipo Transac.', 'N° Doc. Afectado', 'Total Ventas Con IVA', 'Ventas Exentas',
    'Ventas Exoneradas / No Sujetas', 'Base Imponible (Contribuyente)', '% Alícuota', 'Débito Fiscal (Contribuyente)',
    'Base Imponible (No Contribuyente)', '% Alícuota', 'Débito Fiscal (No Contribuyente)', 'IVA Retenido (Comprador)',
    'Fecha Comprobante Ret.', 'N° Comprobante Retención', 'IGTF Percibido (3%)',
  ];
  const n = headers.length;
  const per = (() => {
    const d = new Date(`${fechaInicio}T12:00:00`);
    return isNaN(d.getTime()) ? '' : `${MESES[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
  })();
  const titulo = (row: number, txt: string, size = 12) => {
    ws.mergeCells(row, 1, row, n);
    const c = ws.getCell(row, 1);
    c.value = txt; c.font = { name: 'Arial', size, bold: true }; c.alignment = { horizontal: 'center' };
  };
  titulo(1, 'REPÚBLICA BOLIVARIANA DE VENEZUELA - ESTADO CARABOBO', 11);
  titulo(2, ORGANISMO, 12);
  titulo(3, `LIBRO DE VENTAS E INGRESOS POR SERVICIO DE ASEO URBANO${tipo === 'Mensual' && per ? ' - ' + per : ''}`, 12);
  ws.getCell(4, 1).value = `RIF: ${RIF_IAMEC}`;
  ws.getCell(4, 1).font = { bold: true };
  ws.getCell(4, 12).value = `Período: ${dmy(fechaInicio)} al ${dmy(fechaFin)}`;
  ws.getCell(4, 12).font = { bold: true };

  const hr = ws.getRow(6);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });
  hr.height = 42;
  [7, 11, 16, 34, 12, 14, 12, 11, 11, 9, 12, 15, 13, 14, 15, 8, 14, 15, 8, 14, 14, 13, 18, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const T = { total: 0, exento: 0, exon: 0, baseC: 0, ivaC: 0, baseN: 0, ivaN: 0, ret: 0, igtf: 0 };
  let facturas = 0;
  const usuariosRes = new Set<string>();
  const usuariosCom = new Set<string>();
  let rowIdx = 7;

  ventas.forEach((p, i) => {
    const det = parseDet(p);
    const contrib = esContribuyente(p.identidad);
    const ret = retPorPago.get(String(p.id));
    const m = montosPago(p, det, inmMap, r2(ret?.monto ?? Number(det.monto_retencion_iva || 0)));
    const retMonto = m.ret;
    const fd = det.factura_digital || {};
    const reciboNo = det.recibo_caja?.[0]?.controlWeb || det.recibo_caja?.[0]?.reciboNo || p.referencia || '';
    const nroDoc = fd.numero_documento || reciboNo;
    if (fd.numero_documento) facturas++;
    (m.iva > 0 ? usuariosCom : usuariosRes).add(String(p.identidad || ''));

    const vals: any[] = [
      i + 1, fechaISO(p.created_at), p.identidad || '', nombreDe(p.identidad, det), '', nroDoc, fd.numero_control || '',
      '', '', '01-REG', '', m.total, m.exento, 0,
      contrib ? m.base : 0, 0.16, contrib ? m.iva : 0,
      contrib ? 0 : m.base, 0.16, contrib ? 0 : m.iva,
      retMonto, retMonto > 0 ? (ret?.fecha || fechaISO(p.created_at)) : '', retMonto > 0 ? (ret?.ref || '') : '', 0,
    ];
    const row = ws.getRow(rowIdx++);
    vals.forEach((v, k) => {
      const c = row.getCell(k + 1);
      c.value = v;
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      c.font = { size: 9 };
      if ([12, 13, 14, 15, 17, 18, 20, 21, 24].includes(k + 1)) c.numFmt = '#,##0.00';
      if ([16, 19].includes(k + 1)) c.numFmt = '0%';
    });
    T.total += m.total; T.exento += m.exento;
    if (contrib) { T.baseC += m.base; T.ivaC += m.iva; } else { T.baseN += m.base; T.ivaN += m.iva; }
    T.ret += retMonto;
  });

  const tot = ws.getRow(rowIdx);
  tot.getCell(1).value = 'TOTALES';
  const totVals: Record<number, number> = { 12: T.total, 13: T.exento, 14: T.exon, 15: T.baseC, 17: T.ivaC, 18: T.baseN, 20: T.ivaN, 21: T.ret, 24: T.igtf };
  for (let k = 1; k <= n; k++) {
    const c = tot.getCell(k);
    if (totVals[k] !== undefined) { c.value = r2(totVals[k]); c.numFmt = '#,##0.00'; }
    c.font = { bold: true, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }
  ws.views = [{ state: 'frozen', ySplit: 6 }];

  // ── Hoja Resumen y Declaración ──
  wsRes.getColumn(1).width = 62; wsRes.getColumn(2).width = 22; wsRes.getColumn(3).width = 22; wsRes.getColumn(4).width = 18;
  const put = (r: number, vals: any[], opts: { bold?: boolean; fill?: string; fmt?: boolean } = {}) => {
    vals.forEach((v, k) => {
      const c = wsRes.getCell(r, k + 1);
      c.value = v;
      if (opts.bold) c.font = { bold: true };
      if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
      if (opts.fmt && typeof v === 'number') c.numFmt = k === 3 ? '0.00%' : '#,##0.00';
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  };
  wsRes.mergeCells('A1:D1'); wsRes.getCell('A1').value = ORGANISMO; wsRes.getCell('A1').font = { bold: true, size: 13 }; wsRes.getCell('A1').alignment = { horizontal: 'center' };
  wsRes.mergeCells('A2:D2'); wsRes.getCell('A2').value = 'RESUMEN DEL LIBRO DE VENTAS (DECLARACIÓN IVA)'; wsRes.getCell('A2').font = { bold: true, size: 12 }; wsRes.getCell('A2').alignment = { horizontal: 'center' };
  put(4, ['DATOS GENERALES DE LA OFICINA DE RECAUDACIÓN', '', '', ''], { bold: true, fill: 'FFD9E1F2' });
  put(5, ['Organismo / Entidad: Oficina de Recaudación de Aseo Urbano - Naguanagua', 'RIF:', RIF_IAMEC, '']);
  put(6, [`Período Impositivo: ${per || ''} (${dmy(fechaInicio)} al ${dmy(fechaFin)})`, 'Fecha de Elaboración:', fechaISO(new Date()), '']);
  put(7, ['Marco Normativo: Providencia SNAT/2025/000054 / L-IVA', 'Estatus del Período:', ventas.length ? 'CON OPERACIONES' : 'SIN OPERACIONES', '']);

  put(9, ['RESUMEN DE VENTAS Y DÉBITOS FISCALES', '', '', ''], { bold: true, fill: 'FFD9E1F2' });
  put(10, ['Concepto / Descripción del Rubro', 'Base Imponible (Bs.)', 'Débito Fiscal (Bs.)', '% Total'], { bold: true, fill: 'FF1F4E78' });
  for (let k = 1; k <= 4; k++) wsRes.getCell(10, k).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  const totalBase = T.exento + T.exon + T.baseC + T.baseN;
  const pct = (x: number) => (totalBase > 0 ? x / totalBase : 0);
  const rubros: [string, number, number][] = [
    ['Total Ventas Exportación', 0, 0],
    ['Total Ventas Internas No Gravadas (Exentas)', T.exento, 0],
    ['Total Ventas Internas No Gravadas (Exoneradas / No Sujetas)', T.exon, 0],
    ['Total Ventas Afectadas en Alícuota General (16%) - Contribuyentes', T.baseC, T.ivaC],
    ['Total Ventas Afectadas en Alícuota General (16%) - No Contribuyentes', T.baseN, T.ivaN],
    ['Total Ventas Afectadas en Alícuota Reducida (8%)', 0, 0],
    ['Total Ventas Afectadas en Alícuota General + Adicional (31%)', 0, 0],
  ];
  rubros.forEach((rb, k) => put(11 + k, [rb[0], r2(rb[1]), r2(rb[2]), pct(rb[1])], { fmt: true }));
  put(18, ['TOTAL DE VENTAS INTERNAS Y DÉBITOS FISCALES', r2(totalBase), r2(T.ivaC + T.ivaN), totalBase > 0 ? 1 : 0], { bold: true, fmt: true, fill: 'FFE7E6E6' });

  put(20, ['COMPLEMENTO DE RETENCIONES Y AJUSTES', '', '', ''], { bold: true, fill: 'FFD9E1F2' });
  put(21, ['Total IVA Retenido por Compradores (Soportes Recibidos)', r2(T.ret), '', ''], { fmt: true });
  put(22, ['Ajuste a los Débitos Fiscales de Períodos Anteriores', 0, '', ''], { fmt: true });
  put(23, ['Total General IVA Cobrado / Facturado en el Mes', r2(T.ivaC + T.ivaN), '', ''], { fmt: true });

  const anuladas = pagosFiltrados.filter(p => /anulad/i.test(String(p.estado || ''))).length;
  put(25, ['ESTADÍSTICAS DEL PERÍODO', '', '', ''], { bold: true, fill: 'FFD9E1F2' });
  put(26, ['FACTURAS EMITIDAS', facturas + anuladas, '', '']);
  put(27, ['FACTURAS ANULADAS', anuladas, '', '']);
  put(28, ['TOTAL FACTURAS GENERADAS', facturas, '', '']);
  put(29, ['DOCUMENTOS (FACTURAS + RECIBOS) REGISTRADOS', ventas.length, '', '']);
  put(30, ['USUARIOS RESIDENCIALES ATENDIDOS INCLUYENDO CONDOMINIOS', usuariosRes.size, '', '']);
  put(31, ['USUARIOS COMERCIALES ATENDIDOS INCLUYENDO CENTROS COMERCIALES', usuariosCom.size, '', '']);
  put(33, ['Notas: Contribuyente = RIF J/G; No contribuyente = cédula V/E. Las retenciones de IVA se reflejan en la línea de su factura.', '', '', '']);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `Libro_Ventas_${fechaInicio}_${fechaFin}.xlsx`);
};
