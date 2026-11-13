import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabase';
import { isResidencialInm } from '@/lib/calculos';
import { clasificarPago } from '@/lib/documentoPago';
import { codigosDePago, cargarInmMapPagos, parseDet } from './LibroVentas';

export interface ReciboPagoRow {
  id: string;
  created_at: string;
  codigoPrincipal: string;
  fechaDoc: string;
  rifCi: string;
  nombre: string;
  nroRecibo: string;
  montoAseo: number;
  montoMultas: number;
  montoTotal: number;
  raw: any;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const cleanId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function obtenerNroReciboWeb(p: any, det: any): string {
  const candidatos = [
    det?.recibo_caja?.[0]?.controlWeb,
    det?.recibo_caja?.[0]?.reciboNo,
    det?.recibo_no,
    det?.recibo_digital?.numero,
  ];
  for (const raw of candidatos) {
    const s = String(raw || '').trim().toUpperCase();
    if (!s) continue;
    if (s.includes('M') || s.startsWith('RC-') || s.startsWith('RECIB-')) continue;
    if (s.startsWith('WEB-')) return s;
    const onlyDigits = s.replace(/\D/g, '');
    if (onlyDigits.length >= 3) {
      return `WEB-${onlyDigits.slice(-7).padStart(7, '0')}`;
    }
  }
  const ref = String(p?.referencia || '')
    .replace(/\s*\(\+[^)]*\)/g, '')
    .trim()
    .replace(/^(\d{4,20})-[0-9a-zA-Z]{3,6}$/, '$1');
  if (ref && !ref.toUpperCase().startsWith('RECIB-')) {
    const digits = ref.replace(/\D/g, '').slice(-7);
    if (digits.length >= 3) {
      return `WEB-${digits.padStart(7, '0')}`;
    }
  }
  const idDigits = String(p?.id || '').replace(/\D/g, '').slice(0, 7).padStart(7, '0');
  return `WEB-${idDigits}`;
}
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
export async function obtenerRecibosPagosUnificados(
  pagos: any[],
  contribuyentes: any[],
  fechaInicio: string,
  fechaFin: string
): Promise<ReciboPagoRow[]> {
  const fIni = String(fechaInicio || '').slice(0, 10);
  const fFin = String(fechaFin || '').slice(0, 10);

  let itemsApi: any[] | null = null;
  if (typeof window !== 'undefined' && /^\d{4}-\d{2}-\d{2}$/.test(fIni) && /^\d{4}-\d{2}-\d{2}$/.test(fFin)) {
    try {
      const res = await fetch(
        `/api/admin/factura-digital/listar?filter=todos&documento=recibo&fechaInicio=${encodeURIComponent(fIni)}&fechaFin=${encodeURIComponent(fFin)}&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) {
          itemsApi = data.items
            .filter(
              (i: any) =>
                !i.facturaAnulada &&
                !i.notaCredito &&
                i.estado !== 'Anulado' &&
                i.estado !== 'Rechazado' &&
                (i.procesado || i.estado === 'Aprobado')
            )
            .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
            .map((i: any) => ({
              ...i,
              _montoOficial: r2(Number(i.monto) || 0),
              _nombreOficial: i.contribuyente,
              _identidadOficial: i.identidad,
              _inmueblesOficial: Array.isArray(i.inmuebles) ? i.inmuebles : [],
              _condominioOficial: i.condominio || null,
              detalles: i.detalles || {},
            }));
        }
      }
    } catch (e) {
      console.warn('Fallback local en obtenerRecibosPagosUnificados:', e);
    }
  }

  const basePagos = itemsApi || pagos;

  // Cargar mapa de inmuebles y condominios para identificar código principal y clasificar en modo fallback
  const inmMap = await cargarInmMapPagos(basePagos);
  const condoByIdentidad = new Map<string, any>();
  const condoByCodigo = new Map<string, any>();
  const inmByIdentidad = new Map<string, any>();

  try {
    const { data: condos } = await supabase.from('condominios').select('codigo, identidad, nombre, tipo');
    (condos || []).forEach((c: any) => {
      if (c.identidad) condoByIdentidad.set(cleanId(c.identidad), c);
      if (c.codigo) condoByCodigo.set(String(c.codigo).trim().toUpperCase(), c);
    });

    const idsSinCodigo = [
      ...new Set(
        basePagos
          .filter((p: any) => codigosDePago(parseDet(p), p).length === 0 && !(Array.isArray(p._inmueblesOficial) && p._inmueblesOficial.length > 0))
          .map((p: any) => String(p.identidad || '').trim())
          .filter(Boolean)
      ),
    ];
    if (idsSinCodigo.length > 0) {
      for (let i = 0; i < idsSinCodigo.length; i += 200) {
        const { data: inmsExtra } = await supabase
          .from('inmuebles')
          .select('inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, es_condominio, padre_id')
          .in('identidad', idsSinCodigo.slice(i, i + 200));
        (inmsExtra || []).forEach((r: any) => {
          const cid = cleanId(r.identidad);
          if (cid && (!inmByIdentidad.has(cid) || !r.padre_id)) {
            inmByIdentidad.set(cid, r);
          }
          if (r.inmueble) inmMap.set(String(r.inmueble).trim().toUpperCase(), r);
        });
      }
    }
  } catch (e) {
    console.warn('No se pudo cargar mapa adicional para ReporteRecibosPagos:', e);
  }

  const resolverCodigo = (p: any, det: any): string => {
    const codigos = codigosDePago(det, p);
    if (codigos[0]) return codigos[0];
    if (Array.isArray(p._inmueblesOficial) && p._inmueblesOficial[0]) {
      return String(p._inmueblesOficial[0]).trim().toUpperCase();
    }
    const directo =
      det.codigo_inmueble ||
      det.cod_inmueble ||
      p.inmueble ||
      p._condominioOficial?.codigo ||
      det.condominio?.codigo ||
      det.recibo_caja?.[0]?.codContribuyente;
    if (directo) return String(directo).trim().toUpperCase();
    const cid = cleanId(p.identidad);
    if (cid) {
      const cnd = condoByIdentidad.get(cid);
      if (cnd?.codigo) return String(cnd.codigo).trim().toUpperCase();
      const cnt = (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid);
      const codCnt = cnt?.CodCont || cnt?.cod_cont || cnt?.inmueble;
      if (codCnt) return String(codCnt).trim().toUpperCase();
      const inm = inmByIdentidad.get(cid);
      if (inm?.inmueble) return String(inm.inmueble).trim().toUpperCase();
    }
    const srv = (Array.isArray(det.servicios) && det.servicios[0]) || (Array.isArray(det.tala_poda) && det.tala_poda[0]);
    if (srv) return String(srv).trim().toUpperCase();
    return '-';
  };

  const nombreDe = (id: string, det: any, p?: any) => {
    if (p?._nombreOficial && String(p._nombreOficial).trim() && p._nombreOficial !== id) {
      return String(p._nombreOficial).replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
    }
    const cid = cleanId(id);
    const c = (contribuyentes || []).find((x: any) => cleanId(x.Identidad || x.identidad) === cid);
    const cnd = condoByIdentidad.get(cid);
    const inm = inmByIdentidad.get(cid);
    const raw =
      c?.Contribuyente ||
      c?.contribuyente ||
      cnd?.nombre ||
      inm?.contribuyente ||
      det.contribuyente_nombre ||
      det.condominio?.nombre ||
      det.recibo_caja?.[0]?.razonSocial ||
      (det.contribuyente && det.contribuyente !== id ? det.contribuyente : '') ||
      id;
    return String(raw || '').replace(/^\d+\s*-\s*(?=[A-Za-z])/, '').trim();
  };

  let recibosList: any[] = [];

  if (itemsApi) {
    recibosList = itemsApi;
  } else {
    const candidatosRecibos = pagos
      .filter((p) => {
        if (fIni && fFin) {
          const fDoc = fechaISO(p.created_at);
          if (fDoc < fIni || fDoc > fFin) return false;
        }
        const estado = String(p.estado || '').toLowerCase();
        if (estado.includes('anulad') || estado.includes('rechaz') || estado.includes('revers')) return false;
        const det = parseDet(p);
        const rd = det.recibo_digital || {};
        if (!rd.enviado && p.estado !== 'Aprobado') return false;
        if (/retenci|nota de cr[eé]dito/i.test(String(p.tipo || ''))) return false;
        const fd = det.factura_digital || {};
        if (det.es_pago_adicional || fd.es_pago_adicional) return false;
        if (fd.emitida || fd.numero_documento || fd.numero_control || fd.anulada) return false;

        const cod = resolverCodigo(p, det);
        const inm = (cod !== '-' ? inmMap.get(cod) : null) || inmByIdentidad.get(cleanId(p.identidad)) || null;
        const cnd = (cod !== '-' ? condoByCodigo.get(cod) : null) || condoByIdentidad.get(cleanId(p.identidad)) || null;
        const clasif = clasificarPago(p, inm, cnd);
        return clasif.documento === 'recibo';
      })
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    const recibosConCompletador = new Set<string>();
    const idsPrincipales = new Set<string>();
    const refsSecundariasPorIdentidad = new Map<string, Set<string>>();

    candidatosRecibos.forEach((p) => {
      const det = parseDet(p);
      const cid = cleanId(p.identidad);
      const recs = Array.isArray(det.recibos) ? [...det.recibos].sort().join('|') : '';
      if (recs && !det.es_abono && Number(det.abono_previo_descontado || 0) > 0) {
        recibosConCompletador.add(`${cid}::${recs}`);
      }
      if (det.pago_principal_id) {
        idsPrincipales.add(String(det.pago_principal_id));
      }
      if (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1) {
        const refPropia = String(p.referencia || '').trim().toUpperCase();
        det.pagos_agregados.forEach((pa: any) => {
          const rPa = String(pa?.referencia || '').trim().toUpperCase();
          if (rPa && rPa !== refPropia && !/SALDO|FAVOR|CREDITO/i.test(rPa)) {
            if (!refsSecundariasPorIdentidad.has(cid)) refsSecundariasPorIdentidad.set(cid, new Set());
            refsSecundariasPorIdentidad.get(cid)!.add(rPa);
          }
        });
      }
    });

    const vistosAbonoCompletado = new Set<string>();
    const vistosNroRecibo = new Set<string>();
    const vistosGrupoPago = new Set<string>();

    recibosList = candidatosRecibos.filter((p) => {
      const det = parseDet(p);
      const cid = cleanId(p.identidad);

      if (det.pago_principal_id && String(det.pago_principal_id) !== String(p.id)) {
        return false;
      }

      const refActual = String(p.referencia || '').trim().toUpperCase();
      if (refActual && !idsPrincipales.has(String(p.id)) && refsSecundariasPorIdentidad.get(cid)?.has(refActual)) {
        return false;
      }

      const grp = String(p.grupo_pago || det.grupo_pago || '').trim();
      if (grp) {
        if (vistosGrupoPago.has(grp)) return false;
        vistosGrupoPago.add(grp);
      }

      const rc0 = Array.isArray(det.recibo_caja) ? det.recibo_caja[0] : null;
      const rcWebExplicito = String(rc0?.controlWeb || rc0?.reciboNo || det.recibo_no || '').trim().toUpperCase();
      if (rcWebExplicito) {
        const keyRecibo = `${cid}::${rcWebExplicito}`;
        if (vistosNroRecibo.has(keyRecibo)) return false;
        vistosNroRecibo.add(keyRecibo);
      }

      const recs = Array.isArray(det.recibos) ? [...det.recibos].sort().join('|') : '';
      if (!recs) return true;
      const key = `${cid}::${recs}`;
      if (det.es_abono && det.abono_completado) {
        if (recibosConCompletador.has(key)) return false;
        if (vistosAbonoCompletado.has(key)) return false;
        vistosAbonoCompletado.add(key);
      }
      return true;
    });
  }

  return recibosList.map((p) => {
    const det = parseDet(p);
    let montoTotal = 0;

    if (typeof p._montoOficial === 'number' && p._montoOficial > 0) {
      montoTotal = r2(p._montoOficial);
    } else {
      const sumRc =
        Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0
          ? r2(det.recibo_caja.reduce((s: number, rc: any) => s + (Number(rc.total || rc.subTotal || 0) || 0), 0))
          : 0;
      const sumLineas =
        Array.isArray(det.condominio?.lineas) && det.condominio.lineas.length > 0
          ? r2(det.condominio.lineas.reduce((s: number, l: any) => s + (Number(l.totalBs || l.totalBrutoBs || 0) || 0), 0))
          : 0;
      const fdTotalGuardado = r2(Number(det.factura_digital?.total || 0));
      const mFacGuardado = r2(Number(det.monto_factura || 0));
      const mNetoGuardado = r2(Number(det.monto_neto_factura || 0));
      const mSel = r2(Number(det.total_seleccionado || det.montoTotal || 0));
      const esCondo = Boolean(det.modulo === 'condominios' || det.es_condominio || det.isCondominio || det.condominio);
      const esAbonoIncompleto = Boolean(det.es_abono && !det.abono_completado && !esCondo);

      montoTotal = esAbonoIncompleto
        ? r2(Number(p.monto) || 0)
        : esCondo
          ? fdTotalGuardado > 0
            ? fdTotalGuardado
            : sumRc > 0
              ? sumRc
              : mFacGuardado > 0
                ? mFacGuardado
                : sumLineas > 0
                  ? sumLineas
                  : mNetoGuardado > 0
                    ? mNetoGuardado
                    : mSel > 0
                      ? mSel
                      : r2(Number(p.monto) || 0)
          : fdTotalGuardado > 0
            ? fdTotalGuardado
            : mFacGuardado > 0
              ? mFacGuardado
              : sumRc > 0
                ? sumRc
                : mNetoGuardado > 0
                  ? mNetoGuardado
                  : mSel > 0
                    ? mSel
                    : r2(Number(p.monto) || 0);
    }

    let montoMultas = 0;
    if (Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0) {
      let sumMulta = 0;
      det.recibo_caja.forEach((rc: any) => {
        if (Array.isArray(rc.conceptos)) {
          rc.conceptos.forEach((c: any) => {
            const m = Number(c.monto || c.total || c.precioUnit) || 0;
            if (/multa/i.test(String(c.descripcion || c.concepto || ''))) {
              sumMulta += m;
            }
          });
        }
      });
      if (sumMulta > 0) {
        montoMultas = r2(sumMulta);
      }
    }

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
        let sumPrevMulta = 0;
        det.deuda_previa.forEach((dp: any) => {
          if (Number(dp.multa_bs || 0) > 0) sumPrevMulta += Number(dp.multa_bs);
        });
        if (sumPrevMulta > 0) montoMultas = r2(Math.min(sumPrevMulta, montoTotal));
      }
    }

    if (montoMultas > montoTotal) montoMultas = montoTotal;
    const montoAseo = r2(Math.max(0, montoTotal - montoMultas));

    return {
      id: String(p.id || ''),
      created_at: String(p.created_at || ''),
      codigoPrincipal: resolverCodigo(p, det),
      fechaDoc: fechaISO(p.created_at),
      rifCi: String(p._identidadOficial || p.identidad || '-'),
      nombre: nombreDe(p._identidadOficial || p.identidad, det, p),
      nroRecibo: obtenerNroReciboWeb(p, det),
      montoAseo,
      montoMultas,
      montoTotal,
      raw: p,
    };
  });
}

export async function generarReporteRecibosPagos(
  pagos: any[],
  contribuyentes: any[],
  fechaInicio: string,
  fechaFin: string
) {
  const recibosRows = await obtenerRecibosPagosUnificados(pagos, contribuyentes, fechaInicio, fechaFin);

  if (recibosRows.length === 0) {
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

  let rowIdx = 4;
  let totalAseo = 0;
  let totalMultas = 0;
  let totalGeneral = 0;

  recibosRows.forEach((r, idx) => {
    const row = ws.getRow(rowIdx++);
    const vals = [
      idx + 1,
      r.codigoPrincipal,
      dmy(r.fechaDoc),
      r.rifCi,
      r.nombre,
      r.nroRecibo,
      r.montoAseo,
      r.montoMultas,
      r.montoTotal
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

    totalAseo += r.montoAseo;
    totalMultas += r.montoMultas;
    totalGeneral += r.montoTotal;
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
