import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabase';
import { parseDet, montosPago, cargarInmMapPagos, codigosDePago } from './LibroVentas';
import { obtenerNroReciboWeb } from './ReporteRecibosPagos';
import { clasificarBancoDestino } from '@/lib/cuentasBancarias';

const cleanId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function ubicacionDeCaja(caja: string, cajero: string): string {
  const cj = String(caja || '').toUpperCase().trim();
  const op = String(cajero || '').toUpperCase().trim();
  if (cj === 'CAJA R' || /DAMAR[IY]S|NANY|LOVERA|RIO\s*SIL/i.test(op)) return 'RIO SIL';
  if (cj === 'CAJA C' || /DANIELA|TAQUILLA\s*M[OÓ]VIL/i.test(op)) return 'TAQUILLA MOVIL';
  return 'C.C. PASEO LA GRANJA';
}

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
const esAnulado = (p: any) => {
  if (['Anulado', 'Reversado', 'Condonado', 'Rechazado'].includes(String(p.estado || ''))) return true;
  const det = parseDet(p);
  const caj = String(det?.cajero || det?.analista || '').trim();
  if (/^(dz-)?dzara$|^c-dzara$/i.test(caj)) return true;
  return false;
};
const esDebito = (p: any) => /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta/i.test(String(p.tipo || '').trim());
const esTransferencia = (p: any) => {
  if (!/transfer|m[oó]vil|pago m/i.test(String(p.tipo || ''))) return false;
  const ref = String(p.referencia || '').trim();
  const det = parseDet(p);
  const tieneTransfAgregada = Array.isArray(det?.pagos_agregados) && det.pagos_agregados.some((pa: any) => /transfer|m[oó]vil|pago m/i.test(String(pa?.metodo || pa?.tipo || '')));
  if (/^desc\.?\s*saldo|^saldo[-_ ]?favor/i.test(ref) && !tieneTransfAgregada) return false;
  return true;
};
const esRetencion = (p: any) => /retenci/i.test(String(p.tipo || ''));

/** "M-valentina" -> { caja: 'CAJA M', cajero: 'VALENTINA' } */
function cajaDe(det: any) {
  const raw = String(det.cajero || det.analista || '').trim();
  if (/dzara/i.test(raw)) return { caja: 'CAJA DZ', cajero: 'DZARA' };
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
export async function generarTotalPuntosVenta(pagos: any[], fechaInicio: string, fechaFin: string, contribuyentes: any[] = []) {
  const deb = pagos.filter(p => !esAnulado(p) && esDebito(p) && !esRetencion(p) && !/saldo a favor|nota de cr[eé]dito/i.test(String(p.tipo || '')));
  if (!deb.length) { alert('No hay pagos por punto de venta en el rango.'); return; }
  const inmMap = await cargarInmMapPagos(deb);
  const nombreDe = (id: string, det: any, p: any) => {
    const raw =
      contribuyentes.find((x: any) => cleanId(x.Identidad || x.identidad) === cleanId(id))?.Contribuyente ||
      det.recibo_caja?.[0]?.razonSocial ||
      p.contribuyente ||
      id;
    return String(raw || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
  };

  const porDia = new Map<string, Map<string, { cajero: string; monto: number; usuarios: number }>>();
  const todasCajas = new Map<string, string>();
  deb.forEach(p => {
    const det = parseDet(p);
    const dia = fechaVE(p.created_at);
    if (!dia) return;
    const { caja, cajero } = cajaDe(det);
    todasCajas.set(caja, cajero);
    if (!porDia.has(dia)) porDia.set(dia, new Map());
    const m = porDia.get(dia)!;
    if (!m.has(caja)) m.set(caja, { cajero, monto: 0, usuarios: 0 });
    const c = m.get(caja)!;
    c.monto += Number(p.monto) || 0;
    c.usuarios += 1;
  });
  const cajasOrden = [...todasCajas.keys()].sort();
  const wb = new ExcelJS.Workbook();

  // Hoja 1: DETALLE DEBITOS (TODAS LAS CAJAS) - similar al reporte detallado de transferencias
  const wsDet = wb.addWorksheet('DETALLE PUNTOS DE VENTA');
  const colsDet = [
    'Fecha Pago', 'Caja', 'Cajero / Operador', 'Banco / Punto', 'Referencia / Recibo',
    'Aprobación', 'Lote', 'Forma de Pago', 'Monto Pagado (Bs.)', 'Nro Factura / Control',
    'Código Inmueble', 'RIF / Cédula', 'Razón Social / Contribuyente',
    'Aseo Urbano', '% IVA', 'Monto IVA', 'Exento'
  ];
  [12, 12, 18, 18, 16, 14, 12, 14, 16, 16, 15, 15, 34, 15, 8, 13, 13].forEach((w, i) => {
    wsDet.getColumn(i + 1).width = w;
  });
  wsDet.mergeCells(1, 1, 1, colsDet.length);
  wsDet.getCell(1, 1).value = `REPORTE DETALLADO DE COBROS POR PUNTO DE VENTA (DÉBITO) — TODAS LAS CAJAS (${dmy(fechaInicio)} AL ${dmy(fechaFin)})`;
  wsDet.getCell(1, 1).font = { bold: true, size: 12 };
  wsDet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  cab(wsDet, 3, colsDet, 1);

  const porCajaItems = new Map<string, any[]>();
  deb.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).forEach(p => {
    const det = parseDet(p);
    const { caja } = cajaDe(det);
    if (!porCajaItems.has(caja)) porCajaItems.set(caja, []);
    porCajaItems.get(caja)!.push({ p, det });
  });

  let fdRow = 4;
  let granTotalDeb = 0;
  let granBase = 0, granIva = 0, granExento = 0;

  [...porCajaItems.keys()].sort().forEach(caja => {
    const itemsCaja = porCajaItems.get(caja)!;
    const cajeroNom = todasCajas.get(caja) || '';
    const rSec = wsDet.getRow(fdRow++);
    rSec.getCell(1).value = `💳 ${caja}${cajeroNom ? ` — CAJERO: ${cajeroNom}` : ''} (${itemsCaja.length} operaciones)`;
    rSec.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF1F4E78' } };
    rSec.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    wsDet.mergeCells(fdRow - 1, 1, fdRow - 1, colsDet.length);

    let subCaja = 0, subBase = 0, subIva = 0, subExento = 0;
    itemsCaja.forEach(({ p, det }) => {
      const fPago = fechaVE(p.created_at);
      const { cajero } = cajaDe(det);
      const mt = montosPago(p, det, inmMap, 0);
      const fd = det.factura_digital || {};
      const recs = Array.isArray(det.recibos) ? det.recibos : [];
      const nroDoc = fd.numero_documento || det.recibo_caja?.[0]?.controlWeb || det.recibo_caja?.[0]?.reciboNo || det.recibo_no || recs[0] || '';
      const codigosList = codigosDePago(det, p);
      const codPrincipal = codigosList[0] || det.codigo_inmueble || det.cod_inmueble || p.inmueble || '';
      const mPagado = r2(Number(p.monto) || 0);

      const row = wsDet.getRow(fdRow++);
      const vals: any[] = [
        dmy(fPago),
        caja,
        cajero || det.cajero || '',
        p.banco || det.banco_destino || 'Punto de Venta',
        p.referencia || recs[0] || '',
        det.aprobacion || '',
        det.lote || '',
        p.tipo || 'Débito',
        mPagado,
        nroDoc,
        codPrincipal,
        p.identidad || '',
        nombreDe(p.identidad, det, p),
        mt.base,
        mt.iva > 0 ? 16 : 0,
        mt.iva,
        mt.exento
      ];
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.border = BORDE;
        c.font = { size: 9 };
        if ([8, 13, 15, 16].includes(i)) c.numFmt = '"Bs. "#,##0.00';
      });
      subCaja += mPagado;
      subBase += mt.base;
      subIva += mt.iva;
      subExento += mt.exento;
    });

    const rSub = wsDet.getRow(fdRow++);
    rSub.getCell(8).value = `SUBTOTAL ${caja}`;
    rSub.getCell(9).value = r2(subCaja);
    rSub.getCell(14).value = r2(subBase);
    rSub.getCell(16).value = r2(subIva);
    rSub.getCell(17).value = r2(subExento);
    [8, 9, 14, 16, 17].forEach(colIdx => {
      const cell = rSub.getCell(colIdx);
      cell.font = { bold: true, size: 9 };
      cell.border = BORDE;
      if (colIdx !== 8) cell.numFmt = '"Bs. "#,##0.00';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
    fdRow++;

    granTotalDeb += subCaja;
    granBase += subBase;
    granIva += subIva;
    granExento += subExento;
  });

  const rGran = wsDet.getRow(fdRow++);
  rGran.getCell(8).value = 'TOTAL GENERAL PUNTOS DE VENTA';
  rGran.getCell(9).value = r2(granTotalDeb);
  rGran.getCell(14).value = r2(granBase);
  rGran.getCell(16).value = r2(granIva);
  rGran.getCell(17).value = r2(granExento);
  [8, 9, 14, 16, 17].forEach(colIdx => {
    const cell = rGran.getCell(colIdx);
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.border = BORDE;
    if (colIdx !== 8) cell.numFmt = '"Bs. "#,##0.00';
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  });

  // Hoja 2: RESUMEN POR DIA (Total_MES + Total_semana lado a lado)
  const res = wb.addWorksheet('RESUMEN');
  res.columns = [
    { width: 10 }, // A: Dia sem
    { width: 8 },  // B: DIA
    { width: 18 }, // C: MONTO (Bs.)
    { width: 12 }, // D: USUARIOS
    { width: 10 }, // E: ACTIVAS
    { width: 4 },  // F: separador
    { width: 14 }, // G: SEMANA
    { width: 18 }, // H: MONTO
    { width: 12 }, // I: USUARIOS
    { width: 12 }, // J: CAJAS ACT
  ] as any;
  res.mergeCells('A1:E1');
  res.getCell('A1').value = `TOTAL PUNTOS DE VENTA ${dmy(fechaInicio)} AL ${dmy(fechaFin)}`;
  res.getCell('A1').font = { bold: true, size: 12 };
  res.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  const cabCyan = (wsTarget: any, fila: number, valores: string[], desde = 1) => {
    const r = wsTarget.getRow(fila);
    valores.forEach((v, i) => {
      const c = r.getCell(desde + i);
      c.value = v;
      c.font = { bold: true, color: { argb: 'FF000000' }, size: 9 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FFFF' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = BORDE;
    });
    r.height = 24;
  };

  cabCyan(res, 3, ['Dia sem', 'DIA', 'MONTO (Bs.)', 'USUARIOS', 'ACTIVAS'], 1);
  cabCyan(res, 3, ['SEMANA', 'MONTO', 'USUARIOS', 'CAJAS ACT'], 7);

  // Construir calendario completo del mes (o rango seleccionado) para Total_MES y agrupar por semana para Total_semana
  const startDt = new Date(`${fechaInicio.slice(0, 10)}T12:00:00`);
  const endDt = new Date(`${fechaFin.slice(0, 10)}T12:00:00`);
  const diasCalendario: string[] = [];
  if (!isNaN(startDt.getTime()) && !isNaN(endDt.getTime()) && startDt <= endDt) {
    const cur = new Date(startDt);
    while (cur <= endDt) {
      diasCalendario.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    diasCalendario.push(...[...porDia.keys()].sort());
  }

  let f = 4;
  let tM = 0, tU = 0;
  const semanasResumen: { label: string; monto: number; usuarios: number; cajasAct: number }[] = [];
  let semIdx = 1;
  let curSem = { label: `SEMANA ${semIdx}`, monto: 0, usuarios: 0, cajasAct: 0, hasDays: false };

  diasCalendario.forEach((dia, idx) => {
    const m = porDia.get(dia);
    const monto = m ? [...m.values()].reduce((s, c) => s + c.monto, 0) : 0;
    const usuarios = m ? [...m.values()].reduce((s, c) => s + c.usuarios, 0) : 0;
    const activas = m ? m.size : 0;
    const d = new Date(`${dia}T12:00:00`);
    const dow = d.getDay(); // 0=dom, 6=sáb
    const esFinDeSemana = dow === 0 || dow === 6;

    const row = res.getRow(f++);
    const valsMes: any[] = [
      DIAS[dow],
      d.getDate(),
      r2(monto),
      usuarios > 0 ? usuarios : null,
      activas > 0 ? activas : null,
    ];
    valsMes.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.border = BORDE;
      c.font = { size: 9 };
      if (i === 0 || i === 1 || i === 3 || i === 4) c.alignment = { horizontal: 'center' };
      if (i === 2) {
        c.numFmt = '"Bs. "#,##0.00;("Bs. "#,##0.00);"-"';
      }
      if (esFinDeSemana && monto === 0) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFAEAAAA' } };
      }
    });

    tM += monto;
    tU += usuarios;

    curSem.monto += monto;
    curSem.usuarios += usuarios;
    curSem.cajasAct += activas;
    curSem.hasDays = true;

    if (dow === 0 || idx === diasCalendario.length - 1) {
      semanasResumen.push({ ...curSem });
      semIdx++;
      curSem = { label: `SEMANA ${semIdx}`, monto: 0, usuarios: 0, cajasAct: 0, hasDays: false };
    }
  });

  const tr = res.getRow(f);
  ['TOTAL', '', r2(tM), tU, ''].forEach((v, i) => {
    const c = tr.getCell(i + 1);
    c.value = v;
    c.font = { bold: true, size: 9 };
    c.border = BORDE;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
    if (i === 2) {
      c.numFmt = '"Bs. "#,##0.00;("Bs. "#,##0.00);"-"';
    }
  });

  // Llenar tabla derecha Total_semana (columnas G..J)
  let fSem = 4;
  semanasResumen.forEach(sem => {
    const row = res.getRow(fSem++);
    [sem.label, r2(sem.monto), sem.usuarios, sem.cajasAct].forEach((v, i) => {
      const c = row.getCell(7 + i);
      c.value = v as any;
      c.border = BORDE;
      c.font = { size: 9, bold: i === 0 };
      if (i === 0 || i === 2 || i === 3) c.alignment = { horizontal: 'center' };
      if (i === 1) c.numFmt = '"Bs. "#,##0.00;("Bs. "#,##0.00);"-"';
    });
  });
  const trSem = res.getRow(fSem);
  ['TOTAL', r2(tM), tU, ''].forEach((v, i) => {
    const c = trSem.getCell(7 + i);
    c.value = v as any;
    c.font = { bold: true, size: 9 };
    c.border = BORDE;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
    if (i === 1) c.numFmt = '"Bs. "#,##0.00;("Bs. "#,##0.00);"-"';
  });

  [...porDia.keys()].sort().forEach(dia => {
    const [, mm, dd] = dia.split('-');
    const ws = wb.addWorksheet(`${dd}-${mm}`);
    ws.columns = [{ width: 12 }, { width: 18 }, { width: 9 }, { width: 24 }, { width: 18 }, { width: 11 }] as any;
    ws.mergeCells('A1:F1'); ws.getCell('A1').value = `PUNTOS DE VENTA ${dmy(dia)}`; ws.getCell('A1').font = { bold: true, size: 12 };
    cabCyan(ws, 3, ['CAJAS', 'CAJERO', 'ACTIVA', 'UBICACION', 'MONTO (Bs.)', 'USUARIOS'], 1);
    const m = porDia.get(dia)!;
    let r = 4; let sm = 0, su = 0;
    cajasOrden.forEach(caja => {
      const c = m.get(caja);
      const nomCajero = c?.cajero || todasCajas.get(caja) || '';
      const ubic = ubicacionDeCaja(caja, nomCajero);
      const row = ws.getRow(r++);
      [caja, nomCajero, c ? '✔️' : '❌', ubic, c ? r2(c.monto) : 0, c ? c.usuarios : null]
        .forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v as any;
          cell.border = BORDE;
          cell.font = { size: 9 };
          if (i === 0 || i === 2 || i === 3 || i === 5) cell.alignment = { horizontal: 'center' };
          if (i === 4) cell.numFmt = '"Bs. "#,##0.00;("Bs. "#,##0.00);"-"';
        });
      if (c) { sm += c.monto; su += c.usuarios; }
    });
    const t = ws.getRow(r);
    ['TOTAL', '', m.size, '', r2(sm), su].forEach((v, i) => {
      const cell = t.getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true, size: 9 };
      cell.border = BORDE;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
      if (i === 4) cell.numFmt = '"Bs. "#,##0.00;("Bs. "#,##0.00);"-"';
    });
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

  // Mapas adicionales de condominios, inmuebles por RIF y retenciones_iva para completar códigos y números de factura
  const condoByIdentidad = new Map<string, any>();
  const inmByIdentidad = new Map<string, any>();
  const docByControlFromRet = new Map<string, string>();
  const mapaDocsAudit = new Map<string, string>();

  try {
    const [{ data: auditRows }, { data: condos }, { data: retRows }] = await Promise.all([
      supabase.from('auditoria').select('*').or('accion.ilike.%factura%,accion.ilike.%comprobante%'),
      supabase.from('condominios').select('codigo, identidad, nombre, tipo'),
      supabase.from('retenciones_iva').select('factura_control, codigo_retencion'),
    ]);

    (condos || []).forEach((c: any) => {
      if (c.identidad) condoByIdentidad.set(cleanId(c.identidad), c);
    });

    (retRows || []).forEach((r: any) => {
      const ctrl = String(r.factura_control || '').trim();
      const cod = String(r.codigo_retencion || '').trim();
      if (ctrl && /^FAC-\d+/i.test(cod)) {
        docByControlFromRet.set(ctrl, cod.replace(/^FAC-/i, '').trim());
      }
    });

    if (Array.isArray(auditRows)) {
      auditRows.forEach((a: any) => {
        const d = typeof a.detalles === 'string' ? JSON.parse(a.detalles || '{}') : (a.detalles || {});
        const pid = d.pago_id || d.pagoId;
        const fac = d.factura || d.numero_factura || d.numeroFactura || d.numero_documento;
        if (pid && fac && !mapaDocsAudit.has(String(pid))) {
          mapaDocsAudit.set(String(pid), String(fac).trim());
        }
      });
    }

    const idsSinCodigo = [...new Set(
      transf
        .filter(p => codigosDePago(parseDet(p), p).length === 0)
        .map(p => String(p.identidad || '').trim())
        .filter(Boolean)
    )];
    if (idsSinCodigo.length > 0) {
      for (let i = 0; i < idsSinCodigo.length; i += 200) {
        const { data: inmsExtra } = await supabase
          .from('inmuebles')
          .select('inmueble, identidad, contribuyente, padre_id')
          .in('identidad', idsSinCodigo.slice(i, i + 200));
        (inmsExtra || []).forEach((r: any) => {
          const cid = cleanId(r.identidad);
          if (cid && (!inmByIdentidad.has(cid) || !r.padre_id)) {
            inmByIdentidad.set(cid, r);
          }
        });
      }
    }
  } catch (errAudit) {
    console.warn('No se pudo cargar datos auxiliares en conciliación:', errAudit);
  }

  const nombreDe = (id: string, det: any) => {
    const cid = cleanId(id);
    const c = contribuyentes.find((x: any) => cleanId(x.Identidad || x.identidad) === cid);
    const cnd = condoByIdentidad.get(cid);
    const inm = inmByIdentidad.get(cid);
    const raw =
      c?.Contribuyente ||
      cnd?.nombre ||
      inm?.contribuyente ||
      det.condominio?.nombre ||
      det.recibo_caja?.[0]?.razonSocial ||
      (det.contribuyente && det.contribuyente !== id ? det.contribuyente : '') ||
      id;
    return String(raw || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
  };

  // Mapas de referencia cruzada (para pagos combinados o abonos que liquidaron un recibo con factura/recibo final)
  const docMapPorRef = new Map<string, string>();
  const docMapPorRecibo = new Map<string, string>();
  vivos.forEach(p => {
    const d = parseDet(p);
    const fd = d.factura_digital || {};
    const doc = fd.numero_documento ||
                d.recibo_caja?.[0]?.controlWeb ||
                d.recibo_caja?.[0]?.reciboNo ||
                d.recibo_no ||
                mapaDocsAudit.get(String(p.id)) ||
                d.recibo_digital?.numero ||
                '';
    if (doc) {
      if (p.referencia) {
        const partes = String(p.referencia).split(/[\s,()\/+]+/).map(x => x.trim()).filter(Boolean);
        partes.forEach(pt => {
          if (!docMapPorRef.has(pt)) docMapPorRef.set(pt, doc);
        });
      }
      if (Array.isArray(d.recibos)) {
        d.recibos.forEach((r: any) => {
          const rStr = String(r || '').trim();
          if (rStr && !docMapPorRecibo.has(rStr)) docMapPorRecibo.set(rStr, doc);
        });
      }
    }
  });

  // Mes del PAGO (fecha de la transferencia), no del registro
  const porMes = new Map<string, any[]>();
  transf.forEach(p => {
    const det = parseDet(p);
    const fRegistro = String(fechaVE(p.created_at) || '').slice(0, 10);
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

    const fd = det.factura_digital || {};
    const rc0 = Array.isArray(det.recibo_caja) ? det.recibo_caja[0] : det.recibo_caja;
    const fFacturaRaw =
      det.fecha_emision_override ||
      det.fecha_asignacion_override ||
      (fd.fecha_emision ? String(fd.fecha_emision).slice(0, 10) : '') ||
      (fd.fecha_asignacion ? String(fd.fecha_asignacion).slice(0, 10) : '') ||
      (rc0?.fechaEmision && fRegistro && String(rc0.fechaEmision).slice(0, 7) < fRegistro.slice(0, 7) ? String(rc0.fechaEmision).slice(0, 10) : '') ||
      fRegistro;
    const fFactura = /^\d{4}-\d{2}-\d{2}$/.test(String(fFacturaRaw)) ? String(fFacturaRaw) : fRegistro;

    if (pagsAgregados && pagsAgregados.length > 1 && !yaExistenComoFilasSeparadas) {
      const totalBase = pagsAgregados.reduce((acc: number, x: any) => acc + (Number(x.monto) || 0), 0) || Number(p.monto) || 1;
      pagsAgregados.forEach((pa: any) => {
        let fPagoSub = String(pa.fecha || pa.fechaTransaccion || det.fecha_transaccion || det.fecha_banco || fFactura || fRegistro).slice(0, 10);
        // Si por error de tipeo la fecha del pago fue guardada en un mes futuro respecto al registro o factura, usar la fecha de factura/registro
        const limiteFecha = fFactura && fFactura < fRegistro ? fFactura : fRegistro;
        if (limiteFecha && fPagoSub > limiteFecha) {
          fPagoSub = limiteFecha;
        }
        if ((fechaInicio && fPagoSub < fechaInicio) || (fechaFin && fPagoSub > fechaFin)) return;
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
          fFactura,
          esSubPago: true,
          montoTotalReportado: totalBase,
        });
      });
    } else {
      const fpExacto = (Array.isArray(det.formasPago) ? det.formasPago : []).find((f: any) => String(f?.referencia || '').trim() === String(p.referencia || '').trim());
      const paExacto = (Array.isArray(det.pagos_agregados) ? det.pagos_agregados : []).find((a: any) => String(a?.referencia || '').trim() === String(p.referencia || '').trim());
      const fPagoPropia = String(fpExacto?.fecha || paExacto?.fecha || paExacto?.fechaTransaccion || '').slice(0, 10);
      const fPagoBancaria = det.fecha_banco || (Array.isArray(det.formasPago) && det.formasPago[0]?.fecha ? String(det.formasPago[0].fecha).slice(0, 10) : '');
      let fPago = fPagoPropia || String(fPagoBancaria || det.fecha_transaccion || fFactura || fRegistro).slice(0, 10);
      // Si por error de tipeo la fecha del pago fue guardada en un mes futuro respecto al registro o factura, usar la fecha de factura/registro
      const limiteFecha = fFactura && fFactura < fRegistro ? fFactura : fRegistro;
      if (limiteFecha && fPago > limiteFecha) {
        fPago = limiteFecha;
      }
      if ((fechaInicio && fPago < fechaInicio) || (fechaFin && fPago > fechaFin)) return;
      const key = fPago.slice(0, 7);
      if (!porMes.has(key)) porMes.set(key, []);
      porMes.get(key)!.push({ p, det, fPago, fFactura, esSubPago: false, montoTotalReportado: Number(p.monto) || 1, yaExistenComoFilasSeparadas: !!yaExistenComoFilasSeparadas });
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
    // Requisito 1: El sistema debe separar en la columna banco destino (todo lo que es Banesco separado de lo de Bancamiga)
    const itemsBanesco: any[] = [];
    const itemsBancamiga: any[] = [];
    const itemsOtros: any[] = [];

    porMes.get(key)!.sort((a, b) => a.fPago.localeCompare(b.fPago)).forEach(item => {
      const bClass = clasificarBancoDestino(item.p);
      if (bClass === 'Banesco') itemsBanesco.push(item);
      else if (bClass === 'Bancamiga') itemsBancamiga.push(item);
      else itemsOtros.push(item);
    });

    const grupos = [
      { titulo: 'BANESCO BANCO UNIVERSAL', items: itemsBanesco, color: 'FF047857', bg: 'FFE6F4EA' },
      { titulo: 'BANCAMIGA BANCO UNIVERSAL', items: itemsBancamiga, color: 'FF0284C7', bg: 'FFE0F2FE' },
      { titulo: 'OTROS BANCOS / POR DEFINIR', items: itemsOtros, color: 'FF475569', bg: 'FFF1F5F9' },
    ].filter(g => g.items.length > 0);

    let subMes = 0;
    let subBanesco = 0;
    let subBancamiga = 0;

    grupos.forEach(g => {
      // Cabecera de sección de banco
      const rSec = wsBan.getRow(f++);
      rSec.getCell(2).value = `🏦 ${g.titulo}`;
      rSec.getCell(2).font = { bold: true, size: 10, color: { argb: g.color } };
      rSec.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.bg } };
      wsBan.mergeCells(f - 1, 2, f - 1, 18);

      let subGrupo = 0;
      g.items.forEach(({ p, det, fPago, fFactura, esSubPago, montoTotalReportado, yaExistenComoFilasSeparadas }: any) => {
        const fpMatch = (Array.isArray(det.formasPago) ? det.formasPago : []).find(
          (fp: any) => String(fp?.referencia || '').trim() === String(p.referencia || '').trim()
        );
        const paMatch = (Array.isArray(det.pagos_agregados) ? det.pagos_agregados : []).find(
          (pa: any) => String(pa?.referencia || '').trim() === String(p.referencia || '').trim()
        );
        const parseNum = (v: any): number => {
          if (typeof v === 'number') return isNaN(v) ? 0 : v;
          if (!v) return 0;
          const s = String(v).trim();
          if (s.includes(',') && s.includes('.')) {
            return Number(s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) || 0;
          }
          if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
          return Number(s) || 0;
        };
        const mPagado = r2(
          esSubPago
            ? (parseNum(paMatch?.monto) || parseNum(fpMatch?.monto) || parseNum(p.monto))
            : (det.es_pago_adicional || yaExistenComoFilasSeparadas)
              ? (parseNum(det.monto_conciliado) || parseNum(paMatch?.monto) || parseNum(fpMatch?.monto) || parseNum(p.monto))
              : (parseNum(det.monto_conciliado) || parseNum(paMatch?.monto) || parseNum(fpMatch?.monto) || (Array.isArray(det.formasPago) && det.formasPago.length === 1 ? parseNum(det.formasPago[0]?.monto) : 0) || parseNum(p.monto))
        );

        const ret = retPorPago.get(String(p.id)) ?? Number(det.monto_retencion_iva || 0);
        const mtTotal = montosPago(p, det, inmMap, ret);
        const esPagoMultipleSeparado = Boolean(esSubPago || det.es_pago_adicional || yaExistenComoFilasSeparadas || (mtTotal.total > mPagado + 1 && mtTotal.ret === 0));
        const baseDenom = esSubPago && montoTotalReportado > 0 ? montoTotalReportado : (mtTotal.total > 0 ? mtTotal.total : 1);
        const factor = esPagoMultipleSeparado && baseDenom > 0 ? mPagado / baseDenom : 1;
        const mt = esPagoMultipleSeparado ? {
          base: r2(mtTotal.base * factor),
          iva: r2(mtTotal.iva * factor),
          ret: r2(mtTotal.ret * factor),
          exento: r2(mtTotal.exento * factor)
        } : mtTotal;
        const fd = det.factura_digital || {};
        const ncRaw = Number(det.descuento_saldo_favor || det.saldo_favor_usado || det.saldo_usado || det.saldo_favor || 0);
        const ncTotal = ncRaw > 0 ? ncRaw : 0;
        const nc = esPagoMultipleSeparado ? r2(ncTotal * factor) : ncTotal;
        const cajero = det.cajero || det.usuario || p.usuario || '';
        const bClass = clasificarBancoDestino(p);
        const bDestLabel = bClass === 'Banesco' ? 'Banesco' : bClass === 'Bancamiga' ? 'Bancamiga' : (det.banco_destino || det.banco_receptor || 'Otro');
        
        let refTexto = String(p.referencia || '').trim();
        if (!esSubPago && !yaExistenComoFilasSeparadas && Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1) {
          const todasRefs = [
            ...new Set(
              det.pagos_agregados
                .filter((pa: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(pa?.metodo || pa?.tipo || pa?.referencia || '')))
                .map((pa: any) => String(pa.referencia || '').trim())
                .filter(Boolean)
            )
          ];
          if (todasRefs.length >= 1) {
            refTexto = todasRefs.join(' / ');
          }
        }
        // Limpiar referencias rechazadas erróneamente concatenadas (ej. '77015, RECH-34...' -> '77015')
        if (/rech/i.test(refTexto)) {
          const partes = refTexto.split(/[,;\/]/).map(x => x.trim()).filter(Boolean);
          const buenas = partes.filter(x => !/rech/i.test(x));
          if (buenas.length > 0) {
            refTexto = buenas.join(' / ');
          }
        }

        const row = wsBan.getRow(f++);

        // Requisito 2: Para usuarios con recibo o factura, sale el número de factura o recibo asociado
        const ctrlStr = String(fd.numero_control || '').trim();
        let nroDoc = fd.numero_documento || 
                     (ctrlStr ? docByControlFromRet.get(ctrlStr) : '') ||
                     mapaDocsAudit.get(String(p.id)) ||
                     mapaDocsAudit.get(String(det.pago_principal_id || '')) ||
                     det.recibo_caja?.[0]?.controlWeb || 
                     det.recibo_caja?.[0]?.reciboNo || 
                     det.recibo_no || 
                     det.recibo_digital?.numero ||
                     '';

        if (nroDoc && (String(nroDoc).includes('M') || String(nroDoc).startsWith('RC-'))) {
          nroDoc = '';
        }

        // Si no tiene nroDoc directo (ej. pago combinado o abono parcial), buscar por referencia bancaria o recibos asociados
        if (!nroDoc && p.referencia) {
          const partes = String(p.referencia).split(/[\s,()\/+]+/).map(x => x.trim()).filter(Boolean);
          for (const pt of partes) {
            const candidate = docMapPorRef.get(pt);
            if (candidate && !candidate.includes('M') && !candidate.startsWith('RC-')) {
              nroDoc = candidate;
              break;
            }
          }
        }
        if (!nroDoc && Array.isArray(det.recibos)) {
          for (const rec of det.recibos) {
            const rStr = String(rec || '').trim();
            const candidate = rStr ? docMapPorRecibo.get(rStr) : '';
            if (candidate && !candidate.includes('M') && !candidate.startsWith('RC-')) {
              nroDoc = candidate;
              break;
            }
          }
        }
        if (!nroDoc) {
          nroDoc = ctrlStr || obtenerNroReciboWeb(p, det);
        }

        // Requisito 3: En condominios residenciales sale el código principal; en locales hijos su código propio
        const codigosList = codigosDePago(det, p);
        const cid = cleanId(p.identidad);
        const codPrincipal =
          codigosList[0] ||
          det.codigo_inmueble ||
          det.cod_inmueble ||
          p.inmueble ||
          condoByIdentidad.get(cid)?.codigo ||
          contribuyentes.find((x: any) => cleanId(x.Identidad || x.identidad) === cid)?.CodCont ||
          inmByIdentidad.get(cid)?.inmueble ||
          '';

        const vals: any[] = [
          dmy(fPago), p.banco || '', bDestLabel, refTexto, p.tipo || 'Transferencia', mPagado, dmy(fFactura || fechaVE(p.created_at)),
          nroDoc, codPrincipal, nombreDe(p.identidad, det),
          cajero,
          mt.base, mt.iva > 0 ? 16 : 0, mt.iva, mt.ret, r2(nc), mt.exento,
        ];
        vals.forEach((v, i) => { const c = row.getCell(i + 2); c.value = v; c.border = BORDE; c.font = { size: 9 }; if ([5, 11, 13, 14, 15, 16].includes(i)) c.numFmt = '#,##0.00'; });
        subGrupo += mPagado;
        subMes += mPagado;
        if (bClass === 'Banesco') subBanesco += mPagado;
        else if (bClass === 'Bancamiga') subBancamiga += mPagado;
      });

      // Subtotal por banco
      const rSub = wsBan.getRow(f++);
      rSub.getCell(6).value = `SUBTOTAL ${g.titulo}`;
      rSub.getCell(7).value = r2(subGrupo);
      rSub.getCell(7).numFmt = '#,##0.00';
      rSub.getCell(6).font = { bold: true, size: 9 };
      rSub.getCell(7).font = { bold: true, size: 9 };
      f++;
    });

    // Total general del mes
    const t = wsBan.getRow(f++);
    t.getCell(6).value = `TOTAL MES ${MESES[parseInt(m) - 1]} ${y}`;
    t.getCell(7).value = r2(subMes);
    t.getCell(7).numFmt = '#,##0.00';
    t.getCell(6).font = { bold: true, size: 10 };
    t.getCell(7).font = { bold: true, size: 10 };
    t.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    t.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    f += 2;
    totalesMes.push([`${MESES[parseInt(m) - 1]} ${y}`, subMes, subBanesco, subBancamiga]);
  });

  // Conciliación del punto: total del sistema por caja y día (cierre de lote, nro de lote y comisión los completa el analista)
  wsPto.columns = [
    { width: 18 },
    { width: 14 },
    { width: 26 },
    { width: 18 },
    { width: 16 },
    { width: 20 },
    { width: 16 },
    { width: 14 },
  ] as any;
  const pto = new Map<string, Map<string, { monto: number; usuarios: number }>>();
  deb.forEach(p => {
    const { caja } = cajaDe(parseDet(p));
    const dia = fechaVE(p.created_at);
    if (!pto.has(caja)) pto.set(caja, new Map());
    const m = pto.get(caja)!;
    if (!m.has(dia)) m.set(dia, { monto: 0, usuarios: 0 });
    const x = m.get(dia)!; x.monto += Number(p.monto) || 0; x.usuarios += 1;
  });
  let fp = 1; let totalPunto = 0;
  [...pto.keys()].sort().forEach(caja => {
    cab(wsPto, fp++, [
      caja,
      'FECHA',
      'TOTAL EMITIDO POR EL SISTEMA',
      'CIERRE DE PUNTO',
      'NRO DE LOTE',
      'COMISION DEL PUNTO',
      'DIFERENCIA',
      'PERSONAS',
    ]);
    const m = pto.get(caja)!;
    let totalCaja = 0;
    let totalPersonasCaja = 0;

    [...m.keys()].sort().forEach(dia => {
      const x = m.get(dia)!;
      const row = wsPto.getRow(fp);
      ['', dmy(dia), r2(x.monto), null, null, null, null, x.usuarios].forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v as any;
        c.border = BORDE;
        if (i === 2 || i === 3 || i === 5 || i === 6) c.numFmt = '#,##0.00';
      });
      row.getCell(7).value = { formula: `IF(D${fp}="","",D${fp}-C${fp})` } as any;
      totalCaja += x.monto;
      totalPersonasCaja += x.usuarios;
      fp++;
    });

    // Requisito: AGREGAR EL TOTAL GENERAL POR CADA CAJA
    const rTotCaja = wsPto.getRow(fp++);
    rTotCaja.getCell(1).value = `TOTAL ${caja.toUpperCase()}`;
    rTotCaja.getCell(1).font = { bold: true, size: 9 };
    rTotCaja.getCell(3).value = r2(totalCaja);
    rTotCaja.getCell(3).numFmt = '#,##0.00';
    rTotCaja.getCell(3).font = { bold: true, size: 9 };
    rTotCaja.getCell(8).value = totalPersonasCaja;
    rTotCaja.getCell(8).font = { bold: true, size: 9 };
    for (let colIdx = 1; colIdx <= 8; colIdx++) {
      rTotCaja.getCell(colIdx).border = BORDE;
    }
    rTotCaja.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    rTotCaja.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    totalPunto += totalCaja;
    fp++;
  });

  // Requisito: Y EL TOTAL FINAL DE TODAS LAS CAJAS
  const rTotFinal = wsPto.getRow(fp++);
  rTotFinal.getCell(1).value = 'TOTAL FINAL DE TODAS LAS CAJAS';
  rTotFinal.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF1F4E78' } };
  rTotFinal.getCell(3).value = r2(totalPunto);
  rTotFinal.getCell(3).numFmt = '#,##0.00';
  rTotFinal.getCell(3).font = { bold: true, size: 10, color: { argb: 'FF1F4E78' } };
  for (let colIdx = 1; colIdx <= 8; colIdx++) {
    rTotFinal.getCell(colIdx).border = BORDE;
  }
  rTotFinal.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
  rTotFinal.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
  fp++;

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
