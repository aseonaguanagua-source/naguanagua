'use client';
import { TreePine, Upload, AlertCircle, Send, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatBs } from '@/lib/formatCurrency';

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

export default function TalaYPodaPage() {
  const [tipoPermiso, setTipoPermiso] = useState('tala_poda');
  const [altura, setAltura] = useState('hasta_3');
  const [cantidad, setCantidad] = useState(1);
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
        }).filter((s: any) => s.tipo === 'tala_poda');
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
  if (tipoPermiso === 'tala_poda') {
    if (altura === 'hasta_3') tarifaTCMV = 7 * cantidad;
    else if (altura === '4_a_5') tarifaTCMV = 10 * cantidad;
    else if (altura === 'mayor_5') tarifaTCMV = 15 * cantidad;
  } else if (tipoPermiso === 'limpieza') {
    tarifaTCMV = 10;
  } else if (tipoPermiso === 'variables') {
    tarifaTCMV = 20;
  } else if (tipoPermiso === 'constancias') {
    tarifaTCMV = 5;
  }
  const costoTotalBs = (tarifaTCMV * tasaBcv);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tarifaTCMV === 0) return;
    setIsSubmitting(true);

    const doc = localStorage.getItem('portal_doc') || '';
    const nombre = localStorage.getItem('portal_user') || '';

    let desc = '';
    if (tipoPermiso === 'tala_poda') {
      const altStr = altura === 'hasta_3' ? 'Hasta 3m' : (altura === '4_a_5' ? '4m a 5m' : 'Mayor a 5m');
      desc = `Tala y Poda - Altura: ${altStr} - Unidades: ${cantidad} - Dir: ${direccion}`;
    } else {
      desc = `Permiso: ${tipoPermiso} - Dir: ${direccion}`;
    }

    try {
      const res = await fetch('/api/admin/servicios-especiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'tala_poda',
          identidad: doc,
          contribuyente: nombre,
          descripcion: desc,
          monto: costoTotalBs,
          fecha: new Date().toISOString().split('T')[0],
          notas: detalles,
          estado: 'Pendiente',
          referencia: `SERV-TALA-${Date.now()}`,
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

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
          <h2 className="font-semibold text-emerald-900 uppercase flex items-center gap-2 text-sm">
            <TreePine className="w-5 h-5 text-emerald-600" />
            Mis Permisos (Tala / Poda / Otros)
          </h2>
          <button onClick={cargarServicios} className="text-emerald-600 hover:text-emerald-800 transition-colors p-1">
            <RefreshCw className={`w-4 h-4 ${isLoadingServicios ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {servicios.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {servicios.map((s, i) => (
              <div key={i} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-slate-800">{s.referencia || `PERM-00${s.id}`}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${estadoColor(s.estado)}`}>
                      {s.estado}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{s.descripcion}</p>
                  <div className="text-xs text-slate-400 mt-2 flex items-center gap-4">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Solicitado: {new Date(s.fecha).toLocaleDateString('es-VE')}</span>
                  </div>
                </div>
                
                <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between">
                  <span className="text-lg font-black text-slate-900 flex items-baseline gap-1">
                    {formatBs(s.monto)}
                  </span>
                  
                  {(s.estado === 'Pendiente' || s.estado === 'Aprobado') && (
                    <Link href="/portal/pagos" className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 underline">
                      Ir a Pagar
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500">
            <TreePine className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p>No tienes permisos ni solicitudes de Tala/Poda registrados.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 uppercase flex items-center gap-2 text-sm">
            <TreePine className="w-5 h-5 text-slate-500" />
            Solicitar Nuevo Permiso
          </h2>
        </div>

        {isSuccess ? (
          <div className="p-12 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">¡Solicitud Enviada!</h3>
            <p className="text-slate-600 mb-6">
              Tu solicitud de permiso ha sido enviada. Pronto el departamento de Ambiente se comunicará contigo.
            </p>
            <button 
              onClick={() => setIsSuccess(false)}
              className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors font-semibold"
            >
              Realizar otra solicitud
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 flex gap-3 text-sm text-blue-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Información Importante</p>
                <p>Las tarifas aplicadas se calculan automáticamente según la ordenanza vigente. Asegúrese de especificar las dimensiones correctas.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de Permiso</label>
                <select 
                  value={tipoPermiso}
                  onChange={e => setTipoPermiso(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="tala_poda">Tala y Poda de Árboles</option>
                  <option value="limpieza">Limpieza de Terrenos</option>
                  <option value="variables">Variables Urbanas (Ambiental)</option>
                  <option value="constancias">Constancias y Renovaciones</option>
                </select>
              </div>

              {tipoPermiso === 'tala_poda' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Altura Promedio</label>
                    <select 
                      value={altura}
                      onChange={e => setAltura(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    >
                      <option value="hasta_3">Hasta 3 metros</option>
                      <option value="4_a_5">De 4 a 5 metros</option>
                      <option value="mayor_5">Mayor a 5 metros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Unidades Arbóreas (Cantidad)</label>
                    <input 
                      type="number" 
                      min="1"
                      value={cantidad}
                      onChange={e => setCantidad(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Dirección de la solicitud</label>
                <input 
                  type="text" 
                  value={direccion}
                  onChange={e => setDireccion(e.target.value)}
                  placeholder="Ej: Sector Las Quintas, Calle 4, Casa 12"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Detalles o Notas Adicionales (Opcional)</label>
                <textarea 
                  value={detalles}
                  onChange={e => setDetalles(e.target.value)}
                  placeholder="Cualquier información relevante para los inspectores..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p className="text-sm font-bold text-slate-500 uppercase mb-1">Costo Estimado del Permiso</p>
                <p className="text-3xl font-black text-slate-900">{formatBs(costoTotalBs)}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Base cálculo: {tarifaTCMV} U.M.M.V. × Tasa BCV ({tasaBcv.toFixed(2)})
                </p>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting || tarifaTCMV === 0}
                className="w-full sm:w-auto px-8 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2"><RefreshCw className="w-5 h-5 animate-spin" /> Procesando...</span>
                ) : (
                  <span className="flex items-center gap-2"><Send className="w-5 h-5" /> Enviar Solicitud</span>
                )}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}
