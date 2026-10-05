'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants } from '@/lib/formatters';
import { Upload, FileText, CheckCircle2, AlertCircle, Clock, ChevronRight, Plus, ShieldAlert, Building2 } from 'lucide-react';

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

const fmt = (n: number) =>
  n?.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00';

export default function RetencionesDashboard() {
  const [identidad, setIdentidad] = useState('');
  const [isAgente, setIsAgente] = useState<boolean | null>(null);
  const [agenteInmuebles, setAgenteInmuebles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retenciones, setRetenciones] = useState<Retencion[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [form, setForm] = useState({
    inmueble: '',
    numero_planilla: '',
    periodo: '',
    fecha_planilla: '',
    monto_base: '',
    monto_iva: '',
    codigo_retencion: '',
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc') || localStorage.getItem('portal_codigo') || '';
    setIdentidad(doc);
    checkAgente(doc);
  }, []);

  const checkAgente = async (id: string) => {
    if (!id) { setIsAgente(false); setLoading(false); return; }
    const variantes = getIdentidadVariants(id);
    const orFilter = variantes.map(v => `identidad.eq.${v}`).join(',');
    const { data } = await supabase
      .from('inmuebles')
      .select('id, inmueble, contribuyente, actividad_principal, direccion, agente_retencion')
      .or(orFilter)
      .eq('agente_retencion', true);

    if (data && data.length > 0) {
      setIsAgente(true);
      setAgenteInmuebles(data);
      if (data[0]?.inmueble) {
        setForm(f => ({ ...f, inmueble: data[0].inmueble }));
      }
      loadRetenciones(id);
    } else {
      setIsAgente(false);
      setAgenteInmuebles([]);
    }
    setLoading(false);
  };

  const loadRetenciones = async (id: string) => {
    const { data } = await supabase
      .from('retenciones_iva')
      .select('*')
      .or(`identidad.eq.${id},identidad.eq.${id.replace(/-/g, '')}`)
      .order('created_at', { ascending: false });
    setRetenciones(data || []);
  };

  const montoRetenido = form.monto_iva
    ? (parseFloat(form.monto_iva || '0') * 0.75).toFixed(2)
    : '0.00';

  const handleSubmit = async () => {
    if (!form.inmueble || !form.numero_planilla || !form.periodo || !form.monto_base || !form.monto_iva || !form.codigo_retencion) {
      setSaveMsg('⚠️ Complete todos los campos requeridos, incluyendo el comercio retentor autorizado.');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    try {
      let planilla_url = '';

      // Upload PDF if provided via /api/upload
      if (pdfFile) {
        const fileName = `${identidad}/${Date.now()}_${pdfFile.name}`;
        const uploadData = new FormData();
        uploadData.append('file', pdfFile);
        uploadData.append('bucket', 'retenciones');
        uploadData.append('path', fileName);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: uploadData,
        });
        const resData = await res.json();
        if (!res.ok || !resData.success) {
          throw new Error('Error subiendo PDF: ' + (resData.error || 'Error desconocido'));
        }
        planilla_url = resData.publicUrl || '';
      }

      // Get name from inmuebles
      const { data: inm } = await supabase.from('inmuebles').select('contribuyente').eq('identidad', identidad).limit(1);
      const nombre = inm?.[0]?.contribuyente || identidad;

      const { error } = await supabase.from('retenciones_iva').insert({
        identidad,
        contribuyente: nombre,
        codigo_inmueble: form.inmueble,
        numero_planilla: form.numero_planilla,
        periodo: form.periodo,
        fecha_planilla: form.fecha_planilla || null,
        monto_base: parseFloat(form.monto_base),
        monto_iva: parseFloat(form.monto_iva),
        monto_retenido: parseFloat(montoRetenido),
        codigo_retencion: form.codigo_retencion,
        planilla_url,
        estado: 'Pendiente',
      });

      if (error) throw error;

      setSaveMsg('✅ Planilla enviada exitosamente. Será revisada por el equipo de administración.');
      setShowForm(false);
      setForm({ inmueble: agenteInmuebles[0]?.inmueble || '', numero_planilla: '', periodo: '', fecha_planilla: '', monto_base: '', monto_iva: '', codigo_retencion: '' });
      setPdfFile(null);
      loadRetenciones(identidad);
    } catch (e: any) {
      setSaveMsg('❌ Error: ' + e.message);
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Retenciones de IVA</h1>
          <p className="text-slate-500 text-sm mt-0.5">Cargue sus comprobantes de retención (75% del IVA para comercios autorizados)</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setSaveMsg(''); }}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> Nueva Planilla
        </button>
      </div>

      {/* Success/error msg */}
      {saveMsg && (
        <div className={`rounded-xl px-5 py-4 text-sm font-medium border ${saveMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {saveMsg}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-black text-slate-800 text-lg mb-4">Nueva Planilla de Retención</h3>

          {/* Selector de Comercio Retentor Autorizado */}
          <div className="mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Comercio / Inmueble Retentor Autorizado *
            </label>
            <select
              value={form.inmueble}
              onChange={e => setForm({ ...form, inmueble: e.target.value })}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium text-slate-800"
              required
            >
              <option value="">-- Seleccione el comercio calificado --</option>
              {agenteInmuebles.map((inm: any) => (
                <option key={inm.id} value={inm.inmueble}>
                  {inm.inmueble} — {inm.actividad_principal || 'Local Comercial'} ({inm.direccion})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Solo se muestran los comercios formalmente calificados con retención. Las viviendas y comercios no autorizados no admiten retención.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Nro. de Planilla SENIAT *</label>
              <input value={form.numero_planilla} onChange={e => setForm({ ...form, numero_planilla: e.target.value })}
                placeholder="Ej: 00100200027815" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Período *</label>
              <input value={form.periodo} onChange={e => setForm({ ...form, periodo: e.target.value })}
                placeholder="Ej: Septiembre 2026" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Fecha de la Planilla</label>
              <input type="date" value={form.fecha_planilla} onChange={e => setForm({ ...form, fecha_planilla: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Código de Retención *</label>
              <input value={form.codigo_retencion} onChange={e => setForm({ ...form, codigo_retencion: e.target.value })}
                placeholder="Código comprobante" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Base Imponible (Bs.) *</label>
              <input type="number" value={form.monto_base} onChange={e => setForm({ ...form, monto_base: e.target.value })}
                placeholder="0.00" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">IVA Total (Bs.) *</label>
              <input type="number" value={form.monto_iva} onChange={e => setForm({ ...form, monto_iva: e.target.value })}
                placeholder="0.00" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>

          {/* IVA retenido calculado */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex justify-between items-center mb-4">
            <span className="text-sm font-bold text-emerald-700">IVA Retenido (75%) calculado:</span>
            <span className="text-lg font-black text-emerald-800">Bs. {fmt(parseFloat(montoRetenido))}</span>
          </div>

          {/* PDF Upload */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Planilla en PDF (opcional pero recomendado)</label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl px-6 py-5 text-center hover:border-emerald-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById('pdf-upload')?.click()}>
              {pdfFile ? (
                <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold">
                  <FileText className="w-5 h-5" /> {pdfFile.name}
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Haga clic para seleccionar el PDF</p>
                </>
              )}
            </div>
            <input id="pdf-upload" type="file" accept="application/pdf" className="hidden"
              onChange={e => setPdfFile(e.target.files?.[0] || null)} />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl transition-all">
              {saving ? 'Enviando...' : 'Enviar Planilla'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {retenciones.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No ha enviado ninguna planilla todavía.</p>
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
                <p className="font-bold text-slate-800 text-sm">Planilla: {r.numero_planilla}</p>
                <p className="text-slate-500 text-xs mt-0.5">Cód. Retención: {r.codigo_retencion}</p>
                {r.motivo_rechazo && (
                  <p className="text-red-600 text-xs mt-1 font-medium">Motivo: {r.motivo_rechazo}</p>
                )}
              </div>
              <div className="text-right shrink-0 ml-4">
                <div className="text-lg font-black text-slate-800">Bs. {fmt(r.monto_retenido)}</div>
                <div className="text-slate-400 text-xs">Retenido (75%)</div>
                {r.factura_url && (
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
                  <FileText className="w-3.5 h-3.5" /> Ver Planilla PDF
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
