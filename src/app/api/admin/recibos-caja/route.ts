import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { extraerCodigoInmueble, parseDetalles } from '@/lib/documentoPago';
import { isResidencialInm } from '@/lib/calculos';

export const dynamic = 'force-dynamic';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const formaPagoTexto = (tipo: string) => {
  const t = String(tipo || '');
  if (t === 'TMD') return 'TMD (TARJETA CRÉDITO MASTER)';
  if (t === 'TVD') return 'TVD (TARJETA CRÉDITO VISA)';
  if (t === 'Credito') return 'TARJETA DE CRÉDITO';
  if (t === 'Debito') return 'PUNTO DE VENTA (DÉBITO)';
  if (/transfer|pago m[oó]vil/i.test(t)) return 'TRANSFERENCIA';
  return t || 'PUNTO DE VENTA';
};

/**
 * Recibo de Caja de un pago, para descargar/reimprimir desde Facturación Electrónica.
 *  - Si Caja guardó el recibo al cobrar (detalles.recibo_caja) se devuelve tal cual (original).
 *  - Si es un pago anterior a esa mejora, se reconstruye con los datos guardados en el pago.
 */
export async function GET(request: Request) {
  try {
    const pagoId = new URL(request.url).searchParams.get('pagoId') || '';
    if (!pagoId) return NextResponse.json({ error: 'pagoId requerido' }, { status: 400 });

    const { data: pago, error } = await supabase.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
    if (error) throw error;
    if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });

    const det = parseDetalles(pago.detalles);
    if (Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0) {
      return NextResponse.json({ success: true, original: true, recibos: det.recibo_caja });
    }

    // ── Reconstrucción ──
    const { data: cont } = await supabase.from('contribuyentes').select('nombre, direccion').eq('identidad', pago.identidad).maybeSingle();
    const refs: string[] = Array.isArray(det.recibos) ? det.recibos : [];
    const montos: Record<string, any> = det.montos && typeof det.montos === 'object' ? det.montos : {};
    const codigos = [...new Set(refs.map(r => extraerCodigoInmueble(r)).filter(Boolean))] as string[];
    const { data: inms } = codigos.length
      ? await supabase.from('inmuebles').select('inmueble, contribuyente, direccion, tipo, clasificacion, actividad_principal').in('inmueble', codigos)
      : { data: [] as any[] };
    const inmMap = new Map((inms || []).map((i: any) => [i.inmueble, i]));

    const monto = r2(parseFloat(String(pago.monto || 0)));
    const conceptos: { descripcion: string; precioUnit: number; total: number }[] = [];
    for (const ref of refs) {
      const m = r2(parseFloat(String(montos[ref] ?? 0)));
      if (m <= 0) continue;
      const cod = extraerCodigoInmueble(ref) || '';
      const mes = ref.match(/-M(\d+)$/i)?.[1];
      const desc = /^MULTA-/i.test(ref)
        ? `Multa por mora - Aseo Urbano (${cod})`
        : /^RECIB-HIST-/i.test(ref)
          ? `Servicio de Aseo Urbano - Mes ${mes || ''} de deuda (${cod})`
          : `Servicio de Aseo Urbano (${ref})`;
      conceptos.push({ descripcion: desc, precioUnit: m, total: m });
    }
    const suma = r2(conceptos.reduce((s, c) => s + c.total, 0));
    const cuadra = conceptos.length > 0 && Math.abs(suma - monto) <= 0.05;
    const lineas = cuadra ? conceptos : [{ descripcion: 'Servicio de Aseo Urbano y Domiciliario', precioUnit: monto, total: monto }];

    const inmPrincipal: any = codigos.map(c => inmMap.get(c)).find(Boolean);
    const esComercial = (inms || []).some((i: any) => !isResidencialInm(i));
    const refNum = String(pago.referencia || pago.id).replace(/\D/g, '').slice(-7).padStart(7, '0');
    const esAbono = !!det.es_abono;

    const recibo = {
      reciboNo: refNum,
      controlWeb: `WEB-${refNum}`,
      fechaEmision: String(det.fecha_transaccion || pago.created_at || '').slice(0, 10),
      codContribuyente: pago.identidad,
      razonSocial: det.contribuyente || cont?.nombre || inmPrincipal?.contribuyente || '',
      domicilioFiscal: String(inmPrincipal?.direccion || cont?.direccion || 'NAGUANAGUA, CARABOBO').toUpperCase(),
      rifCi: pago.identidad,
      caja: det.cajero || '',
      conceptos: lineas,
      subTotal: monto,
      exento: monto,
      iva: 0,
      total: monto,
      formaPago: formaPagoTexto(pago.tipo),
      banco: pago.banco || pago.tipo || '',
      referencia: pago.referencia || 'N/A',
      tasaBcv: parseFloat(String(det.tasa_bcv_aplicada || det.tasa_bcv || 0)) || undefined,
      tipoContribuyente: esComercial ? 'Comercial' : 'Residencial',
      ...(esAbono ? { esAbono: true, montoCancelado: monto } : {}),
    };

    return NextResponse.json({ success: true, original: false, recibos: [recibo] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
