'use client';
import { useState, useEffect } from 'react';
import { Target, Plus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function POAPage() {
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    codigo_proyecto: '', nombre_proyecto: '', departamento: '',
    presupuesto_estimado: 0, fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: new Date().toISOString().split('T')[0], estatus: 'Planificado'
  });

  useEffect(() => {
    fetchProyectos();
  }, []);

  const fetchProyectos = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('admin_poa_proyectos').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setProyectos(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_poa_proyectos').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Proyecto formulado en el POA exitosamente');
      setShowForm(false);
      setFormData({
        codigo_proyecto: '', nombre_proyecto: '', departamento: '',
        presupuesto_estimado: 0, fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_fin: new Date().toISOString().split('T')[0], estatus: 'Planificado'
      });
      fetchProyectos();
    } else {
      alert('Error al registrar proyecto en el POA: ' + error.message);
    }
  };

  const actualizarAvance = async (id: string, avance: number) => {
    let nuevoAvance = avance;
    if (nuevoAvance < 0) nuevoAvance = 0;
    if (nuevoAvance > 100) nuevoAvance = 100;
    
    let estatus = 'En Ejecución';
    if (nuevoAvance === 100) estatus = 'Culminado';
    if (nuevoAvance === 0) estatus = 'Planificado';

    const { error } = await supabase.from('admin_poa_proyectos').update({ porcentaje_avance: nuevoAvance, estatus }).eq('id', id);
    if (!error) fetchProyectos();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-6 h-6 text-fuchsia-600" />
            Plan Operativo Anual (POA)
          </h1>
          <p className="text-slate-500 mt-1">Planificación, metas y control de ejecución de proyectos municipales.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Formular Proyecto
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800">Formular Nuevo Proyecto POA</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código de Proyecto</label>
                  <input required type="text" value={formData.codigo_proyecto} onChange={e => setFormData({...formData, codigo_proyecto: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" placeholder="Ej. POA-26-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Departamento Responsable</label>
                  <input required type="text" value={formData.departamento} onChange={e => setFormData({...formData, departamento: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" placeholder="Ej. Obras Públicas" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre y Objetivo del Proyecto</label>
                  <input required type="text" value={formData.nombre_proyecto} onChange={e => setFormData({...formData, nombre_proyecto: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" placeholder="Ej. Asfaltado de la Avenida Principal" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Estimada de Inicio</label>
                  <input required type="date" value={formData.fecha_inicio} onChange={e => setFormData({...formData, fecha_inicio: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Estimada de Culminación</label>
                  <input required type="date" value={formData.fecha_fin} onChange={e => setFormData({...formData, fecha_fin: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Presupuesto Asignado Estimado (EUR)</label>
                  <input required type="number" step="0.01" value={formData.presupuesto_estimado} onChange={e => setFormData({...formData, presupuesto_estimado: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500 font-bold" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Aprobar e Incluir en POA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA PRINCIPAL DE PROYECTOS POA */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Buscar proyecto o departamento..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-fuchsia-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 w-1/3">Proyecto</th>
                <th className="px-6 py-4">Presupuesto (EUR)</th>
                <th className="px-6 py-4">Fechas</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right">Progreso Físico (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">Cargando POA...</td></tr>
              ) : proyectos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay proyectos formulados en el Plan Operativo Anual.</p>
                  </td>
                </tr>
              ) : (
                proyectos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-800">{p.nombre_proyecto}</p>
                      <p className="text-xs text-slate-500">Cod: {p.codigo_proyecto} | Resp: {p.departamento}</p>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{p.presupuesto_estimado}</td>
                    <td className="px-6 py-4 text-slate-600 text-xs">
                      <p>Inicio: {new Date(p.fecha_inicio).toLocaleDateString()}</p>
                      <p>Fin: {new Date(p.fecha_fin).toLocaleDateString()}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-max ${
                        p.estatus === 'Planificado' ? 'bg-slate-100 text-slate-700' :
                        p.estatus === 'En Ejecución' ? 'bg-sky-100 text-sky-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {p.estatus}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <button onClick={() => actualizarAvance(p.id, p.porcentaje_avance - 10)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-500">-</button>
                          <span className="font-bold text-fuchsia-700 w-8 text-center">{p.porcentaje_avance}%</span>
                          <button onClick={() => actualizarAvance(p.id, p.porcentaje_avance + 10)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-500">+</button>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 max-w-[120px]">
                          <div className={`h-full rounded-full ${p.porcentaje_avance === 100 ? 'bg-green-500' : 'bg-fuchsia-500'}`} style={{ width: `${p.porcentaje_avance}%` }}></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
