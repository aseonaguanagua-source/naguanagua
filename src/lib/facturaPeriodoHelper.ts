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

  // 1. Revisar recibo_caja (máxima fidelidad con lo liquidado en caja)
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

  // 1.5 Revisar periodos_pagados explícito en detalles
  if (det.periodos_pagados) {
    const pp = String(det.periodos_pagados).trim();
    if (pp) {
      const fmt = formatearPeriodoParaConcepto(pp);
      return `Servicio de Aseo Urbano Comercial - ${fmt || pp}`;
    }
  }

  // 2. Si tiene concepto explícito ya guardado (distinto del genérico default)
  if (det.concepto || pago.concepto) {
    const c = String(det.concepto || pago.concepto).trim();
    if (c) return c;
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

  // 5. Fallback por fecha de pago/transacción
  const fPago = det.fecha_pago || det.fecha_transaccion || pago.created_at;
  if (fPago) {
    const d = new Date(fPago);
    if (!isNaN(d.getTime())) {
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const mIdx = d.getMonth() === 9 ? 8 : (d.getMonth() === 0 ? 11 : d.getMonth() - 1);
      return `Servicio de Aseo Urbano Comercial - ${meses[mIdx]} ${d.getFullYear()}`;
    }
  }

  return 'Servicio de Aseo Urbano Comercial';
}
