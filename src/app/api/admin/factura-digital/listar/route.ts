import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim().toLowerCase();
    const filter = searchParams.get('filter') || 'todos'; // 'todos' | 'pendientes' | 'emitidas'

    // Obtener los pagos reportados más recientes
    const { data: pagos, error: pagosErr } = await supabase
      .from('pagos_reportados')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

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

    // Mapear cada pago con sus detalles de factura digital
    const items = (pagos || []).map(pago => {
      let det = pago.detalles;
      if (typeof det === 'string') {
        try { det = JSON.parse(det); } catch (e) { det = {}; }
      }
      det = det || {};

      const cont = contsMap.get(pago.identidad);
      const fd = det.factura_digital || null;
      const emitida = !!(fd && (fd.emitida || fd.url || fd.numero_control));
      const fallbackEmail = process.env.TFHKA_FALLBACK_EMAIL?.trim() || 'facturacion.naguanagua@gmail.com';
      const rawEmail = (cont?.email || det.correo || fd?.correo_utilizado || '').trim();
      const esCorreoComodin = !rawEmail || rawEmail.length < 4 || rawEmail.toLowerCase() === fallbackEmail.toLowerCase();
      const correoFinal = esCorreoComodin ? fallbackEmail : rawEmail;

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
        recibos: det.recibos || [],
        facturaEmitida: emitida,
        facturaUrl: fd?.url || null,
        numeroControl: fd?.numero_control || null,
        numeroDocumento: fd?.numero_documento || null,
        fechaEmision: fd?.fecha_emision || null,
        error: det.factura_digital_error || null
      };
    });

    // Aplicar filtros
    let filtered = items;
    if (filter === 'pendientes') {
      filtered = filtered.filter(i => !i.facturaEmitida);
    } else if (filter === 'emitidas') {
      filtered = filtered.filter(i => i.facturaEmitida);
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
