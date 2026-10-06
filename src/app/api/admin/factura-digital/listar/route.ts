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

    // Obtener identidades únicas para traer nombres de contribuyentes
    const identidades = Array.from(new Set((pagos || []).map(p => p.identidad).filter(Boolean)));
    
    const { data: conts } = await supabase
      .from('contribuyentes')
      .select('identidad, nombre, email, telefono')
      .in('identidad', identidades);

    const contsMap = new Map();
    (conts || []).forEach(c => contsMap.set(c.identidad, c));

    // Inmuebles referenciados en los recibos pagados (para clasificar factura vs recibo)
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
        .select('inmueble, tipo, clasificacion, actividad_principal, direccion, correo_electronico')
        .in('inmueble', listaCodigos.slice(i, i + 300));
      (inms || []).forEach((inm: any) => inmMap.set(inm.inmueble, inm));
    }

    const fallbackEmail = process.env.TFHKA_FALLBACK_EMAIL?.trim() || 'facturacion.comercial@globalgreenca.com';

    // Mapear cada pago con sus detalles de factura digital
    const items = (pagos || []).map(pago => {
      const det = detallesPorPago.get(pago.id) || {};

      const cont = contsMap.get(pago.identidad);
      const fd = det.factura_digital || null;
      const rd = det.recibo_digital || null;
      const emitida = !!(fd && (fd.emitida || fd.url || fd.numero_control));
      const clasif = clasificarPago(det.recibos || [], inmMap, det);
      const correoInm = clasif.inmuebles.map(c => inmMap.get(c)?.correo_electronico).find((e: any) => e && String(e).includes('@'));
      const rawEmail = (cont?.email || det.correo || fd?.correo_utilizado || correoInm || '').trim();
      const esCorreoComodin = !rawEmail || rawEmail.length < 4 || rawEmail.toLowerCase() === fallbackEmail.toLowerCase();
      const correoFinal = esCorreoComodin ? fallbackEmail : rawEmail;
      const reciboEnviado = !!(rd && rd.enviado);

      return {
        id: pago.id,
        pagoId: pago.id,
        identidad: pago.identidad,
        contribuyente: det.contribuyente || cont?.nombre || 'Contribuyente ' + pago.identidad,
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
        // Recibo por correo
        reciboEnviado,
        reciboEnviadoFecha: rd?.fecha || null,
        reciboCorreo: rd?.correo || null,
        reciboError: rd?.error || null,
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
