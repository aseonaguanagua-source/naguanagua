import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabase';
import { isResidencialInm } from '@/lib/calculos';
import { codigosDePago, cargarInmMapPagos, parseDet } from './LibroVentas';

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
  const ref = String(p?.referencia || '').trim();
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
export async function generarReporteRecibosPagos(
  pagos: any[],
  contribuyentes: any[],
  fechaInicio: string,
  fechaFin: string
) {
  // Cargar mapa de inmuebles y condominios para identificar código principal y excluir comerciales
  const inmMap = await cargarInmMapPagos(pagos);
  const condoByIdentidad = new Map<string, any>();
  const condoByCodigo = new Map<string, any>();
  const inmByIdentidad = new Map<string, any>();

  try {
    const { data: condos } = await supabase.from('condominios').select('codigo, identidad, nombre, tipo');
    (condos || []).forEach((c: any) => {
      if (c.identidad) condoByIdentidad.set(cleanId(c.identidad), c);
      if (c.codigo) condoByCodigo.set(String(c.codigo).trim().toUpperCase(), c);
    });

    const idsSinCodigo = [...new Set(
      pagos
        .filter(p => codigosDePago(parseDet(p), p).length === 0)
        .map(p => String(p.identidad || '').trim())
        .filter(Boolean)
    )];
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
    const directo = det.codigo_inmueble || det.cod_inmueble || p.inmueble;
    if (directo) return String(directo).trim().toUpperCase();
    const cid = cleanId(p.identidad);
    if (cid) {
      const cnd = condoByIdentidad.get(cid);
      if (cnd?.codigo) return String(cnd.codigo).trim().toUpperCase();
      const cnt = contribuyentes.find((x: any) => cleanId(x.Identidad || x.identidad) === cid);
      const codCnt = cnt?.CodCont || cnt?.cod_cont || cnt?.inmueble;
      if (codCnt) return String(codCnt).trim().toUpperCase();
      const inm = inmByIdentidad.get(cid);
      if (inm?.inmueble) return String(inm.inmueble).trim().toUpperCase();
    }
    return '-';
  };

  const nombreDe = (id: string, det: any) => {
    const cid = cleanId(id);
    const c = contribuyentes.find((x: any) => cleanId(x.Identidad || x.identidad) === cid);
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

  // Filtrar pagos que sean recibos residenciales / condominios residenciales
  // (excluir pagos anulados, retenciones, facturas emitidas, contribuyentes comerciales y filas de transferencias secundarias)
  const candidatosRecibos = pagos.filter(p => {
    const estado = String(p.estado || '').toLowerCase();
    if (estado.includes('anulad') || estado.includes('rechaz') || estado.includes('revers')) return false;
    if (/retenci|nota de cr[eé]dito|saldo a favor/i.test(String(p.tipo || ''))) return false;
    const det = parseDet(p);
    const fd = det.factura_digital || {};
    // Excluir filas secundarias de pagos múltiples (el recibo sale una sola vez por su monto total en el pago principal)
    if (det.es_pago_adicional || fd.es_pago_adicional) return false;
    // Si tiene factura digital formal o control fiscal, va al Libro de Ventas
    if (fd.emitida || fd.numero_documento || fd.numero_control || fd.anulada) {
      return false;
    }
    // Excluir si tiene IVA o retención o recibo marcado como Comercial
    if (Number(det.iva || det.monto_iva || det.monto_retencion_iva || 0) > 0) return false;
    if (Array.isArray(det.recibo_caja) && det.recibo_caja.some((rc: any) => String(rc?.tipoContribuyente || '').toLowerCase() === 'comercial' || Number(rc?.iva || 0) > 0)) {
      return false;
    }
    if (det.condominio?.tipo && String(det.condominio.tipo).toUpperCase().includes('COMERCIAL')) {
      return false;
    }

    const cod = resolverCodigo(p, det);
    const cnd = (cod !== '-' ? condoByCodigo.get(cod) : null) || condoByIdentidad.get(cleanId(p.identidad));
    if (cnd) {
      if (String(cnd.tipo || '').toUpperCase().includes('COMERCIAL')) return false;
      return true; // Condominio residencial
    }

    const inm = (cod !== '-' ? inmMap.get(cod) : null) || inmByIdentidad.get(cleanId(p.identidad));
    if (inm) {
      if (inm.es_condominio || String(inm.clasificacion || '').toLowerCase().includes('condominio')) {
        return !String(inm.tipo || '').toUpperCase().includes('COMERCIAL');
      }
      if (!isResidencialInm(inm)) return false;
      return true;
    }

    // Si no se encontró inmueble ni condominio pero el RIF es J/G y el nombre no es de condominio/residencia, es comercial
    const nom = nombreDe(p.identidad, det);
    if (/^[JG]/i.test(String(p.identidad || '').trim()) && !/condominio|residencia|conjunto|asociaci[oó]n|junta/i.test(nom)) {
      return false;
    }
    return true;
  }).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  // Consolidar recibos pagados con múltiples transferencias (abono_completado + pago completador del mismo recibo,
  // o múltiples transferencias que comparten el mismo N° de recibo WEB-XXXXXXX / grupo_pago / pagos_agregados)
  // para que cada recibo salga una sola vez por el monto total del recibo y no desglosado por transferencias.
  const recibosConCompletador = new Set<string>();
  const idsPrincipales = new Set<string>();
  const refsSecundariasPorIdentidad = new Map<string, Set<string>>();

  candidatosRecibos.forEach(p => {
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

  const recibosList = candidatosRecibos.filter(p => {
    const det = parseDet(p);
    const cid = cleanId(p.identidad);

    // 1. Excluir si tiene pago_principal_id (es fila hija de un multipago)
    if (det.pago_principal_id && String(det.pago_principal_id) !== String(p.id)) {
      return false;
    }

    // 2. Excluir si su referencia bancaria ya figura como transferencia secundaria dentro de pagos_agregados de otro pago del mismo contribuyente
    const refActual = String(p.referencia || '').trim().toUpperCase();
    if (refActual && !idsPrincipales.has(String(p.id)) && refsSecundariasPorIdentidad.get(cid)?.has(refActual)) {
      return false;
    }

    // 3. Consolidar por grupo_pago si existe
    const grp = String(p.grupo_pago || det.grupo_pago || '').trim();
    if (grp) {
      if (vistosGrupoPago.has(grp)) return false;
      vistosGrupoPago.add(grp);
    }

    // 4. Consolidar por N° de recibo explícito en recibo_caja (ej. WEB-5333008)
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
      // Si en la lista ya está el recibo completador final, omitir las transferencias parciales previas
      if (recibosConCompletador.has(key)) return false;
      // Si solo están las partes con abono_completado, dejar solo una fila con el total del recibo
      if (vistosAbonoCompletado.has(key)) return false;
      vistosAbonoCompletado.add(key);
    }
    return true;
  });

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

  let rowIdx = 4;
  let totalAseo = 0;
  let totalMultas = 0;
  let totalGeneral = 0;

  recibosList.forEach((p, idx) => {
    const det = parseDet(p);
    const sumRc = Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0
      ? r2(det.recibo_caja.reduce((s: number, rc: any) => s + (Number(rc.total || rc.subTotal || 0) || 0), 0))
      : 0;
    const sumLineas = Array.isArray(det.condominio?.lineas) && det.condominio.lineas.length > 0
      ? r2(det.condominio.lineas.reduce((s: number, l: any) => s + (Number(l.totalBs || l.totalBrutoBs || 0) || 0), 0))
      : 0;
    const mFac = r2(Number(det.monto_factura || det.total_seleccionado || det.montoTotal || 0));
    const esCondo = Boolean(det.modulo === 'condominios' || det.es_condominio || det.isCondominio || det.condominio);
    const esAbonoIncompleto = Boolean(det.es_abono && !det.abono_completado && !esCondo);

    // Usar siempre el monto total del recibo (sin desglosarlo por transferencias ni inflarlo con sobrepagos bancarios)
    const montoTotal = esAbonoIncompleto
      ? r2(Number(p.monto) || 0)
      : esCondo
        ? (sumRc > 0 ? sumRc : (mFac > 0 ? mFac : (sumLineas > 0 ? sumLineas : r2(Number(p.monto) || 0))))
        : (mFac > 0 ? mFac : (sumRc > 0 ? sumRc : r2(Number(p.monto) || 0)));

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
    const codigoPrincipal = resolverCodigo(p, det);

    // Número de recibo limpio (WEB-XXXXXXX)
    const nroRecibo = obtenerNroReciboWeb(p, det);

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
