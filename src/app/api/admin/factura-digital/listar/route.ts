import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { clasificarPago, extraerCodigoInmueble, parseDetalles, rangoDiaCaracas } from '@/lib/documentoPago';
import { sanitizarDireccionFiscal } from '@/lib/formatters';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Normalizador de identidades (sin guiones ni símbolos)
const normId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').replace(/[,()]/g, ' ').trim().toLowerCase();
    const filter = searchParams.get('filter') || 'todos'; // 'todos' | 'pendientes' | 'emitidas'
    const documentoFiltro = searchParams.get('documento') || ''; // '' | 'factura' | 'recibo'
    const moduloFiltro = searchParams.get('modulo') || 'Todos'; // Todos | Contribuyentes | Condominios | Condominios residenciales | Condominios comerciales
    const fecha = (searchParams.get('fecha') || '').trim(); // YYYY-MM-DD (hora Venezuela)
    const fechaInicioParam = (searchParams.get('fechaInicio') || '').trim().slice(0, 10);
    const fechaFinParam = (searchParams.get('fechaFin') || '').trim().slice(0, 10);

    // Si hay un término de búsqueda (cédula, referencia, código de inmueble, etc.),
    // buscamos directamente en la base de datos sin restringir por fecha del día.
    // Si hay un término de búsqueda (cédula, referencia, código de inmueble, etc.),
    // buscamos directamente en la base de datos sin restringir por fecha del día.
    const queryInmIdents = new Set<string>();
    const queryRelatedInmuebleCodes = new Set<string>();

    if (query) {
      // Generar variantes con y sin guión para búsquedas por RIF/Cédula (ej. J309335758 <-> J-309335758, 309335758)
      const qClean = query.replace(/[^a-z0-9]/gi, '');
      const rifMatch = qClean.match(/^([vejpgc])(\d{4,12})$/i);
      const qWithDash = rifMatch ? `${rifMatch[1].toUpperCase()}-${rifMatch[2]}` : query;
      const qWithoutDash = rifMatch ? `${rifMatch[1].toUpperCase()}${rifMatch[2]}` : query;
      const qDigitsOnly = rifMatch ? rifMatch[2] : (/^\d{5,12}$/.test(qClean) ? qClean : '');
      const idOrClauses = Array.from(new Set([
        `identidad.ilike.%${query}%`,
        `identidad.ilike.%${qWithDash}%`,
        `identidad.ilike.%${qWithoutDash}%`,
        ...(qDigitsOnly ? [`identidad.ilike.%${qDigitsOnly}%`] : []),
      ])).join(',');

      // 1. Buscar en paralelo en inmuebles, condominio_unidades, condominios y pagos_reportados
      const [
        { data: matchedInms },
        { data: cuByQuery },
        { data: condosByQuery },
        { data: directPagos }
      ] = await Promise.all([
        supabase
          .from('inmuebles')
          .select('identidad, inmueble, contribuyente')
          .or(`inmueble.ilike.%${query}%,contribuyente.ilike.%${query}%,${idOrClauses}`)
          .limit(40),
        supabase
          .from('condominio_unidades')
          .select('identidad, inmueble')
          .or(`inmueble.ilike.%${query}%,propietario.ilike.%${query}%,${idOrClauses}`)
          .limit(50),
        supabase
          .from('condominios')
          .select('identidad, codigo, nombre')
          .or(`codigo.ilike.%${query}%,nombre.ilike.%${query}%,${idOrClauses}`)
          .limit(30),
        supabase
          .from('pagos_reportados')
          .select('identidad, detalles')
          .or(`${idOrClauses},referencia.ilike.%${query}%,detalles->>codigo_inmueble.ilike.%${query}%,detalles->>cod_inmueble.ilike.%${query}%,detalles->>contribuyente.ilike.%${query}%`)
          .limit(40)
      ]);

      matchedInms?.forEach(i => {
        if (i.identidad) queryInmIdents.add(i.identidad);
        if (i.inmueble) queryRelatedInmuebleCodes.add(i.inmueble);
      });

      cuByQuery?.forEach(cu => {
        if (cu.identidad) queryInmIdents.add(cu.identidad);
        if (cu.inmueble) queryRelatedInmuebleCodes.add(cu.inmueble);
      });

      condosByQuery?.forEach(c => {
        if (c.identidad) queryInmIdents.add(c.identidad);
        if (c.codigo) queryRelatedInmuebleCodes.add(c.codigo);
      });

      directPagos?.forEach(p => {
        if (p.identidad) queryInmIdents.add(p.identidad);
        const d = parseDetalles(p.detalles);
        const esPagoLocalIndiv =
          d?.modo === 'CONTRIBUYENTE' ||
          String(d?.modalidad_cobro || '').toLowerCase() === 'individual' ||
          String(d?.condominio?.modalidad || '').toUpperCase() === 'INDIVIDUAL';
        const c1 = esPagoLocalIndiv
          ? (d?.codigo_inmueble || d?.cod_inmueble)
          : (d?.codigo_inmueble || d?.cod_inmueble || d?.condominio?.codigo);
        if (c1 && !String(c1).startsWith('CONDO-')) queryRelatedInmuebleCodes.add(String(c1).toUpperCase());
        (d?.condominio?.lineas || []).forEach((l: any) => {
          if (l.inmueble) queryRelatedInmuebleCodes.add(String(l.inmueble).toUpperCase());
        });
        (d?.recibos || []).forEach((r: any) => {
          const match = String(r).match(/(URB\d+|AURI\d+|RES\d+)/i);
          if (match) queryRelatedInmuebleCodes.add(match[1].toUpperCase());
        });
      });

      // 3. Buscar propietarios de los inmuebles vinculados (en lote y en paralelo, sin bucles secuenciales lentos)
      if (queryRelatedInmuebleCodes.size > 0) {
        const codesBatch = Array.from(queryRelatedInmuebleCodes).slice(0, 30);
        const specificCodes = codesBatch.filter(c => !c.startsWith('URB014903') && c.length >= 6).slice(0, 12);
        const codeOrParts: string[] = [];
        specificCodes.forEach(rawSCod => {
          const sCod = String(rawSCod || '').replace(/[,()]/g, '').trim();
          if (sCod) {
            codeOrParts.push(`detalles->>codigo_inmueble.eq.${sCod}`);
            codeOrParts.push(`detalles->>cod_inmueble.eq.${sCod}`);
          }
        });

        const [{ data: inmsFromCodes }, { data: cuFromCodes }, { data: pLineas }] = await Promise.all([
          supabase.from('inmuebles').select('identidad, contribuyente').in('inmueble', codesBatch),
          supabase.from('condominio_unidades').select('identidad, propietario').in('inmueble', codesBatch),
          codeOrParts.length > 0
            ? supabase.from('pagos_reportados').select('identidad').or(codeOrParts.join(',')).limit(30)
            : Promise.resolve({ data: [] as any[] })
        ]);

        inmsFromCodes?.forEach(i => {
          if (i.identidad && !String(i.contribuyente || '').toUpperCase().includes('CONDOMINIO')) {
            queryInmIdents.add(i.identidad);
          }
        });
        cuFromCodes?.forEach(cu => {
          if (cu.identidad && !String(cu.propietario || '').toUpperCase().includes('CONDOMINIO')) {
            queryInmIdents.add(cu.identidad);
          }
        });
        pLineas?.forEach((pl: any) => pl.identidad && queryInmIdents.add(pl.identidad));
      }
    }

    // Obtener los pagos reportados (de un día concreto, por búsqueda de término, anuladas o los más recientes)
    let pagosQuery = supabase
      .from('pagos_reportados')
      .select('*')
      .order('created_at', { ascending: false });

    if (query) {
      // Al buscar por RIF, referencia o código, NO excluir Rechazado/Anulado para permitir ver el historial y facturas anuladas
      const qClean = query.replace(/[^a-z0-9]/gi, '');
      const rifMatch = qClean.match(/^([vejpgc])(\d{4,12})$/i);
      const qWithDash = rifMatch ? `${rifMatch[1].toUpperCase()}-${rifMatch[2]}` : query;
      const qWithoutDash = rifMatch ? `${rifMatch[1].toUpperCase()}${rifMatch[2]}` : query;
      const qDigitsOnly = rifMatch ? rifMatch[2] : (/^\d{5,12}$/.test(qClean) ? qClean : '');
      const orParts = [
        `identidad.ilike.%${query}%`,
        `identidad.ilike.%${qWithDash}%`,
        `identidad.ilike.%${qWithoutDash}%`,
        ...(qDigitsOnly ? [`identidad.ilike.%${qDigitsOnly}%`] : []),
        `referencia.ilike.%${query}%`,
        `detalles->>codigo_inmueble.ilike.%${query}%`,
        `detalles->>cod_inmueble.ilike.%${query}%`,
        `detalles->>contribuyente.ilike.%${query}%`
      ];
      Array.from(queryInmIdents).forEach(id => {
        const safeId = String(id || '').replace(/[,()]/g, '').trim();
        if (safeId) orParts.push(`identidad.eq.${safeId}`);
      });
      Array.from(queryRelatedInmuebleCodes).filter(c => !c.startsWith('URB014903') && c.length >= 6).slice(0, 15).forEach(c => {
        const safeC = String(c || '').replace(/[,()]/g, '').trim();
        if (safeC) {
          orParts.push(`detalles->>codigo_inmueble.eq.${safeC}`);
          orParts.push(`detalles->>cod_inmueble.eq.${safeC}`);
        }
      });
      pagosQuery = pagosQuery.or(orParts.join(',')).limit(500);
    } else if (filter === 'anuladas') {
      // Vista específica de facturas anuladas / notas de crédito (incluye facturas previas anuladas o con NC)
      pagosQuery = pagosQuery
        .or('estado.eq.Anulado,detalles->>factura_digital.ilike.%anulad%,detalles->>factura_digital.ilike.%nota_credito%,detalles->>facturas_digitales_previas.ilike.%anulad%,detalles->>facturas_digitales_previas.ilike.%nota_credito%')
        .limit(1000);
    } else {
      // En vista regular sin búsqueda, excluir reversados o condonados automáticos
      pagosQuery = pagosQuery.not('estado', 'in', '(Reversado,Condonado)');
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioParam) && /^\d{4}-\d{2}-\d{2}$/.test(fechaFinParam)) {
        const { desde } = rangoDiaCaracas(fechaInicioParam);
        const { hasta } = rangoDiaCaracas(fechaFinParam);
        pagosQuery = pagosQuery.gte('created_at', desde).lt('created_at', hasta);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const { desde, hasta } = rangoDiaCaracas(fecha);
        pagosQuery = pagosQuery.gte('created_at', desde).lt('created_at', hasta);
      } else {
        pagosQuery = pagosQuery.limit(500);
      }
    }

    const tieneRangoFecha =
      !query &&
      filter !== 'anuladas' &&
      ((/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioParam) && /^\d{4}-\d{2}-\d{2}$/.test(fechaFinParam)) ||
        /^\d{4}-\d{2}-\d{2}$/.test(fecha));

    let rawPagos: any[] = [];
    if (tieneRangoFecha) {
      let from = 0;
      const step = 1000;
      while (true) {
        const { data: chunk, error: chunkErr } = await pagosQuery.range(from, from + step - 1);
        if (chunkErr) throw chunkErr;
        if (!chunk || chunk.length === 0) break;
        rawPagos.push(...chunk);
        if (chunk.length < step) break;
        from += step;
      }
    } else {
      const { data, error: pagosErr } = await pagosQuery;
      if (pagosErr) throw pagosErr;
      rawPagos = data || [];
    }

    // 1) Separar pagos de retención (tipo 'Retencion de IVA') que son comprobantes vinculados al pago principal
    const retencionPorPagoVinculado = new Map<string, { id: string; monto: number; referencia: string }>();
    (rawPagos || []).forEach(p => {
      if (p.tipo === 'Retencion de IVA') {
        const d = parseDetalles(p.detalles);
        const vinc = d?.pago_vinculado;
        if (vinc) {
          retencionPorPagoVinculado.set(String(vinc), {
            id: p.id,
            monto: parseFloat(p.monto || '0') || 0,
            referencia: p.referencia || 'N/A',
          });
        }
      }
    });

    // 1.1) Detectar abonos parciales / transferencias complementarias que fueron absorbidos por un pago principal
    const abonosAbsorbidosIds = new Set<string>();
    const abonosInfoPorPagoPrincipal = new Map<string, { montoTotal: number; referencias: string[]; formasPago: any[]; ids: string[] }>();

    const deduplicarFormasPagoList = (lista: any[]): any[] => {
      if (!Array.isArray(lista)) return [];
      const seen = new Set<string>();
      const result: any[] = [];
      for (const fp of lista) {
        if (!fp || typeof fp !== 'object') continue;
        const desc = String(fp.descripcion || fp.tipo || fp.metodo || '').toLowerCase();
        const esSf = desc.includes('saldo a favor') || desc.includes('nota de credito');
        const refClean = String(fp.referencia || '')
          .replace(/\s*\(\+[^)]*\)/g, '')
          .trim()
          .replace(/^0+/, '') || String(fp.referencia || '').trim();
        const montoCents = Math.round((parseFloat(String(fp.monto ?? 0).replace(',', '.')) || 0) * 100);
        const key = esSf ? `SF_${montoCents}` : `${refClean.toUpperCase()}_${montoCents}`;
        if (refClean && seen.has(key)) continue;
        if (refClean || esSf) seen.add(key);
        result.push(fp);
      }
      return result;
    };

    // Ordenar para evaluar primero los pagos ya emitidos, luego los pagos principales reales (no adicionales),
    // priorizando el pago consolidador final (con factura preparada/pendiente, desglose múltiple o mayor abono previo descontado)
    const candidatosPrincipales = [...(rawPagos || [])].sort((a, b) => {
      const dA = parseDetalles(a.detalles);
      const dB = parseDetalles(b.detalles);
      const emA = Boolean(dA?.factura_digital?.emitida || dA?.factura_digital?.numero_control || dA?.factura_digital?.numero_documento) ? 1 : 0;
      const emB = Boolean(dB?.factura_digital?.emitida || dB?.factura_digital?.numero_control || dB?.factura_digital?.numero_documento) ? 1 : 0;
      if (emB !== emA) return emB - emA;
      const esSecA = Boolean(dA?.es_pago_adicional || (dA?.pago_principal_id && dA.pago_principal_id !== a.id) || (a.grupo_pago && a.grupo_pago !== a.id)) ? 1 : 0;
      const esSecB = Boolean(dB?.es_pago_adicional || (dB?.pago_principal_id && dB.pago_principal_id !== b.id) || (b.grupo_pago && b.grupo_pago !== b.id)) ? 1 : 0;
      if (esSecA !== esSecB) return esSecA - esSecB;
      const pendA = Boolean(dA?.factura_digital?.pendiente || dA?.factura_digital?.preparada_at) ? 1 : 0;
      const pendB = Boolean(dB?.factura_digital?.pendiente || dB?.factura_digital?.preparada_at) ? 1 : 0;
      if (pendB !== pendA) return pendB - pendA;
      const multiFpA = Math.max(Array.isArray(dA?.formasPago) ? dA.formasPago.length : 0, Array.isArray(dA?.pagos_agregados) ? dA.pagos_agregados.length : 0);
      const multiFpB = Math.max(Array.isArray(dB?.formasPago) ? dB.formasPago.length : 0, Array.isArray(dB?.pagos_agregados) ? dB.pagos_agregados.length : 0);
      if ((multiFpB > 1 ? multiFpB : 0) !== (multiFpA > 1 ? multiFpA : 0)) {
        return (multiFpB > 1 ? multiFpB : 0) - (multiFpA > 1 ? multiFpA : 0);
      }
      const abonoPrevA = parseFloat(String(dA?.abono_previo_descontado || 0)) || 0;
      const abonoPrevB = parseFloat(String(dB?.abono_previo_descontado || 0)) || 0;
      const diffTime = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (Math.abs(diffTime) < 1000 * 3600 * 12 && Math.abs(abonoPrevB - abonoPrevA) > 0.05) {
        return abonoPrevB - abonoPrevA;
      }
      return diffTime;
    });

    candidatosPrincipales.forEach(pPrincipal => {
      if (pPrincipal.tipo === 'Retencion de IVA') return;
      if (pPrincipal.estado !== 'Aprobado') return;
      if (String(pPrincipal.referencia || '').startsWith('RECH-')) return;
      if (abonosAbsorbidosIds.has(pPrincipal.id)) return;

      const dP = parseDetalles(pPrincipal.detalles);
      if (dP?.factura_digital?.anulada || dP?.factura_digital?.nota_credito || dP?.factura_digital?.rechazada) return;
      // Un pago secundario / adicional nunca debe actuar como principal absorbiendo al verdadero principal
      if (dP?.es_pago_adicional === true || (dP?.pago_principal_id && dP.pago_principal_id !== pPrincipal.id)) return;

      const sumSfDeudaPrevia = Array.isArray(dP?.deuda_previa)
        ? dP.deuda_previa.reduce((acc: number, x: any) => acc + (parseFloat(String(x?.saldo_favor_bs || 0)) || 0), 0)
        : 0;
      const saldoPrevio = Math.max(
        sumSfDeudaPrevia,
        parseFloat(String(dP?.abono_previo_descontado || 0)) || 0
      );
      const recibosP = (dP?.recibos || []).map((r: any) => String(r).toUpperCase());
      const esAbonoP = dP?.es_abono === true || dP?.abono === true || pPrincipal.tipo === 'Abono' || dP?.pago_parcial === true;
      const yaEmitidoP = Boolean(dP?.factura_digital?.emitida || dP?.factura_digital?.numero_documento || dP?.factura_digital?.numero_control || dP?.factura_digital?.url);

      // Extraer referencias explícitas si el pago principal ya tiene "(+ ref1, ref2)" en su referencia
      const refPrinRaw = `${pPrincipal.referencia || ''} ${dP?.referencia || ''} ${dP?.referencia_origen || ''}`;
      const refsExplicitasSet = new Set<string>();
      const plusMatches = refPrinRaw.matchAll(/\(\+\s*([^)]+)\)/g);
      for (const m of plusMatches) {
        if (m[1]) {
          m[1].split(/[,\s+]+/).map(s => s.trim()).filter(Boolean).forEach(r => refsExplicitasSet.add(r));
        }
      }

      const montoSoloP = parseFloat(String(pPrincipal.monto || 0)) || 0;
      const montoNetoReqP = parseFloat(String(dP?.monto_neto_factura || dP?.total_seleccionado || dP?.monto_factura || 0)) || 0;
      const perPrincipal = String(dP?.periodos_pagados || dP?.recibo_caja?.[0]?.periodo || dP?.periodo || '').trim().toUpperCase();

      (rawPagos || []).forEach(pAbono => {
        if (pAbono.id === pPrincipal.id || pAbono.tipo === 'Retencion de IVA') return;
        if (pAbono.estado !== 'Aprobado') return;
        if (String(pAbono.referencia || '').startsWith('RECH-')) return;
        if (abonosAbsorbidosIds.has(pAbono.id)) return;
        if (normId(pAbono.identidad) !== normId(pPrincipal.identidad)) return;

        const dA = parseDetalles(pAbono.detalles);
        const yaEmitidoA = Boolean(dA?.factura_digital?.emitida || dA?.factura_digital?.numero_documento || dA?.factura_digital?.numero_control || dA?.factura_digital?.url);
        if (yaEmitidoA) return;

        const refAbonoBase = String(pAbono.referencia || dA?.referencia || '').replace(/\s*\(\+[^)]*\)/g, '').trim();
        const esExplicitoPorRef = Boolean(refAbonoBase && refsExplicitasSet.has(refAbonoBase));
        const esExplicitoPorId = dA?.pago_principal_id === pPrincipal.id || dA?.completado_con_pago_id === pPrincipal.id || dA?.factura_digital?.unificada_en_pago_id === pPrincipal.id;
        const mismoGrupoPago = Boolean(
          (pPrincipal.grupo_pago && pAbono.grupo_pago && pPrincipal.grupo_pago === pAbono.grupo_pago) ||
          (pAbono.grupo_pago && pAbono.grupo_pago === pPrincipal.id) ||
          (pPrincipal.grupo_pago && pPrincipal.grupo_pago === pAbono.id)
        );
        const esVinculoExplicito = esExplicitoPorRef || esExplicitoPorId || mismoGrupoPago;

        const montoSoloA = parseFloat(String(pAbono.monto || 0)) || 0;
        const montoNetoReqA = parseFloat(String(dA?.monto_neto_factura || dA?.total_seleccionado || dA?.monto_factura || 0)) || 0;
        const recibosA = (dA?.recibos || []).map((r: any) => String(r).toUpperCase());
        const todosRecibosEnPrincipal = recibosA.length > 0 && recibosA.every((r: string) => recibosP.includes(r));

        // Detectar si ambos pagos son transferencias parciales de la MISMA factura registradas en el mismo ciclo (ninguno cubre el neto por sí solo, pero juntos sí)
        const montoFacP = parseFloat(String(dP?.monto_factura || dP?.total_seleccionado || 0)) || 0;
        const montoFacA = parseFloat(String(dA?.monto_factura || dA?.total_seleccionado || 0)) || 0;
        const diffDiasCreacion = Math.abs(new Date(pPrincipal.created_at).getTime() - new Date(pAbono.created_at).getTime()) / (1000 * 3600 * 24);
        const esParcialMismaFactura =
          todosRecibosEnPrincipal &&
          diffDiasCreacion <= 7 &&
          montoFacP > 0 &&
          Math.abs(montoFacP - montoFacA) < 1.00 &&
          montoNetoReqP > 0 &&
          montoSoloP < montoNetoReqP - 1.00 &&
          montoSoloA < montoNetoReqP - 1.00 &&
          (montoSoloP + montoSoloA) >= (montoNetoReqP - 1.00);

        // Si el pago candidato a abono fue cerrado como pago de un ciclo anterior o ya cubre el 100% de su propia factura,
        // NUNCA debe ser absorbido implícitamente por un pago de otro mes posterior
        const abonoCerradoOCubreSuFactura =
          dA?.abono_cerrado_ciclo_octubre === true ||
          dA?.es_abono === false ||
          (montoNetoReqA > 0 && montoSoloA >= montoNetoReqA - 1.00);
        if (!esVinculoExplicito && !esParcialMismaFactura && abonoCerradoOCubreSuFactura) return;

        // Si el pago principal ya cubre por sí solo el 100% de su factura y no registra abono_previo_descontado,
        // no debe absorber pagos independientes de otros meses
        const principalCubreSuFacturaSolo = montoNetoReqP > 0 && montoSoloP >= montoNetoReqP - 1.00 && saldoPrevio <= 0.05;
        if (!esVinculoExplicito && !esParcialMismaFactura && principalCubreSuFacturaSolo) return;

        // Si ambos pagos especifican explícitamente períodos distintos (ej. JULIO 2026 vs AGOSTO 2026), no unirlos implícitamente
        const perAbono = String(dA?.periodos_pagados || dA?.recibo_caja?.[0]?.periodo || dA?.periodo || '').trim().toUpperCase();
        if (!esVinculoExplicito && !esParcialMismaFactura && perPrincipal && perAbono && perPrincipal !== perAbono) return;

        const esAbonoA =
          esParcialMismaFactura ||
          dA?.es_abono === true ||
          dA?.abono === true ||
          dA?.es_pago_adicional === true ||
          (Boolean(dA?.recibo_caja?.[0]?.esAbono) && dA?.es_abono !== false && !dA?.abono_cerrado_ciclo_octubre) ||
          pAbono.tipo === 'Abono' ||
          dA?.pago_parcial === true;
        if (!esAbonoA && !esVinculoExplicito) return;

        const coincideSaldo = saldoPrevio > 0 && (Math.abs(saldoPrevio - montoSoloA) < 0.05 || saldoPrevio >= montoSoloA - 0.05);

        // Dos transferencias para los mismos recibos donde ambas quedaron con es_abono=true porque cada una por separado era menor al total neto
        const sumaCubreFactura = todosRecibosEnPrincipal && montoNetoReqP > 0 && (montoSoloP + montoSoloA) >= (montoNetoReqP - 1.00);
        const absorcionValida =
          esVinculoExplicito ||
          (todosRecibosEnPrincipal && (coincideSaldo || sumaCubreFactura)) ||
          (coincideSaldo && (recibosA.length === 0 || todosRecibosEnPrincipal));

        const ordenTemporalValido = esVinculoExplicito || yaEmitidoP || new Date(pAbono.created_at) <= new Date(pPrincipal.created_at);

        if (absorcionValida && ordenTemporalValido) {
          abonosAbsorbidosIds.add(pAbono.id);
          const current = abonosInfoPorPagoPrincipal.get(pPrincipal.id) || { montoTotal: 0, referencias: [], formasPago: [], ids: [] };
          if (!current.ids.includes(pAbono.id)) {
            current.ids.push(pAbono.id);
            current.montoTotal += montoSoloA;
            if (refAbonoBase && !current.referencias.includes(refAbonoBase)) {
              current.referencias.push(refAbonoBase);
            }
            const fechaAbono = dA?.fecha_transaccion || dA?.fecha_banco || String(pAbono.created_at || '').slice(0, 10);
            const tipoAbono = pAbono.tipo || (Array.isArray(dA?.formasPago) && dA.formasPago[0]?.descripcion) || 'Transferencia';
            const bancoAbono = pAbono.banco || (Array.isArray(dA?.formasPago) && dA.formasPago[0]?.banco) || '';
            const sumFpAbono = Array.isArray(dA?.formasPago) && dA.formasPago.length > 1
              ? dA.formasPago.reduce((s: number, fp: any) => s + (parseFloat(String(fp?.monto || 0)) || 0), 0)
              : 0;
            if (Array.isArray(dA?.formasPago) && dA.formasPago.length > 1 && Math.abs(sumFpAbono - montoSoloA) < 1.00) {
              current.formasPago.push(...dA.formasPago);
            } else {
              current.formasPago.push({
                forma: /d[eé]bito|punto/i.test(String(tipoAbono)) ? '05' : '03',
                descripcion: String(tipoAbono).trim(),
                tipo: String(tipoAbono).trim(),
                metodo: String(tipoAbono).trim(),
                monto: montoSoloA,
                banco: bancoAbono,
                referencia: refAbonoBase,
                fecha: fechaAbono,
              });
            }
            current.formasPago = deduplicarFormasPagoList(current.formasPago);
          }
          abonosInfoPorPagoPrincipal.set(pPrincipal.id, current);
        }
      });
    });

    // 1.2) Consultar el estado de los pagos principales vinculados para verificar si siguen activos
    const principalIdsToCheck = new Set<string>();
    (rawPagos || []).forEach(p => {
      const d = parseDetalles(p.detalles);
      if (d?.pago_principal_id) principalIdsToCheck.add(d.pago_principal_id);
    });

    const pagosPrincipalesActivosMap = new Map<string, boolean>();
    if (principalIdsToCheck.size > 0) {
      const { data: parentRows } = await supabase
        .from('pagos_reportados')
        .select('id, estado, detalles')
        .in('id', Array.from(principalIdsToCheck));

      parentRows?.forEach(pr => {
        const prD = parseDetalles(pr.detalles);
        const prTeniaFactura = Boolean(
          prD?.factura_digital?.emitida ||
          prD?.factura_digital?.numero_documento ||
          prD?.factura_digital?.numero_control
        );
        // El pago principal se considera activo si está Aprobado, Por Verificar/Pendiente o si ya tiene factura emitida/anulada
        const estaActivo = pr.estado === 'Aprobado' || pr.estado === 'Por Verificar' || pr.estado === 'Pendiente' || prTeniaFactura;
        pagosPrincipalesActivosMap.set(pr.id, estaActivo);
      });
    }

    // Detectar si algún pago principal tiene transferencias secundarias aún sin conciliar ('Por Verificar' / 'Pendiente')
    const principalesConSecundarioSinConciliar = new Set<string>();
    (rawPagos || []).forEach(p => {
      const d = parseDetalles(p.detalles);
      const esVinculoAutoFalso = Boolean(d?.vinculado_a_referencia) && !p.grupo_pago;
      if (!esVinculoAutoFalso && d?.pago_principal_id && (p.estado === 'Por Verificar' || p.estado === 'Pendiente')) {
        principalesConSecundarioSinConciliar.add(String(d.pago_principal_id));
      }
    });

    const pagos = (rawPagos || []).filter(p => {
      if (p.tipo === 'Retencion de IVA') return false;
      const d = parseDetalles(p.detalles);

      // Si es un pago adicional / secundario vinculado a un pago principal (múltiples transferencias para una misma factura),
      // solo se excluye SI pertenece a un grupo_pago real (no un vínculo automático falso) y el pago principal está activo/aprobado.
      const esVinculoAutomaticoSinGrupo = Boolean(d?.vinculado_a_referencia) && !p.grupo_pago;
      if (!esVinculoAutomaticoSinGrupo) {
        if (d?.pago_principal_id) {
          const principalActivo = pagosPrincipalesActivosMap.get(d.pago_principal_id);
          if (principalActivo === true) {
            return false;
          }
        } else if (d?.es_pago_adicional === true && p.grupo_pago) {
          return false;
        }
      }

      // Si un pago Rechazado fue marcado erróneamente como es_pago_adicional de un pago principal activo,
      // no tiene factura propia real (su numero_control pertenece al pago principal aprobado).
      const esSecundarioRechazadoFalso =
        p.estado === 'Rechazado' &&
        Boolean(d?.factura_digital?.es_pago_adicional || d?.es_pago_adicional) &&
        Boolean(d?.factura_digital?.pago_principal_id || d?.pago_principal_id) &&
        !d?.factura_digital?.anulada &&
        !d?.factura_digital?.nota_credito;
      if (esSecundarioRechazadoFalso) {
        return false;
      }

      // Una factura solo se considera anulada fiscalmente si fue emitida (o tiene documento/control/NC fiscal real) y luego anulada/rechazada,
      // o si el pago fue marcado como 'Anulado' tras haber tenido documento fiscal.
      const ncFiscalReal = Boolean(
        (d?.factura_digital?.nota_credito && !d.factura_digital.nota_credito.manual && d.factura_digital.nota_credito.numero_documento !== 'ANULADA-MANUAL') ||
        (d?.nota_credito_digital && !d.nota_credito_digital.manual)
      );
      const teniaFactura = Boolean(
        d?.factura_digital?.emitida ||
        ncFiscalReal ||
        d?.factura_digital?.numero_documento ||
        d?.factura_digital?.numero_control
      );

      const tienePrevias = Array.isArray(d?.facturas_digitales_previas) && d.facturas_digitales_previas.length > 0;

      const esAnulada = (p.estado === 'Anulado' && teniaFactura) || 
        (Boolean(d?.factura_digital?.anulada || ncFiscalReal) && teniaFactura) ||
        (Boolean(d?.factura_digital?.rechazada || p.estado === 'Rechazado') && teniaFactura) ||
        (tienePrevias && d.facturas_digitales_previas.some((f: any) => f.anulada || f.nota_credito));

      // Si el pago fue anulado, rechazado, reversado o condonado en caja/conciliación y NUNCA se le emitió factura fiscal,
      // no tiene nada que hacer en Facturación Electrónica (ni como pendiente ni como emitida/anulada).
      if (['Anulado', 'Rechazado', 'Reversado', 'Condonado'].includes(String(p?.estado || '')) && !teniaFactura && !tienePrevias) {
        return false;
      }

      // Si ya tiene factura digital emitida o anulada, SIEMPRE debe mostrarse en facturación electrónica
      const yaEmitidaOAnulada = Boolean(
        d?.factura_digital?.emitida ||
        d?.factura_digital?.numero_documento ||
        d?.factura_digital?.numero_control ||
        d?.factura_digital?.url ||
        esAnulada ||
        tienePrevias
      );
      if (yaEmitidaOAnulada) {
        return true;
      }

      // REGLA ESTRICTA: Si el pago NO está conciliado (estado !== 'Aprobado') y no tiene factura emitida/anulada,
      // NO debe aparecer en Facturación Electrónica (ej. transferencias en 'Por Verificar' o 'Pendiente').
      // Los pagos por Punto de Venta / Débito se registran directamente como 'Aprobado' y sí salen de inmediato.
      if (p.estado !== 'Aprobado') {
        return false;
      }
      if (principalesConSecundarioSinConciliar.has(String(p.id))) {
        return false;
      }

      // Si fue absorbido por otro pago principal que completó la factura, no duplicar en facturación
      if (abonosAbsorbidosIds.has(p.id)) {
        return false;
      }

      // Si hay un término de búsqueda específico, SIEMPRE mostrarlo para permitir auditar o emitir
      if (query) {
        return true;
      }

      // Si es un pago con retención de agente, debe salir para gestión de retención
      if (d?.es_retencion === true || d?.conRetencion === true || Boolean(d?.pago_retencion_id)) {
        return true;
      }

      // Si el pago liquidó recibos de cobro (recibos históricos o del mes), debe salir para facturación
      if (Array.isArray(d?.recibos) && d.recibos.length > 0) {
        return true;
      }

      // REGLA: Los abonos o pagos parciales ordinarios que no han completado el pago total del mes y no tienen recibos liquidados no deben salir por defecto
      if (
        d?.es_abono === true ||
        d?.abono === true ||
        p.tipo === 'Abono' ||
        d?.pago_parcial === true ||
        (d?.monto_pendiente !== undefined && parseFloat(String(d.monto_pendiente)) > 0.05)
      ) {
        return false;
      }

      return true;
    });

    // 2) Obtener retenciones_iva vinculadas a los pagos
    const retencionIds: string[] = [];
    const controlesFacturas: string[] = [];
    pagos.forEach(p => {
      const d = parseDetalles(p.detalles);
      const rId = d?.factura_digital?.retencion?.retencion_id;
      if (rId) retencionIds.push(rId);
      const ctrl = d?.factura_digital?.numero_control;
      if (ctrl) controlesFacturas.push(ctrl);
    });


    const retencionesIvaMap = new Map<string, any>();
    const retencionesPorControlMap = new Map<string, any>();

    if (retencionIds.length > 0 || controlesFacturas.length > 0) {
      try {
        let q = supabase.from('retenciones_iva').select('*');
        if (retencionIds.length > 0 && controlesFacturas.length > 0) {
          q = q.or(`id.in.(${retencionIds.join(',')}),factura_control.in.(${controlesFacturas.map(c => `"${c}"`).join(',')})`);
        } else if (retencionIds.length > 0) {
          q = q.in('id', retencionIds);
        } else {
          q = q.in('factura_control', controlesFacturas);
        }
        const { data: rets } = await q;
        (rets || []).forEach(r => {
          retencionesIvaMap.set(r.id, r);
          if (r.factura_control) {
            const ctrl = String(r.factura_control).trim();
            const idKey = normId(r.identidad);
            if (idKey) {
              retencionesPorControlMap.set(`${ctrl}_${idKey}`, r);
            }
            if (!retencionesPorControlMap.has(ctrl)) {
              retencionesPorControlMap.set(ctrl, r);
            }
          }
        });
      } catch (err) {
        console.warn('Error cargando retenciones_iva en listar:', err);
      }
    }

    // Helper para detectar si un texto es un RIF o marcador genérico en vez del nombre real
    const esPlaceholderNombre = (name: any) => {
      if (!name) return true;
      const str = String(name).trim().toUpperCase();
      if (!str || str === 'CONTRIBUYENTE' || str === 'N/A' || str === 'NULL' || str === 'UNDEFINED') return true;
      if (/^CONTRIBUYENTE\s+[VJGEP]?[-]?\d+/i.test(str)) return true;
      if (/^[VJGEP]-?\d+$/i.test(str)) return true;
      if (/^\d{6,}$/.test(str)) return true;
      return false;
    };

    // Obtener identidades únicas y sus variantes para traer nombres reales de contribuyentes
    const identidades = Array.from(new Set((pagos || []).map(p => p.identidad).filter(Boolean)));
    const idVariantsSet = new Set<string>();
    identidades.forEach(id => {
      const s = String(id || '').trim().toUpperCase();
      if (!s) return;
      idVariantsSet.add(s);
      const noDash = s.replace(/-/g, '');
      idVariantsSet.add(noDash);
      if (!s.includes('-') && /^[VJGEP]\d+$/i.test(s)) {
        idVariantsSet.add(`${s[0]}-${s.slice(1)}`);
      }
    });
    const idVariants = Array.from(idVariantsSet);
    
    const contsMap = new Map();
    for (let i = 0; i < idVariants.length; i += 300) {
      const { data: conts } = await supabase
        .from('contribuyentes')
        .select('identidad, nombre, email, telefono, direccion')
        .in('identidad', idVariants.slice(i, i + 300));
      (conts || []).forEach(c => {
        contsMap.set(c.identidad, c);
        contsMap.set(normId(c.identidad), c);
      });
    }

    // Inmuebles referenciados en los recibos pagados (para clasificar factura vs recibo y rescatar nombre)
    const detallesPorPago = new Map<string, any>();
    const codigos = new Set<string>();
    const pagoIds = (pagos || []).map(p => p.id);

    // Buscar retenciones vinculadas a estos pagos en la base de datos para asegurar el enlace
    if (pagoIds.length > 0) {
      for (let i = 0; i < pagoIds.length; i += 200) {
        const chunk = pagoIds.slice(i, i + 200);
        const { data: retsDb } = await supabase
          .from('pagos_reportados')
          .select('id, monto, referencia, detalles')
          .eq('tipo', 'Retencion de IVA')
          .filter('detalles->>pago_vinculado', 'in', `(${chunk.join(',')})`);
        (retsDb || []).forEach((r: any) => {
          const d = parseDetalles(r.detalles);
          if (d?.pago_vinculado) {
            retencionPorPagoVinculado.set(String(d.pago_vinculado), {
              id: r.id,
              monto: parseFloat(r.monto || '0') || 0,
              referencia: r.referencia || 'N/A'
            });
          }
        });
      }
    }

    (pagos || []).forEach(p => {
      const det = parseDetalles(p.detalles);
      detallesPorPago.set(p.id, det);
      (det.recibos || []).forEach((r: string) => { const c = extraerCodigoInmueble(r); if (c) codigos.add(c); });
      if (det.codigo_inmueble) codigos.add(String(det.codigo_inmueble).trim().toUpperCase());
      if (det.cod_inmueble) codigos.add(String(det.cod_inmueble).trim().toUpperCase());
      if (Array.isArray(det.condominio?.lineas)) {
        det.condominio.lineas.forEach((l: any) => {
          if (l?.inmueble) codigos.add(String(l.inmueble).trim().toUpperCase());
        });
      }
    });
    const inmMap = new Map<string, any>();
    const cuMap = new Map<string, any>();
    const listaCodigos = [...codigos];
    for (let i = 0; i < listaCodigos.length; i += 300) {
      const slice = listaCodigos.slice(i, i + 300);
      const [{ data: inms }, { data: cus }] = await Promise.all([
        supabase
          .from('inmuebles')
          .select('inmueble, tipo, clasificacion, actividad_principal, direccion, correo_electronico, contribuyente, identidad, agente_retencion, multa_bs, notas')
          .in('inmueble', slice),
        supabase
          .from('condominio_unidades')
          .select('inmueble, propietario, identidad, correo')
          .in('inmueble', slice),
      ]);
      (inms || []).forEach((inm: any) => inmMap.set(inm.inmueble, inm));
      (cus || []).forEach((cu: any) => {
        if (cu.inmueble) cuMap.set(String(cu.inmueble).trim().toUpperCase(), cu);
      });
    }

    const fallbackEmail = process.env.TFHKA_FALLBACK_EMAIL?.trim() || 'facturacion.comercial@globalgreenca.com';

    // Condominios (para reconocer pagos de condominios por su RIF o código y correo actualizado)
    const { data: condosRows } = await supabase.from('condominios').select('codigo,identidad,nombre,tipo,agente_retencion,correo,direccion,multa_meses,multa_exonerada_hasta').limit(5000);
    const condoPorRif = new Map<string, any>();
    const condoPorCodigo = new Map<string, any>();
    (condosRows || []).forEach((c: any) => {
      if (c.identidad) condoPorRif.set(normId(c.identidad), c);
      if (c.codigo) condoPorCodigo.set(String(c.codigo).trim().toUpperCase(), c);
    });
    const detectarEsPagoPorLocal = (pago: any, det: any, condoRow: any) => {
      const c = det.condominio || {};
      const condoMod = String(c.modalidad || '').toUpperCase();
      const modCobro = String(det.modalidad_cobro || c.modalidad_cobro || '').toLowerCase();
      const tieneSoloMultas = Boolean(det.soloMultas || det.solo_multas || c.solo_multas);
      if (tieneSoloMultas || ['individual', 'local', 'multas_separadas'].includes(modCobro)) {
        return true;
      }
      if (['completo', 'total', 'abono', 'abono_locales'].includes(modCobro)) {
        return false;
      }
      const rifDistintoDeCondo = Boolean(
        condoRow?.identidad &&
        pago.identidad &&
        normId(pago.identidad) !== normId(condoRow.identidad)
      );
      if (det.modo === 'CONDOMINIO' && !rifDistintoDeCondo) return false;
      return Boolean(
        det.modo === 'CONTRIBUYENTE' ||
        (!det.modo && !modCobro && condoMod === 'INDIVIDUAL') ||
        (!det.modo && !modCobro && rifDistintoDeCondo)
      );
    };
    const infoCondo = (pago: any, det: any) => {
      const c = det.condominio || {};
      const codCondoRaw = String(c.codigo || (det.cod_inmueble && String(det.cod_inmueble).startsWith('CONDO-') ? det.cod_inmueble : '') || '').trim().toUpperCase();
      const porCod = codCondoRaw ? condoPorCodigo.get(codCondoRaw) : null;
      const porRif = condoPorRif.get(normId(pago.identidad)) || (c.identidad ? condoPorRif.get(normId(c.identidad)) : null);
      const condoRow = porCod || porRif;
      const esModulo = pago.modulo === 'condominios' || det.modulo === 'condominios';
      if (!esModulo && det.isCondominio !== true && det.es_condominio !== true && !condoRow) return null;
      const tipo = c.tipo || condoRow?.tipo || null;
      const esLocal = detectarEsPagoPorLocal(pago, det, condoRow);
      return {
        codigo: c.codigo || condoRow?.codigo || null,
        nombre: condoRow?.nombre || c.nombre || det.contribuyente || 'Condominio',
        identidad: condoRow?.identidad || c.identidad || null,
        tipo,
        residencial: tipo ? String(tipo).toUpperCase() === 'RESIDENCIAL' : null,
        agente_retencion: Boolean(c.agente_retencion ?? condoRow?.agente_retencion),
        correo: condoRow?.correo || c.correo || null,
        direccion: condoRow?.direccion || c.direccion || null,
        multa_meses: condoRow?.multa_meses ?? null,
        multa_exonerada_hasta: condoRow?.multa_exonerada_hasta ?? null,
        facturaA: esLocal ? 'CONTRIBUYENTE' : 'CONDOMINIO',
        grupo: det.grupo_pago ? { id: det.grupo_pago.id, parte: det.grupo_pago.parte, partes: det.grupo_pago.partes, montoTotal: Number(det.grupo_pago.monto_total) || 0 } : null,
      };
    };

    // Mapear cada pago con sus detalles de factura digital
    const items = (pagos || []).map(pago => {
      const det = detallesPorPago.get(pago.id) || {};
      const condo = infoCondo(pago, det);
      const esCondo = Boolean(pago.modulo === 'condominios' || det.modulo === 'condominios' || det.isCondominio || det.es_condominio || condo);
      const codCondoRaw = String(det.condominio?.codigo || condo?.codigo || '').trim().toUpperCase();
      const condoRow = (codCondoRaw ? condoPorCodigo.get(codCondoRaw) : null) || condoPorRif.get(normId(pago.identidad)) || (det.condominio?.identidad ? condoPorRif.get(normId(det.condominio.identidad)) : null);
      const esPagoPorLocal = esCondo && detectarEsPagoPorLocal(pago, det, condoRow);
      const esModoCondominio = Boolean(esCondo && !esPagoPorLocal);

      const cont = contsMap.get(pago.identidad) || contsMap.get(normId(pago.identidad));
      const fd = det.factura_digital || null;
      const rd = det.recibo_digital || null;
      const emitida = !!(fd && (fd.emitida || fd.url || fd.numero_control));
      const clasif = clasificarPago(det.recibos || [], inmMap, det);

      // Si se eliminó o exoneró la multa del inmueble/condominio o en el propio pago, asegurar que no vuelva a aparecer
      const inmsDelPago = clasif.inmuebles.map(c => inmMap.get(c)).filter(Boolean);
      const inmExoneradoTotal = inmsDelPago.length > 0 && inmsDelPago.every((i: any) => {
        const notasStr = String(i.notas || '');
        const tieneTagExo = notasStr.includes('Caso especial: Exonerado de multas') || (notasStr.includes('EXONERACIÓN DE MULTAS') && Number(i.multa_bs || 0) <= 0);
        return tieneTagExo;
      });
      const condoExonerado = Boolean(condo && (condo as any).multa_meses === 0 && (condo as any).multa_exonerada_hasta);
      const lineasCondoDet = Array.isArray(det.condominio?.lineas) ? det.condominio.lineas : [];
      const aseoLineasTotal = lineasCondoDet.reduce((s: number, l: any) => s + (Number(l?.aseoBs) || 0), 0);
      const multaLineasTotal = lineasCondoDet.reduce((s: number, l: any) => s + (Number(l?.multaBs) || 0), 0);
      const esPagoExclusivoMulta =
        clasif.subtipo === 'factura_multa_comercial' ||
        (lineasCondoDet.length > 0 && aseoLineasTotal <= 0 && multaLineasTotal > 0) ||
        (Number(det.base_bs || det.montoServicio || 0) <= 0 && Number(det.multa_bs || det.montoMulta || det.monto_multa || 0) > 0 && String(det.concepto || '').toLowerCase().includes('multa'));

      const sinMultaExplicito =
        !esPagoExclusivoMulta && (
          det.llevaMulta === false ||
          det.sin_multas === true ||
          det.solo_aseo === true ||
          det.incluir_multas === false ||
          (det.montoMulta !== undefined && det.montoMulta !== null && String(det.montoMulta).trim() !== '' && parseFloat(String(det.montoMulta)) <= 0)
        );

      if (!esPagoExclusivoMulta && (sinMultaExplicito || (!emitida && (inmExoneradoTotal || condoExonerado)))) {
        det.sin_multas = true;
        det.llevaMulta = false;
        det.incluir_multas = false;
        det.multa_bs = 0;
        det.montoMulta = 0;
        det.monto_multa = 0;
        if (Array.isArray(det.deuda_previa)) {
          det.deuda_previa = det.deuda_previa.map((dp: any) => dp ? { ...dp, multa_bs: 0 } : dp);
        }
        if (Array.isArray(det.condominio?.lineas)) {
          det.condominio.lineas = det.condominio.lineas.map((l: any) => l ? { ...l, multaBs: 0 } : l);
        }
        clasif.tieneMulta = false;
      }
      const correoInm = clasif.inmuebles.map(c => inmMap.get(c)?.correo_electronico).find((e: any) => e && String(e).includes('@'));
      
      // Si la factura va al CONDOMINIO centralizado, priorizar el correo oficial del condominio
      const rawEmailStr = (
        (esModoCondominio && (condo?.correo || det.correo)) ||
        cont?.email ||
        condo?.correo ||
        det.correo ||
        fd?.correo_utilizado ||
        correoInm ||
        ''
      ).trim();
      const rawEmail = rawEmailStr
        .split(/[,;\s|/]+/)
        .map((s: string) => s.trim().toLowerCase())
        .find((s: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s)) || '';
      const esCorreoComodin = !rawEmail || rawEmail.length < 4 || rawEmail.toLowerCase() === fallbackEmail.toLowerCase();
      const correoFinal = esCorreoComodin ? fallbackEmail : rawEmail;
      const reciboEnviado = !!(rd && rd.enviado);

      // Rescatar nombre y RIF real según modalidad (Grupal/Condominio vs Individual/Local)
      const fueEditadoFiscal = Array.isArray(det.historial_edicion_fiscal) && det.historial_edicion_fiscal.length > 0;
      const codLocalInm = esPagoPorLocal
        ? String(
            det.condominio?.lineas?.[0]?.inmueble ||
            (det.cod_inmueble && !String(det.cod_inmueble).startsWith('CONDO-') ? det.cod_inmueble : '') ||
            (det.codigo_inmueble && !String(det.codigo_inmueble).startsWith('CONDO-') ? det.codigo_inmueble : '') ||
            clasif.inmuebles[0] ||
            ''
          ).trim().toUpperCase()
        : null;
      const localProp = codLocalInm ? inmMap.get(codLocalInm) : null;
      const cuProp = codLocalInm ? cuMap.get(codLocalInm) : null;
      const linea0 = det.condominio?.lineas?.[0] || null;

      let identidadResuelta = pago.identidad;
      if (fueEditadoFiscal && pago.identidad) {
        identidadResuelta = pago.identidad;
      } else if (esPagoPorLocal) {
        const rifCondoNorm = normId(condoRow?.identidad || condo?.identidad || '');
        if (!identidadResuelta || (rifCondoNorm && normId(identidadResuelta) === rifCondoNorm)) {
          const candRif =
            (linea0?.identidad && normId(linea0.identidad) !== rifCondoNorm ? linea0.identidad : null) ||
            (cuProp?.identidad && normId(cuProp.identidad) !== rifCondoNorm ? cuProp.identidad : null) ||
            (localProp?.identidad && normId(localProp.identidad) !== rifCondoNorm ? localProp.identidad : null) ||
            identidadResuelta;
          if (candRif) identidadResuelta = String(candRif).trim();
        }
      } else if (esModoCondominio) {
        identidadResuelta = condoRow?.identidad || condo?.identidad || det.condominio?.identidad || pago.identidad;
      }

      let nombreInm = '';
      if (localProp?.contribuyente && !esPlaceholderNombre(localProp.contribuyente)) {
        nombreInm = String(localProp.contribuyente).trim();
      } else {
        for (const r of (det.recibos || [])) {
          const c = extraerCodigoInmueble(r);
          if (c && inmMap.get(c)?.contribuyente) {
            const cand = String(inmMap.get(c).contribuyente).trim();
            if (!esPlaceholderNombre(cand) && (!esPagoPorLocal || !cand.toUpperCase().includes('CONDOMINIO'))) {
              nombreInm = cand;
              break;
            }
          }
        }
        if (!nombreInm && det.codigo_inmueble && inmMap.get(det.codigo_inmueble)?.contribuyente) {
          const cand = String(inmMap.get(det.codigo_inmueble).contribuyente).trim();
          if (!esPlaceholderNombre(cand) && (!esPagoPorLocal || !cand.toUpperCase().includes('CONDOMINIO'))) nombreInm = cand;
        }
        if (!nombreInm && det.cod_inmueble && inmMap.get(det.cod_inmueble)?.contribuyente) {
          const cand = String(inmMap.get(det.cod_inmueble).contribuyente).trim();
          if (!esPlaceholderNombre(cand) && (!esPagoPorLocal || !cand.toUpperCase().includes('CONDOMINIO'))) nombreInm = cand;
        }
      }

      const rcRazon = det.recibo_caja?.[0]?.razonSocial && !esPlaceholderNombre(det.recibo_caja[0].razonSocial) ? String(det.recibo_caja[0].razonSocial).trim() : null;
      const nombreUnidad =
        (linea0?.propietario && !esPlaceholderNombre(linea0.propietario) && !String(linea0.propietario).toUpperCase().includes('CONDOMINIO') ? String(linea0.propietario).trim() : '') ||
        (cuProp?.propietario && !esPlaceholderNombre(cuProp.propietario) && !String(cuProp.propietario).toUpperCase().includes('CONDOMINIO') ? String(cuProp.propietario).trim() : '');

      let nombreResuelto = '';
      if (fueEditadoFiscal && !esPlaceholderNombre(det.contribuyente)) {
        nombreResuelto = String(det.contribuyente).trim();
      } else if (esPagoPorLocal) {
        if (nombreUnidad) {
          nombreResuelto = nombreUnidad;
        } else if (nombreInm && !esPlaceholderNombre(nombreInm) && !nombreInm.toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = nombreInm;
        } else if (rcRazon && !rcRazon.toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = rcRazon;
        } else if (cont?.nombre && !esPlaceholderNombre(cont.nombre) && !cont.nombre.toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = cont.nombre;
        } else if (!esPlaceholderNombre(det.contribuyente) && !String(det.contribuyente).toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = det.contribuyente;
        } else {
          nombreResuelto = rcRazon || cont?.nombre || 'Contribuyente ' + identidadResuelta;
        }
      } else if (esModoCondominio) {
        if (condo?.nombre && !esPlaceholderNombre(condo.nombre)) {
          nombreResuelto = condo.nombre;
        } else if (rcRazon) {
          nombreResuelto = rcRazon;
        } else if (!esPlaceholderNombre(det.contribuyente)) {
          nombreResuelto = det.contribuyente;
        } else if (cont?.nombre && !esPlaceholderNombre(cont.nombre)) {
          nombreResuelto = cont.nombre;
        } else if (nombreInm && !esPlaceholderNombre(nombreInm)) {
          nombreResuelto = nombreInm;
        } else {
          nombreResuelto = det.contribuyente || cont?.nombre || 'Contribuyente ' + identidadResuelta;
        }
      } else {
        if (nombreInm && !esPlaceholderNombre(nombreInm)) {
          nombreResuelto = nombreInm;
        } else if (rcRazon) {
          nombreResuelto = rcRazon;
        } else if (!esPlaceholderNombre(det.contribuyente)) {
          nombreResuelto = det.contribuyente;
        } else if (cont?.nombre && !esPlaceholderNombre(cont.nombre)) {
          nombreResuelto = cont.nombre;
        } else if (condo?.nombre && !esPlaceholderNombre(condo.nombre)) {
          nombreResuelto = condo.nombre;
        } else {
          nombreResuelto = det.contribuyente || cont?.nombre || 'Contribuyente ' + identidadResuelta;
        }
      }

      const vincRet = retencionPorPagoVinculado.get(String(pago.id));
      const montoRetGuardada = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || 0)) || 0;
      let montoRetNum = montoRetGuardada > 0 ? montoRetGuardada : (vincRet ? vincRet.monto : 0);

      // Detección de Agente de Retención por catálogo de inmuebles / condominios
      let esAgenteEnCatalogo = false;
      for (const r of (det.recibos || [])) {
        const c = extraerCodigoInmueble(r);
        if (c && inmMap.get(c)?.agente_retencion) {
          esAgenteEnCatalogo = true;
          break;
        }
      }
      if (!esAgenteEnCatalogo && det.codigo_inmueble && inmMap.get(det.codigo_inmueble)?.agente_retencion) {
        esAgenteEnCatalogo = true;
      }
      if (!esAgenteEnCatalogo && (condo as any)?.agente_retencion) {
        esAgenteEnCatalogo = true;
      }

      const tieneRetencion = montoRetNum > 0 || !!det.es_retencion || !!det.agente_retencion || !!vincRet || (esAgenteEnCatalogo && clasif.documento === 'factura');

      // Si el pago tiene retención y se guardó saldo_favor igual a la retención, se limpia para no mostrarlo como Nota de Crédito
      const sFavorGuardado = parseFloat(String(det.saldo_a_favor_nuevo || det.monto_sobrante || det.saldo_favor || det.saldo_favor_generado || 0)) || 0;
      if (tieneRetencion && montoRetNum > 0 && Math.abs(sFavorGuardado - montoRetNum) < 0.05) {
        delete det.saldo_a_favor_nuevo;
        delete det.monto_sobrante;
        delete det.saldo_favor;
        delete det.saldo_favor_generado;
      }

      const porcRet = Number(det.porcentaje_retencion) === 100 ? 100 : 75;
      if (tieneRetencion) {
        det.conRetencion = true;
        det.es_retencion = true;
        det.agente_retencion = true;
        det.monto_retencion_iva = montoRetNum;
        det.retencion_iva = montoRetNum;
        det.porcentaje_retencion = porcRet;
      }

      // Detección de Nota de Crédito (Saldo a Favor) aplicada en el pago
      const sfUsado = (() => {
        let sf = parseFloat(String(
          det.saldo_usado ?? 
          det.descuentoSaldoFavor ?? 
          det.descuento_saldo_favor ?? 
          det.saldo_favor_usado ?? 
          det.nota_credito_usada ?? 
          det.monto_saldo_favor ?? 
          0
        )) || 0;
        if (sf === 0 && (String(pago.tipo || det.tipo || '').toLowerCase().includes('saldo a favor') || String(pago.tipo || det.tipo || '').toLowerCase().includes('nota de credito'))) {
          return parseFloat(String(pago.monto || det.montoTotal || 0)) || 0;
        }
        if (sf === 0 && Array.isArray(det.pagos_agregados)) {
          sf = det.pagos_agregados
            .filter((pa: any) => String(pa?.metodo || pa?.tipo || '').toLowerCase().includes('saldo a favor') || String(pa?.metodo || pa?.tipo || '').toLowerCase().includes('nota de credito'))
            .reduce((sum: number, pa: any) => sum + (parseFloat(String(pa.monto || 0)) || 0), 0);
        }
        if (sf === 0 && Array.isArray(det.formasPago)) {
          sf = det.formasPago
            .filter((fp: any) => String(fp?.descripcion || fp?.tipo || fp?.metodo || '').toLowerCase().includes('saldo a favor') || String(fp?.descripcion || fp?.tipo || fp?.metodo || '').toLowerCase().includes('nota de credito'))
            .reduce((sum: number, fp: any) => sum + (parseFloat(String(fp.monto || 0)) || 0), 0);
        }
        return Math.round(sf * 100) / 100;
      })();

      // Monto de la factura fiscal/recibo: debe ser el valor REAL del servicio (incluyendo nota de crédito / saldo a favor)
      let montoFacturaReal = parseFloat(pago.monto || '0');
      let rcTotal = 0;
      if (det.recibo_caja) {
        try {
          const rc = typeof det.recibo_caja === 'string' ? JSON.parse(det.recibo_caja) : det.recibo_caja;
          if (Array.isArray(rc) && rc.length > 0) {
            const sumRc = rc.reduce((acc: number, r: any) => acc + (parseFloat(String(r.total || 0)) || 0), 0);
            const esRcAbono = rc.some((r: any) => Boolean(r?.esAbono || (Number(r?.montoPendiente || 0) > 0.01)));
            const mFacDet = parseFloat(String(det.monto_factura || det.total_seleccionado || det.montoTotal || 0)) || 0;
            if (!(esRcAbono && mFacDet > sumRc + 0.01)) {
              rcTotal = sumRc;
            }
          }
        } catch(e) {}
      }

      const fdTotalGuardado = parseFloat(String(fd?.retencion?.total || fd?.monto_total || 0)) || 0;
      const mFacGuardado = parseFloat(String(det.monto_factura || 0)) || 0;
      const mPagoCol = parseFloat(String(pago.monto || 0)) || 0;
      const mNetoGuardado = parseFloat(String(det.monto_neto_factura || 0)) || 0;
      const netFromRetEst = montoRetNum > 0 ? Math.round((montoRetNum * 26 / 3) * 100) / 100 : 0;

      if (fdTotalGuardado > 0 && (!tieneRetencion || montoRetNum === 0 || fdTotalGuardado >= (montoRetNum * 29 / 3) - 25 || fdTotalGuardado > mPagoCol + 1)) {
        montoFacturaReal = fdTotalGuardado;
      } else if (mFacGuardado > 0) {
        const esMFacNeto = tieneRetencion && montoRetNum > 0 && (
          (mNetoGuardado > 0 && Math.abs(mFacGuardado - mNetoGuardado) < 1) ||
          (Math.abs(mFacGuardado - mPagoCol) < 1 && Math.abs(mFacGuardado - netFromRetEst) < 25) ||
          (rcTotal > mFacGuardado + 1 && Math.abs(rcTotal - (mFacGuardado + montoRetNum)) < 2)
        );
        montoFacturaReal = esMFacNeto ? Math.round((mFacGuardado + montoRetNum + sfUsado) * 100) / 100 : mFacGuardado;
      } else if (rcTotal > 0) {
        const esNeto = tieneRetencion && montoRetNum > 0 && (
          (mNetoGuardado > 0 && Math.abs(rcTotal - mNetoGuardado) < 1) ||
          (det.montoTotal && Math.abs(rcTotal - parseFloat(det.montoTotal)) < 1 && Math.abs(rcTotal - netFromRetEst) < 25) ||
          (Math.abs(rcTotal - mPagoCol) < 1 && Math.abs(rcTotal - netFromRetEst) < 25) ||
          (det.total_seleccionado && parseFloat(det.total_seleccionado) > rcTotal + 1)
        );
        montoFacturaReal = esNeto ? Math.round((rcTotal + montoRetNum) * 100) / 100 : rcTotal;
      } else if (tieneRetencion) {
        // Para retención: El monto fiscal de la factura es el valor BRUTO con IVA (antes de deducir retención)
        const montoNetoDet = mNetoGuardado;
        const totalSel = parseFloat(String(det.total_seleccionado || 0));
        const deudaSis = parseFloat(String(det.deuda_total_sistema || 0));
        if (montoNetoDet > 0 && montoRetNum > 0) {
          montoFacturaReal = montoNetoDet + montoRetNum;
        } else if (totalSel > 0) {
          montoFacturaReal = totalSel;
        } else if (deudaSis > 0) {
          montoFacturaReal = deudaSis;
        } else if (montoRetNum > 0) {
          montoFacturaReal = Math.max(0, mPagoCol - (sFavorGuardado > 0 ? sFavorGuardado : 0)) + montoRetNum + sfUsado;
        }
      } else if (mNetoGuardado > 0) {
        montoFacturaReal = mNetoGuardado;
      } else if (det.total_seleccionado && parseFloat(det.total_seleccionado) > 0) {
        montoFacturaReal = parseFloat(det.total_seleccionado);
      } else if (sFavorGuardado > 0 && montoFacturaReal > sFavorGuardado) {
        montoFacturaReal = montoFacturaReal - sFavorGuardado + sfUsado;
      } else {
        montoFacturaReal = montoFacturaReal + sfUsado;
      }
      montoFacturaReal = Math.round(montoFacturaReal * 100) / 100;

      if (tieneRetencion && montoRetNum === 0 && montoFacturaReal > 0) {
        montoRetNum = Math.round((montoFacturaReal - (montoFacturaReal / 1.16)) * (porcRet / 100) * 100) / 100;
        det.monto_retencion_iva = montoRetNum;
        det.retencion_iva = montoRetNum;
      }

      // Los pagos con retención comercial siempre corresponden a factura fiscal
      const docFinal = tieneRetencion ? 'factura' : clasif.documento;

      // Agente de retención: la factura se envía solo al aprobar su comprobante
      const pNormId = normId(pago.identidad);
      let retRow = fd?.retencion?.retencion_id ? retencionesIvaMap.get(fd.retencion.retencion_id) : null;
      // Descartar retRow por ID si no pertenece al mismo contribuyente (evitar IDs cruzados)
      if (retRow && pNormId && normId(retRow.identidad) !== pNormId) {
        retRow = null;
      }
      if (!retRow && fd?.numero_control) {
        const ctrl = String(fd.numero_control).trim();
        retRow = retencionesPorControlMap.get(`${ctrl}_${pNormId}`);
        if (!retRow) {
          const cand = retencionesPorControlMap.get(ctrl);
          if (cand && (!cand.identidad || normId(cand.identidad) === pNormId)) {
            retRow = cand;
          }
        }
      }
      const stRet = (retRow?.estado === 'Aprobado' || det?.retencion_aprobada === true || fd?.retencion?.estado === 'aprobada')
        ? 'aprobada'
        : (fd?.retencion?.estado || (retRow ? (retRow.estado === 'Pendiente' ? 'planilla_recibida' : String(retRow.estado).toLowerCase()) : null));

      const infoAbonos = abonosInfoPorPagoPrincipal.get(pago.id);
      if (Array.isArray(det.formasPago) && det.formasPago.length > 1) {
        det.formasPago = deduplicarFormasPagoList(det.formasPago);
      }
      if (Array.isArray(det.pagos_agregados) && det.pagos_agregados.length > 1) {
        det.pagos_agregados = deduplicarFormasPagoList(det.pagos_agregados);
      }
      const sumFormasPagoBancarias = Array.isArray(det.formasPago) && det.formasPago.length > 1
        ? det.formasPago
            .filter((fp: any) => !String(fp?.descripcion || fp?.tipo || fp?.metodo || '').toLowerCase().includes('saldo a favor') && !String(fp?.descripcion || fp?.tipo || fp?.metodo || '').toLowerCase().includes('nota de credito'))
            .reduce((s: number, fp: any) => s + (parseFloat(String(fp?.monto || 0)) || 0), 0)
        : 0;
      const sumaDirectaConAbonos = (parseFloat(pago.monto || '0') || 0) + (infoAbonos?.montoTotal || 0);
      const montoPagadoEfectivo = Math.round(Math.max(sumaDirectaConAbonos, sumFormasPagoBancarias) * 100) / 100;
      const refRawStr = String(pago.referencia || 'N/A');
      const refBaseClean = refRawStr.replace(/\s*\(\+[^)]*\)/g, '').trim() || 'N/A';
      const existingPlusMatch = refRawStr.match(/\(\+\s*([^)]+)\)/);
      const existingPlusRefs = existingPlusMatch
        ? existingPlusMatch[1].split(/[,\s+]+/).map(s => s.trim()).filter(Boolean)
        : [];
      const mergedPlusRefs = Array.from(new Set([...existingPlusRefs, ...(infoAbonos?.referencias || [])])).filter(r => r && r !== refBaseClean);
      const refFinal = mergedPlusRefs.length > 0
        ? `${refBaseClean} (+ ${mergedPlusRefs.join(', ')})`
        : refRawStr;

      if (infoAbonos && Array.isArray(infoAbonos.formasPago) && infoAbonos.formasPago.length > 0) {
        const tieneMultiReal = Array.isArray(det.formasPago) && det.formasPago.length > 1;
        const montoPropio = parseFloat(String(pago.monto || 0)) || 0;
        const fechaPropio = det.fecha_transaccion || det.fecha_banco || String(pago.created_at || '').slice(0, 10);
        const tipoPropio = pago.tipo || (Array.isArray(det.formasPago) && det.formasPago[0]?.descripcion) || 'Transferencia';
        const bancoPropio = pago.banco || (Array.isArray(det.formasPago) && det.formasPago[0]?.banco) || '';
        const itemPropio = {
          forma: /d[eé]bito|punto/i.test(String(tipoPropio)) ? '05' : '03',
          descripcion: String(tipoPropio).trim(),
          tipo: String(tipoPropio).trim(),
          metodo: String(tipoPropio).trim(),
          monto: montoPropio,
          banco: bancoPropio,
          referencia: refBaseClean,
          fecha: fechaPropio,
        };
        if (!tieneMultiReal) {
          det.pagos_agregados = deduplicarFormasPagoList([
            itemPropio,
            ...infoAbonos.formasPago,
          ]);
        } else {
          const refsExistentes = new Set(
            det.formasPago.map((fp: any) =>
              String(fp?.referencia || '').replace(/\s*\(\+[^)]*\)/g, '').trim().replace(/^0+/, '').toUpperCase()
            ).filter(Boolean)
          );
          const faltantes = [itemPropio, ...infoAbonos.formasPago].filter((fp: any) => {
            const r = String(fp?.referencia || '').replace(/\s*\(\+[^)]*\)/g, '').trim().replace(/^0+/, '').toUpperCase();
            return r && !refsExistentes.has(r);
          });
          if (faltantes.length > 0) {
            det.formasPago = deduplicarFormasPagoList([...det.formasPago, ...faltantes]);
          }
          det.pagos_agregados = deduplicarFormasPagoList(det.formasPago);
        }
      }

      return {
        id: pago.id,
        pagoId: pago.id,
          identidad: identidadResuelta,
          contribuyente: nombreResuelto,
          correo: correoFinal,
          rawCorreo: rawEmail,
          esCorreoComodin,
          requiereActualizacionCorreo: esCorreoComodin,
          monto: montoFacturaReal,
          montoPagado: montoPagadoEfectivo,
          saldoAFavor: sFavorGuardado,
          saldoFavorUsado: sfUsado,
          banco: pago.banco || 'N/A',
          referencia: refFinal,
          tipo: pago.tipo || 'Transferencia',
          estado: pago.estado || 'Aprobado',
          created_at: pago.created_at,
          cajero: det.cajero || '',
          recibos: det.recibos || [],
          // Condominio: a quién va la factura (al condominio o a cada dueño) y si es parte de un pago repartido
          condominio: infoCondo(pago, det),
          // Clasificación del documento
          documento: docFinal,
          subtipo: clasif.subtipo,
          mixto: clasif.mixto,
          inmuebles: clasif.inmuebles,
          mesesServicio: clasif.mesesServicio,
          tieneMulta: clasif.tieneMulta,
          // Factura fiscal
          facturaEmitida: emitida,
          facturaUrl: fd?.url || fd?.raw_response?.resultado?.urlConsulta || retRow?.factura_url || null,
          numeroControl: fd?.numero_control || null,
          numeroDocumento: fd?.numero_documento || null,
          fechaEmision: fd?.fecha_emision || (det.fecha_emision_override ? `${det.fecha_emision_override}T12:00:00-04:00` : null),
          fechaAsignacion: fd?.fecha_asignacion || fd?.fecha_emision || (det.fecha_asignacion_override ? `${det.fecha_asignacion_override}T12:00:00-04:00` : (det.fecha_emision_override ? `${det.fecha_emision_override}T12:00:00-04:00` : null)),
          fechaEmisionOverride: det.fecha_emision_override || null,
          fechaAsignacionOverride: det.fecha_asignacion_override || det.fecha_emision_override || null,
          error: det.factura_digital_error || null,
          facturaAnulada: Boolean(
            ((fd?.anulada || pago.estado === 'Anulado' || det?.estado === 'Anulado' || fd?.rechazada || pago.estado === 'Rechazado') &&
              Boolean(fd?.numero_documento || fd?.numero_control || emitida || fd?.nota_credito)) ||
            fd?.nota_credito
          ),
          notaCredito: fd?.nota_credito || null,
          notaCreditoUrl: fd?.nota_credito?.url || null,
          notaCreditoControl: fd?.nota_credito?.numero_control || 
            fd?.nota_credito?.numero_documento || 
            ((fd?.anulada && Boolean(fd?.numero_documento || fd?.numero_control || emitida)) ? 'ANULADA' : ((fd?.rechazada || pago.estado === 'Rechazado') && (fd?.numero_documento || fd?.numero_control || emitida) ? 'ANULADA EN CAJA' : ((pago.estado === 'Anulado' && Boolean(fd?.numero_documento || fd?.numero_control || emitida)) ? 'ANULADA' : null))),
          // Agente de retención: la factura se envía solo al aprobar su comprobante
          conRetencion: tieneRetencion,
          esRetencion: tieneRetencion,
          montoRetencion: montoRetNum,
          referenciaRetencion: vincRet?.referencia || det.referencia_retencion || null,
          pagoRetencionId: vincRet?.id || det.pago_retencion_id || null,
          modulo: pago.modulo || (infoCondo(pago, det) ? 'condominios' : 'caja'),
          grupo_pago: pago.grupo_pago || null,
          direccion: (() => {
            const limpiarDir = (d: any, opts?: any) => sanitizarDireccionFiscal(String(d || ''), opts);
            const isValidDir = (d: any) => {
              const s = limpiarDir(d);
              return s.length > 3 && s !== '0 0' && s !== '0' && s.toUpperCase() !== 'N/A';
            };
            const dirCondoOficial = condo?.direccion || condoRow?.direccion || (codCondoRaw ? inmMap.get(codCondoRaw)?.direccion : null);
            const dirCont = cont?.direccion;
            const inmPrim = esModoCondominio ? null : clasif.inmuebles.map(c => inmMap.get(c)).find((m: any) => isValidDir(m?.direccion));
            const dirInm = inmPrim?.direccion || null;
            const uNum = esModoCondominio ? null : (
              det?.condominio?.lineas?.[0]?.numero ||
              det?.condominio?.lineas?.[0]?.unidadNumero ||
              det?.condominio_hijos_pagados?.[0]?.numero ||
              inmPrim?.numero_local ||
              null
            );
            const nombreCondo = condo?.nombre || condoRow?.nombre || det?.condominio?.nombre || null;
            const optsDir = { unidadNumero: uNum, nombreCondo, parentDir: dirCondoOficial };
            const dirRec = Array.isArray(det.recibo_caja) ? det.recibo_caja[0]?.domicilioFiscal : '';
            if (esModoCondominio && isValidDir(dirCondoOficial)) {
              return limpiarDir(dirCondoOficial, { unidadNumero: null, nombreCondo, parentDir: dirCondoOficial });
            }
            const rawCand = (esModoCondominio
              ? (dirCondoOficial || dirRec || dirCont || det.direccion)
              : (det.direccion || dirInm || dirRec || dirCont)) || '';
            return limpiarDir(rawCand, optsDir);
          })(),
          detalles: det,
          retencionEstado: stRet,
          retencionDatosEnviados: fd?.retencion?.datos_enviados_at || null,
          retencionId: fd?.retencion?.retencion_id || retRow?.id || null,
          retencionPlanillaUrl: retRow?.planilla_url || null,
          retencionNumeroPlanilla: retRow?.numero_planilla || null,
          retencionFechaPlanilla: retRow?.fecha_planilla || null,
          retencionMontoPlanilla: retRow?.monto_retenido || fd?.retencion?.retenido || montoRetNum,
          retencionMotivoRechazo: retRow?.motivo_rechazo || fd?.retencion?.motivo_rechazo || null,
          // Recibo por correo
          reciboEnviado,
          reciboEnviadoFecha: rd?.fecha || null,
          reciboCorreo: rd?.correo || null,
          reciboError: rd?.error || null,
          // Recibo impreso en Caja (original guardado en el pago; si no, se reconstruye al descargar)
          reciboCajaGuardado: Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0,
          // Procesado = factura emitida (facturas) o recibo enviado (recibos)
          procesado: docFinal === 'factura' ? Boolean(emitida || fd?.nota_credito) : reciboEnviado,
          conciliado: pago.estado === 'Aprobado',
        };
      });

      // ─── AGRUPACIÓN Y DESDUPLICACIÓN DE MÚLTIPLES TRANSFERENCIAS PARA EL MISMO RECIBO ───
      // Si un contribuyente pagó una misma factura/recibo con 2 o más transferencias,
      // se unifican en un único ítem de emisión para evitar facturas duplicadas en el SENIAT.
      // IMPORTANTE: Solo se deben agrupar pagos APROBADOS o activos. Los pagos rechazados, anulados o reversados
      // NO deben agrupar ni absorber pagos aprobados, ni ser elegidos como pago principal.
      const dedupedItems: any[] = [];
      const processedIds = new Set<string>();

      for (const item of items) {
        if (processedIds.has(item.id)) continue;

        const pNormId = normId(item.identidad);
        const itemRecibos = Array.isArray(item.recibos) ? item.recibos.filter(Boolean) : [];
        const itemEsAprobado = item.estado === 'Aprobado';

        if (!item.facturaEmitida && itemRecibos.length > 0 && itemEsAprobado && item.grupo_pago) {
          // Encontrar transferencias complementarias del MISMO grupo_pago explícito QUE TAMBIÉN ESTÉN APROBADAS.
          // Nunca agrupar ni mutar en BD pagos independientes sin grupo_pago aunque compartan código RECIB-HIST-*-M1.
          const hermanos = items.filter(other => 
            other.id !== item.id &&
            !processedIds.has(other.id) &&
            !other.facturaEmitida &&
            other.estado === 'Aprobado' &&
            other.grupo_pago === item.grupo_pago &&
            normId(other.identidad) === pNormId
          );

          if (hermanos.length > 0) {
            // Ordenar para dejar el pago aprobado con mayor monto como principal
            const todosLosPagos = [item, ...hermanos].sort((a, b) => (b.montoPagado || 0) - (a.montoPagado || 0));
            const principal = todosLosPagos[0];
            const secundarios = todosLosPagos.slice(1);

            const totalTransferido = todosLosPagos.reduce((acc, p) => acc + (parseFloat(String(p.montoPagado || 0)) || 0), 0);
            const refs = Array.from(new Set(todosLosPagos.map(p => p.referencia).filter(Boolean))).join(', ');
            const secIds = secundarios.map(s => s.id);

            principal.montoPagado = Math.round(totalTransferido * 100) / 100;
            principal.referencia = refs;
            (principal as any).pagosVinculadosIds = secIds;
            (principal as any).pagosVinculadosDetalles = todosLosPagos.map(p => ({
              id: p.id,
              referencia: p.referencia,
              monto: p.montoPagado,
              banco: p.banco
            }));

            for (const sec of secundarios) {
              processedIds.add(sec.id);
            }

            processedIds.add(principal.id);
            dedupedItems.push(principal);
            continue;
          }
        }

        const previas = Array.isArray(item.detalles?.facturas_digitales_previas) ? item.detalles.facturas_digitales_previas : [];
        const tieneFacturaActual = Boolean(
          item.facturaEmitida ||
          item.numeroControl ||
          item.numeroDocumento ||
          item.detalles?.factura_digital?.anulada ||
          item.detalles?.factura_digital?.nota_credito
        );
        const omitirItemVacioPorPrevia = previas.length > 0 && !tieneFacturaActual && (item.estado === 'Rechazado' || item.estado === 'Anulado');

        processedIds.add(item.id);
        if (!omitirItemVacioPorPrevia) {
          dedupedItems.push(item);
        }

        // Si el pago contiene facturas digitales previas (emitidas y luego anuladas con o sin NC),
        // se agregan como ítems independientes para que aparezcan en la pestaña de Anuladas (NC)
        previas.forEach((prevFd: any, pIdx: number) => {
          if (!prevFd) return;
          if (String(prevFd.url || '').includes('democonsulta.thefactoryhka.com.ve')) return;
          const esPrevAnulada = true;
          const prevEmitida = Boolean(prevFd.emitida || prevFd.numero_documento || prevFd.numero_control);
          if (!prevEmitida && !prevFd.anulada && !prevFd.nota_credito) return;

          const prevNCControl = prevFd.nota_credito?.numero_control ||
            prevFd.nota_credito?.numero_documento ||
            'ANULADA / REEMPLAZADA';

          dedupedItems.push({
            ...item,
            id: `${item.id}_previa_${pIdx}`,
            pagoId: item.pagoId,
            esFacturaPrevia: true,
            referencia: `${item.referencia || 'N/A'} (Factura Previa #${prevFd.numero_control || prevFd.numero_documento || pIdx + 1})`,
            facturaEmitida: prevEmitida,
            facturaUrl: prevFd.url || null,
            numeroControl: prevFd.numero_control || null,
            numeroDocumento: prevFd.numero_documento || null,
            fechaEmision: prevFd.fecha_emision || item.fechaEmision,
            facturaAnulada: esPrevAnulada,
            notaCredito: prevFd.nota_credito || null,
            notaCreditoUrl: prevFd.nota_credito?.url || null,
            notaCreditoControl: prevNCControl,
            procesado: true,
          });
        });
      }

      // Aplicar filtros
      let filtered = dedupedItems;
      if (documentoFiltro === 'factura' || documentoFiltro === 'recibo') {
        filtered = filtered.filter(i => i.documento === documentoFiltro);
      }
      if (filter === 'pendientes') {
        filtered = filtered.filter(i => !i.procesado && !i.facturaAnulada && i.estado === 'Aprobado');
      } else if (filter === 'emitidas') {
        filtered = filtered.filter(i => i.procesado && !i.facturaAnulada && i.estado !== 'Anulado' && i.estado !== 'Rechazado');
      } else if (filter === 'anuladas') {
        filtered = filtered.filter(i => i.facturaAnulada || i.notaCredito || i.estado === 'Anulado' || i.estado === 'Rechazado');
      } else if (filter === 'retenciones' || filter === 'retenciones_pendientes') {
        filtered = filtered.filter(i => i.conRetencion && (i.retencionEstado === 'planilla_recibida' || i.retencionEstado === 'esperando_planilla' || (!i.facturaEmitida && i.conRetencion)));
      }
    if (moduloFiltro === 'Contribuyentes') filtered = filtered.filter(i => !i.condominio);
    else if (moduloFiltro === 'Condominios') filtered = filtered.filter(i => !!i.condominio);
    else if (moduloFiltro === 'Condominios residenciales') filtered = filtered.filter(i => i.condominio?.residencial === true);
    else if (moduloFiltro === 'Condominios comerciales') filtered = filtered.filter(i => i.condominio?.residencial === false);

    if (query) {
      const qLower = query.toLowerCase();
      const qNorm = normId(query);
      const normInmIdents = new Set(Array.from(queryInmIdents).map(id => normId(id)));
      filtered = filtered.filter(i => {
        const iIdNorm = normId(i.identidad);
        return (
          i.identidad.toLowerCase().includes(qLower) ||
          (qNorm.length >= 3 && iIdNorm.includes(qNorm)) ||
          i.contribuyente.toLowerCase().includes(qLower) ||
          (i.condominio?.nombre && String(i.condominio.nombre).toLowerCase().includes(qLower)) ||
          (i.condominio?.codigo && String(i.condominio.codigo).toLowerCase().includes(qLower)) ||
          i.referencia.toLowerCase().includes(qLower) ||
          (i.numeroControl && i.numeroControl.toLowerCase().includes(qLower)) ||
          (i.numeroDocumento && String(i.numeroDocumento).toLowerCase().includes(qLower)) ||
          (i.inmuebles && i.inmuebles.some((inm: string) => inm.toLowerCase().includes(qLower) || queryRelatedInmuebleCodes.has(inm.toUpperCase()))) ||
          (i.recibos && i.recibos.some((r: string) => r.toLowerCase().includes(qLower))) ||
          (queryInmIdents.size > 0 && (queryInmIdents.has(i.identidad) || normInmIdents.has(iIdNorm)))
        );
      });
    }

    return NextResponse.json({
      success: true,
      total: filtered.length,
      items: filtered
    });

  } catch (err: any) {
    console.error('Error al listar pagos para facturación digital:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
