import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { extraerCodigoInmueble, parseDetalles } from '@/lib/documentoPago';
import { isResidencialInm } from '@/lib/calculos';
import { desglosarPago, COLS_INMUEBLE_DESGLOSE, LineaDesglose } from '@/lib/desglosePago';

/** Conceptos del recibo a partir del desglose por período (base, IVA, retención y multa de cada mes). */
function conceptosDeDesglose(lineas: LineaDesglose[]) {
  const out: { descripcion: string; precioUnit: number; total: number }[] = [];
  for (const l of lineas) {
    if (l.tipo === 'multa') { out.push({ descripcion: `Multa por mora - Aseo Urbano (${l.codigo})`, precioUnit: l.multa, total: l.multa }); continue; }
    if (l.tipo === 'otro') { out.push({ descripcion: `Servicio de Aseo Urbano (${l.periodo})`, precioUnit: l.total, total: l.total }); continue; }
    out.push({ descripcion: `Aseo Urbano ${l.periodo} - Base Imponible (${l.codigo})`, precioUnit: l.base, total: l.base });
    if (l.iva > 0) out.push({ descripcion: `Aseo Urbano ${l.periodo} - IVA (16%)`, precioUnit: l.iva, total: l.iva });
    if (l.retencion > 0) out.push({ descripcion: `Aseo Urbano ${l.periodo} - Retención IVA (75%)`, precioUnit: -l.retencion, total: -l.retencion });
    if (l.multa > 0) out.push({ descripcion: `Aseo Urbano ${l.periodo} - Multa (${l.esResidencial ? '10%' : '12%'})`, precioUnit: l.multa, total: l.multa });
  }
  return out;
}

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

    // Desglose real por período (incluye las multas pagadas)
    const refsAll: string[] = Array.isArray(det.recibos) ? det.recibos : [];
    const codsAll = [...new Set(refsAll.map(r => extraerCodigoInmueble(r)).filter(Boolean))] as string[];
    const { data: inmsDesg } = codsAll.length
      ? await supabase.from('inmuebles').select(COLS_INMUEBLE_DESGLOSE).in('inmueble', codsAll)
      : { data: [] as any[] };
    const desglose = desglosarPago(pago, new Map((inmsDesg || []).map((i: any) => [i.inmueble, i])));

    if (Array.isArray(det.recibo_caja) && det.recibo_caja.length > 0) {
      // Recibo original de Caja. Si quedó con un solo concepto genérico, se completa con el desglose por período.
      const recibos = det.recibo_caja.map((rc: any) => {
        const generico = Array.isArray(rc?.conceptos) && rc.conceptos.length === 1 && /Servicio de Aseo Urbano y Domiciliario|Abono/i.test(rc.conceptos[0]?.descripcion || '');
        if (det.recibo_caja.length === 1 && generico && desglose.cuadra) {
          return { ...rc, conceptos: conceptosDeDesglose(desglose.lineas), periodo: desglose.periodoTexto || rc.periodo };
        }
        return rc;
      });
      return NextResponse.json({ success: true, original: true, recibos });
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
    // Mes de cada referencia: HIST usa la deuda previa guardada en el pago (meses que debía al pagar)
    const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const mesesPrevios = new Map<string, number>();
    (Array.isArray(det.deuda_previa) ? det.deuda_previa : []).forEach((d: any) => {
      if (d?.inmueble) mesesPrevios.set(String(d.inmueble), parseInt(d.meses_deuda || '0') || 0);
    });
    const fechaPago = new Date(new Date(pago.created_at).getTime() - 4 * 3600 * 1000); // hora Venezuela
    const mesKey = (ref: string): string | null => {
      const h = ref.match(/^RECIB-HIST-(.+)-M(\d+)$/i);
      if (h) {
        const total = mesesPrevios.get(h[1]);
        if (!total) return null;
        const d = new Date(Date.UTC(fechaPago.getUTCFullYear(), fechaPago.getUTCMonth() - total + parseInt(h[2]) - 1, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      }
      const cm = ref.match(/-(\d{2})-(\d{4})$/);
      return cm ? `${cm[2]}-${cm[1]}` : null;
    };
    const lbl = (k: string) => `${MESES[parseInt(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
    const keys = [...new Set(refs.filter(r => !/^MULTA-/i.test(r)).map(mesKey).filter(Boolean) as string[])].sort();
    const periodo = keys.length === 0 ? undefined
      : keys.length === 1 ? lbl(keys[0])
      : `DESDE ${lbl(keys[0])} HASTA ${lbl(keys[keys.length - 1])} (${keys.length} MESES)`;

    const conceptos: { descripcion: string; precioUnit: number; total: number }[] = [];
    for (const ref of refs) {
      const m = r2(parseFloat(String(montos[ref] ?? 0)));
      if (m <= 0) continue;
      const cod = extraerCodigoInmueble(ref) || '';
      const mes = ref.match(/-M(\d+)$/i)?.[1];
      const k = mesKey(ref);
      const desc = /^MULTA-/i.test(ref)
        ? `Multa por mora - Aseo Urbano (${cod})`
        : /^RECIB-HIST-/i.test(ref)
          ? `Servicio de Aseo Urbano - ${k ? lbl(k) : `Mes ${mes || ''} de deuda`} (${cod})`
          : `Servicio de Aseo Urbano ${k ? lbl(k) : ''} (${ref})`;
      conceptos.push({ descripcion: desc, precioUnit: m, total: m });
    }
    const suma = r2(conceptos.reduce((s, c) => s + c.total, 0));
    const cuadra = conceptos.length > 0 && Math.abs(suma - monto) <= 0.05;
    const lineas = cuadra ? conceptos
      : desglose.cuadra ? conceptosDeDesglose(desglose.lineas)
      : [{ descripcion: 'Servicio de Aseo Urbano y Domiciliario', precioUnit: monto, total: monto }];

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
      periodo: desglose.periodoTexto || periodo,
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
