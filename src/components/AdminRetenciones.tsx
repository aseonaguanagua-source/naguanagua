'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  FileText, CheckCircle2, XCircle, Clock, Eye, Send,
  ChevronLeft, AlertCircle, User2, Calendar, Hash, DollarSign
} from 'lucide-react';

interface Retencion {
  id: string;
  created_at: string;
  identidad: string;
  contribuyente: string;
  codigo_inmueble?: string;
  numero_planilla: string;
  periodo: string;
  fecha_planilla?: string;
  monto_base: number;
  monto_iva: number;
  monto_retenido: number;
  codigo_retencion: string;
  planilla_url?: string;
  estado: string;
  motivo_rechazo?: string;
  aprobado_por?: string;
  aprobado_at?: string;
  factura_url?: string;
  factura_control?: string;
  factura_emitida: boolean;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const estadoBadge = (e: string) => {
  if (e === 'Aprobado') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (e === 'Rechazado') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-amber-100 text-amber-800 border-amber-300';
};

export default function AdminRetenciones() {
  const [retenciones, setRetenciones] = useState<Retencion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Retencion | null>(null);
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [motivo, setMotivo] = useState('');
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('retenciones_iva').select('*').order('created_at', { ascending: false });
    if (filtroEstado !== 'Todos') q = q.eq('estado', filtroEstado);
    const { data } = await q;
    const arr = data || [];

    // Cargar también las retenciones cobradas directamente en Caja (que no están en retenciones_iva)
    let pq = supabase.from('pagos_reportados').select('id, created_at, identidad, detalles').not('detalles->>monto_retencion_iva', 'is', null).order('created_at', { ascending: false });
    const { data: pagos } = await pq;
    
    if (pagos) {
      for (const p of pagos) {
        const det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles;
        const m = parseFloat(String(det.monto_retencion_iva || 0));
        if (m > 0) {
          // Si ya existe en retenciones_iva (porque el contribuyente subió la planilla), omitimos
          if (det.factura_digital?.retencion?.retencion_id) continue;
          
          // Si hay filtro de estado, y la retención de caja es 'Aprobado', lo respetamos
          if (filtroEstado !== 'Todos' && filtroEstado !== 'Aprobado') continue;

          // Estimamos la base e iva a partir del monto retenido asumiendo 75%
          const baseIVA = m / 0.75;
          const baseImponible = baseIVA / (det.iva_percent || 0.16);

          arr.push({
            id: p.id,
            created_at: p.created_at,
            identidad: p.identidad,
            contribuyente: det.contribuyente || det.recibo_caja?.[0]?.razonSocial || p.identidad,
            codigo_inmueble: det.recibo_caja?.[0]?.codContribuyente || det.recibos?.[0]?.split('-')[2] || '',
            numero_planilla: 'CAJA',
            periodo: det.recibo_caja?.[0]?.periodo || '—',
            fecha_planilla: p.created_at.split('T')[0],
            monto_base: baseImponible,
            monto_iva: baseIVA,
            monto_retenido: m,
            codigo_retencion: 'COBRO CAJA',
            estado: 'Aprobado',
            factura_emitida: det.factura_digital?.emitida || false,
            factura_url: det.factura_digital?.url,
            factura_control: det.factura_digital?.numero_control,
            planilla_url: undefined
          } as Retencion);
        }
      }
    }

    // Ordenar combinados por fecha descendente
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    setRetenciones(arr);
    setLoading(false);
  }, [filtroEstado]);

  useEffect(() => { load(); }, [load]);

  const revisar = async (accion: 'aprobar' | 'rechazar') => {
    if (!selected) return;
    if (accion === 'rechazar' && !motivo.trim()) { setMsg('Ingrese el motivo de rechazo.'); return; }
    setProcessing(true);
    setMsg(accion === 'aprobar' ? 'Aprobando y enviando la factura…' : 'Rechazando…');
    try {
      const usuario = typeof window !== 'undefined' ? (sessionStorage.getItem('admin_user') || localStorage.getItem('admin_user') || 'Administración') : 'Administración';
      const res = await fetch('/api/admin/retenciones/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retencionId: selected.id, accion, motivo: motivo.trim(), usuario }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Error');
      if (accion === 'aprobar') {
        setMsg(j.facturaEnviada
          ? `✅ Aprobado. Factura enviada a ${j.correo}.`
          : `✅ Aprobado. ⚠️ La factura NO se envió: ${j.error || 'sin correo'}`);
      } else {
        setMsg(`❌ Comprobante rechazado.${j.avisado ? ` Se avisó a ${j.correo}.` : ' (El contribuyente no tiene correo: avísele por otra vía.)'}`);
      }
    } catch (e: any) {
      setMsg('Error: ' + e.message);
    }
    await load();
    const { data: fresh } = await supabase.from('retenciones_iva').select('*').eq('id', selected.id).single();
    if (fresh) setSelected(fresh);
    setProcessing(false);
  };
  const aprobar = () => revisar('aprobar');
  const rechazar = () => revisar('rechazar');

  if (selected) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button onClick={() => { setSelected(null); setMsg(''); setMotivo(''); }}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors">
          <ChevronLeft className="w-5 h-5" /> Volver a Retenciones
        </button>

        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${estadoBadge(selected.estado)} mb-2`}>
                {selected.estado === 'Aprobado' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                  selected.estado === 'Rechazado' ? <XCircle className="w-3.5 h-3.5" /> :
                    <Clock className="w-3.5 h-3.5" />}
                {selected.estado}
              </span>
              <h2 className="text-xl font-black text-slate-800">{selected.contribuyente || selected.identidad}</h2>
              <p className="text-slate-500 text-sm">{selected.identidad} {selected.codigo_inmueble ? `· ${selected.codigo_inmueble}` : ''}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Hash className="w-3.5 h-3.5" /> Nro. Planilla</div>
              <div className="font-bold text-slate-700 text-sm">{selected.numero_planilla}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Calendar className="w-3.5 h-3.5" /> Período</div>
              <div className="font-bold text-slate-700 text-sm">{selected.periodo}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Hash className="w-3.5 h-3.5" /> {selected.codigo_retencion?.startsWith('FAC-') ? 'Factura' : 'Cód. Retención'}</div>
              <div className="font-bold text-slate-700 text-sm">{selected.codigo_retencion?.startsWith('FAC-') ? `N° ${selected.codigo_retencion.slice(4)}${selected.factura_control ? ` · Control ${selected.factura_control}` : ''}` : selected.codigo_retencion}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1"><Calendar className="w-3.5 h-3.5" /> Fecha Planilla</div>
              <div className="font-bold text-slate-700 text-sm">{selected.fecha_planilla || '—'}</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 text-white">
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 text-sm">Base Imponible</span>
              <span className="font-bold">Bs. {fmt(selected.monto_base)}</span>
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 text-sm">IVA Total (16%)</span>
              <span className="font-bold">Bs. {fmt(selected.monto_iva)}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-700">
              <span className="text-emerald-400 font-black">IVA Retenido (75%)</span>
              <span className="text-emerald-400 font-black text-xl">Bs. {fmt(selected.monto_retenido)}</span>
            </div>
          </div>
        </div>

        {/* PDF Viewer */}
        {selected.planilla_url ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Planilla PDF
            </h3>
            <a href={selected.planilla_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
              <Eye className="w-4 h-4" /> Ver / Descargar PDF
            </a>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-slate-400 text-sm">
            El contribuyente no adjuntó planilla en PDF.
          </div>
        )}

        {/* Factura ya emitida */}
        {selected.factura_emitida && selected.factura_url && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5">
            <h3 className="font-bold text-emerald-700 mb-2 flex items-center gap-2">
              <Send className="w-4 h-4" /> {selected.estado === 'Aprobado' ? 'Factura enviada al contribuyente' : 'Factura Digital'}
            </h3>
            <p className="text-sm text-emerald-600 mb-3">Control: {selected.factura_control}</p>
            <a href={selected.factura_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl text-sm">
              <Eye className="w-4 h-4" /> Ver Factura Digital
            </a>
          </div>
        )}

        {/* Acciones */}
        {selected.estado === 'Pendiente' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <h3 className="font-black text-slate-800">Revisión del Comprobante de Retención</h3>
            <p className="text-xs text-slate-500 -mt-2">Verifique que el comprobante coincida con la factura (RIF del emisor, N° de factura y control, base, IVA y 75% retenido). Al aprobar, la factura se envía por correo al contribuyente; al rechazar, se le avisa el motivo para que suba uno nuevo.</p>
            {msg && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.includes('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {msg}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={aprobar} disabled={processing}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl transition-all">
                <CheckCircle2 className="w-5 h-5" /> Aprobar y Enviar Factura por Correo
              </button>
            </div>
            <div className="space-y-2">
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Motivo de rechazo (requerido para rechazar)..."
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" rows={3} />
              <button onClick={rechazar} disabled={processing || !motivo.trim()}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-xl transition-all">
                <XCircle className="w-5 h-5" /> Rechazar Planilla
              </button>
            </div>
          </div>
        )}

        {selected.estado !== 'Pendiente' && msg && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.includes('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {msg}
          </div>
        )}

        {selected.motivo_rechazo && (
          <div className="bg-red-50 rounded-2xl border border-red-200 p-4 text-sm text-red-700">
            <strong>Motivo de rechazo:</strong> {selected.motivo_rechazo}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-800">Retenciones de IVA</h2>
          <p className="text-slate-500 text-sm mt-0.5">Comprobantes de retención enviados por los agentes de retención. La factura se envía al aprobar.</p>
        </div>
        <div className="flex gap-2">
          {['Todos', 'Pendiente', 'Aprobado', 'Rechazado'].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${filtroEstado === e ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>
              {e}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : retenciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay retenciones {filtroEstado !== 'Todos' ? `en estado "${filtroEstado}"` : 'registradas'}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-bold text-slate-600">Contribuyente / RIF</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">Nro. Planilla</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">Período</th>
                <th className="text-right px-4 py-3 font-bold text-slate-600">Monto Retenido</th>
                <th className="text-center px-4 py-3 font-bold text-slate-600">Estado</th>
                <th className="text-center px-4 py-3 font-bold text-slate-600">Fecha</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {retenciones.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelected(r)}>
                  <td className="px-5 py-3.5">
                    <div className="font-bold text-slate-800 truncate max-w-[180px]">{r.contribuyente || '—'}</div>
                    <div className="text-slate-400 text-xs">{r.identidad}</div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-slate-600">{r.numero_planilla}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.periodo}</td>
                  <td className="px-4 py-3.5 text-right font-black text-slate-800">Bs. {fmt(r.monto_retenido)}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${estadoBadge(r.estado)}`}>
                      {r.estado === 'Pendiente' && <Clock className="w-3 h-3" />}
                      {r.estado === 'Aprobado' && <CheckCircle2 className="w-3 h-3" />}
                      {r.estado === 'Rechazado' && <XCircle className="w-3 h-3" />}
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs text-center">
                    {new Date(r.created_at).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-3 py-3.5">
                    <Eye className="w-4 h-4 text-slate-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
