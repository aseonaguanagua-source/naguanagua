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

    // Obtener los pagos reportados (de un día concreto, o los más recientes)
    let pagosQuery = supabase
      .from('pagos_reportados')
      .select('*')
      .order('created_at', { ascending: false });
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const { desde, hasta } = rangoDiaCaracas(fecha);
      pagosQuery = pagosQuery.gte('created_at', desde).lt('created_at', hasta).limit(2000);
    } else {
      pagosQuery = pagosQuery.limit(300);
    }
    const { data: pagos, error: pagosErr } = await pagosQuery;

    if (pagosErr) {
      throw pagosErr;
    }

    // Normalizador de identidades (sin guiones ni símbolos)
    const normId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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
    (pagos || []).forEach(p => {
      const det = parseDetalles(p.detalles);
      detallesPorPago.set(p.id, det);
      (det.recibos || []).forEach((r: string) => { const c = extraerCodigoInmueble(r); if (c) codigos.add(c); });
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

      let nombreResuelto = '';
      if (!esPlaceholderNombre(det.contribuyente)) {
        nombreResuelto = det.contribuyente;
      } else if (cont?.nombre && !esPlaceholderNombre(cont.nombre)) {
        nombreResuelto = cont.nombre;
      } else if (nombreInm) {
        nombreResuelto = nombreInm;
      } else if (condo?.nombre && !esPlaceholderNombre(condo.nombre)) {
        nombreResuelto = condo.nombre;
      } else {
        nombreResuelto = det.contribuyente || cont?.nombre || 'Contribuyente ' + pago.identidad;
      }

      return {
        id: pago.id,
        pagoId: pago.id,
        identidad: pago.identidad,
        contribuyente: nombreResuelto,
        correo: correoFinal,
        rawCorreo: rawEmail,
        esCorreoComodin,
        requiereActualizacionCorreo: esCorreoComodin,
        monto: parseFloat(pago.monto || '0'),
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
        documento: clasif.documento,
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
        facturaAnulada: !!fd?.anulada,
        notaCreditoUrl: fd?.nota_credito?.url || null,
        notaCreditoControl: fd?.nota_credito?.numero_control || null,
        // Agente de retención: la factura se envía solo al aprobar su comprobante
        conRetencion: (parseFloat(String(det.monto_retencion_iva || 0)) || 0) > 0,
        retencionEstado: fd?.retencion?.estado || null,
        retencionDatosEnviados: fd?.retencion?.datos_enviados_at || null,
        // Recibo por correo
        reciboEnviado,
        reciboEnviadoFecha: rd?.fecha || null,
        reciboCorreo: rd?.correo || null,
        reciboError: rd?.error || null,
        // Recibo impreso en Caja (original guardado en el pago; si no, se reconstruye al descargar)
        reciboCajaGuardado: Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0,
        // Procesado = factura emitida (facturas) o recibo enviado (recibos)
        procesado: clasif.documento === 'factura' ? emitida : reciboEnviado,
      };
    });

    // Aplicar filtros
    let filtered = items;
    if (documentoFiltro === 'factura' || documentoFiltro === 'recibo') {
      filtered = filtered.filter(i => i.documento === documentoFiltro);
    }
    if (filter === 'pendientes') {
      filtered = filtered.filter(i => !i.procesado);
    } else if (filter === 'emitidas') {
      filtered = filtered.filter(i => i.procesado);
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
