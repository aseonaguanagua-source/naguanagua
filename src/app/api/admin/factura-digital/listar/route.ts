import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { clasificarPago, extraerCodigoInmueble, parseDetalles, rangoDiaCaracas } from '@/lib/documentoPago';

export const dynamic = 'force-dynamic';

// Normalizador de identidades (sin guiones ni símbolos)
const normId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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

    // 1.1) Detectar abonos parciales previos que fueron absorbidos por un pago posterior que liquidó el mismo recibo o incorporó saldo_favor_bs
    const abonosAbsorbidosIds = new Set<string>();
    const abonosInfoPorPagoPrincipal = new Map<string, { montoTotal: number; referencias: string[]; formasPago: any[] }>();

    (rawPagos || []).forEach(pPrincipal => {
      if (pPrincipal.tipo === 'Retencion de IVA') return;
      const dP = parseDetalles(pPrincipal.detalles);
      const saldoPrevio = parseFloat(String(dP?.deuda_previa?.[0]?.saldo_favor_bs || dP?.abono_previo_descontado || 0)) || 0;
      const recibosP = (dP?.recibos || []).map((r: any) => String(r).toUpperCase());

      (rawPagos || []).forEach(pAbono => {
        if (pAbono.id === pPrincipal.id || pAbono.tipo === 'Retencion de IVA') return;
        if (pAbono.estado !== 'Aprobado') return;
        if (String(pAbono.referencia || '').startsWith('RECH-')) return;
        if (normId(pAbono.identidad) !== normId(pPrincipal.identidad)) return;

        const dA = parseDetalles(pAbono.detalles);
        const yaEmitidoA = Boolean(dA?.factura_digital?.emitida || dA?.factura_digital?.numero_documento || dA?.factura_digital?.url);
        if (yaEmitidoA) return;

        const esAbonoA = dA?.es_abono === true || dA?.abono === true || pAbono.tipo === 'Abono' || dA?.pago_parcial === true;
        if (!esAbonoA) return;

        const montoSoloA = parseFloat(String(pAbono.monto || 0)) || 0;
        const recibosA = (dA?.recibos || []).map((r: any) => String(r).toUpperCase());
        const comparteRecibo = recibosP.length > 0 && recibosA.length > 0 && recibosP.some((r: string) => recibosA.includes(r));
        const coincideSaldo = saldoPrevio > 0 && Math.abs(saldoPrevio - montoSoloA) < 0.05;

        // Si el abono ocurrió antes o igual que el pago principal y comparte recibo o su monto fue abonado previamente
        if ((comparteRecibo || coincideSaldo) && new Date(pAbono.created_at) <= new Date(pPrincipal.created_at)) {
          abonosAbsorbidosIds.add(pAbono.id);
          const current = abonosInfoPorPagoPrincipal.get(pPrincipal.id) || { montoTotal: 0, referencias: [], formasPago: [] };
          if (!current.referencias.includes(pAbono.referencia)) {
            current.montoTotal += montoSoloA;
            if (pAbono.referencia) current.referencias.push(pAbono.referencia);
            if (Array.isArray(dA?.formasPago) && dA.formasPago.length > 0) {
              current.formasPago.push(...dA.formasPago);
            } else {
              current.formasPago.push({
                forma: '03',
                descripcion: `${pAbono.tipo || 'Transferencia'} ${pAbono.banco || ''} ${pAbono.referencia || ''}`.trim(),
                monto: montoSoloA,
                banco: pAbono.banco,
                referencia: pAbono.referencia
              });
            }
          }
          abonosInfoPorPagoPrincipal.set(pPrincipal.id, current);
        }
      });
    });

    const pagos = (rawPagos || []).filter(p => {
      if (p.tipo === 'Retencion de IVA') return false;
      const d = parseDetalles(p.detalles);

      // Si es un pago adicional / secundario vinculado a un pago principal (múltiples transferencias para una misma factura),
      // la factura electrónica SOLO se emite desde el pago principal y no debe salir duplicada.
      if (d?.es_pago_adicional === true || Boolean(d?.pago_principal_id)) return false;

      // Una factura solo se considera anulada fiscalmente si fue emitida (o tiene documento/control) y luego anulada/rechazada,
      // o si el pago fue marcado como 'Anulado' tras haber sido procesado.
      const teniaFactura = Boolean(
        d?.factura_digital?.emitida ||
        d?.factura_digital?.numero_documento ||
        d?.factura_digital?.numero_control
      );

      const esAnulada = (p.estado === 'Anulado' && teniaFactura) || 
        Boolean(d?.factura_digital?.anulada || d?.factura_digital?.nota_credito) ||
        (Boolean(d?.factura_digital?.rechazada || p.estado === 'Rechazado') && teniaFactura);

      // Si el pago fue rechazado, reversado o condonado en caja/conciliación y NUNCA se le emitió factura fiscal,
      // no tiene nada que hacer en Facturación Electrónica (ni como pendiente ni como emitida).
      if (['Rechazado', 'Reversado', 'Condonado'].includes(String(p?.estado || '')) && !teniaFactura) {
        return false;
      }

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
      if (Array.isArray(det.condominio?.lineas)) {
        det.condominio.lineas.forEach((l: any) => {
          if (l?.inmueble) codigos.add(String(l.inmueble).trim().toUpperCase());
        });
      }
    });
    const inmMap = new Map<string, any>();
    const listaCodigos = [...codigos];
    for (let i = 0; i < listaCodigos.length; i += 300) {
      const { data: inms } = await supabase
        .from('inmuebles')
        .select('inmueble, tipo, clasificacion, actividad_principal, direccion, correo_electronico, contribuyente, identidad, agente_retencion')
        .in('inmueble', listaCodigos.slice(i, i + 300));
      (inms || []).forEach((inm: any) => inmMap.set(inm.inmueble, inm));
    }

    const fallbackEmail = process.env.TFHKA_FALLBACK_EMAIL?.trim() || 'facturacion.comercial@globalgreenca.com';

    // Condominios (para reconocer pagos viejos de condominios por su RIF y correo actualizado)
    const { data: condosRows } = await supabase.from('condominios').select('codigo,identidad,nombre,tipo,agente_retencion,correo').limit(5000);
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
        agente_retencion: Boolean(c.agente_retencion ?? porRif?.agente_retencion),
        correo: porRif?.correo || c.correo || null,
        facturaA: det.modo === 'CONTRIBUYENTE' ? 'CONTRIBUYENTE' : 'CONDOMINIO',
        grupo: det.grupo_pago ? { id: det.grupo_pago.id, parte: det.grupo_pago.parte, partes: det.grupo_pago.partes, montoTotal: Number(det.grupo_pago.monto_total) || 0 } : null,
      };
    };

    // Mapear cada pago con sus detalles de factura digital
    const items = (pagos || []).map(pago => {
      const det = detallesPorPago.get(pago.id) || {};
      const condo = infoCondo(pago, det);
      const esCondo = pago.modulo === 'condominios' || det.modulo === 'condominios' || det.isCondominio || det.es_condominio;
      const esModoCondominio = det.modo === 'CONDOMINIO' || (!det.modo && esCondo);

      const cont = contsMap.get(pago.identidad) || contsMap.get(normId(pago.identidad));
      const fd = det.factura_digital || null;
      const rd = det.recibo_digital || null;
      const emitida = !!(fd && (fd.emitida || fd.url || fd.numero_control));
      const clasif = clasificarPago(det.recibos || [], inmMap, det);
      const correoInm = clasif.inmuebles.map(c => inmMap.get(c)?.correo_electronico).find((e: any) => e && String(e).includes('@'));
      
      // Si la factura va al CONDOMINIO centralizado, priorizar el correo oficial del condominio
      const rawEmail = (
        (esModoCondominio && (condo?.correo || det.correo)) ||
        cont?.email ||
        condo?.correo ||
        det.correo ||
        fd?.correo_utilizado ||
        correoInm ||
        ''
      ).trim();
      const esCorreoComodin = !rawEmail || rawEmail.length < 4 || rawEmail.toLowerCase() === fallbackEmail.toLowerCase();
      const correoFinal = esCorreoComodin ? fallbackEmail : rawEmail;
      const reciboEnviado = !!(rd && rd.enviado);

      // Rescatar nombre real del contribuyente evitando mostrar el RIF como nombre
      const condoMod = String(det.condominio?.modalidad || '').toUpperCase();
      const esModoContribuyente = det.modo === 'CONTRIBUYENTE';
      const esPagoPorLocal = Boolean(
        esCondo && !esModoCondominio && (
          esModoContribuyente ||
          condoMod === 'INDIVIDUAL'
        )
      );

      const codLocalInm = esPagoPorLocal ? (det.condominio?.lineas?.[0]?.inmueble || (det.cod_inmueble && !String(det.cod_inmueble).startsWith('CONDO-') ? det.cod_inmueble : null)) : null;
      const localProp = codLocalInm ? inmMap.get(codLocalInm) : null;

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

      let nombreResuelto = '';
      if (esPagoPorLocal) {
        if (nombreInm && !esPlaceholderNombre(nombreInm) && !nombreInm.toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = nombreInm;
        } else if (rcRazon && !rcRazon.toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = rcRazon;
        } else if (cont?.nombre && !esPlaceholderNombre(cont.nombre) && !cont.nombre.toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = cont.nombre;
        } else if (!esPlaceholderNombre(det.contribuyente) && !String(det.contribuyente).toUpperCase().includes('CONDOMINIO')) {
          nombreResuelto = det.contribuyente;
        } else {
          nombreResuelto = rcRazon || cont?.nombre || 'Contribuyente ' + pago.identidad;
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
          nombreResuelto = det.contribuyente || cont?.nombre || 'Contribuyente ' + pago.identidad;
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
          nombreResuelto = det.contribuyente || cont?.nombre || 'Contribuyente ' + pago.identidad;
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

      if (tieneRetencion && montoRetNum === 0 && montoFacturaReal > 0) {
        montoRetNum = Math.round((montoFacturaReal - (montoFacturaReal / 1.16)) * 0.75 * 100) / 100;
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
      const montoPagadoEfectivo = parseFloat(pago.monto || '0') + (infoAbonos?.montoTotal || 0);
      const refFinal = infoAbonos && infoAbonos.referencias.length > 0
        ? `${pago.referencia || 'N/A'} (+ ${infoAbonos.referencias.join(', ')})`
        : (pago.referencia || 'N/A');

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
          facturaUrl: fd?.url || null,
          numeroControl: fd?.numero_control || null,
          numeroDocumento: fd?.numero_documento || null,
          fechaEmision: fd?.fecha_emision || null,
          error: det.factura_digital_error || null,
          facturaAnulada: Boolean(
            fd?.anulada || 
            fd?.nota_credito ||
            pago.estado === 'Anulado' ||
            // Si fue rechazada la factura pero había sido emitida
            (Boolean(fd?.rechazada || pago.estado === 'Rechazado') && Boolean(fd?.numero_documento || fd?.numero_control || emitida))
          ),
          notaCredito: fd?.nota_credito || null,
          notaCreditoUrl: fd?.nota_credito?.url || null,
          notaCreditoControl: fd?.nota_credito?.numero_control || 
            fd?.nota_credito?.numero_documento || 
            (fd?.anulada ? 'ANULADA' : ((fd?.rechazada || pago.estado === 'Rechazado') && (fd?.numero_documento || fd?.numero_control || emitida) ? 'ANULADA EN CAJA' : null)),
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

        if (!item.facturaEmitida && itemRecibos.length > 0 && itemEsAprobado) {
          // Encontrar duplicados / transferencias complementarias del mismo recibo y contribuyente QUE TAMBIÉN ESTÉN APROBADAS
          const hermanos = items.filter(other => 
            other.id !== item.id &&
            !processedIds.has(other.id) &&
            !other.facturaEmitida &&
            other.estado === 'Aprobado' &&
            normId(other.identidad) === pNormId &&
            Array.isArray(other.recibos) &&
            other.recibos.some((r: string) => itemRecibos.includes(r))
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

            // Marcar secundarios en la base de datos para que queden vinculados permanentemente
            for (const sec of secundarios) {
              processedIds.add(sec.id);
              try {
                await supabase.from('pagos_reportados').update({
                  detalles: {
                    ...(sec.detalles || {}),
                    pago_principal_id: principal.id,
                    es_pago_adicional: true,
                    vinculado_a_referencia: principal.referencia
                  }
                }).eq('id', sec.id);
              } catch(e) {}
            }

            processedIds.add(principal.id);
            dedupedItems.push(principal);
            continue;
          }
        }

        processedIds.add(item.id);
        dedupedItems.push(item);
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
