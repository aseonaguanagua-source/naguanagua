'use client';
import { ShieldCheck, Send, FileText, CheckCircle2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

type VistoBueno = {
  id: number;
  descripcion: string;
  monto: number;
  fecha: string;
  estado: string;
  referencia?: string;
  notas?: string;
};

export default function VistoBuenoPage() {
  const [proyecto, setProyecto] = useState('');
  const [area, setArea] = useState('');
  const [descripcionActividad, setDescripcionActividad] = useState('');
  const [tipoSolicitud, setTipoSolicitud] = useState('');
  const [incluyeHabilitado, setIncluyeHabilitado] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [tasaBcv, setTasaBcv] = useState<number>(0);
  const [registros, setRegistros] = useState<VistoBueno[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const tarifaTCMV = ((parseFloat(area) || 0) * 0.5) + (incluyeHabilitado ? 100 : 0);
  const costoTotalBs = tarifaTCMV * tasaBcv;

  const cargarRegistros = async () => {
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
          return (id === docLimpio || id === doc.toUpperCase()) && s.tipo === 'visto_bueno';
        });
        setRegistros(filtrados);
      }
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => {
    fetch('/api/bcv')
      .then(res => res.json())
      .then(data => { if (data?.tcmmv) setTasaBcv(data.tcmmv); })
      .catch(() => {});
    cargarRegistros();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tarifaTCMV === 0) { alert('Ingrese el área del local.'); return; }
    setIsSubmitting(true);

    const doc = localStorage.getItem('portal_doc') || '';
    const nombre = localStorage.getItem('portal_user') || '';

    try {
      const res = await fetch('/api/admin/servicios-especiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'visto_bueno',
          identidad: doc,
          contribuyente: nombre,
          descripcion: `Visto Bueno Ambiental: ${proyecto} — ${tipoSolicitud} — ${area} m² — ${descripcionActividad}${incluyeHabilitado ? ' (HABILITADO)' : ''}`,
          monto: costoTotalBs,
          fecha: new Date().toISOString().split('T')[0],
          notas: `Área: ${area} m² | Tipo: ${tipoSolicitud}${incluyeHabilitado ? ' | Habilitado' : ''}`,
          estado: 'Pendiente',
          referencia: `VB-AMB-${Date.now()}`,
          origen: 'contribuyente'
        })
      });

      if (res.ok) {
        setIsSuccess(true);
        cargarRegistros();
      }
    } catch {}
    setIsSubmitting(false);
  };

  const estadoColor = (estado: string) => {
    if (estado === 'Aprobado') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (estado === 'En Revisión') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (estado === 'Pagado') return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">

      {/* Mis Solicitudes */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-green-50 px-6 py-4 border-b border-green-100 flex items-center justify-between">
          <h2 className="font-semibold text-green-900 uppercase flex items-center gap-2 text-sm">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Mis Certificados de Visto Bueno Ambiental
          </h2>
          <button onClick={cargarRegistros} className="text-green-600 hover:text-green-800 transition-colors p-1">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : registros.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-20" />
            No tiene solicitudes de Visto Bueno registradas.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {registros.map(s => (
              <div key={s.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{s.descripcion}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-slate-400">{s.fecha}</span>
                    {s.referencia && <span className="text-xs font-mono text-slate-400">{s.referencia}</span>}
                    {s.notas && <span className="text-xs text-slate-500 italic">{s.notas}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-bold text-slate-800 text-sm">
                    Bs. {Number(s.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${estadoColor(s.estado)}`}>{s.estado}</span>
                  {(s.estado === 'Pendiente' || s.estado === 'En Revisión') && (
                    <Link href="/portal/pagos" className="text-[10px] text-emerald-600 hover:underline font-semibold">→ Ir a Pagar</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Solicitar Visto Bueno */}
      {isSuccess ? (
        <div className="bg-white rounded-lg border border-emerald-200 p-10 text-center shadow-sm">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">¡Trámite Iniciado Exitosamente!</h2>
          <p className="text-slate-600 mb-2">Su solicitud de Visto Bueno Ambiental fue registrada y será revisada por nuestro equipo técnico.</p>
          <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg inline-block border border-slate-100 mb-6">
            Se ha generado un arancel de <strong>Bs. {costoTotalBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong>.
            Diríjase a <strong>PAGAR</strong> para cancelar los tributos.
          </p>
          <div>
            <button onClick={() => { setIsSuccess(false); setProyecto(''); setArea(''); setDescripcionActividad(''); setTipoSolicitud(''); }}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-medium transition-colors">
              Nueva Solicitud
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700 uppercase flex items-center gap-2 text-sm">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              SOLICITUD DE VISTO BUENO AMBIENTAL
            </h2>
          </div>

          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <p className="text-sm text-slate-600">
              El Visto Bueno Ambiental es un requisito indispensable para la obtención o renovación de la Licencia de Actividades Económicas y permisos de construcción. Complete la información y adjunte los recaudos exigidos.
            </p>
          </div>

          <form className="p-6 space-y-6" onSubmit={handleSubmit}>
            {/* Datos del Proyecto */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4 pb-2 border-b border-slate-200">1. Datos del Proyecto o Actividad</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Proyecto / Actividad Comercial *</label>
                  <input type="text" value={proyecto} onChange={e => setProyecto(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-green-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Área del Local / Terreno (m²) *</label>
                  <input type="number" min="1" value={area} onChange={e => setArea(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-green-500" required />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción Breve de la Actividad *</label>
                  <textarea rows={2} value={descripcionActividad} onChange={e => setDescripcionActividad(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-green-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Solicitud *</label>
                  <select value={tipoSolicitud} onChange={e => setTipoSolicitud(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-green-500 bg-white" required>
                    <option value="">Seleccione...</option>
                    <option value="Nueva Actividad Económica">Nueva Actividad Económica</option>
                    <option value="Renovación">Renovación</option>
                    <option value="Proyecto de Construcción">Proyecto de Construcción</option>
                    <option value="Modificación / Ampliación">Modificación / Ampliación</option>
                  </select>
                </div>
                <div className="md:col-span-2 pt-2 border-t border-slate-200 mt-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={incluyeHabilitado} onChange={e => setIncluyeHabilitado(e.target.checked)} className="w-4 h-4 accent-green-600" />
                    Incluir Trámite Habilitado (+ 100 TCMV)
                  </label>
                </div>
              </div>
            </div>

            {/* Recaudos */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4 pb-2 border-b border-slate-200">2. Carga de Recaudos Digitales</h3>
              <p className="text-xs text-slate-500 mb-4">Todos los documentos deben estar en formato PDF y no superar los 5MB.</p>
              <div className="space-y-3">
                {[
                  { label: 'Copia del RIF Vigente', desc: 'Persona natural o jurídica' },
                  { label: 'Memoria Descriptiva del Proyecto', desc: 'Detallando procesos, generación de residuos y manejo propuesto' },
                  { label: 'Documento de Propiedad o Contrato de Arrendamiento', desc: 'Del local o terreno donde operará' }
                ].map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{doc.label}</p>
                        <p className="text-xs text-slate-500">{doc.desc}</p>
                      </div>
                    </div>
                    <label className="px-4 py-1.5 bg-white border border-slate-300 rounded text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
                      Examinar
                      <input type="file" className="sr-only" accept=".pdf,image/*" />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Cálculo */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg grid grid-cols-3 gap-3">
              {[
                { label: 'Tarifa por m²', value: '0.5 TCMV' },
                { label: 'Total TCMV', value: tarifaTCMV > 0 ? `${tarifaTCMV.toFixed(2)} TCMV` : '0.00 TCMV' },
                { label: 'Total a Pagar', value: `Bs. ${costoTotalBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}`, highlight: true }
              ].map((item, i) => (
                <div key={i} className={`text-center p-3 rounded-lg ${item.highlight ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                  <p className={`text-xs mb-1 ${item.highlight ? 'text-green-100' : 'text-slate-500'}`}>{item.label}</p>
                  <p className="font-black text-base">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-200">
              <button type="submit" disabled={isSubmitting || tarifaTCMV === 0}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 rounded font-semibold flex items-center gap-2 transition-colors text-sm shadow-sm">
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Procesando...' : 'Generar Pago y Solicitar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
