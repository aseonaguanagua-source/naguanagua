import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { getTasaBCV } from '@/services/bcv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function fetchAllRows(table: string, selectCols: string, filterFn?: (q: any) => any) {
  const STEP = 1000;
  const all: any[] = [];
  let from = 0;
  for (let page = 0; page < 120; page++) {
    let q = sb.from(table).select(selectCols).order('id', { ascending: true }).range(from, from + STEP - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < STEP) break;
    from += STEP;
  }
  return all;
}

function normSector(actividad?: string, clasificacion?: string, tipo?: string): 'Residencial' | 'Comercial' | 'Industrial' {
  const a = String(actividad || '').toLowerCase();
  const c = String(clasificacion || '').toLowerCase();
  const t = String(tipo || '').toLowerCase();
  if (
    a.includes('fabrica') ||
    a.includes('industrial') ||
    a.includes('embotelladora') ||
    a.includes('concretera') ||
    a.includes('manufactura') ||
    c.includes('industrial') ||
    t.includes('industrial')
  ) {
    return 'Industrial';
  }
  if (
    a.includes('residencial') ||
    (a.includes('condominio') && !a.includes('oficina')) ||
    a.includes('apartamento') ||
    a.includes('vivienda') ||
    a.includes('casa') ||
    a === 'no aplica' ||
    a === 'n/a' ||
    c.includes('residencial') ||
    t.includes('residencial')
  ) {
    return 'Residencial';
  }
  if (a.length > 2 || c.includes('comercial') || t.includes('comercial')) {
    return 'Comercial';
  }
  return 'Residencial';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const modo = url.searchParams.get('modo') || 'dashboard';

    // Si pide recibos de morosos para exportar el Excel/PDF de Record de Morosos
    if (modo === 'morosos_export') {
      const [facturasPendientes, rawInmuebles, rawContribs] = await Promise.all([
        fetchAllRows('facturas', '*', (q) => q.in('estado', ['Pendiente', 'Abonado'])),
        fetchAllRows(
          'inmuebles',
          'id,identidad,inmueble,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,multa_bs,meses_deuda,agente_retencion,estado,correo_electronico,telefono,es_condominio'
        ),
        fetchAllRows('contribuyentes', '*'),
      ]);
      const contribMap = new Map<string, any>();
      rawContribs.forEach((c: any) => {
        if (c.identidad) contribMap.set(c.identidad, c);
      });
      const mergedInmuebles = rawInmuebles.map((inm: any) => ({
        ...inm,
        contribuyentes: contribMap.get(inm.identidad) || null,
      }));
      return NextResponse.json({
        success: true,
        facturasPendientes,
        contribuyentes: mergedInmuebles,
      });
    }

    if (modo === 'report_datasets') {
      const [rawInmuebles, rawContribs, trabajadoresList] = await Promise.all([
        fetchAllRows(
          'inmuebles',
          'id,identidad,inmueble,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,multa_bs,meses_deuda,agente_retencion,estado,correo_electronico,telefono,es_condominio'
        ),
        fetchAllRows('contribuyentes', '*'),
        sb.from('trabajadores').select('*').then((r) => r.data || []),
      ]);
      const contribMap = new Map<string, any>();
      rawContribs.forEach((c: any) => {
        if (c.identidad) contribMap.set(c.identidad, c);
      });
      const mergedInmuebles = rawInmuebles.map((inm: any) => ({
        ...inm,
        contribuyentes: contribMap.get(inm.identidad) || null,
      }));
      const saldosCombinados: any[] = [];
      mergedInmuebles.forEach((inm: any) => {
        const sf = Number(inm.saldo_favor_bs) || 0;
        if (sf > 0) {
          saldosCombinados.push({
            id: inm.id,
            created_at: new Date().toISOString(),
            identidad: inm.identidad,
            nombre: inm.contribuyente || inm.contribuyentes?.nombre || inm.identidad,
            concepto_original: `Saldo a favor en inmueble ${inm.inmueble || ''}`.trim(),
            estado: 'Disponible',
            monto_restante: sf,
          });
        }
      });
      const empleadosCombinados = (trabajadoresList || []).map((t: any) => ({
        cedula: t.cedula || t.usuario || '—',
        nombre: t.nombre || t.usuario || 'Funcionario IAMEC',
        cargo: t.rol || 'Operador',
        departamento: 'IAMEC Naguanagua',
        estatus: t.estado || 'Activo',
        fecha_ingreso: t.created_at,
        telefono: t.email || '—',
      }));
      return NextResponse.json({
        success: true,
        contribuyentes: mergedInmuebles,
        saldosFavor: saldosCombinados,
        empleados: empleadosCombinados,
      });
    }

    // 1. Obtener Tasa BCV / UCD vigente + Datos Administrativos en paralelo
    const [
      bcvRes,
      pagosAll,
      inmueblesAll,
      condominiosAll,
      unidadesCondoAll,
      trabajadoresAll,
      preRegistrosAll,
      reclamosAll,
      serviciosAll,
      conveniosAll,
      saldosFavorAll,
      auditoriaReciente,
    ] = await Promise.all([
      getTasaBCV().catch(() => ({ usd: 0, euro: 0, tcmmv: 0 })),
      fetchAllRows(
        'pagos_reportados',
        'id,identidad,monto,banco,referencia,tipo,estado,created_at,detalles',
        (q) => q.not('estado', 'in', '(Reversado,Condonado)').order('created_at', { ascending: false })
      ),
      fetchAllRows(
        'inmuebles',
        'id,identidad,inmueble,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,multa_bs,meses_deuda,agente_retencion,estado,correo_electronico,telefono,es_condominio'
      ),
      sb
        .from('condominios')
        .select('codigo,nombre,identidad,tipo,modalidad,cant_declarada,tarifa_mmv,estado,aseo_pendiente_desde,multa_meses')
        .neq('estado', 'Eliminado')
        .then((r) => r.data || []),
      fetchAllRows(
        'condominio_unidades',
        'id,condominio_id,inmueble,identidad,actividad,tarifa_mmv,estado,aseo_pendiente_desde,multa_meses',
        (q) => q.neq('estado', 'Eliminada')
      ),
      sb
        .from('trabajadores')
        .select('id,nombre,usuario,rol,estado,letra,cedula,cargo,departamento,created_at')
        .then((r) => r.data || []),
      sb
        .from('documentos')
        .select('id,identidad,contribuyente,tipo,estado,created_at')
        .eq('tipo', 'Pre-Registro')
        .then((r) => (r.data || []).map((d: any) => ({ ...d, nombre: d.contribuyente }))),
      sb
        .from('reclamos')
        .select('id,tipo,asunto,estado,created_at')
        .then((r) => r.data || []),
      sb
        .from('servicios_especiales')
        .select('id,referencia,tipo,monto,estado,created_at')
        .then((r) => r.data || []),
      sb
        .from('convenios_pago')
        .select('id, rif, contribuyente_nombre, deuda_total_bs, monto_inicial_bs, monto_cuota_bs, total_cuotas, estado, created_at')
        .then(async (r) => {
          if (r.error) {
            const fb = await sb.from('convenios_pago').select('*');
            return fb.data || [];
          }
          return r.data || [];
        }),
      sb
        .from('documentos')
        .select('id,identidad,contribuyente,tipo,estado,created_at')
        .eq('tipo', 'Nota de Credito')
        .eq('estado', 'Vigente')
        .then((r) => r.data || []),
      sb
        .from('auditoria')
        .select('id, created_at, usuario_email, usuario_rol, modulo, accion, descripcion')
        .order('created_at', { ascending: false })
        .limit(40)
        .then(async (r) => {
          if (r.error) {
            const fb = await sb.from('auditoria').select('*').order('created_at', { ascending: false }).limit(40);
            return fb.data || [];
          }
          return r.data || [];
        }),
    ]);

    const tcmmv = Number(bcvRes?.tcmmv || bcvRes?.euro || 0) || 1;
    const usdRate = Number(bcvRes?.usd || 0) || tcmmv;

    // 2. Construir mapa de identidad -> sector y datos de contribuyente
    const sectorByIdentidad = new Map<string, 'Residencial' | 'Comercial' | 'Industrial'>();
    const nombreByIdentidad = new Map<string, string>();
    const inmByIdentidad = new Map<string, string>();

    let totalInmueblesActivos = 0;
    let inmsResidenciales = 0;
    let inmsComerciales = 0;
    let inmsIndustriales = 0;
    let inmsSolventes = 0;
    let inmsConDeuda = 0;
    let inmsAgentesRetencion = 0;
    let inmsConMulta = 0;
    let inmsConCorreo = 0;
    let inmsConTelefono = 0;

    let deudaTotalMmv = 0;
    let deudaTotalBsEstimada = 0;
    let multaTotalBs = 0;
    let saldoFavorTotalInmBs = 0;
    let facturacionMensualPotencialMmv = 0;

    const deudaPorSector = {
      Residencial: { inms: 0, morosos: 0, solventes: 0, deudaBs: 0, deudaMmv: 0 },
      Comercial: { inms: 0, morosos: 0, solventes: 0, deudaBs: 0, deudaMmv: 0 },
      Industrial: { inms: 0, morosos: 0, solventes: 0, deudaBs: 0, deudaMmv: 0 },
    };

    const tramosMorosidad = {
      alDia: 0,
      de1a2Meses: 0,
      de3a6Meses: 0,
      de7a12Meses: 0,
      masDe12Meses: 0,
    };

    const actividadCounter = new Map<string, { count: number; morosos: number; deudaBs: number }>();
    const topDeudoresList: {
      inmueble: string;
      identidad: string;
      contribuyente: string;
      sector: string;
      meses: number;
      deudaBs: number;
      multaBs: number;
    }[] = [];

    for (const inm of inmueblesAll) {
      if (inm.estado === 'Eliminado' || inm.estado === 'Inactivo') continue;
      totalInmueblesActivos++;

      const idClean = String(inm.identidad || '').replace(/[-.\s]/g, '').toUpperCase();
      const sector = normSector(inm.actividad_principal, inm.clasificacion, inm.tipo);
      if (idClean && !sectorByIdentidad.has(idClean)) {
        sectorByIdentidad.set(idClean, sector);
      }
      if (idClean && inm.contribuyente && !nombreByIdentidad.has(idClean)) {
        nombreByIdentidad.set(idClean, inm.contribuyente);
      }
      if (idClean && inm.inmueble && !inmByIdentidad.has(idClean)) {
        inmByIdentidad.set(idClean, inm.inmueble);
      }

      if (sector === 'Residencial') inmsResidenciales++;
      else if (sector === 'Industrial') inmsIndustriales++;
      else inmsComerciales++;

      if (inm.agente_retencion === true) inmsAgentesRetencion++;
      if (inm.correo_electronico && String(inm.correo_electronico).includes('@')) inmsConCorreo++;
      if (inm.telefono && String(inm.telefono).replace(/\D/g, '').length >= 7) inmsConTelefono++;

      const mmvMes = parseFloat(String(inm.mmv_mes || 0)) || 0;
      const dMmv = parseFloat(String(inm.deuda_mmv || 0)) || 0;
      const dCongBs = parseFloat(String(inm.deuda_congelada_bs || 0)) || 0;
      const mBs = parseFloat(String(inm.multa_bs || 0)) || 0;
      const sfBs = parseFloat(String(inm.saldo_favor_bs || 0)) || 0;
      const meses = Math.max(0, parseInt(String(inm.meses_deuda || 0)) || 0);

      facturacionMensualPotencialMmv += mmvMes;
      saldoFavorTotalInmBs += sfBs;

      const deudaInmBs = (dMmv > 0 ? dMmv * tcmmv : dCongBs) + mBs;
      if (mBs > 0) {
        inmsConMulta++;
        multaTotalBs += mBs;
      }

      deudaPorSector[sector].inms++;

      if (meses > 0 || deudaInmBs > 1) {
        inmsConDeuda++;
        deudaPorSector[sector].morosos++;
        deudaPorSector[sector].deudaBs += deudaInmBs;
        deudaPorSector[sector].deudaMmv += dMmv;
        deudaTotalMmv += dMmv;
        deudaTotalBsEstimada += deudaInmBs;

        if (meses <= 2) tramosMorosidad.de1a2Meses++;
        else if (meses <= 6) tramosMorosidad.de3a6Meses++;
        else if (meses <= 12) tramosMorosidad.de7a12Meses++;
        else tramosMorosidad.masDe12Meses++;

        if (deudaInmBs > 5000) {
          topDeudoresList.push({
            inmueble: inm.inmueble || 'S/C',
            identidad: inm.identidad || 'S/I',
            contribuyente: inm.contribuyente || 'CONTRIBUYENTE',
            sector,
            meses: meses || 1,
            deudaBs: Math.round(deudaInmBs * 100) / 100,
            multaBs: Math.round(mBs * 100) / 100,
          });
        }
      } else {
        inmsSolventes++;
        deudaPorSector[sector].solventes++;
        tramosMorosidad.alDia++;
      }

      const actName = String(inm.actividad_principal || (sector === 'Residencial' ? 'Residencial / Familiar' : 'Comercio General')).trim();
      const prevAct = actividadCounter.get(actName) || { count: 0, morosos: 0, deudaBs: 0 };
      prevAct.count++;
      if (meses > 0 || deudaInmBs > 1) {
        prevAct.morosos++;
        prevAct.deudaBs += deudaInmBs;
      }
      actividadCounter.set(actName, prevAct);
    }

    topDeudoresList.sort((a, b) => b.deudaBs - a.deudaBs);
    const top25Deudores = topDeudoresList.slice(0, 25);

    const topActividades = Array.from(actividadCounter.entries())
      .map(([actividad, info]) => ({
        actividad,
        cantidad: info.count,
        morosos: info.morosos,
        solventes: info.count - info.morosos,
        deudaBs: Math.round(info.deudaBs * 100) / 100,
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 12);

    // 3. Estadísticas de Condominios y Unidades
    const totalCondominios = condominiosAll.length;
    const condominiosResidenciales = condominiosAll.filter((c: any) => String(c.tipo || '').toLowerCase() !== 'comercial').length;
    const condominiosComerciales = totalCondominios - condominiosResidenciales;
    const condominiosSolventes = condominiosAll.filter((c: any) => !c.aseo_pendiente_desde && !(Number(c.multa_meses) > 0)).length;
    const condominiosConDeuda = totalCondominios - condominiosSolventes;

    const totalUnidadesCondo = unidadesCondoAll.length;
    const unidadesSolventes = unidadesCondoAll.filter((u: any) => !u.aseo_pendiente_desde && !(Number(u.multa_meses) > 0)).length;
    const unidadesConDeuda = totalUnidadesCondo - unidadesSolventes;

    // 4. Estadísticas de Facturación Electrónica SENIAT, Recibos y Retenciones desde pagos_reportados
    let facturasDigitalesEmitidas = 0;
    let facturasDigitalesPendientes = 0;
    let notasCreditoEmitidas = 0;
    let recibosCajaEmitidos = 0;
    let retencionesIvaTotalBs = 0;
    let pagosConRetencionCount = 0;

    const pagoPorId = new Map<string, any>();
    for (const p of pagosAll) {
      if (p?.id) pagoPorId.set(String(p.id), p);
    }

    const parseDetObj = (p: any): any => {
      if (!p?.detalles) return {};
      if (typeof p.detalles === 'object') return p.detalles;
      try { return JSON.parse(p.detalles); } catch { return {}; }
    };

    const parseMontoNum = (v: any): number => {
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      if (!v) return 0;
      const s = String(v).trim();
      if (s.includes(',') && s.includes('.')) {
        return Number(s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) || 0;
      }
      if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
      return Number(s) || 0;
    };

    const isSaldoPago = (p: any, det: any): boolean => {
      const t = String(p.tipo || '').toUpperCase().trim();
      if (t && !t.includes('SALDO') && !t.includes('NOTA DE CREDITO') && !t.includes('NOTA DE CRÉDITO')) return false;
      const paList = Array.isArray(det.pagos_agregados) ? det.pagos_agregados : [];
      if (paList.some((x: any) => x?.metodo && !String(x.metodo).toUpperCase().includes('SALDO'))) return false;
      const detTipo = String(det.tipo || '').toUpperCase();
      return t.includes('SALDO') || t.includes('NOTA DE CREDITO') || t.includes('NOTA DE CRÉDITO') ||
             detTipo.includes('SALDO') || detTipo.includes('NOTA DE CREDITO') || detTipo.includes('NOTA DE CRÉDITO') ||
             Boolean(det.es_saldo_a_favor || det.es_nota_credito);
    };

    const esDebitoPago = (p: any, det: any) =>
      !isSaldoPago(p, det) && /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta|^rec$/i.test(String(p.tipo || '').trim());

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

    const obtenerFechaEfectivaCuadre = (p: any, det: any): Date => {
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
      if (!esDebitoPago(p, det)) {
        const fd = det.factura_digital || {};
        const pagoPadre = det.pago_principal_id ? pagoPorId.get(String(det.pago_principal_id)) : null;
        const detPadre = pagoPadre ? parseDetObj(pagoPadre) : null;
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

    const obtenerMontoEfectivoCuadre = (p: any, det: any): number => {
      if (det?.monto_reporte != null) {
        return parseMontoNum(det.monto_reporte);
      }
      const mBase = parseMontoNum(p?.monto);
      if (esDebitoPago(p, det)) return mBase;
      const tUpper = String(p.tipo || '').toUpperCase().trim();
      if (tUpper.includes('DEPOSITO') || tUpper.includes('DEPÓSITO')) return mBase;
      const mConc = parseMontoNum(det?.monto_conciliado);
      const esMultiple = Boolean(
        det?.es_pago_adicional ||
        det?.abono_completado ||
        (Array.isArray(det?.pagos_agregados) && det.pagos_agregados.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1) ||
        (Array.isArray(det?.formasPago) && det.formasPago.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1)
      );
      if (esMultiple && mBase > 0 && mConc > mBase + 1) return mBase;
      if (mConc > 0 && (!Array.isArray(det?.pagos_agregados) || !det.pagos_agregados.some((x: any) => /saldo\s*a\s*favor/i.test(String(x?.referencia || x?.metodo || ''))))) {
        return mConc;
      }
      return mBase || mConc;
    };

    const pagosFiltradosValidos = pagosAll.filter((p: any) => {
      const t = String(p.tipo || '').trim();
      const det = parseDetObj(p);
      if (/retenci|saldo a favor|nota de cr[eé]dito/i.test(t) || isSaldoPago(p, det)) return false;
      const caj = String(det?.cajero || det?.analista || '').trim();
      if (/^(dz-)?dzara$|^c-dzara$/i.test(caj)) return false;
      return true;
    });

    const pagosEnriquecidos = pagosFiltradosValidos.map((p: any) => {
      const det = parseDetObj(p);
      const dEf = obtenerFechaEfectivaCuadre(p, det);
      let fechaEfectivaYmd = '';
      try {
        fechaEfectivaYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(dEf);
      } catch {
        fechaEfectivaYmd = String(p.created_at || '').slice(0, 10);
      }
      const montoEfectivo = obtenerMontoEfectivoCuadre(p, det);

      const idClean = String(p.identidad || '').replace(/[-.\s]/g, '').toUpperCase();
      const sector = sectorByIdentidad.get(idClean) || (idClean.startsWith('J') || idClean.startsWith('G') ? 'Comercial' : 'Residencial');
      const nombreContrib =
        det.contribuyente ||
        det.contribuyente_nombre ||
        nombreByIdentidad.get(idClean) ||
        p.identidad ||
        'Contribuyente';
      const codInm =
        det.cod_inmueble ||
        det.codigo_inmueble ||
        det.inmueble ||
        inmByIdentidad.get(idClean) ||
        '';

      if (p.estado === 'Aprobado') {
        const fd = det.factura_digital;
        if (fd && (fd.numero_factura || fd.numero || fd.emitida === true)) {
          facturasDigitalesEmitidas++;
          if (fd.anulada || fd.nota_credito) notasCreditoEmitidas++;
        } else if (sector !== 'Residencial') {
          facturasDigitalesPendientes++;
        }
        if (Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0) {
          recibosCajaEmitidos += det.recibo_caja.length;
        } else {
          recibosCajaEmitidos++;
        }
        const retMonto = parseFloat(String(det.monto_retencion_iva || 0)) || 0;
        if (retMonto > 0) {
          retencionesIvaTotalBs += retMonto;
          pagosConRetencionCount++;
        }
      }

      return {
        ...p,
        monto: montoEfectivo,
        fechaEfectiva: fechaEfectivaYmd,
        created_at: fechaEfectivaYmd ? `${fechaEfectivaYmd}T12:00:00-04:00` : p.created_at,
        created_at_original: p.created_at,
        sector,
        contribuyenteNombre: nombreContrib,
        codInmueble: codInm,
        cajero: det.cajero || det.analista || 'Sistema / Portal',
        origen: det.origen || (det.cajero ? 'caja' : 'portal'),
        bancoDestino: det.banco_destino || det.banco_receptor || p.banco || 'Bancamiga',
        facturaEmitida: Boolean(det.factura_digital?.numero_factura || det.factura_digital?.numero || det.factura_digital?.emitida),
        numeroFactura: det.factura_digital?.numero_factura || det.factura_digital?.numero || null,
      };
    });

    // 5. Estadísticas Administrativas y Operativas
    const trabajadoresActivos = trabajadoresAll.filter((t: any) => t.estado === 'Activo').length;
    const trabajadoresPorRol: Record<string, number> = {};
    trabajadoresAll.forEach((t: any) => {
      const r = t.rol || 'Operador';
      trabajadoresPorRol[r] = (trabajadoresPorRol[r] || 0) + 1;
    });

    const preRegPendientes = preRegistrosAll.filter((p: any) => p.estado !== 'Aprobado' && p.estado !== 'Rechazado').length;
    const preRegAprobados = preRegistrosAll.filter((p: any) => p.estado === 'Aprobado').length;

    const reclamosPendientes = reclamosAll.filter((r: any) => r.estado !== 'Resuelto' && r.estado !== 'Cerrado').length;
    const reclamosResueltos = reclamosAll.length - reclamosPendientes;

    const serviciosPagados = serviciosAll.filter((s: any) => s.estado === 'Pagado' || s.estado === 'Aprobado').length;
    const serviciosPendientes = serviciosAll.length - serviciosPagados;
    const serviciosPorTipo: Record<string, number> = {};
    serviciosAll.forEach((s: any) => {
      const t = s.tipo || s.tipo_servicio || 'Otro';
      serviciosPorTipo[t] = (serviciosPorTipo[t] || 0) + 1;
    });

    const conveniosActivos = conveniosAll.filter((c: any) => c.estado === 'Activo' || c.estado === 'Vigente' || c.estado === 'Al Día').length;
    const conveniosDeudaTotalBs = Math.round(conveniosAll.reduce((sum: number, c: any) => sum + (parseFloat(String(c.deuda_total_bs ?? c.monto_total ?? 0)) || 0), 0) * 100) / 100;
    const conveniosMontoInicialBs = Math.round(conveniosAll.reduce((sum: number, c: any) => sum + (parseFloat(String(c.monto_inicial_bs ?? c.inicial ?? 0)) || 0), 0) * 100) / 100;
    const conveniosResumen = conveniosAll.map((c: any) => ({
      id: c.id,
      rif: c.rif || c.identidad || '',
      contribuyente_nombre: c.contribuyente_nombre || c.contribuyente || '',
      deuda_total_bs: parseFloat(String(c.deuda_total_bs ?? c.monto_total ?? 0)) || 0,
      monto_inicial_bs: parseFloat(String(c.monto_inicial_bs ?? c.inicial ?? 0)) || 0,
      monto_cuota_bs: parseFloat(String(c.monto_cuota_bs ?? 0)) || 0,
      total_cuotas: parseInt(String(c.total_cuotas ?? c.cuotas ?? 0), 10) || 0,
      estado: c.estado || 'Activo',
      created_at: c.created_at,
    }));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tasas: {
        tcmmv: Math.round(tcmmv * 100) / 100,
        eur: Math.round((Number(bcvRes?.euro) || tcmmv) * 100) / 100,
        usd: Math.round(usdRate * 100) / 100,
      },
      catastro: {
        totalInmueblesActivos,
        inmsResidenciales,
        inmsComerciales,
        inmsIndustriales,
        inmsSolventes,
        inmsConDeuda,
        porcentajeSolvencia: totalInmueblesActivos > 0 ? Math.round((inmsSolventes / totalInmueblesActivos) * 1000) / 10 : 0,
        porcentajeMorosidad: totalInmueblesActivos > 0 ? Math.round((inmsConDeuda / totalInmueblesActivos) * 1000) / 10 : 0,
        inmsAgentesRetencion,
        inmsConMulta,
        inmsConCorreo,
        inmsConTelefono,
        deudaTotalMmv: Math.round(deudaTotalMmv * 100) / 100,
        deudaTotalBsEstimada: Math.round(deudaTotalBsEstimada * 100) / 100,
        multaTotalBs: Math.round(multaTotalBs * 100) / 100,
        saldoFavorTotalInmBs: Math.round(saldoFavorTotalInmBs * 100) / 100,
        facturacionMensualPotencialMmv: Math.round(facturacionMensualPotencialMmv * 100) / 100,
        facturacionMensualPotencialBs: Math.round(facturacionMensualPotencialMmv * tcmmv * 100) / 100,
        deudaPorSector,
        tramosMorosidad,
        topActividades,
        top25Deudores,
      },
      condominios: {
        totalCondominios,
        condominiosResidenciales,
        condominiosComerciales,
        condominiosSolventes,
        condominiosConDeuda,
        totalUnidadesCondo,
        unidadesSolventes,
        unidadesConDeuda,
        listaCondominios: condominiosAll.slice(0, 50),
      },
      facturacionFiscal: {
        facturasDigitalesEmitidas,
        facturasDigitalesPendientes,
        notasCreditoEmitidas,
        recibosCajaEmitidos,
        retencionesIvaTotalBs: Math.round(retencionesIvaTotalBs * 100) / 100,
        pagosConRetencionCount,
      },
      administrativo: {
        totalTrabajadores: trabajadoresAll.length,
        trabajadoresActivos,
        trabajadoresPorRol,
        listaTrabajadores: trabajadoresAll,
        totalPreRegistros: preRegistrosAll.length,
        preRegPendientes,
        preRegAprobados,
        totalReclamos: reclamosAll.length,
        reclamosPendientes,
        reclamosResueltos,
        totalServiciosEspeciales: serviciosAll.length,
        serviciosPagados,
        serviciosPendientes,
        serviciosPorTipo,
        totalConvenios: conveniosAll.length,
        conveniosActivos,
        conveniosDeudaTotalBs,
        conveniosMontoInicialBs,
        conveniosResumen,
        totalSaldosFavor: saldosFavorAll.length,
        auditoriaReciente,
      },
      pagos: pagosEnriquecidos,
    });
  } catch (err: any) {
    console.error('Error en /api/presidencia/estadisticas:', err);
    return NextResponse.json(
      { error: err?.message || 'Error obteniendo estadísticas de Presidencia' },
      { status: 500 }
    );
  }
}
