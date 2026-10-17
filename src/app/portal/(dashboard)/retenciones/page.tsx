'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';
import { isResidencialInm } from '@/lib/calculos';
import { calcularDeudaInmueble, esUltimoMesHist, porMesConRetencion, r2 } from '@/lib/deudaMensual';
import { construirRecibosContribuyente, desgloseReciboCM } from '@/lib/recibosContribuyente';
import { Download } from 'lucide-react';
import { Upload, FileText, CheckCircle2, AlertCircle, Clock, ShieldAlert, Receipt, Send } from 'lucide-react';

interface Retencion {
  id: string;
  created_at: string;
  numero_planilla: string;
  periodo: string;
  fecha_planilla: string;
  monto_base: number;
  monto_iva: number;
  monto_retenido: number;
  codigo_retencion: string;
  planilla_url: string;
  estado: string;
  motivo_rechazo?: string;
  factura_url?: string;
  factura_control?: string;
}

/** Factura emitida que requiere comprobante de retención (datos para llenar la planilla). */
interface FacturaRet {
  pagoId: string;
  fechaPago: string;
  numeroFactura: string;
  numeroControl: string;
  fechaEmision: string | null;
  base: number; iva: number; retenido: number; total: number; pagado: number;
  estado: 'esperando_planilla' | 'planilla_recibida' | 'aprobada' | 'rechazada';
  motivoRechazo?: string;
  facturaUrl?: string | null;
}

const RIF_IAMEC = 'G-20008614-9';
const NOMBRE_IAMEC = 'Instituto Autónomo Municipal de Ecosocialismo Naguanagua (IAMEC)';
const DOMICILIO_IAMEC = 'Avenida Libertador, frente a la Plaza Bolívar, Naguanagua, Estado Carabobo';
// Variantes EXACTAS (no mezcla V/J/E/G con el mismo número)
const variantesDe = (id: string) => /^[VEJPG][-_\s]?\d+$/i.test(id.trim()) ? getIdentidadVariantsExact(id) : getIdentidadVariants(id);

/** PDF con los datos de la factura para elaborar el comprobante de retención. */
async function descargarDatosFactura(d: { titulo: string; numeroFactura?: string; numeroControl?: string; fecha?: string | null;
  agente: string; rifAgente: string; base: number; iva: number; retenido: number; total: number; nota?: string }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(); let y = 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(d.titulo, W / 2, y, { align: 'center' }); y += 9;
  const fila = (k: string, v: string, neg = false) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(k, 20, y);
    doc.setFont('helvetica', neg ? 'bold' : 'normal'); doc.text(v, 95, y); y += 6.5; };
  const sec = (t: string) => { y += 2; doc.setFillColor(236, 253, 245); doc.rect(16, y - 4.5, W - 32, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(4, 120, 87); doc.text(t, 20, y); doc.setTextColor(0, 0, 0); y += 8; };
  sec('DATOS DEL EMISOR (SUJETO RETENIDO)');
  fila('Razón social:', 'IAMEC Naguanagua'); fila('Nombre completo:', NOMBRE_IAMEC.replace(' (IAMEC)', '')); fila('R.I.F.:', RIF_IAMEC);
  const dom = doc.splitTextToSize(DOMICILIO_IAMEC, W - 115) as string[]; doc.setFont('helvetica', 'bold'); doc.text('Domicilio fiscal:', 20, y); doc.setFont('helvetica', 'normal'); doc.text(dom, 95, y); y += 6.5 * dom.length;
  sec('DATOS DEL AGENTE DE RETENCIÓN');
  fila('Nombre / Razón social:', d.agente || '—'); fila('R.I.F.:', d.rifAgente || '—');
  sec('DATOS DE LA FACTURA');
  fila('N° de factura:', d.numeroFactura || 'Se asigna al emitir'); fila('N° de control:', d.numeroControl || 'Se asigna al emitir'); fila('Fecha de emisión:', d.fecha ? fmtFecha(d.fecha) : '—');
  fila('Concepto:', 'Tasa por servicio de aseo urbano domiciliario');
  sec('MONTOS (Bs.)');
  fila('Base imponible:', fmt(d.base)); fila('Alícuota IVA:', '16 %'); fila('Impuesto IVA (16 %):', fmt(d.iva));
  fila('IVA retenido (75 %):', fmt(d.retenido), true); fila('IVA no retenido (25 %):', fmt(r2(d.iva - d.retenido)));
  fila('Total factura:', fmt(d.total)); fila('Total a pagar (total - retención):', fmt(r2(d.total - d.retenido)), true);
  if (d.nota) { y += 4; doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.text(doc.splitTextToSize(d.nota, W - 40) as string[], 20, y); }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text(`Generado desde Soy Contribuyente · ${new Date().toLocaleString('es-VE')}`, W / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  doc.save(`Datos_Factura_Retencion_${d.numeroFactura || 'deuda_actual'}.pdf`);
}

const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFecha = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00-04:00` : iso);
  return isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
};

const ESTADO_FACT: Record<FacturaRet['estado'], { label: string; cls: string }> = {
  esperando_planilla: { label: 'Esperando su comprobante', cls: 'text-amber-700 bg-amber-100 border-amber-300' },
  rechazada:          { label: 'Comprobante rechazado: súbalo de nuevo', cls: 'text-red-700 bg-red-100 border-red-300' },
  planilla_recibida:  { label: 'Comprobante en revisión', cls: 'text-blue-700 bg-blue-100 border-blue-300' },
  aprobada:           { label: 'Aprobado: factura enviada a su correo', cls: 'text-emerald-700 bg-emerald-100 border-emerald-300' },
};

export default function RetencionesDashboard() {
  const [identidad, setIdentidad] = useState('');
  const [isAgente, setIsAgente] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [retenciones, setRetenciones] = useState<Retencion[]>([]);
  const [facturas, setFacturas] = useState<FacturaRet[]>([]);

  // Formulario de carga (por factura)
  const [abierta, setAbierta] = useState<string | null>(null);
  const [numComp, setNumComp] = useState('');
  const [fechaComp, setFechaComp] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc') || localStorage.getItem('portal_codigo') || '';
    setIdentidad(doc);
    checkAgente(doc);
  }, []);

  // Reglas de condominio: un local dentro de un condominio comercial NO retiene por el aseo (lo paga el condominio;
  // sus multas no llevan IVA). Retiene: (a) el contribuyente con actividades individuales comerciales marcadas como
  // agente de retención, o (b) el condominio mismo si está marcado como agente (se aplica en Caja Condominios).
  const [esCondoAgente, setEsCondoAgente] = useState(false);
  const [soloLocalEnCondominio, setSoloLocalEnCondominio] = useState(false);
  const [deudaActual, setDeudaActual] = useState<{ base: number; iva: number; retenido: number; multa: number; total: number; inms: string[] } | null>(null);

  const checkAgente = async (id: string) => {
    if (!id) { setIsAgente(false); setLoading(false); return; }
    const orFilter = variantesDe(id).map(v => `identidad.eq.${v}`).join(',');
    const [{ data: inms }, { data: facs }, { data: pagosConRet }, bcv] = await Promise.all([
      supabase.from('inmuebles').select('*').or(orFilter),
      supabase.from('facturas').select('*').or(orFilter).in('estado', ['Pendiente', 'Por Verificar', 'Abonado']),
      supabase.from('pagos_reportados').select('id, detalles').or(orFilter).limit(20),
      fetch('/api/bcv').then(r => r.json()).catch(() => ({})),
    ]);
    const todos = inms || [];
    const rc = construirRecibosContribuyente({ inmuebles: todos, facturas: facs || [], identidad: id });
    const agentesInd = rc.billables.filter((i: any) => (i.agente_retencion === true || String(i.agente_retencion) === 'true') && !isResidencialInm(i));
    const condoAg = todos.some((i: any) => i.es_condominio === true && (i.agente_retencion === true || String(i.agente_retencion) === 'true'));
    
    // Verificar también si tiene pagos con retención en pagos_reportados
    const tienePagosRet = (pagosConRet || []).some((p: any) => {
      let d = p.detalles;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} }
      return d?.es_retencion || d?.agente_retencion || (parseFloat(String(d?.monto_retencion_iva || 0)) > 0);
    });

    setEsCondoAgente(condoAg);
    setSoloLocalEnCondominio(!agentesInd.length && !condoAg && todos.some((i: any) => i.agente_retencion === true && i.condominio_padre_id));

    if (agentesInd.length || condoAg || tienePagosRet) {
      setIsAgente(true);
      // Datos de la factura de su deuda ACTUAL (para preparar el comprobante antes de pagar)
      const tasa = Number(bcv?.tcmmv) || 0;
      if (tasa > 0 && agentesInd.length) {
        let base = 0, iva = 0, ret = 0, multa = 0;
        const hist = new Map<string, any[]>();
        rc.recibos.forEach((r: any) => {
          const ref = String(r.referencia || '');
          if (ref.startsWith('RECIB-HIST-')) { const c = ref.split('-')[2]; if (!hist.has(c)) hist.set(c, []); hist.get(c)!.push(r); }
          else if (ref.startsWith('CM-') && r.estado !== 'Abonado') { const d = desgloseReciboCM(r, rc.billables, tasa); base += d.base; iva += d.iva; multa += d.multa; ret += r2(d.ivaRetenible * 0.75); }
        });
        hist.forEach((rs, c) => {
          const inm = rc.billables.find((i: any) => i.inmueble === c); if (!inm) return;
          const d = calcularDeudaInmueble(inm, tasa, rs.map((r: any) => ({ emision: r.emision, esUltimo: esUltimoMesHist(r.referencia, inm) })));
          base += d.base; iva += d.iva; multa += d.multa; ret += porMesConRetencion(d).reduce((t, m) => t + m.retencion, 0);
        });
        if (base > 0) setDeudaActual({ base: r2(base), iva: r2(iva), retenido: r2(ret), multa: r2(multa), total: r2(base + iva + multa), inms: agentesInd.map((i: any) => i.inmueble) });
      }
      await cargar(id);
    } else {
      setIsAgente(false);
    }
    setLoading(false);
  };

  const cargar = async (id: string) => {
    const variantes = variantesDe(id);
    const [{ data }, res] = await Promise.all([
      supabase.from('retenciones_iva').select('*').in('identidad', variantes).order('created_at', { ascending: false }),
      fetch(`/api/portal/retenciones/pendientes?identidad=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => ({})),
    ]);
    setRetenciones(data || []);
    setFacturas(res?.facturas || []);
  };

  const abrir = (pagoId: string) => {
    setAbierta(abierta === pagoId ? null : pagoId);
    setNumComp(''); setFechaComp(''); setArchivo(null); setSaveMsg('');
  };

  const enviar = async (f: FacturaRet) => {
    if (!numComp.trim()) { setSaveMsg('⚠️ Indique el número del comprobante de retención.'); return; }
    if (!archivo) { setSaveMsg('⚠️ Adjunte el comprobante de retención (PDF o imagen).'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const ext = archivo.name.split('.').pop() || 'pdf';
      const up = new FormData();
      up.append('file', archivo);
      up.append('bucket', 'documentos');
      up.append('path', `retenciones/${identidad.replace(/[^a-zA-Z0-9-]/g, '')}/FAC-${f.numeroFactura || f.pagoId.slice(0, 8)}_${Date.now()}.${ext}`);
      const r1 = await fetch('/api/upload', { method: 'POST', body: up });
      const j1 = await r1.json();
      if (!r1.ok || !j1.success) throw new Error('Error subiendo el archivo: ' + (j1.error || 'desconocido'));

      const r2 = await fetch('/api/portal/retenciones/subir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identidad, pagoId: f.pagoId, numeroComprobante: numComp.trim(), fechaComprobante: fechaComp || null, planillaUrl: j1.publicUrl || '' }),
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error || 'Error');
      setSaveMsg('✅ Comprobante enviado. Hacienda lo verificará y le enviaremos la factura a su correo.');
      setAbierta(null);
      await cargar(identidad);
    } catch (e: any) {
      setSaveMsg('❌ ' + e.message);
    }
    setSaving(false);
  };

  const estadoColor = (e: string) => {
    if (e === 'Aprobado') return 'text-emerald-700 bg-emerald-100 border-emerald-300';
    if (e === 'Rechazado') return 'text-red-700 bg-red-100 border-red-300';
    return 'text-amber-700 bg-amber-100 border-amber-300';
  };

  const estadoIcon = (e: string) => {
    if (e === 'Aprobado') return <CheckCircle2 className="w-4 h-4" />;
    if (e === 'Rechazado') return <AlertCircle className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isAgente) return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 shadow-sm">
        <ShieldAlert className="w-10 h-10" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Módulo Restringido</h2>
      <p className="text-slate-600 text-sm leading-relaxed mb-5">
        Este módulo está estrictamente reservado para contribuyentes y comercios calificados formalmente como <strong>Agentes de Retención de IVA</strong>.
      </p>
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 text-left space-y-2">
        <p className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
          <span>¿Su empresa es Sujeto Pasivo Especial del SENIAT?</span>
        </p>
        <p className="leading-relaxed">
          Para que el sistema habilite la retención del 75% sobre sus facturas comerciales, debe consignar su <strong>Providencia Administrativa de Designación del SENIAT</strong> ante la Dirección de Hacienda Municipal de Naguanagua.
        </p>
        <p className="text-[11px] text-slate-400 pt-1">
          Una vez validada por nuestros fiscales, sus locales comerciales quedarán habilitados automáticamente para descontar retenciones y cargar comprobantes.
        </p>
      </div>
    </div>
  );

  const pendientes = facturas.filter(f => f.estado === 'esperando_planilla' || f.estado === 'rechazada');
  const otras = facturas.filter(f => f.estado === 'planilla_recibida' || f.estado === 'aprobada');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">Retenciones de IVA</h1>
        <p className="text-slate-500 text-sm mt-0.5">Suba el comprobante de retención (75% del IVA) de cada factura. Al aprobarse, recibirá la factura fiscal en su correo.</p>
      </div>

      {/* Pasos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        {[
          ['1', 'Le enviamos los datos de la factura'],
          ['2', 'Usted sube su comprobante de retención'],
          ['3', 'Hacienda verifica y le enviamos la factura'],
        ].map(([n, t]) => (
          <div key={n} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
            <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center">{n}</span>
            <span className="text-slate-600 font-medium">{t}</span>
          </div>
        ))}
      </div>

      {saveMsg && (
        <div className={`rounded-xl px-5 py-4 text-sm font-medium border ${saveMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : saveMsg.startsWith('⚠️') ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {saveMsg}
        </div>
      )}

      {esCondoAgente && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 text-sm text-blue-800">
          <b>Condominio agente de retención:</b> la retención del 75% del IVA se aplica al pagar el aseo del condominio en Caja Condominios.
          Al emitirse la factura, aparecerá abajo con sus datos para que suba el comprobante.
        </div>
      )}

      {/* Datos de la factura de la deuda actual (para preparar el comprobante antes de pagar) */}
      {deudaActual && (
        <section className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Su deuda actual · datos para el comprobante</h2>
              <p className="text-xs text-slate-500">Actividades: {deudaActual.inms.join(', ')} · tasa del día. El N° de factura y de control se asignan al emitirla, después del pago.</p>
            </div>
            <button onClick={() => descargarDatosFactura({ titulo: 'DATOS PARA EL COMPROBANTE DE RETENCIÓN DE IVA (PROFORMA)', agente: (typeof window !== 'undefined' ? localStorage.getItem('portal_user') || '' : ''), rifAgente: identidad,
              base: deudaActual.base, iva: deudaActual.iva, retenido: deudaActual.retenido, total: deudaActual.total,
              nota: `Proforma de la deuda a la fecha (incluye multas por mora por Bs. ${fmt(deudaActual.multa)}, exentas de IVA). Los montos pueden variar con la tasa del día de pago.` })}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2">
              <Download className="w-3.5 h-3.5" /> Descargar datos
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-slate-500">
            <div><span className="font-bold text-slate-700 block">Base imponible</span>Bs. {fmt(deudaActual.base)}</div>
            <div><span className="font-bold text-slate-700 block">IVA (16%)</span>Bs. {fmt(deudaActual.iva)}</div>
            <div><span className="font-bold text-red-700 block">IVA retenido (75%)</span>Bs. {fmt(deudaActual.retenido)}</div>
            <div><span className="font-bold text-slate-700 block">Multas (exentas)</span>Bs. {fmt(deudaActual.multa)}</div>
            <div><span className="font-bold text-emerald-700 block">A pagar</span>Bs. {fmt(r2(deudaActual.total - deudaActual.retenido))}</div>
          </div>
        </section>
      )}

      {/* Facturas pendientes de comprobante */}
      <section className="space-y-3">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Receipt className="w-4 h-4 text-amber-600" /> Facturas pendientes de comprobante ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">
            No tiene facturas pendientes de comprobante de retención.
          </div>
        ) : pendientes.map(f => (
          <div key={f.pagoId} id={`factura-ret-${f.pagoId}`} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${ESTADO_FACT[f.estado].cls}`}>
                  {f.estado === 'rechazada' ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />} {ESTADO_FACT[f.estado].label}
                </span>
                <p className="font-black text-slate-800 mt-2">Factura N° {f.numeroFactura || '—'}</p>
                <p className="text-xs text-slate-500">N° de Control: <span className="font-mono">{f.numeroControl || '—'}</span> · Emitida: {fmtFecha(f.fechaEmision)}</p>
                {f.motivoRechazo && <p className="text-xs text-red-600 font-semibold mt-1">Motivo del rechazo: {f.motivoRechazo}</p>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-black text-red-700">Bs. {fmt(f.retenido)}</div>
                <div className="text-[11px] text-slate-400">IVA a retener (75%)</div>
              </div>
            </div>

            {/* Datos para llenar la planilla */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <div><span className="font-bold text-slate-700 block">RIF emisor</span>{RIF_IAMEC}</div>
              <div><span className="font-bold text-slate-700 block">Base imponible</span>Bs. {fmt(f.base)}</div>
              <div><span className="font-bold text-slate-700 block">IVA (16%)</span>Bs. {fmt(f.iva)}</div>
              <div><span className="font-bold text-slate-700 block">Total factura</span>Bs. {fmt(f.total)}</div>
              <div><span className="font-bold text-slate-700 block">Emisor</span>IAMEC Naguanagua</div>
              <div><span className="font-bold text-slate-700 block">IVA no retenido (25%)</span>Bs. {fmt(r2((f.iva || 0) - (f.retenido || 0)))}</div>
              <div><span className="font-bold text-slate-700 block">Pagado en caja</span>Bs. {fmt(f.pagado)}</div>
              <div>
                <button onClick={() => descargarDatosFactura({ titulo: 'DATOS DE LA FACTURA PARA EL COMPROBANTE DE RETENCIÓN DE IVA', numeroFactura: f.numeroFactura, numeroControl: f.numeroControl,
                  fecha: f.fechaEmision, agente: (typeof window !== 'undefined' ? localStorage.getItem('portal_user') || '' : ''), rifAgente: identidad, base: f.base, iva: f.iva, retenido: f.retenido, total: f.total })}
                  className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline mt-3"><Download className="w-3.5 h-3.5" /> Descargar datos</button>
              </div>
            </div>

            {abierta === f.pagoId ? (
              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">N° de comprobante de retención *</label>
                    <input id={`num-comp-${f.pagoId}`} value={numComp} onChange={e => setNumComp(e.target.value)} placeholder="Ej: 20261000001234"
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Fecha del comprobante</label>
                    <input type="date" value={fechaComp} onChange={e => setFechaComp(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
                  </div>
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl px-4 py-4 text-center hover:border-emerald-400 transition-colors cursor-pointer bg-white"
                  onClick={() => document.getElementById(`file-${f.pagoId}`)?.click()}>
                  {archivo ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold text-sm"><FileText className="w-5 h-5" /> {archivo.name}</div>
                  ) : (
                    <><Upload className="w-7 h-7 text-slate-400 mx-auto mb-1" /><p className="text-slate-500 text-sm">Adjunte el comprobante (PDF o imagen) *</p></>
                  )}
                </div>
                <input id={`file-${f.pagoId}`} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => setArchivo(e.target.files?.[0] || null)} />
                <div className="flex gap-2">
                  <button id={`btn-enviar-comp-${f.pagoId}`} onClick={() => enviar(f)} disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl transition-all">
                    <Send className="w-4 h-4" /> {saving ? 'Enviando…' : 'Enviar comprobante'}
                  </button>
                  <button onClick={() => setAbierta(null)} className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl">Cancelar</button>
                </div>
              </div>
            ) : (
              <button id={`btn-subir-comp-${f.pagoId}`} onClick={() => abrir(f.pagoId)}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm">
                <Upload className="w-4 h-4" /> Subir comprobante de retención
              </button>
            )}
          </div>
        ))}
      </section>

      {/* Facturas en revisión / aprobadas */}
      {otras.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Facturas en revisión o aprobadas</h2>
          {otras.map(f => (
            <div key={f.pagoId} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-800 text-sm">Factura N° {f.numeroFactura || '—'} <span className="text-xs text-slate-400 font-normal">· {fmtFecha(f.fechaEmision)}</span></p>
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${ESTADO_FACT[f.estado].cls}`}>{ESTADO_FACT[f.estado].label}</span>
              </div>
              <div className="text-right">
                <div className="font-black text-slate-800 text-sm">Bs. {fmt(f.total)}</div>
                {f.facturaUrl && (
                  <a href={f.facturaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline">
                    <FileText className="w-3.5 h-3.5" /> Ver factura
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Historial de comprobantes */}
      <section className="space-y-3">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Comprobantes enviados</h2>
        {retenciones.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium text-sm">No ha enviado ningún comprobante todavía.</p>
          </div>
        ) : retenciones.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${estadoColor(r.estado)}`}>
                    {estadoIcon(r.estado)} {r.estado}
                  </span>
                  <span className="text-slate-400 text-xs">{r.periodo}</span>
                </div>
                <p className="font-bold text-slate-800 text-sm">Comprobante: {r.numero_planilla}</p>
                <p className="text-slate-500 text-xs mt-0.5">{r.codigo_retencion?.startsWith('FAC-') ? `Factura N° ${r.codigo_retencion.slice(4)}` : `Cód. Retención: ${r.codigo_retencion}`}</p>
                {r.motivo_rechazo && r.estado === 'Rechazado' && (
                  <p className="text-red-600 text-xs mt-1 font-medium">Motivo: {r.motivo_rechazo}</p>
                )}
              </div>
              <div className="text-right shrink-0 ml-4">
                <div className="text-lg font-black text-slate-800">Bs. {fmt(r.monto_retenido)}</div>
                <div className="text-slate-400 text-xs">Retenido (75%)</div>
                {r.estado === 'Aprobado' && r.factura_url && (
                  <a href={r.factura_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-emerald-600 hover:underline">
                    <FileText className="w-3.5 h-3.5" /> Ver Factura
                  </a>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <div><span className="font-bold text-slate-700 block">Base</span>Bs. {fmt(r.monto_base)}</div>
              <div><span className="font-bold text-slate-700 block">IVA Total</span>Bs. {fmt(r.monto_iva)}</div>
              <div><span className="font-bold text-slate-700 block">Fecha</span>{r.fecha_planilla || '—'}</div>
            </div>
            {r.planilla_url && (
              <div className="mt-3">
                <a href={r.planilla_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
                  <FileText className="w-3.5 h-3.5" /> Ver comprobante
                </a>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
