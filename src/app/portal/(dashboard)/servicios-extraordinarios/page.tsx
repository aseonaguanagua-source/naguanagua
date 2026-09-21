'use client';
import { Truck, Upload, AlertCircle, Send, CheckCircle2, Clock, RefreshCw, FlaskConical } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

type Servicio = {
  id: number;
  tipo: string;
  descripcion: string;
  monto: number;
  fecha: string;
  estado: string;
  referencia?: string;
  notas?: string;
};

export default function ServiciosExtraordinariosPage() {
  const [tipo, setTipo] = useState('');
  const [camion, setCamion] = useState('');
  const [distancia, setDistancia] = useState('');
  const [direccion, setDireccion] = useState('');
  const [detalles, setDetalles] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [tasaBcv, setTasaBcv] = useState<number>(0);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [isLoadingServicios, setIsLoadingServicios] = useState(true);

  const cargarServicios = async () => {
    const doc = localStorage.getItem('portal_doc') || '';
    if (!doc) return;
    setIsLoadingServicios(true);
    try {
      const res = await fetch('/api/admin/servicios-especiales');
      const data = await res.json();
      if (Array.isArray(data)) {
        const docLimpio = doc.replace(/-/g,'').toUpperCase();
        const filtrados = data.filter((s: any) => {
          const id = (s.identidad || '').replace(/-/g,'').toUpperCase();
          return id === docLimpio || id === doc.toUpperCase();
        }).filter((s: any) => s.tipo === 'extraordinario');
        setServicios(filtrados);
      }
    } catch {}
    setIsLoadingServicios(false);
  };

  useEffect(() => {
    fetch('/api/bcv')
      .then(res => res.json())
      .then(data => { if (data?.tcmmv) setTasaBcv(data.tcmmv); })
      .catch(() => {});
    cargarServicios();
  }, []);

  let tarifaTCMV = 0;
  if (distancia === 'menor') {
    if (camion === '350') tarifaTCMV = 30;
    if (camion === '600') tarifaTCMV = 50;
    if (camion === '750') tarifaTCMV = 70;
  } else if (distancia === 'mayor') {
    if (camion === '350') tarifaTCMV = 40;
    if (camion === '600') tarifaTCMV = 60;
    if (camion === '750') tarifaTCMV = 80;
  }
  const costoTotalBs = (tarifaTCMV * tasaBcv);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tarifaTCMV === 0) return;
    setIsSubmitting(true);

    const doc = localStorage.getItem('portal_doc') || '';
    const nombre = localStorage.getItem('portal_user') || '';

    try {
      const res = await fetch('/api/admin/servicios-especiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'extraordinario',
          identidad: doc,
          contribuyente: nombre,
          descripcion: `Recolección Especial: ${tipo} — Camión ${camion} — ${distancia === 'menor' ? 'Menos de 20 Km' : 'Más de 20 Km'} — ${direccion}`,
          monto: costoTotalBs,
          fecha: new Date().toISOString().split('T')[0],
          notas: detalles,
          estado: 'Pendiente',
          referencia: `SERV-EXT-${Date.now()}`,
          origen: 'contribuyente'
        })
      });

      if (res.ok) {
        setIsSuccess(true);
        cargarServicios();
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
    <div className="space-y-6 max-w-4xl mx-auto pb-12">

      {/* Servicios Asignados por el Funcionario */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-orange-50 px-6 py-4 border-b border-orange-100 flex items-center justify-between">
          <h2 className="font-semibold text-orange-900 uppercase flex items-center gap-2 text-sm">
            <FlaskConical className="w-5 h-5 text-orange-600" />
            Mis Servicios Extraordinarios
          </h2>
          <button onClick={cargarServicios} className="text-orange-600 hover:text-orange-800 transition-colors p-1">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {isLoadingServicios ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando servicios...</div>
        ) : servicios.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-20" />
            No tiene servicios extraordinarios registrados.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {servicios.map(s => (
              <div key={s.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{s.descripcion}</p>
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
                  {s.estado === 'Pendiente' && (
                    <Link href="/portal/pagos" className="text-[10px] text-emerald-600 hover:underline font-semibold">→ Ir a Pagar</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Solicitar Nuevo */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Sobre los Servicios Extraordinarios (Art. 50-52)</p>
          <p>Aplica para residuos que por sus dimensiones, peso o naturaleza no pueden ser recolectados por el servicio ordinario. Incluye escombros, desechos vegetales, muebles, cauchos, etc.</p>
        </div>
      </div>

      {isSuccess ? (
        <div className="bg-white rounded-lg border border-emerald-200 p-10 text-center shadow-sm">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">¡Solicitud Registrada!</h2>
          <p className="text-slate-600 mb-2">Su solicitud fue enviada al equipo de Aseo Urbano.</p>
          <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg inline-block border border-slate-100 mb-6">
            El cargo de <strong>Bs. {costoTotalBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong> aparecerá en su estado de cuenta.
            Diríjase a <strong>PAGAR</strong> para cancelarlo.
          </p>
          <div>
            <button onClick={() => { setIsSuccess(false); setTipo(''); setCamion(''); setDistancia(''); setDireccion(''); setDetalles(''); }}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-medium transition-colors">
              Nueva Solicitud
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700 uppercase flex items-center gap-2 text-sm">
              <Truck className="w-5 h-5 text-orange-600" />
              SOLICITAR RECOLECCIÓN ESPECIAL
            </h2>
          </div>

          <form className="p-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Desecho o Material *</label>
                <select value={tipo} onChange={e => setTipo(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-orange-500 bg-white" required>
                  <option value="">Seleccione una opción...</option>
                  <option value="Escombros y restos de construcción">Escombros y restos de construcción</option>
                  <option value="Desechos vegetales (Tala y poda)">Desechos vegetales (Tala y poda)</option>
                  <option value="Voluminosos (Muebles, colchones, enseres)">Voluminosos (Muebles, colchones, enseres)</option>
                  <option value="Cauchos / Neumáticos">Cauchos / Neumáticos</option>
                  <option value="Animales muertos">Animales muertos</option>
                  <option value="Residuos de eventos especiales">Residuos de eventos especiales (Ferias, verbenas)</option>
                  <option value="Otros materiales pesados o especiales">Otros materiales pesados o especiales</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Camión Requerido *</label>
                <select value={camion} onChange={e => setCamion(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-orange-500 bg-white" required>
                  <option value="">Seleccione capacidad...</option>
                  <option value="350">Camión 350</option>
                  <option value="600">Camión 600</option>
                  <option value="750">Camión 750</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Distancia del Servicio *</label>
                <select value={distancia} onChange={e => setDistancia(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-orange-500 bg-white" required>
                  <option value="">Seleccione rango...</option>
                  <option value="menor">Menor a 20 Kms</option>
                  <option value="mayor">Mayor a 20 Kms</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Exacta de Recolección *</label>
                <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2.5 focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Calle Principal, Frente a la plaza..." required />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Detalles adicionales</label>
                <textarea rows={2} value={detalles} onChange={e => setDetalles(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-orange-500"
                  placeholder="Describa si se requiere maquinaria pesada, acceso difícil, etc." />
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col items-end">
              <span className="text-sm font-medium text-slate-500">Cálculo de Tarifa (Tabla 3 Ordenanza)</span>
              <div className="text-2xl font-black text-slate-800 mt-1">
                {tarifaTCMV > 0 ? `Bs. ${costoTotalBs.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '0.00 Bs'}
              </div>
              {tarifaTCMV > 0 && <span className="text-xs text-slate-400 mt-1">Equivalente a {tarifaTCMV} TCMV</span>}
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={isSubmitting || tarifaTCMV === 0}
                className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-2.5 rounded font-semibold text-sm disabled:opacity-50 transition-colors shadow-sm">
                {isSubmitting ? 'Enviando...' : <><Send className="w-4 h-4" /> Enviar Solicitud</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
