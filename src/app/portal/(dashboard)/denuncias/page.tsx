'use client';
import { MessageSquare, Camera, Send, History, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Denuncia {
  id: string;
  fecha: string;
  tipo: string;
  direccion: string;
  descripcion: string;
  estado: string;
}

export default function DenunciasPage() {
  const [activeTab, setActiveTab] = useState<'nueva' | 'historial'>('nueva');
  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [tipo, setTipo] = useState('');
  const [direccion, setDireccion] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enviadoMsg, setEnviadoMsg] = useState<string | null>(null);

  useEffect(() => {
    const doc = localStorage.getItem('portal_doc') || '';
    if (doc) {
      try {
        const guardadas = JSON.parse(localStorage.getItem(`portal_denuncias_${doc}`) || '[]');
        setDenuncias(Array.isArray(guardadas) ? guardadas : []);
      } catch {
        setDenuncias([]);
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const doc = localStorage.getItem('portal_doc') || 'GEN';
    const nuevoTicket: Denuncia = {
      id: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
      fecha: new Date().toLocaleDateString('es-VE'),
      tipo,
      direccion,
      descripcion,
      estado: 'Recibido'
    };

    const actualizadas = [nuevoTicket, ...denuncias];
    setDenuncias(actualizadas);
    try {
      localStorage.setItem(`portal_denuncias_${doc}`, JSON.stringify(actualizadas));
    } catch {}

    setEnviadoMsg(`Su reporte fue registrado con éxito bajo el Nro. de Ticket: ${nuevoTicket.id}. La Dirección de Ecosocialismo lo revisará a la brevedad.`);
    setTipo('');
    setDireccion('');
    setDescripcion('');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            Atención al Ciudadano y Reportes de Servicio
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Reporte incidencias en recolección, botes en vía pública o solicitudes de atención directa.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button 
            onClick={() => { setActiveTab('nueva'); setEnviadoMsg(null); }}
            className={`px-6 py-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'nueva' ? 'border-emerald-600 text-emerald-800 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <MessageSquare className="w-4 h-4" /> Nuevo Reporte
          </button>
          <button 
            onClick={() => setActiveTab('historial')}
            className={`px-6 py-3.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'historial' ? 'border-emerald-600 text-emerald-800 bg-white' : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <History className="w-4 h-4" /> Mis Reportes Registrados ({denuncias.length})
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'nueva' && (
            <div className="max-w-xl mx-auto">
              {enviadoMsg ? (
                <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="font-bold text-emerald-900 text-sm">¡Reporte Enviado Correctamente!</h3>
                  <p className="text-xs text-emerald-800 leading-relaxed">{enviadoMsg}</p>
                  <button
                    onClick={() => setEnviadoMsg(null)}
                    className="mt-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    Crear Otro Reporte
                  </button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Tipo de Incidencia / Reporte</label>
                    <select 
                      required 
                      value={tipo}
                      onChange={e => setTipo(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                    >
                      <option value="">Seleccione el tipo de motivo...</option>
                      <option value="Falla de Recolección">Falla de Recolección (El camión no pasó por la ruta)</option>
                      <option value="Bote Ilegal">Bote de Desechos en Vía Pública</option>
                      <option value="Contenedor Desbordado">Contenedor Comunitario Desbordado</option>
                      <option value="Aclaratoria de Recibo">Aclaratoria de Recibo / Deuda</option>
                      <option value="Otro Motivo">Otro Motivo</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Sector o Dirección Exacta</label>
                    <input 
                      required 
                      type="text" 
                      value={direccion}
                      onChange={e => setDireccion(e.target.value)}
                      placeholder="Calle, avenida, urbanización o punto de referencia" 
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50" 
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Descripción del Caso</label>
                    <textarea 
                      required 
                      rows={4} 
                      value={descripcion}
                      onChange={e => setDescripcion(e.target.value)}
                      placeholder="Explique detalladamente la situación para que la cuadrilla o inspector pueda atenderla..." 
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                    />
                  </div>

                  <div className="pt-2">
                    <button 
                      type="submit" 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl w-full transition-colors flex items-center justify-center gap-2 text-xs shadow-sm"
                    >
                      <Send className="w-4 h-4" /> Registrar Reporte
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="space-y-4">
              {denuncias.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-600 text-xs">No tiene reportes ni reclamos activos.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Cualquier reporte ingresado se reflejará aquí con su estado de atención.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Ticket</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Dirección</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {denuncias.map((denuncia) => (
                        <tr key={denuncia.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono font-bold text-slate-700">{denuncia.id}</td>
                          <td className="px-4 py-3 text-slate-600">{denuncia.fecha}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{denuncia.tipo}</td>
                          <td className="px-4 py-3 text-slate-500 truncate max-w-xs">{denuncia.direccion}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold">
                              {denuncia.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
