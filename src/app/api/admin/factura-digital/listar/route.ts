import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { clasificarPago, extraerCodigoInmueble, parseDetalles, rangoDiaCaracas } from '@/lib/documentoPago';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim().toLowerCase();
    const filter = searchParams.get('filter') || 'todos'; // 'todos' | 'pendientes' | 'emitidas'
    const documentoFiltro = searchParams.get('documento') || ''; // '' | 'factura' | 'recibo'
    const moduloFiltro = searchParams.get('modulo') || 'Todos'; // Todos | Contribuyentes | Condominios | Condominios residenciales | Condominios comerciales
    const fecha = (searchParams.get('fecha') || '').trim(); // YYYY-MM-DD (hora Venezuela)

    // Si hay un término de búsqueda (cédula, referencia, código de inmueble, etc.),
    // buscamos directamente en la base de datos sin restringir por fecha del día.
    let queryInmIdents: string[] = [];
    if (query) {
      const { data: matchedInms } = await supabase
        .from('inmuebles')
        .select('identidad')
        .ilike('inmueble', `%${query}%`)
        .limit(10);
      if (matchedInms) {
        queryInmIdents = matchedInms.map(i => i.identidad).filter(Boolean);
      }
    }

    // Obtener los pagos reportados (de un día concreto, por búsqueda de término, o los más recientes)
    let pagosQuery = supabase
      .from('pagos_reportados')
      .select('*')
      .order('created_at', { ascending: false });

    if (query) {
      // Al buscar por RIF, referencia o código, NO excluir Rechazado/Anulado para permitir ver el historial y facturas anuladas
      const orParts = [
        `identidad.ilike.%${query}%`,
        `referencia.ilike.%${query}%`
      ];
      queryInmIdents.forEach(id => orParts.push(`identidad.eq.${id}`));
      pagosQuery = pagosQuery.or(orParts.join(',')).limit(500);
    } else {
      // En vista regular sin búsqueda, excluir reversados o condonados automáticos
      pagosQuery = pagosQuery.not('estado', 'in', '(Reversado,Condonado)');
      if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const { desde, hasta } = rangoDiaCaracas(fecha);
        pagosQuery = pagosQuery.gte('created_at', desde).lt('created_at', hasta).limit(2000);
      } else {
        pagosQuery = pagosQuery.limit(500);
      }
    }
    const { data: rawPagos, error: pagosErr } = await pagosQuery;

    if (pagosErr) {
      throw pagosErr;
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

    const pagos = (rawPagos || []).filter(p => {
      if (p.tipo === 'Retencion de IVA') return false;
      const d = parseDetalles(p.detalles);

      // Si es un pago adicional / secundario vinculado a un pago principal (múltiples transferencias para una misma factura),
      // la factura electrónica SOLO se emite desde el pago principal y no debe salir duplicada.
      if (d?.es_pago_adicional === true || Boolean(d?.pago_principal_id)) return false;

      const esAnulada = p.estado === 'Anulado' || 
        Boolean(d?.factura_digital?.anulada || d?.factura_digital?.nota_credito || d?.factura_digital?.rechazada) ||
        (p.estado === 'Rechazado' && (String(p.referencia || '').startsWith('RECH-') || Boolean(d?.recibo_caja) || Boolean(d?.factura_digital)));

      if (['Rechazado', 'Reversado', 'Condonado'].includes(String(p?.estado || '')) && !esAnulada && !query) return false;

      // Si ya tiene factura digital emitida o anulada, SIEMPRE debe mostrarse en facturación electrónica
      const yaEmitidaOAnulada = Boolean(
        d?.factura_digital?.emitida ||
        d?.factura_digital?.numero_documento ||
        d?.factura_digital?.url ||
        esAnulada
      );
      if (yaEmitidaOAnulada) {
        return true;
      }

      // REGLA: Los abonos o pagos parciales ordinarios que no han completado el pago total del mes no deben salir para emisión
      if (
        d?.es_abono === true ||
        d?.abono === true ||
        p.tipo === 'Abono' ||
        d?.pago_parcial === true ||
        (d?.monto_pendiente !== undefined && parseFloat(String(d.monto_pendiente)) > 0.05)
      ) {
        return false;
      }

      // Si hay un término de búsqueda específico, mostrarlo para permitir auditar o emitir
      if (query) {
        return true;
      }

      // Si es un pago con retención de agente, debe salir para gestión de retención
      if (d?.es_retencion === true || d?.conRetencion === true || Boolean(d?.pago_retencion_id)) {
        return true;
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

    // Normalizador de identidades (sin guiones ni símbolos)
    const normId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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
        .select('identidad, nombre, email, telefono')
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
    });
    const inmMap = new Map<string, any>();
    const listaCodigos = [...codigos];
    for (let i = 0; i < listaCodigos.length; i += 300) {
      const { data: inms } = await supabase
        .from('inmuebles')
        .select('inmueble, tipo, clasificacion, actividad_principal, direccion, correo_electronico, contribuyente, identidad')
        .in('inmueble', listaCodigos.slice(i, i + 300));
      (inms || []).forEach((inm: any) => inmMap.set(inm.inmueble, inm));
    }

    const fallbackEmail = process.env.TFHKA_FALLBACK_EMAIL?.trim() || 'facturacion.comercial@globalgreenca.com';

    // Condominios (para reconocer pagos viejos de condominios por su RIF)
    const { data: condosRows } = await supabase.from('condominios').select('codigo,identidad,nombre,tipo').limit(5000);
    const condoPorRif = new Map<string, any>();
    (condosRows || []).forEach((c: any) => { if (c.identidad) condoPorRif.set(normId(c.identidad), c); });
    const infoCondo = (pago: any, det: any) => {
      const porRif = condoPorRif.get(normId(pago.identidad));
      const esModulo = pago.modulo === 'condominios' || det.modulo === 'condominios';
      if (!esModulo && det.isCondominio !== true && det.es_condominio !== true && !porRif) return null;
      const c = det.condominio || {};
      const tipo = c.tipo || porRif?.tipo || null;
      return {
        codigo: c.codigo || porRif?.codigo || null, nombre: c.nombre || porRif?.nombre || det.contribuyente || 'Condominio', tipo,
        residencial: tipo ? String(tipo).toUpperCase() === 'RESIDENCIAL' : null,
        facturaA: det.modo === 'CONTRIBUYENTE' ? 'CONTRIBUYENTE' : 'CONDOMINIO',
        grupo: det.grupo_pago ? { id: det.grupo_pago.id, parte: det.grupo_pago.parte, partes: det.grupo_pago.partes, montoTotal: Number(det.grupo_pago.monto_total) || 0 } : null,
      };
    };

    // Mapear cada pago con sus detalles de factura digital
    const items = (pagos || []).map(pago => {
      const det = detallesPorPago.get(pago.id) || {};

      const cont = contsMap.get(pago.identidad) || contsMap.get(normId(pago.identidad));
      const fd = det.factura_digital || null;
      const rd = det.recibo_digital || null;
      const emitida = !!(fd && (fd.emitida || fd.url || fd.numero_control));
      const clasif = clasificarPago(det.recibos || [], inmMap, det);
      const correoInm = clasif.inmuebles.map(c => inmMap.get(c)?.correo_electronico).find((e: any) => e && String(e).includes('@'));
      const rawEmail = (cont?.email || det.correo || fd?.correo_utilizado || correoInm || '').trim();
      const esCorreoComodin = !rawEmail || rawEmail.length < 4 || rawEmail.toLowerCase() === fallbackEmail.toLowerCase();
      const correoFinal = esCorreoComodin ? fallbackEmail : rawEmail;
      const reciboEnviado = !!(rd && rd.enviado);

      // Rescatar nombre real del contribuyente evitando mostrar el RIF como nombre
      const condo = infoCondo(pago, det);
      let nombreInm = '';
      for (const r of (det.recibos || [])) {
        const c = extraerCodigoInmueble(r);
        if (c && inmMap.get(c)?.contribuyente) {
          const cand = String(inmMap.get(c).contribuyente).trim();
          if (!esPlaceholderNombre(cand)) {
            nombreInm = cand;
            break;
          }
        }
      }
      if (!nombreInm && det.codigo_inmueble && inmMap.get(det.codigo_inmueble)?.contribuyente) {
        const cand = String(inmMap.get(det.codigo_inmueble).contribuyente).trim();
        if (!esPlaceholderNombre(cand)) nombreInm = cand;
      }
      if (!nombreInm && det.cod_inmueble && inmMap.get(det.cod_inmueble)?.contribuyente) {
        const cand = String(inmMap.get(det.cod_inmueble).contribuyente).trim();
        if (!esPlaceholderNombre(cand)) nombreInm = cand;
      }

      const rcRazon = det.recibo_caja?.[0]?.razonSocial && !esPlaceholderNombre(det.recibo_caja[0].razonSocial) ? String(det.recibo_caja[0].razonSocial).trim() : null;

      let nombreResuelto = '';
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
        nombreResuelto = det.contribuyente || cont?.nombre || 'Contribuyente ' + pago.identidad;
      }

      const vincRet = retencionPorPagoVinculado.get(String(pago.id));
      const montoRetGuardada = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || 0)) || 0;
      const montoRetNum = montoRetGuardada > 0 ? montoRetGuardada : (vincRet ? vincRet.monto : 0);
      const tieneRetencion = montoRetNum > 0 || !!det.es_retencion || !!det.agente_retencion || !!vincRet;

      // Si el pago tiene retención y se guardó saldo_favor igual a la retención, se limpia para no mostrarlo como Nota de Crédito
      const sFavorGuardado = parseFloat(String(det.saldo_a_favor_nuevo || det.monto_sobrante || det.saldo_favor || det.saldo_favor_generado || 0)) || 0;
      if (tieneRetencion && montoRetNum > 0 && Math.abs(sFavorGuardado - montoRetNum) < 0.05) {
        delete det.saldo_a_favor_nuevo;
        delete det.monto_sobrante;
        delete det.saldo_favor;
        delete det.saldo_favor_generado;
      }

      if (tieneRetencion) {
        det.conRetencion = true;
        det.es_retencion = true;
        det.agente_retencion = true;
        det.monto_retencion_iva = montoRetNum;
        det.retencion_iva = montoRetNum;
        det.porcentaje_retencion = 75;
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
        if (sf === 0 && det.monto_factura) {
          const mFactura = parseFloat(String(det.monto_factura)) || 0;
          const mPago = parseFloat(String(pago.monto || det.montoTotal || 0)) || 0;
          const dif = Math.round((mFactura - mPago - montoRetNum + (sFavorGuardado > 0 ? sFavorGuardado : 0)) * 100) / 100;
          if (dif > 0.05) sf = dif;
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
            rcTotal = rc.reduce((acc: number, r: any) => acc + (parseFloat(String(r.total || 0)) || 0), 0);
          }
        } catch(e) {}
      }

      if (det.monto_factura && parseFloat(det.monto_factura) > 0) {
        montoFacturaReal = parseFloat(det.monto_factura);
      } else if (rcTotal > 0) {
        const esNeto = tieneRetencion && montoRetNum > 0 && (
          (det.monto_neto_factura && Math.abs(rcTotal - parseFloat(det.monto_neto_factura)) < 1) ||
          (det.montoTotal && Math.abs(rcTotal - parseFloat(det.montoTotal)) < 1) ||
          (det.total_seleccionado && parseFloat(det.total_seleccionado) > rcTotal + 1)
        );
        montoFacturaReal = esNeto ? Math.round((rcTotal + montoRetNum) * 100) / 100 : rcTotal;
      } else if (tieneRetencion) {
        // Para retención: El monto fiscal de la factura es el valor BRUTO con IVA (antes de deducir retención)
        const montoNetoDet = parseFloat(String(det.monto_neto_factura || 0));
        const totalSel = parseFloat(String(det.total_seleccionado || 0));
        const deudaSis = parseFloat(String(det.deuda_total_sistema || 0));
        if (montoNetoDet > 0 && montoRetNum > 0) {
          montoFacturaReal = montoNetoDet + montoRetNum;
        } else if (totalSel > 0) {
          montoFacturaReal = totalSel;
        } else if (deudaSis > 0) {
          montoFacturaReal = deudaSis;
        } else if (montoRetNum > 0) {
          montoFacturaReal = Math.max(0, parseFloat(pago.monto || '0') - (sFavorGuardado > 0 ? sFavorGuardado : 0)) + montoRetNum + sfUsado;
        }
      } else if (det.monto_neto_factura && parseFloat(det.monto_neto_factura) > 0) {
        montoFacturaReal = parseFloat(det.monto_neto_factura);
      } else if (det.total_seleccionado && parseFloat(det.total_seleccionado) > 0) {
        montoFacturaReal = parseFloat(det.total_seleccionado);
      } else if (sFavorGuardado > 0 && montoFacturaReal > sFavorGuardado) {
        montoFacturaReal = montoFacturaReal - sFavorGuardado + sfUsado;
      } else {
        montoFacturaReal = montoFacturaReal + sfUsado;
      }
      montoFacturaReal = Math.round(montoFacturaReal * 100) / 100;

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

      return {
        id: pago.id,
        pagoId: pago.id,
          identidad: pago.identidad,
          contribuyente: nombreResuelto,
          correo: correoFinal,
          rawCorreo: rawEmail,
          esCorreoComodin,
          requiereActualizacionCorreo: esCorreoComodin,
          monto: montoFacturaReal,
          montoPagado: parseFloat(pago.monto || '0'),
          saldoAFavor: sFavorGuardado,
          saldoFavorUsado: sfUsado,
          banco: pago.banco || 'N/A',
          referencia: pago.referencia || 'N/A',
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
          facturaUrl: fd?.url || null,
          numeroControl: fd?.numero_control || null,
          numeroDocumento: fd?.numero_documento || null,
          fechaEmision: fd?.fecha_emision || null,
          error: det.factura_digital_error || null,
          facturaAnulada: Boolean(
            fd?.anulada || 
            fd?.rechazada || 
            pago.estado === 'Anulado' || 
            fd?.nota_credito ||
            (pago.estado === 'Rechazado' && (String(pago.referencia || '').startsWith('RECH-') || Boolean(det.recibo_caja)))
          ),
          notaCredito: fd?.nota_credito || null,
          notaCreditoUrl: fd?.nota_credito?.url || null,
          notaCreditoControl: fd?.nota_credito?.numero_control || 
            fd?.nota_credito?.numero_documento || 
            (fd?.anulada ? 'ANULADA' : (fd?.rechazada || pago.estado === 'Rechazado' || String(pago.referencia || '').startsWith('RECH-') ? 'ANULADA EN CAJA' : null)),
          // Agente de retención: la factura se envía solo al aprobar su comprobante
          conRetencion: tieneRetencion,
          esRetencion: tieneRetencion,
          montoRetencion: montoRetNum,
          referenciaRetencion: vincRet?.referencia || det.referencia_retencion || null,
          pagoRetencionId: vincRet?.id || det.pago_retencion_id || null,
          modulo: pago.modulo || (infoCondo(pago, det) ? 'condominios' : 'caja'),
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
          procesado: docFinal === 'factura' ? (emitida || Boolean(fd?.anulada)) : reciboEnviado,
          conciliado: pago.estado === 'Aprobado',
        };
      });

      // Aplicar filtros
      let filtered = items;
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
      filtered = filtered.filter(i => 
        i.identidad.toLowerCase().includes(query) ||
        i.contribuyente.toLowerCase().includes(query) ||
        i.referencia.toLowerCase().includes(query) ||
        (i.numeroControl && i.numeroControl.toLowerCase().includes(query)) ||
        (i.numeroDocumento && String(i.numeroDocumento).toLowerCase().includes(query)) ||
        (i.inmuebles && i.inmuebles.some((inm: string) => inm.toLowerCase().includes(query))) ||
        (i.recibos && i.recibos.some((r: string) => r.toLowerCase().includes(query)))
      );
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
