'use client';
import { SearchCheck, Send, CheckCircle2, FlaskConical, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Inspeccion = {
  id: number;
  descripcion: string;
  monto: number;
  fecha: string;
  estado: string;
  referencia?: string;
  notas?: string;
};

export default function InspeccionPage() {
  const [motivo, setMotivo] = useState('');
  const [direccion, setDireccion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [tasaBcv, setTasaBcv] = useState<number>(0);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const TARIFA_TCMV = 3;

  const cargarInspecciones = async () => {
    const doc = localStorage.getItem('portal_doc') || '';
    if (!doc) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/servicios-especiales');
      const data = await res.json();
      if (Array.isArray(data)) {
        const docLimpio = doc.replace(/-/g,'').toUpperCase();
        const filtrados = data.filter((s: any) => {
          const id = (s.identidad || '').replace(/-/g,'').toUpperCase();
          return (id === docLimpio || id === doc.toUpperCase()) && s.tipo === 'inspeccion';
        });
        setInspecciones(filtrados);
      }
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => {
    fetch('/api/bcv')
      .then(res => res.json())
      .then(data => { if (data?.tcmmv) setTasaBcv(data.tcmmv); })
      .catch(() => {});
    cargarInspecciones();
  }, []);

  const costoTotalBs = TARIFA_TCMV * tasaBcv;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const doc = localStorage.getItem('portal_doc') || '';
    const nombre = localStorage.getItem('portal_user') || '';

    try {
      const res = await fetch('/api/admin/servicios-especiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'inspeccion',
          identidad: doc,
          contribuyente: nombre,
          descripcion: `Inspección Técnica: ${motivo} — ${direccion}`,
          monto: costoTotalBs,
          fecha: new Date().toISOString().split('T')[0],
          notas: observaciones,
          estado: 'Pendiente',
          referencia: `INSP-TEC-${Date.now()}`,
          origen: 'contribuyente'
        })
      });

      if (res.ok) {
        setIsSuccess(true);
        cargarInspecciones();
      }
    } catch {}
    setIsSubmitting(false);
  };

  const estadoColor = (estado: string) => {
    if (estado === 'Pagado') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (estado === 'En Revisión') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (estado === 'Aprobado') return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">

      {/* Mis Inspecciones */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center justify-between">
          <h2 className="font-semibold text-blue-900 uppercase flex items-center gap-2 text-sm">
            <SearchCheck className="w-5 h-5 text-blue-600" />
            Mis Inspecciones
          </h2>
          <button onClick={cargarInspecciones} className="text-blue-600 hover:text-blue-800 transition-colors p-1">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : inspecciones.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <SearchCheck className="w-10 h-10 mx-auto mb-2 opacity-20" />
            No tiene inspecciones registradas.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {inspecciones.map(s => (
              <div key={s.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{s.descripcion}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-slate-400">{s.fecha}</span>
                    {s.referencia && <span className="text-xs font-mono text-slate-400">{s.referencia}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-bold text-slate-800 text-sm">
                    Bs. {Number(s.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${estadoColor(s.estado)}`}>{s.estado}</span>
                  {s.estado === 'Pendiente' && (
                    <Link href="/portal/pagos" className="text-[10px] text-emerald-600 hover:underline font-semibold">→ Ir a Pagar</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Solicitar Inspección */}
      {isSuccess ? (
        <div className="bg-white rounded-lg border border-blue-200 p-10 text-center shadow-sm">
          <CheckCircle2 className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">¡Inspección Solicitada!</h2>
          <p className="text-slate-600 mb-2">Su solicitud de inspección técnica fue registrada.</p>
          <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg inline-block border border-slate-100 mb-6">
            El cargo administrativo de <strong>Bs. {costoTotalBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong> aparecerá en su estado de cuenta.
            Diríjase a <strong>PAGAR</strong> para cancelarlo.
          </p>
          <div>
            <button onClick={() => { setIsSuccess(false); setMotivo(''); setDireccion(''); setObservaciones(''); }}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-medium transition-colors">
              Nueva Solicitud
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700 uppercase flex items-center gap-2 text-sm">
              <SearchCheck className="w-5 h-5 text-blue-600" />
              SOLICITUD DE INSPECCIÓN TÉCNICA
            </h2>
          </div>

          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Tarifa', value: `${TARIFA_TCMV} TCMV` },
                { label: 'Tasa BCV', value: `Bs. ${tasaBcv.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}` },
                { label: 'Total a Pagar', value: `Bs. ${costoTotalBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}`, highlight: true }
              ].map((item, i) => (
                <div key={i} className={`rounded-lg p-3 text-center ${item.highlight ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                  <p className={`text-xs mb-1 ${item.highlight ? 'text-blue-100' : 'text-slate-500'}`}>{item.label}</p>
                  <p className="font-black text-lg">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <form className="p-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de la Inspección *</label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-blue-500 bg-white" required>
                <option value="">Seleccione el motivo...</option>
                <option value="Verificación de actividad comercial">Verificación de actividad comercial</option>
                <option value="Solicitud de solvencia ambiental">Solicitud de solvencia ambiental</option>
                <option value="Inicio de actividad económica">Inicio de actividad económica</option>
                <option value="Denuncia ciudadana">Denuncia ciudadana</option>
                <option value="Revisión de instalaciones">Revisión de instalaciones</option>
                <option value="Otro motivo">Otro motivo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dirección del Inmueble a Inspeccionar *</label>
              <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: Calle Comercio, Local 3, Naguanagua..." required />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones</label>
              <textarea rows={3} value={observaciones} onChange={e => setObservaciones(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="Detalles adicionales sobre la inspección requerida..." />
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={isSubmitting}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded font-semibold text-sm disabled:opacity-50 transition-colors shadow-sm">
                {isSubmitting ? 'Enviando...' : <><Send className="w-4 h-4" /> Solicitar Inspección</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
