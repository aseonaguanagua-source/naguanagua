import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { parseDet, montosPago, cargarInmMapPagos, codigosDePago } from './LibroVentas';
import { clasificarBancoDestino } from '@/lib/cuentasBancarias';

/**
 * Reportes de Caja con el formato del IAMEC (carpeta REPORTES):
 *  - TOTAL PUNTOS DE VENTA: hoja "TOTAL POR DIA" + una hoja por día con cada caja (cajero, activa, monto, usuarios).
 *  - CONCILIACIÓN DE TRANSFERENCIAS: "RESUMEN DEL MES", "CONCILIACION BANCARIA" (bloques por mes del pago)
 *    y "CONCILIACION DEL PUNTO DE VENTA" (total del sistema por caja y día; el cierre de lote lo llena el analista).
 */
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const BORDE = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as any;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const fechaVE = (d: any) => { const x = new Date(d); return isNaN(x.getTime()) ? '' : new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10); };
const dmy = (iso: string) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : iso; };
const esAnulado = (p: any) => ['Anulado', 'Reversado', 'Condonado', 'Rechazado'].includes(String(p.estado || ''));
const esDebito = (p: any) => /^(d[eé]bito|cr[eé]dito|tmd)\b|punto|tarjeta/i.test(String(p.tipo || '').trim());
const esTransferencia = (p: any) => /transfer|m[oó]vil|pago m/i.test(String(p.tipo || ''));
const esRetencion = (p: any) => /retenci/i.test(String(p.tipo || ''));

/** "M-valentina" -> { caja: 'CAJA M', cajero: 'VALENTINA' } */
function cajaDe(det: any) {
  const raw = String(det.cajero || det.analista || '').trim();
  const m = raw.match(/^([A-Za-z]{1,2})-(.+)$/);
  if (m) return { caja: `CAJA ${m[1].toUpperCase()}`, cajero: m[2].toUpperCase() };
  return { caja: raw ? raw.toUpperCase() : 'SIN CAJA', cajero: raw.toUpperCase() };
}

function cab(ws: any, fila: number, valores: string[], desde = 1) {
  const r = ws.getRow(fila);
  valores.forEach((v, i) => {
    const c = r.getCell(desde + i);
    c.value = v; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = BORDE;
  });
  r.height = 28;
}

// ─────────────────────────── TOTAL PUNTOS DE VENTA ───────────────────────────
export async function generarTotalPuntosVenta(pagos: any[], fechaInicio: string, fechaFin: string) {
  const deb = pagos.filter(p => !esAnulado(p) && esDebito(p));
  if (!deb.length) { alert('No hay pagos por punto de venta en el rango.'); return; }
  const porDia = new Map<string, Map<string, { cajero: string; monto: number; usuarios: Set<string> }>>();
  const todasCajas = new Map<string, string>();
  deb.forEach(p => {
    const det = parseDet(p);
    const dia = fechaVE(p.created_at);
    const { caja, cajero } = cajaDe(det);
    todasCajas.set(caja, cajero);
    if (!porDia.has(dia)) porDia.set(dia, new Map());
    const m = porDia.get(dia)!;
    if (!m.has(caja)) m.set(caja, { cajero, monto: 0, usuarios: new Set() });
    const c = m.get(caja)!;
    c.monto += Number(p.monto) || 0;
    c.usuarios.add(String(p.identidad || ''));
  });
  const cajasOrden = [...todasCajas.keys()].sort();
  const wb = new ExcelJS.Workbook();
  const res = wb.addWorksheet('TOTAL POR DIA');
  res.columns = [{ width: 10 }, { width: 8 }, { width: 18 }, { width: 12 }, { width: 10 }] as any;
  res.mergeCells('A1:E1'); res.getCell('A1').value = `TOTAL PUNTOS DE VENTA ${dmy(fechaInicio)} AL ${dmy(fechaFin)}`; res.getCell('A1').font = { bold: true, size: 12 };
  cab(res, 3, ['Dia sem', 'DIA', 'MONTO', 'USUARIOS', 'ACTIVAS']);
  let f = 4; let tM = 0, tU = 0;
  [...porDia.keys()].sort().forEach(dia => {
    const m = porDia.get(dia)!;
    const monto = [...m.values()].reduce((s, c) => s + c.monto, 0);
    const usuarios = [...m.values()].reduce((s, c) => s + c.usuarios.size, 0);
    const d = new Date(`${dia}T12:00:00`);
    const row = res.getRow(f++);
    [DIAS[d.getDay()], d.getDate(), r2(monto), usuarios, m.size].forEach((v, i) => { const c = row.getCell(i + 1); c.value = v; c.border = BORDE; if (i === 2) c.numFmt = '#,##0.00'; });
    tM += monto; tU += usuarios;
  });
  const tr = res.getRow(f);
  ['TOTAL', '', r2(tM), tU, ''].forEach((v, i) => { const c = tr.getCell(i + 1); c.value = v; c.font = { bold: true }; c.border = BORDE; if (i === 2) c.numFmt = '#,##0.00'; });

  [...porDia.keys()].sort().forEach(dia => {
    const [, mm, dd] = dia.split('-');
    const ws = wb.addWorksheet(`${dd}-${mm}`);
    ws.columns = [{ width: 12 }, { width: 18 }, { width: 9 }, { width: 22 }, { width: 18 }, { width: 11 }] as any;
    ws.mergeCells('A1:F1'); ws.getCell('A1').value = `PUNTOS DE VENTA ${dmy(dia)}`; ws.getCell('A1').font = { bold: true, size: 12 };
    cab(ws, 3, ['CAJAS', 'CAJERO', 'ACTIVA', 'UBICACION', 'MONTO', 'USUARIOS']);
    const m = porDia.get(dia)!;
    let r = 4; let sm = 0, su = 0;
    cajasOrden.forEach(caja => {
      const c = m.get(caja);
      const row = ws.getRow(r++);
      [caja, c?.cajero || todasCajas.get(caja) || '', c ? '✔️' : '❌', '', c ? r2(c.monto) : null, c ? c.usuarios.size : null]
        .forEach((v, i) => { const cell = row.getCell(i + 1); cell.value = v as any; cell.border = BORDE; if (i === 4) cell.numFmt = '#,##0.00'; });
      if (c) { sm += c.monto; su += c.usuarios.size; }
    });
    const t = ws.getRow(r);
    ['TOTAL', '', m.size, '', r2(sm), su].forEach((v, i) => { const cell = t.getCell(i + 1); cell.value = v; cell.font = { bold: true }; cell.border = BORDE; if (i === 4) cell.numFmt = '#,##0.00'; });
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Total_Puntos_Venta_${fechaInicio.slice(0, 10)}_${fechaFin.slice(0, 10)}.xlsx`);
}

// ─────────────────────────── CONCILIACIÓN DE TRANSFERENCIAS ───────────────────────────
export async function generarConciliacionTransferencias(pagos: any[], contribuyentes: any[], fechaInicio: string, fechaFin: string) {
  const vivos = pagos.filter(p => !esAnulado(p));
  const transf = vivos.filter(p => esTransferencia(p) && String(p.estado) === 'Aprobado');
  const deb = vivos.filter(p => esDebito(p));
  if (!transf.length && !deb.length) { alert('No hay pagos en el rango.'); return; }

  const retPorPago = new Map<string, number>();
  vivos.filter(esRetencion).forEach(p => { const d = parseDet(p); if (d.pago_vinculado) retPorPago.set(String(d.pago_vinculado), Number(p.monto) || 0); });
  const inmMap = await cargarInmMapPagos(transf);
  const nombreDe = (id: string, det: any) => contribuyentes.find((x: any) => x.Identidad === id)?.Contribuyente || det.recibo_caja?.[0]?.razonSocial || id;

  // Mes del PAGO (fecha de la transferencia), no del registro
  const porMes = new Map<string, any[]>();
  transf.forEach(p => {
    const det = parseDet(p);
    // Si la lista de pagos ya contiene las filas individuales de cada pago adicional,
    // NO debemos re-expandir pagos_agregados en el padre porque duplicaría las filas y sumaría varias veces el mismo pago.
    const pagsAgregados = Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1
      ? det.pagos_agregados.filter((pa: any) => pa && Number(pa.monto) > 0 && pa.metodo !== 'Saldo a Favor')
      : null;

    // Solo se expande si ninguna de las referencias de pagos_agregados existe ya como otra fila en transf
    const yaExistenComoFilasSeparadas = det.es_pago_adicional || (pagsAgregados && pagsAgregados.length > 1 && pagsAgregados.some((pa: any) => {
      const paRef = String(pa?.referencia || '').trim().toLowerCase();
      const pRef = String(p?.referencia || '').trim().toLowerCase();
      return paRef && paRef !== pRef && transf.some((otro: any) => String(otro?.referencia || '').trim().toLowerCase() === paRef);
    }));

    if (pagsAgregados && pagsAgregados.length > 1 && !yaExistenComoFilasSeparadas) {
      const totalBase = pagsAgregados.reduce((acc: number, x: any) => acc + (Number(x.monto) || 0), 0) || Number(p.monto) || 1;
      pagsAgregados.forEach((pa: any) => {
        const fPagoSub = String(pa.fecha || pa.fechaTransaccion || det.fecha_transaccion || det.fecha_banco || fechaVE(p.created_at)).slice(0, 10);
        const keySub = fPagoSub.slice(0, 7);
        if (!porMes.has(keySub)) porMes.set(keySub, []);
        porMes.get(keySub)!.push({
          p: {
            ...p,
            monto: Number(pa.monto) || 0,
            banco: pa.banco || p.banco,
            referencia: pa.referencia || p.referencia,
            tipo: pa.metodo || p.tipo,
          },
          det,
          fPago: fPagoSub,
          esSubPago: true,
          montoTotalReportado: totalBase,
        });
      });
    } else {
      const fPago = String(det.fecha_transaccion || det.fecha_banco || fechaVE(p.created_at)).slice(0, 10);
      const key = fPago.slice(0, 7);
      if (!porMes.has(key)) porMes.set(key, []);
      porMes.get(key)!.push({ p, det, fPago, esSubPago: false, montoTotalReportado: Number(p.monto) || 1 });
    }
  });

  const wb = new ExcelJS.Workbook();
  const wsRes = wb.addWorksheet('RESUMEN DEL MES');
  const wsBan = wb.addWorksheet('CONCILIACION BANCARIA');
  const wsPto = wb.addWorksheet('CONCILIACION DEL PUNTO DE VENTA');

  // Conciliación bancaria
  const cols = ['Fecha Pago', 'Banco Emisor', 'Banco Destino', 'Referencia', 'Forma de Pago', 'Monto Pagado', 'Fecha Factura', 'Nro Serie', 'Código Cliente', 'Razón Social', 'Cajero / Operador', 'Aseo Urbano', '% IVA', 'Monto IVA', 'Retención IVA', 'Nota de Crédito', 'Exento'];
  [12, 18, 15, 14, 14, 15, 12, 12, 14, 34, 20, 15, 7, 13, 13, 13, 13].forEach((w, i) => { wsBan.getColumn(i + 2).width = w; });
  wsBan.getColumn(1).width = 3;
  let f = 1;
  const totalesMes: [string, number, number, number][] = [];
  [...porMes.keys()].sort().forEach(key => {
    const [y, m] = key.split('-');
    wsBan.mergeCells(f, 2, f, 18);
    wsBan.getCell(f, 2).value = `CONCILIACION BANCARIA DE PAGOS (TRANSFERENCIAS) REPORTADAS LUEGO DEL CIERRE DE MES: MES ${MESES[parseInt(m) - 1]} ${y}`;
    wsBan.getCell(f, 2).font = { bold: true }; wsBan.getCell(f, 2).alignment = { horizontal: 'center' };
    f++;
    cab(wsBan, f++, cols, 2);
    let sub = 0;
    let subBanesco = 0;
    let subBancamiga = 0;
    porMes.get(key)!.sort((a, b) => a.fPago.localeCompare(b.fPago)).forEach(({ p, det, fPago, esSubPago, montoTotalReportado }) => {
      const ret = retPorPago.get(String(p.id)) ?? Number(det.monto_retencion_iva || 0);
      const mtTotal = montosPago(p, det, inmMap, ret);
      const factor = esSubPago && montoTotalReportado > 0 ? (Number(p.monto) || 0) / montoTotalReportado : 1;
      const mt = esSubPago ? {
        base: r2(mtTotal.base * factor),
        iva: r2(mtTotal.iva * factor),
        ret: r2(mtTotal.ret * factor),
        exento: r2(mtTotal.exento * factor)
      } : mtTotal;
      const fd = det.factura_digital || {};
      const ncTotal = Number(det.saldo_favor || 0) > 0 ? Number(det.saldo_favor) : 0;
      const nc = esSubPago ? r2(ncTotal * factor) : ncTotal;
      const cajero = det.cajero || det.usuario || p.usuario || '';
      const bClass = clasificarBancoDestino(p);
      const bDestLabel = bClass === 'Banesco' ? 'Banesco' : bClass === 'Bancamiga' ? 'Bancamiga' : (det.banco_destino || det.banco_receptor || 'Otro');
      const row = wsBan.getRow(f++);
      const vals: any[] = [
        dmy(fPago), p.banco || '', bDestLabel, p.referencia || '', p.tipo || 'Transferencia', r2(Number(p.monto) || 0), dmy(fechaVE(p.created_at)),
        fd.numero_documento || det.recibo_caja?.[0]?.controlWeb || '', codigosDePago(det, p).join(', '), nombreDe(p.identidad, det),
        cajero,
        mt.base, mt.iva > 0 ? 16 : 0, mt.iva, mt.ret, r2(nc), mt.exento,
      ];
      vals.forEach((v, i) => { const c = row.getCell(i + 2); c.value = v; c.border = BORDE; c.font = { size: 9 }; if ([5, 11, 13, 14, 15, 16].includes(i)) c.numFmt = '#,##0.00'; });
      const mPagado = Number(p.monto) || 0;
      sub += mPagado;
      if (bClass === 'Banesco') subBanesco += mPagado;
      else if (bClass === 'Bancamiga') subBancamiga += mPagado;
    });
    const t = wsBan.getRow(f++);
    t.getCell(6).value = 'TOTAL'; t.getCell(7).value = r2(sub); t.getCell(7).numFmt = '#,##0.00';
    t.getCell(6).font = { bold: true }; t.getCell(7).font = { bold: true };
    f++;
    totalesMes.push([`${MESES[parseInt(m) - 1]} ${y}`, sub, subBanesco, subBancamiga]);
  });

  // Conciliación del punto: total del sistema por caja y día (cierre de lote lo completa el analista)
  wsPto.columns = [{ width: 14 }, { width: 14 }, { width: 24 }, { width: 18 }, { width: 14 }, { width: 14 }] as any;
  const pto = new Map<string, Map<string, { monto: number; usuarios: Set<string> }>>();
  deb.forEach(p => {
    const { caja } = cajaDe(parseDet(p));
    const dia = fechaVE(p.created_at);
    if (!pto.has(caja)) pto.set(caja, new Map());
    const m = pto.get(caja)!;
    if (!m.has(dia)) m.set(dia, { monto: 0, usuarios: new Set() });
    const x = m.get(dia)!; x.monto += Number(p.monto) || 0; x.usuarios.add(String(p.identidad || ''));
  });
  let fp = 1; let totalPunto = 0;
  [...pto.keys()].sort().forEach(caja => {
    cab(wsPto, fp++, [caja, 'FECHA', 'TOTAL EMITIDO POR EL SISTEMA', 'CIERRE DE PUNTO', 'DIFERENCIA', 'PERSONAS']);
    const m = pto.get(caja)!;
    [...m.keys()].sort().forEach(dia => {
      const x = m.get(dia)!;
      const row = wsPto.getRow(fp);
      ['', dmy(dia), r2(x.monto), null, null, x.usuarios.size].forEach((v, i) => { const c = row.getCell(i + 1); c.value = v as any; c.border = BORDE; if (i === 2 || i === 3 || i === 4) c.numFmt = '#,##0.00'; });
      row.getCell(5).value = { formula: `IF(D${fp}="","",D${fp}-C${fp})` } as any;
      totalPunto += x.monto; fp++;
    });
    fp++;
  });

  // Resumen
  wsRes.getColumn(1).width = 34; wsRes.getColumn(2).width = 22;
  wsRes.getCell('A1').value = 'RESUMEN DE CONCILIACIONES'; wsRes.getCell('A1').font = { bold: true, size: 12 };
  wsRes.getCell('A2').value = `Período de registro: ${dmy(fechaInicio)} al ${dmy(fechaFin)}`;
  let fr = 4; let totalMes = 0;
  totalesMes.forEach(([k, v, vBan, vBga]) => {
    wsRes.getCell(fr, 1).value = k;
    wsRes.getCell(fr, 2).value = r2(v);
    wsRes.getCell(fr, 2).numFmt = '#,##0.00';
    fr++;
    if (vBan > 0 || vBga > 0) {
      wsRes.getCell(fr, 1).value = `   • Banesco`;
      wsRes.getCell(fr, 2).value = r2(vBan || 0);
      wsRes.getCell(fr, 2).numFmt = '#,##0.00';
      wsRes.getCell(fr, 1).font = { italic: true, size: 9, color: { argb: 'FF047857' } };
      wsRes.getCell(fr, 2).font = { size: 9, color: { argb: 'FF047857' } };
      fr++;
      wsRes.getCell(fr, 1).value = `   • Bancamiga`;
      wsRes.getCell(fr, 2).value = r2(vBga || 0);
      wsRes.getCell(fr, 2).numFmt = '#,##0.00';
      wsRes.getCell(fr, 1).font = { italic: true, size: 9, color: { argb: 'FF0284C7' } };
      wsRes.getCell(fr, 2).font = { size: 9, color: { argb: 'FF0284C7' } };
      fr++;
    }
    totalMes += v;
  });
  wsRes.getCell(fr, 1).value = 'VENTAS POR PUNTO'; wsRes.getCell(fr, 2).value = r2(totalPunto); wsRes.getCell(fr, 2).numFmt = '#,##0.00'; fr++;
  wsRes.getCell(fr, 1).value = 'TOTAL DEL MES'; wsRes.getCell(fr, 2).value = r2(totalMes + totalPunto); wsRes.getCell(fr, 2).numFmt = '#,##0.00';
  wsRes.getCell(fr, 1).font = { bold: true }; wsRes.getCell(fr, 2).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Conciliacion_Transferencias_${fechaInicio.slice(0, 10)}_${fechaFin.slice(0, 10)}.xlsx`);
}
