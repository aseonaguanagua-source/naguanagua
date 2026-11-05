const MESES_MAP: Record<string, string> = {
  ene: 'Enero', feb: 'Febrero', mar: 'Marzo', abr: 'Abril', may: 'Mayo', jun: 'Junio',
  jul: 'Julio', ago: 'Agosto', sep: 'Septiembre', oct: 'Octubre', nov: 'Noviembre', dic: 'Diciembre'
};

function expandirMes(m: string): string {
  const k = m.toLowerCase().slice(0, 3);
  return MESES_MAP[k] || m;
}

function capitalizarPeriodo(txt: string): string {
  return txt.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, s, l) => s + l.toUpperCase());
}

export function formatearPeriodoParaConcepto(periodoStr: string): string {
  if (!periodoStr) return '';
  let p = periodoStr.trim();
  p = p.replace(/\s*\(\d+\s*MESES?\)/i, '').trim();
  
  const desdeHastaMatch = p.match(/^DESDE\s+(.+?)\s+HASTA\s+(.+)$/i);
  if (desdeHastaMatch) {
    const inicio = capitalizarPeriodo(desdeHastaMatch[1]);
    const fin = capitalizarPeriodo(desdeHastaMatch[2]);
    if (inicio.toLowerCase() === fin.toLowerCase()) return inicio;
    return `${inicio} a ${fin}`;
  }
  
  const guionMatch = p.match(/^([A-Za-z]+)\s+(\d{4})\s*[–\-]\s*([A-Za-z]+)\s+(\d{4})$/);
  if (guionMatch) {
    const m1 = expandirMes(guionMatch[1]);
    const a1 = guionMatch[2];
    const m2 = expandirMes(guionMatch[3]);
    const a2 = guionMatch[4];
    if (m1 === m2 && a1 === a2) return `${m1} ${a1}`;
    return `${m1} ${a1} a ${m2} ${a2}`;
  }

  return capitalizarPeriodo(p);
}

export function extraerMesesDeTextos(textos: string[]): string[] {
  const MESES_REGEX = /(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}/gi;
  const encontrados: string[] = [];
  for (const t of textos) {
    const matches = String(t || '').match(MESES_REGEX);
    if (matches) {
      for (const m of matches) {
        const norm = m.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, s, l) => s + l.toUpperCase());
        if (!encontrados.includes(norm)) encontrados.push(norm);
      }
    }
  }
  return encontrados;
}

export function resolverConceptoPeriodoPago(pago: any): string {
  if (!pago) return 'Servicio de Aseo Urbano Comercial';
  const det = pago.detalles || {};

  // 0. Si es un pago de Servicio Especial / Extraordinario
  const srvs = Array.isArray(det.servicios) ? det.servicios : [];
  if (srvs.length > 0 || String(pago.referencia || '').startsWith('SRV-')) {
    const srvRef = srvs[0] || pago.referencia;
    return `Servicio Especial - ${srvRef || 'Extraordinario'}`;
  }
  if (String(det.tipo_pago || '').toUpperCase().includes('SERVICIO') || String(det.concepto || '').toUpperCase().includes('SERVICIO ESPECIAL') || String(det.concepto || '').toUpperCase().includes('SERVICIO EXTRAORDINARIO')) {
    return det.concepto || 'Servicio Especial';
  }

  // 1. Si tiene concepto explícito ya guardado o editado manualmente por el usuario,
  // tiene máxima prioridad sobre cualquier cálculo automático.
  if (det.concepto || pago.concepto) {
    const c = String(det.concepto || pago.concepto).trim();
    if (c) return c;
  }

  // 2. Revisar recibo_caja (máxima fidelidad con lo liquidado en caja cuando no fue editado a mano)
  if (det.recibo_caja) {
    try {
      const rc = typeof det.recibo_caja === 'string' ? JSON.parse(det.recibo_caja) : det.recibo_caja;
      const arr = Array.isArray(rc) ? rc : [rc];
      // Si alguno de los recibos de caja tiene ya el campo periodo explícito
      for (const item of arr) {
        if (item?.periodo) {
          const p = formatearPeriodoParaConcepto(item.periodo);
          if (p) return `Servicio de Aseo Urbano Comercial - ${p}`;
        }
      }

      // Si no tiene periodo explícito en el encabezado, extraer los meses de los conceptos
      const mesesList: string[] = [];
      for (const item of arr) {
        if (item?.conceptos && Array.isArray(item.conceptos)) {
          const textos = item.conceptos.map((c: any) => c.descripcion || c.concepto || '');
          const ms = extraerMesesDeTextos(textos);
          for (const m of ms) {
            if (!mesesList.includes(m)) mesesList.push(m);
          }
        }
      }
      if (mesesList.length === 1) {
        return `Servicio de Aseo Urbano Comercial - ${mesesList[0]}`;
      } else if (mesesList.length === 2) {
        return `Servicio de Aseo Urbano Comercial - ${mesesList[0]} a ${mesesList[1]}`;
      } else if (mesesList.length > 2) {
        return `Servicio de Aseo Urbano Comercial - ${mesesList[0]} a ${mesesList[mesesList.length - 1]} (${mesesList.length} meses)`;
      }
    } catch (_) {}
  }

  // 2.5 Revisar periodos_pagados explícito en detalles
  if (det.periodos_pagados) {
    const pp = String(det.periodos_pagados).trim();
    if (pp) {
      const fmt = formatearPeriodoParaConcepto(pp);
      return `Servicio de Aseo Urbano Comercial - ${fmt || pp}`;
    }
  }

  // 3. Revisar mes_aseo
  if (det.mes_aseo) {
    const ma = String(det.mes_aseo).trim();
    return ma.toLowerCase().includes('servicio') ? ma : `Servicio de Aseo Urbano Comercial - ${ma}`;
  }

  // 4. Revisar detalle
  if (det.detalle) {
    const d = String(det.detalle).trim();
    if (d) return d;
  }

  // 5. Revisar si hay notas con el período explícito
  const notasTexto = String(det.notas || pago.notas || '');
  const matchNotas = notasTexto.match(/\((([A-Za-z]+)\s+DE\s+(\d{4})\s+a\s+([A-Za-z]+)\s+DE\s+(\d{4}))\)/i);
  if (matchNotas) {
    const fmt = formatearPeriodoParaConcepto(matchNotas[1]);
    if (fmt) return `Servicio de Aseo Urbano Comercial - ${fmt}`;
  }

  // 6. Detectar cantidad de meses pagados y posición dentro de deuda_previa (respetando pagos parciales de meses antiguos, ej. M1 y M2 de 3 meses = Julio y Agosto)
  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  let maxMesesPorInmueble = 0;
  if (Array.isArray(det.recibos)) {
    const mesesPorInm: Record<string, number[]> = {};
    for (const r of det.recibos) {
      const match = String(r).match(/^(?:RECIB-HIST|CM)-([A-Za-z0-9]+)-M(\d+)$/i);
      if (match) {
        const cod = match[1].toUpperCase();
        const mIdx = parseInt(match[2], 10) || 1;
        if (!mesesPorInm[cod]) mesesPorInm[cod] = [];
        if (!mesesPorInm[cod].includes(mIdx)) mesesPorInm[cod].push(mIdx);
      }
    }
    const entries = Object.entries(mesesPorInm);
    if (entries.length > 0) {
      maxMesesPorInmueble = Math.max(...entries.map(([, arr]) => arr.length));
      // Si hay deuda_previa con meses_deuda, usar la posición exacta M{k} dentro de totalDeuda respecto a la fecha del snapshot
      const [firstCod, mIndices] = entries[0];
      const previaInm = Array.isArray(det.deuda_previa)
        ? (det.deuda_previa.find((dp: any) => String(dp?.inmueble || '').toUpperCase() === firstCod) || det.deuda_previa[0])
        : null;
      const deudaPreviaMeses = parseInt(String(previaInm?.meses_deuda || 0), 10) || 0;
      const snapRaw = det.fecha_conciliado || det.recibo_caja_at || pago.created_at || det.fecha_pago || det.fecha_transaccion;
      if (deudaPreviaMeses > 0 && mIndices.length > 0 && snapRaw) {
        const dSnap = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(snapRaw)) ? `${snapRaw}T12:00:00-04:00` : snapRaw);
        if (!isNaN(dSnap.getTime())) {
          const sortedIdx = [...mIndices].sort((a, b) => a - b);
          const firstIdx = sortedIdx[0];
          const lastIdx = sortedIdx[sortedIdx.length - 1];
          const totalDeuda = Math.max(deudaPreviaMeses, lastIdx);
          const dStart = new Date(Date.UTC(dSnap.getUTCFullYear(), dSnap.getUTCMonth() - totalDeuda + firstIdx - 1, 1));
          const dEnd = new Date(Date.UTC(dSnap.getUTCFullYear(), dSnap.getUTCMonth() - totalDeuda + lastIdx - 1, 1));
          const sMes = mesesNombres[dStart.getUTCMonth()];
          const sAnio = dStart.getUTCFullYear();
          const eMes = mesesNombres[dEnd.getUTCMonth()];
          const eAnio = dEnd.getUTCFullYear();
          const countPagados = sortedIdx.length;
          if (countPagados <= 1 || (sMes === eMes && sAnio === eAnio)) {
            return `Servicio de Aseo Urbano Comercial - ${eMes} ${eAnio}`;
          }
          if (countPagados === 2) {
            return `Servicio de Aseo Urbano Comercial - ${sMes} ${sAnio} y ${eMes} ${eAnio}`;
          }
          if (sAnio === eAnio) {
            return `Servicio de Aseo Urbano Comercial - ${sMes} a ${eMes} ${eAnio} (${countPagados} meses)`;
          }
          return `Servicio de Aseo Urbano Comercial - ${sMes} ${sAnio} a ${eMes} ${eAnio} (${countPagados} meses)`;
        }
      }
    }
  }

  const numMeses =
    (maxMesesPorInmueble > 0 ? maxMesesPorInmueble : 0) ||
    (typeof pago.mesesServicio === 'number' && pago.mesesServicio > 0 ? pago.mesesServicio : 0) ||
    (parseInt(String(det.meses_deuda || 0)) || 0) ||
    (Array.isArray(det.deuda_previa) ? Math.max(0, ...det.deuda_previa.map((dp: any) => parseInt(String(dp?.meses_deuda || 0)) || 0)) : 0) ||
    (Array.isArray(det.condominio?.lineas) ? Math.max(0, ...det.condominio.lineas.map((l: any) => Number(l.meses) || 0)) : 0) ||
    1;

  // 7. Fallback por fecha de pago/transacción respetando cantidad de meses
  const fPago = det.fecha_pago || det.fecha_transaccion || pago.created_at;
  if (fPago) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(fPago)) ? `${fPago}T12:00:00-04:00` : fPago);
    if (!isNaN(d.getTime())) {
      const meses = mesesNombres;
      // En recaudación de aseo, el mes facturado al pagar en el mes M es M-1 (ej. en octubre se cancela septiembre)
      let endMonth = d.getMonth() - 1;
      let endYear = d.getFullYear();
      if (endMonth < 0) {
        endMonth = 11;
        endYear -= 1;
      }

      if (numMeses <= 1) {
        return `Servicio de Aseo Urbano Comercial - ${meses[endMonth]} ${endYear}`;
      }

      let startMonth = endMonth - (numMeses - 1);
      let startYear = endYear;
      while (startMonth < 0) {
        startMonth += 12;
        startYear -= 1;
      }

      if (numMeses === 2) {
        if (startYear === endYear) {
          return `Servicio de Aseo Urbano Comercial - ${meses[startMonth]} ${startYear} y ${meses[endMonth]} ${endYear}`;
        }
        return `Servicio de Aseo Urbano Comercial - ${meses[startMonth]} ${startYear} y ${meses[endMonth]} ${endYear}`;
      }

      if (startYear === endYear) {
        return `Servicio de Aseo Urbano Comercial - ${meses[startMonth]} a ${meses[endMonth]} ${endYear} (${numMeses} meses)`;
      }
      return `Servicio de Aseo Urbano Comercial - ${meses[startMonth]} ${startYear} a ${meses[endMonth]} ${endYear} (${numMeses} meses)`;
    }
  }

  return 'Servicio de Aseo Urbano Comercial';
}

/**
 * Resuelve la descripción con el período exacto de las multas liquidadas en el pago.
 * Ejemplos:
 * - "Multa por Mora - Aseo Urbano (Agosto 2026)"
 * - "Multa por Mora - Aseo Urbano (Julio y Agosto 2026)"
 * - "Multa por Mora - Aseo Urbano (Mayo a Agosto 2026)"
 */
export function resolverConceptoPeriodoMulta(pago: any): string {
  if (!pago) return 'Multa por Mora - Aseo Urbano';
  const det = pago.detalles || {};

  // 1. Revisar si recibo_caja tiene conceptos explícitos de multa
  if (det.recibo_caja) {
    try {
      const rc = typeof det.recibo_caja === 'string' ? JSON.parse(det.recibo_caja) : det.recibo_caja;
      const arr = Array.isArray(rc) ? rc : [rc];
      const mesesMulta: string[] = [];

      for (const item of arr) {
        if (item?.conceptos && Array.isArray(item.conceptos)) {
          for (const c of item.conceptos) {
            const desc = String(c.descripcion || c.concepto || '');
            if (/multa|mora|sanci[oó]n/i.test(desc)) {
              const ms = extraerMesesDeTextos([desc]);
              for (const m of ms) {
                if (!mesesMulta.includes(m)) mesesMulta.push(m);
              }
            }
          }
        }
      }

      if (mesesMulta.length > 0) {
        return formatearListaMesesMulta(mesesMulta);
      }
    } catch (_) {}
  }

  // 2. Revisar si hay recibos MULTA- explícitos
  if (Array.isArray(det.recibos)) {
    const multasRecibos = det.recibos.filter((r: string) => /^MULTA-/i.test(String(r)));
    if (multasRecibos.length > 0) {
      const mesesRec: string[] = [];
      for (const r of multasRecibos) {
        const ms = extraerMesesDeTextos([r]);
        for (const m of ms) {
          if (!mesesRec.includes(m)) mesesRec.push(m);
        }
      }
      if (mesesRec.length > 0) {
        return formatearListaMesesMulta(mesesRec);
      }
    }
  }

  // 3. Revisar deuda_previa
  if (Array.isArray(det.deuda_previa)) {
    const inmsPagados = [...new Set([
      ...(Array.isArray(det.recibos) ? det.recibos : []).map((r: string) => {
        const m = String(r).match(/^(?:RECIB-HIST|CM|MULTA)-([A-Za-z0-9]+)/i);
        return m ? m[1].toUpperCase() : '';
      }).filter(Boolean),
      det.codigo_inmueble,
      det.cod_inmueble
    ].filter(Boolean).map(x => String(x).trim().toUpperCase()))];

    const dpFiltrada = inmsPagados.length > 0
      ? det.deuda_previa.filter((dp: any) => inmsPagados.includes(String(dp.inmueble || '').trim().toUpperCase()))
      : det.deuda_previa;

    const dpConMulta = dpFiltrada.filter((dp: any) => (parseFloat(String(dp.multa_bs || 0)) || 0) > 0);
    const mesesDp: string[] = [];
    for (const dp of dpConMulta) {
      const texto = `${dp.periodo || ''} ${dp.mes_aseo || ''} ${dp.notas || ''}`;
      const ms = extraerMesesDeTextos([texto]);
      for (const m of ms) {
        if (!mesesDp.includes(m)) mesesDp.push(m);
      }
    }
    if (mesesDp.length > 0) {
      return formatearListaMesesMulta(mesesDp);
    }
  }

  // 4. Si se liquidaron N meses de servicio, las multas por mora aplican a los meses vencidos
  // (todos los meses anteriores al último mes que se está pagando)
  const conceptoSrv = resolverConceptoPeriodoPago(pago);
  const mesesEnSrv = extraerMesesDeTextos([conceptoSrv]);
  if (mesesEnSrv.length > 1) {
    // Si pagó por ejemplo Julio, Agosto y Septiembre, la mora aplica a Julio y Agosto
    const mesesAnteriores = mesesEnSrv.slice(0, -1);
    return formatearListaMesesMulta(mesesAnteriores);
  } else if (mesesEnSrv.length === 1) {
    // Si pagó un solo mes que ya estaba vencido y generó multa
    return `Multa por Mora - Aseo Urbano (${mesesEnSrv[0]})`;
  }

  return 'Multa por Mora - Aseo Urbano';
}

function formatearListaMesesMulta(meses: string[]): string {
  if (meses.length === 0) return 'Multa por Mora - Aseo Urbano';
  if (meses.length === 1) return `Multa por Mora - Aseo Urbano (${meses[0]})`;
  if (meses.length === 2) {
    // Si ambos son del mismo año: "Julio y Agosto 2026"
    const p1 = meses[0].split(' ');
    const p2 = meses[1].split(' ');
    if (p1.length === 2 && p2.length === 2 && p1[1] === p2[1]) {
      return `Multa por Mora - Aseo Urbano (${p1[0]} y ${p2[0]} ${p1[1]})`;
    }
    return `Multa por Mora - Aseo Urbano (${meses[0]} y ${meses[1]})`;
  }
  // 3 o más meses: "Mayo a Agosto 2026"
  const pInicio = meses[0].split(' ');
  const pFin = meses[meses.length - 1].split(' ');
  if (pInicio.length === 2 && pFin.length === 2 && pInicio[1] === pFin[1]) {
    return `Multa por Mora - Aseo Urbano (${pInicio[0]} a ${pFin[0]} ${pFin[1]})`;
  }
  return `Multa por Mora - Aseo Urbano (${meses[0]} a ${meses[meses.length - 1]})`;
}

export function resolverPeriodoFactura(pago: any, det?: any, matchedRet?: any): string {
  const d = det || pago?.detalles || {};
  if (matchedRet?.periodo) return String(matchedRet.periodo);
  if (d?.factura_digital?.periodo) return String(d.factura_digital.periodo);
  if (d?.periodos_pagados) return formatearPeriodoParaConcepto(String(d.periodos_pagados));
  const concepto = resolverConceptoPeriodoPago({ ...pago, detalles: d });
  const limpio = concepto.replace(/^Servicio de Aseo Urbano(?: Comercial)?\s*-\s*/i, '').trim();
  return limpio || concepto;
}
