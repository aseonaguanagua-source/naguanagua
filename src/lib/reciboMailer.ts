import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getResendClient, DEFAULT_RESEND_FROM } from '@/lib/emailClient';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { clasificarPago, extraerCodigoInmueble, parseDetalles, ClasificacionPago } from '@/lib/documentoPago';
import { isResidencialInm } from '@/lib/calculos';

/**
 * Recibos de pago por correo (NO fiscales): residenciales y comerciales que solo pagaron multa.
 * Las facturas comerciales van por The Factory HKA (factura-digital/emitir).
 */

export interface DatosRecibo {
  pago: any;
  det: any;
  contribuyente: string;
  identidad: string;
  correoCliente: string | null;
  clasif: ClasificacionPago;
  lineas: { codigo: string; direccion: string; uso: string; meses: number; multa: boolean }[];
  numeroRecibo: string;
  fechaPago: string;
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fechaCaracas(iso: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00-04:00` : iso);
  return new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export async function cargarDatosRecibo(pagoId: string): Promise<DatosRecibo> {
  const { data: pago, error } = await supabase.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
  if (error) throw error;
  if (!pago) throw new Error('Pago no encontrado');
  const det = parseDetalles(pago.detalles);
  const recibos: string[] = det.recibos || [];

  const codigos = [...new Set(recibos.map(extraerCodigoInmueble).filter(Boolean) as string[])];
  const inmMap = new Map<string, any>();
  if (codigos.length > 0) {
    const { data: inms } = await supabase
      .from('inmuebles')
      .select('inmueble, tipo, clasificacion, actividad_principal, direccion, correo_electronico, contribuyente')
      .in('inmueble', codigos);
    (inms || []).forEach((i: any) => inmMap.set(i.inmueble, i));
  }
  const { data: cont } = await supabase.from('contribuyentes').select('nombre, email').eq('identidad', pago.identidad).maybeSingle();

  const clasif = clasificarPago(recibos, inmMap, det);
  const lineas = codigos.map(codigo => {
    const inm = inmMap.get(codigo);
    return {
      codigo,
      direccion: inm?.direccion || '',
      uso: inm ? (isResidencialInm(inm) ? 'Residencial' : 'Comercial') : '',
      meses: recibos.filter(r => /^(RECIB-HIST|CM)-/i.test(r) && extraerCodigoInmueble(r) === codigo).length,
      multa: recibos.some(r => /^MULTA-/i.test(r) && extraerCodigoInmueble(r) === codigo),
    };
  });

  const fallback = TheFactoryHKA.getFallbackEmail().toLowerCase();
  const backup = TheFactoryHKA.getBackupEmail().toLowerCase();
  const correoInm = codigos.map(c => inmMap.get(c)?.correo_electronico).find((e: any) => e && String(e).includes('@'));
  const raw = String(cont?.email || det.correo || correoInm || '').trim().toLowerCase();
  const correoCliente = raw.length > 4 && raw.includes('@') && raw !== fallback && raw !== backup ? raw : null;

  const contribuyente = det.contribuyente || cont?.nombre || codigos.map(c => inmMap.get(c)?.contribuyente).find(Boolean) || pago.identidad;

  return {
    pago, det, contribuyente, identidad: pago.identidad, correoCliente, clasif, lineas,
    numeroRecibo: `RC-${String(pago.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    fechaPago: fechaCaracas(det.fecha_transaccion || pago.created_at),
  };
}

export function construirReciboHtml(d: DatosRecibo, opts: { esCopiaInterna?: boolean } = {}): string {
  const titulo = d.clasif.subtipo === 'recibo_multa_comercial' ? 'RECIBO DE PAGO DE MULTA' : 'RECIBO DE PAGO';
  const filas = d.lineas.map(l => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:bold;color:#0f172a;">${esc(l.codigo)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#475569;">${esc(l.direccion)}${l.uso ? `<br><span style="font-size:11px;color:#64748b;">${esc(l.uso)}</span>` : ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#0f172a;text-align:right;">
        ${l.meses > 0 ? `${l.meses} mes${l.meses === 1 ? '' : 'es'} de aseo urbano` : ''}${l.meses > 0 && l.multa ? '<br>' : ''}${l.multa ? 'Multa por mora' : ''}
      </td>
    </tr>`).join('');
  const formaPago = [d.pago.tipo, d.pago.banco && d.pago.banco !== d.pago.tipo ? d.pago.banco : ''].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>${titulo} - IAMEC Naguanagua</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:30px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;border:1px solid #e2e8f0;">
      <tr><td style="background:linear-gradient(135deg,#0a4a2a 0%,#1a7a40 100%);padding:24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:1px;">ALCALDÍA DE NAGUANAGUA &bull; IAMEC</h1>
        <p style="margin:6px 0 0;color:#dcfce7;font-size:13px;font-weight:bold;">${titulo} &bull; SERVICIO DE ASEO URBANO</p>
      </td></tr>
      ${opts.esCopiaInterna ? `<tr><td style="background:#fef3c7;padding:10px 24px;font-size:12px;color:#92400e;font-weight:bold;">COPIA DE ARCHIVO &mdash; ${d.correoCliente ? `enviado a ${esc(d.correoCliente)}` : 'el contribuyente no tiene correo registrado'}</td></tr>` : ''}
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">Estimado(a) <strong>${esc(d.contribuyente)}</strong> (C.I./R.I.F.: <strong>${esc(d.identidad)}</strong>),</p>
        <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">Hemos recibido su pago. Este es su comprobante:</p>
        <table width="100%" cellpadding="8" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;font-size:13px;">
          <tr><td style="color:#64748b;">N° de Recibo:</td><td style="text-align:right;font-family:monospace;font-weight:bold;color:#0f172a;">${d.numeroRecibo}</td></tr>
          <tr><td style="color:#64748b;">Fecha de pago:</td><td style="text-align:right;color:#0f172a;">${esc(d.fechaPago)}</td></tr>
          <tr><td style="color:#64748b;">Forma de pago:</td><td style="text-align:right;color:#0f172a;">${esc(formaPago)}</td></tr>
          <tr><td style="color:#64748b;">Referencia:</td><td style="text-align:right;font-family:monospace;color:#0f172a;">${esc(d.pago.referencia)}</td></tr>
          ${d.det.cajero ? `<tr><td style="color:#64748b;">Caja:</td><td style="text-align:right;color:#0f172a;">${esc(d.det.cajero)}</td></tr>` : ''}
        </table>
        ${filas ? `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;">
          <tr style="background:#f1f5f9;"><th style="padding:8px;text-align:left;color:#475569;">Inmueble</th><th style="padding:8px;text-align:left;color:#475569;">Dirección</th><th style="padding:8px;text-align:right;color:#475569;">Concepto</th></tr>
          ${filas}
        </table>` : ''}
        <table width="100%" cellpadding="10" cellspacing="0" style="background:#ecfdf5;border-radius:8px;border:1px solid #a7f3d0;font-size:15px;">
          <tr><td style="color:#065f46;font-weight:bold;">TOTAL PAGADO</td><td style="text-align:right;color:#166534;font-size:18px;font-weight:800;">Bs ${fmtBs(d.pago.monto)}</td></tr>
        </table>
        <p style="margin:22px 0 0;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">Este recibo es un comprobante de pago y no constituye factura fiscal.</p>
      </td></tr>
      <tr><td style="background:#f1f5f9;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
        Instituto Autónomo Municipal de Ecosocialismo Naguanagua (IAMEC) &bull; R.I.F. G-20000147-3<br>Naguanagua, Estado Carabobo
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Envía el recibo al contribuyente (si tiene correo real) y copia al archivo interno. Marca el pago como enviado. */
export async function enviarRecibo(pagoId: string): Promise<{ ok: boolean; clienteEnviado: boolean; copiaInternaEnviada: boolean; correo: string | null; error?: string; omitido?: string }> {
  const d = await cargarDatosRecibo(pagoId);
  if (d.clasif.documento !== 'recibo') {
    return { ok: false, clienteEnviado: false, copiaInternaEnviada: false, correo: null, omitido: 'Este pago corresponde a FACTURA comercial, no a recibo.' };
  }
  const resend = getResendClient();
  const from = process.env.RESEND_FROM || DEFAULT_RESEND_FROM;
  const backup = TheFactoryHKA.getBackupEmail();
  const asunto = `${d.clasif.subtipo === 'recibo_multa_comercial' ? 'Recibo de pago de multa' : 'Recibo de pago'} ${d.numeroRecibo} - IAMEC Naguanagua`;

  let clienteEnviado = false;
  let copiaInternaEnviada = false;
  let error: string | undefined;

  if (d.correoCliente) {
    try {
      const r = await resend.emails.send({ from, to: [d.correoCliente], subject: asunto, html: construirReciboHtml(d) });
      if (r.error) error = r.error.message; else clienteEnviado = true;
    } catch (e: any) { error = e.message; }
  }
  if (backup) {
    try {
      const r = await resend.emails.send({
        from, to: [backup],
        subject: `[ARCHIVO RECIBOS] ${d.numeroRecibo} - ${d.contribuyente} (${d.identidad})`,
        html: construirReciboHtml(d, { esCopiaInterna: true }),
      });
      if (r.error) error = error || r.error.message; else copiaInternaEnviada = true;
    } catch (e: any) { error = error || e.message; }
  }

  // Éxito = llegó al cliente, o (sin correo de cliente) al menos quedó la copia de archivo
  const ok = d.correoCliente ? clienteEnviado : copiaInternaEnviada;

  // Releer detalles antes de escribir para no pisar otros cambios
  const { data: fresh } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoId).maybeSingle();
  const det = parseDetalles(fresh?.detalles);
  det.recibo_digital = {
    enviado: ok,
    fecha: new Date().toISOString(),
    numero: d.numeroRecibo,
    correo: d.correoCliente,
    cliente_enviado: clienteEnviado,
    copia_interna: copiaInternaEnviada,
    error: ok ? null : (error || (d.correoCliente ? 'No se pudo entregar' : 'Sin correo del contribuyente')),
  };
  await supabase.from('pagos_reportados').update({ detalles: det }).eq('id', pagoId);

  return { ok, clienteEnviado, copiaInternaEnviada, correo: d.correoCliente, error };
}
