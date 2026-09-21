'use client';
import { useState, useEffect } from 'react';
import { Search, Plus, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function FiscalizacionPage() {
  const [multas, setMultas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    identidad_infractor: '', nombre_infractor: '', tipo_multa: 'Publicidad y Propaganda', monto: 0, descripcion: ''
  });

  useEffect(() => {
    fetchMultas();
  }, []);

  const fetchMultas = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('hacienda_multas').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setMultas(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('hacienda_multas').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Multa impuesta exitosamente.');
      setShowForm(false);
      setFormData({
        identidad_infractor: '', nombre_infractor: '', tipo_multa: 'Publicidad y Propaganda', monto: 0, descripcion: ''
      });
      fetchMultas();
    } else {
      alert('Error al imponer multa: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            Fiscalización y Multas
          </h1>
          <p className="text-slate-500 mt-1">Control de multas, infracciones, publicidad y propaganda.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Imponer Nueva Multa
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">Imponer Multa / Infracción</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cédula / RIF del Infractor</label>
                  <input required type="text" value={formData.identidad_infractor} onChange={e => setFormData({...formData, identidad_infractor: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-red-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Razón Social</label>
                  <input required type="text" value={formData.nombre_infractor} onChange={e => setFormData({...formData, nombre_infractor: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-red-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Clasificación de Multa</label>
                  <select value={formData.tipo_multa} onChange={e => setFormData({...formData, tipo_multa: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-red-500">
                    <option value="Publicidad y Propaganda">Publicidad y Propaganda (Ilegal)</option>
                    <option value="Paralización de Obra">Paralización de Obra / Ordenamiento</option>
                    <option value="Infracción de Actividad">Infracción Actividad Económica</option>
                    <option value="Mora Tributaria">Mora Tributaria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto de Infracción (EUR)</label>
                  <input required type="number" step="0.01" value={formData.monto} onChange={e => setFormData({...formData, monto: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-red-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del Hecho</label>
                  <textarea required value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-red-500" rows={3} />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
                  {saving ? 'Registrando...' : 'Emitir Multa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Buscar por infractor o concepto..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Infractor</th>
                <th className="px-6 py-4">Tipo Infracción</th>
                <th className="px-6 py-4">Fecha Imposición</th>
                <th className="px-6 py-4">Monto (EUR)</th>
                <th className="px-6 py-4">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">Cargando multas...</td></tr>
              ) : multas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay multas registradas aún.</p>
                  </td>
                </tr>
              ) : (
                multas.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-700">{m.nombre_infractor}</p>
                      <p className="text-xs text-slate-500">{m.identidad_infractor}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <p className="font-medium text-red-600">{m.tipo_multa}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{m.descripcion}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{new Date(m.fecha_imposicion).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{m.monto} EUR</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                        {m.estatus}
                      </span>
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
