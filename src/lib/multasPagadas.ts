import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export interface PagoPeriodoDetalle {
  periodo: string; // 'YYYY-MM'
  referencia: string; // e.g. '32478878 (+ 26936302)' or '64819841'
  referenciasLista: string[];
  tipo: 'MULTA' | 'MES_CON_MULTA' | 'MES';
  etiqueta: string; // 'Multa cancelada' | 'Cancelado con el mes (incluye multa)' | 'Cancelado con el mes'
  fecha: string;
  montoBs: number;
  estado: string;
  pagoId?: string;
  facturaNumero?: string;
}

export interface MultaPendienteDetalle {
  id: string;
  periodo: string;
  concepto: string;
  montoBs: number;
  estado: string;
}

export interface ResultadoHistorialPagosMultas {
  inmueble: string | null;
  unidad_id: string | null;
  condominio_id: string | null;
  codigo_condominio: string | null;
  identidad: string | null;
  porPeriodo: Record<string, PagoPeriodoDetalle>;
  lista: PagoPeriodoDetalle[];
  multasPendientesPorPeriodo: Record<string, MultaPendienteDetalle>;
}

const MESES_NOMBRES_ES: Record<string, string> = {
  ENERO: '01',
  ENE: '01',
  FEBRERO: '02',
  FEB: '02',
  MARZO: '03',
  MAR: '03',
  ABRIL: '04',
  ABR: '04',
  MAYO: '05',
  MAY: '05',
  JUNIO: '06',
  JUN: '06',
  JULIO: '07',
  JUL: '07',
  AGOSTO: '08',
  AGO: '08',
  SEPTIEMBRE: '09',
  SETIEMBRE: '09',
  SEP: '09',
  SET: '09',
  OCTUBRE: '10',
  OCT: '10',
  NOVIEMBRE: '11',
  NOV: '11',
  DICIEMBRE: '12',
  DIC: '12',
};

function normalizarIdentidadVariantes(id?: string | null): string[] {
  const raw = String(id || '').trim().toUpperCase();
  if (!raw) return [];
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  const set = new Set<string>([raw, compact]);
  if (/^[VEJGPC]\d+$/.test(compact)) {
    set.add(`${compact[0]}-${compact.slice(1)}`);
  }
  return Array.from(set).filter(Boolean);
}

function normalizarPeriodoYm(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})-(0[1-9]|1[0-2])/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function extraerPeriodosDeTexto(texto?: string | null): string[] {
  const s = String(texto || '').toUpperCase();
  if (!s) return [];
  const encontrados = new Set<string>();

  // 1. Formato YYYY-MM
  const regexYm = /\b(202\d)-(0[1-9]|1[0-2])\b/g;
  let matchYm: RegExpExecArray | null;
  while ((matchYm = regexYm.exec(s)) !== null) {
    encontrados.add(`${matchYm[1]}-${matchYm[2]}`);
  }

  // 2. Rango "DESDE MES YYYY HASTA MES YYYY" o "MES YYYY - MES YYYY"
  const regexRango =
    /\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)\.?\s+(202\d)\s*(?:HASTA|AL|A|-|–|—)\s*(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)\.?\s+(202\d)\b/g;
  let matchRango: RegExpExecArray | null;
  while ((matchRango = regexRango.exec(s)) !== null) {
    const m1 = Number(MESES_NOMBRES_ES[matchRango[1]] || 0);
    const y1 = Number(matchRango[2]);
    const m2 = Number(MESES_NOMBRES_ES[matchRango[3]] || 0);
    const y2 = Number(matchRango[4]);
    if (m1 >= 1 && m2 >= 1 && y1 >= 2020 && y2 >= y1) {
      let cy = y1;
      let cm = m1;
      let guard = 0;
      while ((cy < y2 || (cy === y2 && cm <= m2)) && guard < 36) {
        encontrados.add(`${cy}-${String(cm).padStart(2, '0')}`);
        cm++;
        if (cm > 12) {
          cm = 1;
          cy++;
        }
        guard++;
      }
    }
  }

  // 3. Menciones individuales "SEPTIEMBRE 2026", "OCT 2026", "SEPTIEMBRE DE 2026"
  const regexMesAnio =
    /\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)\.?(?:\s+DE)?\s+(202\d)\b/g;
  let matchMes: RegExpExecArray | null;
  while ((matchMes = regexMesAnio.exec(s)) !== null) {
    const mm = MESES_NOMBRES_ES[matchMes[1]];
    const yy = matchMes[2];
    if (mm && yy) {
      encontrados.add(`${yy}-${mm}`);
    }
  }

  return Array.from(encontrados).sort();
}

function esReferenciaValida(ref?: string | null): boolean {
  const r = String(ref || '').trim();
  if (!r) return false;
  if (/^SALDO[-_ ]?FAVOR/i.test(r)) return false;
  if (/^DESC\.?\s*SALDO/i.test(r)) return false;
  return true;
}

function extraerReferenciasDePago(
  pago: any,
  pagosPorId?: Map<string, any>
): string[] {
  const refs = new Set<string>();
  const addRaw = (val?: string | null) => {
    const raw = String(val || '').trim();
    if (!raw) return;
    // Si tiene formato "32478878 (+ 26936302)" o separado por coma/barra
    const partes = raw
      .replace(/[()]/g, ' ')
      .split(/[,/|+]+|\s+\+\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (partes.length > 1) {
      for (const p of partes) {
        if (esReferenciaValida(p)) refs.add(p);
      }
    } else if (esReferenciaValida(raw)) {
      refs.add(raw);
    }
  };

  addRaw(pago?.referencia);

  const det = pago?.detalles && typeof pago.detalles === 'object' ? pago.detalles : {};
  addRaw(det?.referencia_real);
  addRaw(det?.referencia_bancaria);
  addRaw(det?.referencia_original);
  addRaw(det?.recibo_caja?.referencia);

  if (Array.isArray(det?.pagos_agregados)) {
    for (const pa of det.pagos_agregados) {
      addRaw(pa?.referencia);
    }
  }
  if (Array.isArray(det?.condominio?.formasPago)) {
    for (const fp of det.condominio.formasPago) {
      addRaw(fp?.referencia);
    }
  }

  // Pagos vinculados (abonos completados con otra transferencia)
  const linkedIds = [
    det?.completado_con_pago_id,
    det?.pago_principal_id,
    det?.pago_complementario_id,
  ].filter(Boolean);
  if (pagosPorId) {
    for (const lid of linkedIds) {
      const lp = pagosPorId.get(String(lid));
      if (lp) {
        addRaw(lp.referencia);
      }
    }
  }

  // Si únicamente se pagó con Saldo a Favor y no hay otra referencia bancaria, conservar la referencia original
  if (refs.size === 0 && pago?.referencia) {
    refs.add(String(pago.referencia).trim());
  }

  return Array.from(refs);
}

function formatearListaReferencias(refs: string[]): string {
  const limpias = Array.from(new Set(refs.map((r) => String(r || '').trim()).filter(Boolean)));
  if (limpias.length === 0) return 'S/R';
  if (limpias.length === 1) return limpias[0];
  return `${limpias[0]} (+ ${limpias.slice(1).join(', ')})`;
}

function calcularPeriodoDesdeIndiceReciboHist(
  indiceMes: number, // 1-indexed (M1 = 1, M2 = 2)
  numMesesDeuda: number,
  fechaPagoIso?: string | null
): string | null {
  if (!Number.isFinite(indiceMes) || indiceMes < 1) return null;
  const totalMeses = Math.max(indiceMes, Number(numMesesDeuda) || 1);
  const fechaRef = fechaPagoIso ? new Date(fechaPagoIso) : new Date();
  const baseDate = Number.isNaN(fechaRef.getTime()) ? new Date() : fechaRef;

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(baseDate);
  const y = Number(parts.find((p) => p.type === 'year')?.value || 2026);
  const m0 = Number(parts.find((p) => p.type === 'month')?.value || 11) - 1; // 0-indexed

  // En deudaMensual.ts: new Date(Date.UTC(y, m0 - numMeses + i - 1, 1, 16, 0, 0))
  const d = new Date(Date.UTC(y, m0 - totalMeses + indiceMes - 1, 1, 16, 0, 0));
  const py = d.getUTCFullYear();
  const pm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${py}-${pm}`;
}

function prioridadTipo(tipo: 'MULTA' | 'MES_CON_MULTA' | 'MES'): number {
  if (tipo === 'MES_CON_MULTA') return 3;
  if (tipo === 'MULTA') return 2;
  return 1;
}

function etiquetaPorTipo(tipo: 'MULTA' | 'MES_CON_MULTA' | 'MES'): string {
  if (tipo === 'MULTA') return 'Multa cancelada';
  if (tipo === 'MES_CON_MULTA') return 'Cancelado con el mes (incluye multa)';
  return 'Cancelado con el mes';
}

export async function obtenerHistorialPagosMultasYPeriodos(params: {
  inmueble?: string | null;
  unidad_id?: string | null;
  condominio_id?: string | null;
  codigo_condominio?: string | null;
  identidad?: string | null;
}): Promise<ResultadoHistorialPagosMultas> {

  let inmCode = String(params.inmueble || '').trim().toUpperCase() || null;
  let unidadId = String(params.unidad_id || '').trim() || null;
  let condominioId = String(params.condominio_id || '').trim() || null;
  let codigoCondominio = String(params.codigo_condominio || '').trim().toUpperCase() || null;
  let identidad = String(params.identidad || '').trim().toUpperCase() || null;

  // 1. Resolver datos faltantes desde condominio_unidades / inmuebles / condominios
  if (unidadId) {
    const { data: uRow } = await sb
      .from('condominio_unidades')
      .select('id, condominio_id, inmueble, identidad')
      .eq('id', unidadId)
      .maybeSingle();
    if (uRow) {
      if (!inmCode && uRow.inmueble) inmCode = String(uRow.inmueble).trim().toUpperCase();
      if (!condominioId && uRow.condominio_id) condominioId = String(uRow.condominio_id);
      if (!identidad && uRow.identidad) identidad = String(uRow.identidad).trim().toUpperCase();
    }
  } else if (inmCode) {
    const { data: uRow } = await sb
      .from('condominio_unidades')
      .select('id, condominio_id, inmueble, identidad')
      .eq('inmueble', inmCode)
      .limit(1)
      .maybeSingle();
    if (uRow) {
      unidadId = String(uRow.id);
      if (!condominioId && uRow.condominio_id) condominioId = String(uRow.condominio_id);
      if (!identidad && uRow.identidad) identidad = String(uRow.identidad).trim().toUpperCase();
    }
  }

  if (inmCode && !identidad) {
    const { data: inmRow } = await sb
      .from('inmuebles')
      .select('identidad, inmueble')
      .eq('inmueble', inmCode)
      .limit(1)
      .maybeSingle();
    if (inmRow?.identidad) {
      identidad = String(inmRow.identidad).trim().toUpperCase();
    }
  }

  if (condominioId && !codigoCondominio) {
    const { data: cRow } = await sb
      .from('condominios')
      .select('id, codigo')
      .eq('id', condominioId)
      .maybeSingle();
    if (cRow?.codigo) {
      codigoCondominio = String(cRow.codigo).trim().toUpperCase();
    }
  } else if (codigoCondominio && !condominioId) {
    const { data: cRow } = await sb
      .from('condominios')
      .select('id, codigo')
      .eq('codigo', codigoCondominio)
      .limit(1)
      .maybeSingle();
    if (cRow?.id) {
      condominioId = String(cRow.id);
    }
  }

  const porPeriodo: Record<string, PagoPeriodoDetalle> = {};
  const multasPendientesPorPeriodo: Record<string, MultaPendienteDetalle> = {};

  const registrarPeriodoPagado = (item: {
    periodo: string;
    referencias: string[];
    tipo: 'MULTA' | 'MES_CON_MULTA' | 'MES';
    fecha: string;
    montoBs: number;
    estado: string;
    pagoId?: string;
    facturaNumero?: string;
  }) => {
    const ym = normalizarPeriodoYm(item.periodo);
    if (!ym) return;
    // Ignorar períodos futuros absurdos o anteriores a 2020
    if (ym < '2020-01' || ym > '2030-12') return;

    const existente = porPeriodo[ym];
    const nuevasRefs = Array.from(
      new Set([
        ...(existente?.referenciasLista || []),
        ...item.referencias.map((r) => String(r || '').trim()).filter(Boolean),
      ])
    );
    // Si hay referencias bancarias reales, quitar S/R
    const refsFiltradas =
      nuevasRefs.length > 1
        ? nuevasRefs.filter((r) => r !== 'S/R' && !/^SALDO[-_ ]?FAVOR/i.test(r))
        : nuevasRefs;
    const refsFinal = refsFiltradas.length > 0 ? refsFiltradas : nuevasRefs;

    let tipoFinal = item.tipo;
    if (existente) {
      if (
        (existente.tipo === 'MES' && item.tipo === 'MULTA') ||
        (existente.tipo === 'MULTA' && item.tipo === 'MES')
      ) {
        tipoFinal = 'MES_CON_MULTA';
      } else if (prioridadTipo(existente.tipo) > prioridadTipo(item.tipo)) {
        tipoFinal = existente.tipo;
      }
    }

    porPeriodo[ym] = {
      periodo: ym,
      referencia: formatearListaReferencias(refsFinal),
      referenciasLista: refsFinal,
      tipo: tipoFinal,
      etiqueta: etiquetaPorTipo(tipoFinal),
      fecha: item.fecha || existente?.fecha || new Date().toISOString(),
      montoBs: Math.max(Number(item.montoBs || 0), Number(existente?.montoBs || 0)),
      estado: item.estado || existente?.estado || 'Aprobado',
      pagoId: item.pagoId || existente?.pagoId,
      facturaNumero: item.facturaNumero || existente?.facturaNumero,
    };
  };

  // Si la unidad es un contenedor padre (es_grupo o tiene hijos con padre_unidad_id = unidadId),
  // incluir también las unidades hijas para detectar períodos ya facturados/pagados en sus hijos.
  const unidadIdsConsulta = new Set<string>();
  const inmCodesConsulta = new Set<string>();
  if (unidadId) unidadIdsConsulta.add(unidadId);
  if (inmCode) inmCodesConsulta.add(inmCode);

  if (unidadId) {
    const { data: hijasRows } = await sb
      .from('condominio_unidades')
      .select('id, inmueble')
      .eq('padre_unidad_id', unidadId)
      .neq('estado', 'Eliminada');
    for (const h of hijasRows || []) {
      if (h?.id) unidadIdsConsulta.add(String(h.id));
      if (h?.inmueble) inmCodesConsulta.add(String(h.inmueble).trim().toUpperCase());
    }
  }

  // 2. Consultar condominio_multas y condominio_movimientos
  const multasRows: any[] = [];
  if (unidadIdsConsulta.size > 0) {
    const { data } = await sb
      .from('condominio_multas')
      .select('id, condominio_id, unidad_id, identidad, periodo, concepto, monto_bs, estado, pago_id, created_at')
      .in('unidad_id', Array.from(unidadIdsConsulta));
    if (data) multasRows.push(...data);
  }
  for (const cod of inmCodesConsulta) {
    const { data } = await sb
      .from('condominio_multas')
      .select('id, condominio_id, unidad_id, identidad, periodo, concepto, monto_bs, estado, pago_id, created_at')
      .ilike('concepto', `%[${cod}]%`);
    if (data) {
      for (const r of data) {
        if (!multasRows.some((m) => m.id === r.id)) multasRows.push(r);
      }
    }
  }

  const movimientosRows: any[] = [];
  if (unidadIdsConsulta.size > 0) {
    const { data } = await sb
      .from('condominio_movimientos')
      .select('id, condominio_id, unidad_id, tipo, periodo, concepto, monto_bs, pago_id, created_at')
      .in('unidad_id', Array.from(unidadIdsConsulta))
      .eq('tipo', 'PAGO');
    if (data) movimientosRows.push(...data);
  }
  for (const cod of inmCodesConsulta) {
    const { data } = await sb
      .from('condominio_movimientos')
      .select('id, condominio_id, unidad_id, tipo, periodo, concepto, monto_bs, pago_id, created_at')
      .eq('tipo', 'PAGO')
      .ilike('concepto', `%${cod}%`);
    if (data) {
      for (const r of data) {
        if (!movimientosRows.some((m) => m.id === r.id)) movimientosRows.push(r);
      }
    }
  }
  if (!unidadId && condominioId) {
    const { data } = await sb
      .from('condominio_movimientos')
      .select('id, condominio_id, unidad_id, tipo, periodo, concepto, monto_bs, pago_id, created_at')
      .eq('condominio_id', condominioId)
      .is('unidad_id', null)
      .eq('tipo', 'PAGO');
    if (data) {
      for (const r of data) {
        if (!movimientosRows.some((m) => m.id === r.id)) movimientosRows.push(r);
      }
    }
  }

  // 3. Recolectar pagos_reportados relevantes
  const pagosMap = new Map<string, any>();
  const addPagos = (rows?: any[] | null) => {
    for (const r of rows || []) {
      if (r && r.id) pagosMap.set(String(r.id), r);
    }
  };

  const selectCols = 'id, identidad, referencia, monto, estado, tipo, detalles, created_at';

  // 3a. Por pago_id desde multas y movimientos
  const pagoIdsDirectos = Array.from(
    new Set(
      [
        ...multasRows.map((m) => m.pago_id),
        ...movimientosRows.map((m) => m.pago_id),
      ].filter(Boolean)
    )
  );
  if (pagoIdsDirectos.length > 0) {
    const { data } = await sb
      .from('pagos_reportados')
      .select(selectCols)
      .in('id', pagoIdsDirectos);
    addPagos(data);
  }

  // 3b. Por inmueble en detalles o recibos
  if (inmCode) {
    const [resCod1, resCod2, resLineas, resHistM1, resHistM2, resMulta] = await Promise.all([
      sb.from('pagos_reportados').select(selectCols).eq('detalles->>cod_inmueble', inmCode).limit(50),
      sb.from('pagos_reportados').select(selectCols).eq('detalles->>codigo_inmueble', inmCode).limit(50),
      sb
        .from('pagos_reportados')
        .select(selectCols)
        .contains('detalles', { condominio: { lineas: [{ inmueble: inmCode }] } })
        .limit(50),
      sb
        .from('pagos_reportados')
        .select(selectCols)
        .contains('detalles', { recibos: [`RECIB-HIST-${inmCode}-M1`] })
        .limit(50),
      sb
        .from('pagos_reportados')
        .select(selectCols)
        .contains('detalles', { recibos: [`RECIB-HIST-${inmCode}-M2`] })
        .limit(50),
      sb
        .from('pagos_reportados')
        .select(selectCols)
        .contains('detalles', { recibos: [`MULTA-${inmCode}`] })
        .limit(50),
    ]);
    addPagos(resCod1.data);
    addPagos(resCod2.data);
    addPagos(resLineas.data);
    addPagos(resHistM1.data);
    addPagos(resHistM2.data);
    addPagos(resMulta.data);
  }

  // 3c. Por identidad del propietario/contribuyente
  const idVars = normalizarIdentidadVariantes(identidad);
  if (idVars.length > 0) {
    const { data } = await sb
      .from('pagos_reportados')
      .select(selectCols)
      .in('identidad', idVars)
      .order('created_at', { ascending: false })
      .limit(80);
    addPagos(data);
  }

  // 3d. Cargar pagos vinculados por completado_con_pago_id / pago_principal_id
  const linkedToFetch = new Set<string>();
  for (const p of pagosMap.values()) {
    const det = p?.detalles && typeof p.detalles === 'object' ? p.detalles : {};
    for (const k of ['completado_con_pago_id', 'pago_principal_id', 'pago_complementario_id']) {
      if (det[k] && !pagosMap.has(String(det[k]))) {
        linkedToFetch.add(String(det[k]));
      }
    }
  }
  if (linkedToFetch.size > 0) {
    const { data } = await sb
      .from('pagos_reportados')
      .select(selectCols)
      .in('id', Array.from(linkedToFetch));
    addPagos(data);
  }

  const extraerFacturaDePago = (p: any): string | undefined => {
    if (!p) return undefined;
    const det = p.detalles && typeof p.detalles === 'object' ? p.detalles : {};
    const fd = det?.factura_digital;
    if (fd && !fd.anulada && !fd.rechazada && !det?.nota_credito_digital?.emitida) {
      const doc = String(fd.numero_documento || fd.numeroDocumento || fd.numero_control || '').trim();
      if (doc) return doc;
    }
    return undefined;
  };

  const esPagoValido = (p: any): boolean => {
    if (!p) return false;
    const est = String(p.estado || '').trim().toUpperCase();
    if (est === 'RECHAZADO' || est === 'ANULADO' || est === 'REVERSADO' || est === 'ELIMINADO') {
      return false;
    }
    const tipo = String(p.tipo || '').trim().toUpperCase();
    if (tipo === 'RETENCION DE IVA') return false;
    if (String(p.referencia || '').toUpperCase().startsWith('EXCEDENTE-') || String(p.referencia || '').toUpperCase().startsWith('RECH-')) return false;
    const det = p.detalles && typeof p.detalles === 'object' ? p.detalles : {};
    if (det.nota_credito_fantasma_ignorada || det.nota_credito_duplicada_ignorada) return false;
    if (det?.factura_digital?.anulada === true || det?.nota_credito_digital?.emitida === true) return false;
    return true;
  };

  // 4. Procesar condominio_multas (Pagadas y Pendientes)
  for (const m of multasRows) {
    const ym = normalizarPeriodoYm(m.periodo);
    if (!ym) continue;
    const est = String(m.estado || '').trim().toUpperCase();
    if (est === 'PAGADA' || m.pago_id) {
      const pago = m.pago_id ? pagosMap.get(String(m.pago_id)) : null;
      if (pago && !esPagoValido(pago)) continue;
      const refs = pago ? extraerReferenciasDePago(pago, pagosMap) : ['Pagada en sistema'];
      registrarPeriodoPagado({
        periodo: ym,
        referencias: refs,
        tipo: 'MULTA',
        fecha: pago?.created_at || m.created_at,
        montoBs: Number(m.monto_bs || pago?.monto || 0),
        estado: pago?.estado || 'Pagada',
        pagoId: m.pago_id ? String(m.pago_id) : undefined,
        facturaNumero: extraerFacturaDePago(pago),
      });
    } else if (est === 'PENDIENTE') {
      multasPendientesPorPeriodo[ym] = {
        id: String(m.id),
        periodo: ym,
        concepto: String(m.concepto || ''),
        montoBs: Number(m.monto_bs || 0),
        estado: String(m.estado || 'Pendiente'),
      };
    }
  }

  // 5. Procesar condominio_movimientos (tipo = 'PAGO')
  for (const mov of movimientosRows) {
    const pago = mov.pago_id ? pagosMap.get(String(mov.pago_id)) : null;
    if (pago && !esPagoValido(pago)) continue;
    const concepto = String(mov.concepto || '');
    const periodosSet = new Set<string>(extraerPeriodosDeTexto(concepto));
    const perCol = normalizarPeriodoYm(mov.periodo);
    if (perCol) periodosSet.add(perCol);
    const periodosMov = Array.from(periodosSet);
    if (periodosMov.length === 0) continue;

    const esSoloMulta = /PAGO DE MULTAS/i.test(concepto);
    const incluyeMulta = /\+\s*MULTAS/i.test(concepto);
    const tipoMov: 'MULTA' | 'MES_CON_MULTA' | 'MES' = esSoloMulta
      ? 'MULTA'
      : incluyeMulta
      ? 'MES_CON_MULTA'
      : 'MES';

    const refs = pago ? extraerReferenciasDePago(pago, pagosMap) : ['S/R'];
    const facNum = extraerFacturaDePago(pago);
    for (const ym of periodosMov) {
      registrarPeriodoPagado({
        periodo: ym,
        referencias: refs,
        tipo: tipoMov,
        fecha: pago?.created_at || mov.created_at,
        montoBs: Number(mov.monto_bs || pago?.monto || 0),
        estado: pago?.estado || 'Aprobado',
        pagoId: mov.pago_id ? String(mov.pago_id) : undefined,
        facturaNumero: facNum,
      });
    }
  }

  // 6. Procesar pagos_reportados directamente
  for (const pago of pagosMap.values()) {
    if (!esPagoValido(pago)) continue;
    const det = pago.detalles && typeof pago.detalles === 'object' ? pago.detalles : {};
    const refs = extraerReferenciasDePago(pago, pagosMap);
    const facNum = extraerFacturaDePago(pago);

    // 6a. Pagos de condominio con detalles.condominio.lineas
    const lineasCondo = Array.isArray(det?.condominio?.lineas) ? det.condominio.lineas : [];
    if (lineasCondo.length > 0) {
      const soloMultasGlobal = Boolean(det?.soloMultas || det?.condominio?.solo_multas);
      for (const l of lineasCondo) {
        const lInm = String(l?.inmueble || '').trim().toUpperCase();
        const lUid = String(l?.unidad_id || '').trim();
        const esPagoMatrizCondo = Boolean(
          codigoCondominio &&
          !unidadId &&
          (lInm === codigoCondominio || lUid === '__CONDOMINIO__' || lUid === '__SIN_REGISTRAR__')
        );
        const coincideUnidad =
          (lInm && inmCodesConsulta.has(lInm)) ||
          (lUid && unidadIdsConsulta.has(lUid)) ||
          esPagoMatrizCondo;
        if (!coincideUnidad) continue;

        const aseoBs = Number(l?.aseoBs || 0);
        const multaBs = Number(l?.multaBs || 0);
        const tipoLinea: 'MULTA' | 'MES_CON_MULTA' | 'MES' =
          soloMultasGlobal || (aseoBs <= 0 && multaBs > 0)
            ? 'MULTA'
            : aseoBs > 0 && multaBs > 0
            ? 'MES_CON_MULTA'
            : 'MES';

        const periodosLinea = new Set<string>();
        if (Array.isArray(l?.periodos)) {
          for (const p of l.periodos) {
            const ym = normalizarPeriodoYm(p);
            if (ym) periodosLinea.add(ym);
          }
        }
        if (Array.isArray(l?._multasDetalle)) {
          for (const md of l._multasDetalle) {
            const ym = normalizarPeriodoYm(md?.periodo);
            if (ym) periodosLinea.add(ym);
          }
        }

        for (const ym of periodosLinea) {
          registrarPeriodoPagado({
            periodo: ym,
            referencias: refs,
            tipo: tipoLinea,
            fecha: pago.created_at,
            montoBs: Number(l?.totalBs || pago.monto || 0),
            estado: pago.estado,
            pagoId: String(pago.id),
            facturaNumero: facNum,
          });
        }
      }
    }

    // 6b. Pagos regulares / Caja / Conciliación para este inmueble
    const codEnDet = String(det?.cod_inmueble || det?.codigo_inmueble || '')
      .trim()
      .toUpperCase();
    const recibosArr: string[] = Array.isArray(det?.recibos)
      ? det.recibos.map((r: any) => String(r || '').trim().toUpperCase())
      : [];

    const recibosDelInmueble = inmCode
      ? recibosArr.filter((r) => r.includes(inmCode))
      : recibosArr;

    const perteneceAlInmueble =
      (inmCode && codEnDet === inmCode) ||
      (inmCode && recibosDelInmueble.length > 0) ||
      (!inmCode && idVars.includes(String(pago.identidad || '').trim().toUpperCase()));

    if (!perteneceAlInmueble) continue;

    // Si es un abono parcial en custodia que AÚN NO fue completado con otro pago, no marcar el mes como totalmente cancelado
    // (a menos que tenga completado_con_pago_id o sea pago completo)
    const esAbonoIncompleto =
      Boolean(det?.es_abono_parcial) &&
      !det?.completado_con_pago_id &&
      String(pago.estado || '').toUpperCase().includes('ABONO');
    if (esAbonoIncompleto) continue;

    const tieneMultaEnRecibos = recibosArr.some(
      (r) => r.startsWith('MULTA-') && (!inmCode || r.includes(inmCode))
    );
    const tieneMesEnRecibos = recibosArr.some(
      (r) => r.startsWith('RECIB-HIST-') && (!inmCode || r.includes(inmCode))
    );

    const periodosDetectados = new Set<string>();

    // Extraer desde recibo_caja y periodos_pagados
    if (det?.recibo_caja) {
      for (const ym of extraerPeriodosDeTexto(det.recibo_caja.periodo)) {
        periodosDetectados.add(ym);
      }
      if (Array.isArray(det.recibo_caja.conceptos)) {
        for (const c of det.recibo_caja.conceptos) {
          for (const ym of extraerPeriodosDeTexto(c?.descripcion)) {
            periodosDetectados.add(ym);
          }
        }
      }
    }
    if (Array.isArray(det?.periodos_pagados)) {
      for (const pp of det.periodos_pagados) {
        const ym = normalizarPeriodoYm(pp);
        if (ym) periodosDetectados.add(ym);
        for (const ymTxt of extraerPeriodosDeTexto(String(pp))) {
          periodosDetectados.add(ymTxt);
        }
      }
    }

    // Extraer desde RECIB-HIST-{COD}-M{i} o MULTA-{COD}-M{i} usando deuda_previa
    const deudaPreviaArr = Array.isArray(det?.deuda_previa) ? det.deuda_previa : [];
    const prevInm = inmCode
      ? deudaPreviaArr.find(
          (d: any) => String(d?.inmueble || '').trim().toUpperCase() === inmCode
        )
      : deudaPreviaArr[0];
    const numMesesPrev = Number(prevInm?.meses_deuda || 0);

    for (const recId of recibosDelInmueble) {
      const matchM = recId.match(/-M(\d+)$/);
      if (matchM) {
        const idx = Number(matchM[1]);
        const ymCalc = calcularPeriodoDesdeIndiceReciboHist(
          idx,
          numMesesPrev > 0 ? numMesesPrev : idx,
          pago.created_at
        );
        if (ymCalc) periodosDetectados.add(ymCalc);
      } else if (recId.startsWith('MULTA-') && numMesesPrev > 0) {
        // Multa general sin sufijo -M{i}: cubre los meses de mora en deuda_previa
        const mesesMora = Math.max(1, numMesesPrev - 1);
        for (let i = 1; i <= mesesMora; i++) {
          const ymCalc = calcularPeriodoDesdeIndiceReciboHist(i, numMesesPrev, pago.created_at);
          if (ymCalc) periodosDetectados.add(ymCalc);
        }
      }
    }

    const tipoPagoReg: 'MULTA' | 'MES_CON_MULTA' | 'MES' =
      tieneMultaEnRecibos && !tieneMesEnRecibos
        ? 'MULTA'
        : tieneMultaEnRecibos && tieneMesEnRecibos
        ? 'MES_CON_MULTA'
        : 'MES';

    for (const ym of periodosDetectados) {
      registrarPeriodoPagado({
        periodo: ym,
        referencias: refs,
        tipo: tipoPagoReg,
        fecha: pago.created_at,
        montoBs: Number(pago.monto || 0),
        estado: pago.estado,
        pagoId: String(pago.id),
        facturaNumero: facNum,
      });
    }
  }

  const lista = Object.values(porPeriodo).sort((a, b) => b.periodo.localeCompare(a.periodo));

  return {
    inmueble: inmCode,
    unidad_id: unidadId,
    condominio_id: condominioId,
    codigo_condominio: codigoCondominio,
    identidad,
    porPeriodo,
    lista,
    multasPendientesPorPeriodo,
  };
}
