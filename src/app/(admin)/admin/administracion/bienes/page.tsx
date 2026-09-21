'use client';
import { useState, useEffect } from 'react';
import { Building2, Plus, Search, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function BienesPage() {
  const [bienes, setBienes] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    codigo_bien: '', descripcion: '', departamento_asignado: '',
    valor_adquisicion: 0, fecha_adquisicion: new Date().toISOString().split('T')[0],
    estado_fisico: 'Operativo'
  });

  useEffect(() => {
    fetchBienes();
  }, []);

  const fetchBienes = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('admin_bienes_nacionales').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setBienes(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_bienes_nacionales').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Bien Nacional registrado exitosamente');
      setShowForm(false);
      setFormData({
        codigo_bien: '', descripcion: '', departamento_asignado: '',
        valor_adquisicion: 0, fecha_adquisicion: new Date().toISOString().split('T')[0],
        estado_fisico: 'Operativo'
      });
      fetchBienes();
    } else {
      alert('Error al registrar bien nacional: ' + error.message);
    }
  };

  const cambiarEstado = async (id: string, nuevoEstado: string) => {
    const { error } = await supabase.from('admin_bienes_nacionales').update({ estado_fisico: nuevoEstado }).eq('id', id);
    if (!error) fetchBienes();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-rose-500" />
            Bienes Nacionales
          </h1>
          <p className="text-slate-500 mt-1">Inventario mayor, equipos, vehículos e inmuebles de la alcaldía.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Incorporar Bien
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800">Incorporación de Bien Nacional</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código Patrimonial</label>
                  <input required type="text" value={formData.codigo_bien} onChange={e => setFormData({...formData, codigo_bien: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-rose-500" placeholder="Ej. BN-2026-0001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Adquisición</label>
                  <input required type="date" value={formData.fecha_adquisicion} onChange={e => setFormData({...formData, fecha_adquisicion: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-rose-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del Equipo / Inmueble</label>
                  <input required type="text" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-rose-500" placeholder="Ej. Vehículo Toyota Corolla 2024 / Computadora HP..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dpto. Asignado / Responsable</label>
                  <input required type="text" value={formData.departamento_asignado} onChange={e => setFormData({...formData, departamento_asignado: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-rose-500" placeholder="Dirección de Hacienda" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Valor de Adquisición (EUR)</label>
                  <input required type="number" step="0.01" value={formData.valor_adquisicion} onChange={e => setFormData({...formData, valor_adquisicion: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-rose-500" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Incorporar al Inventario'}
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
            <input type="text" placeholder="Buscar por código patrimonial o descripción..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-rose-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Código / Registro</th>
                <th className="px-6 py-4">Descripción del Bien</th>
                <th className="px-6 py-4">Ubicación / Dpto.</th>
                <th className="px-6 py-4">Valor (EUR)</th>
                <th className="px-6 py-4">Estatus Físico</th>
                <th className="px-6 py-4 text-right">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">Cargando inventario de bienes...</td></tr>
              ) : bienes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay bienes nacionales registrados.</p>
                  </td>
                </tr>
              ) : (
                bienes.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{b.codigo_bien}</td>
                    <td className="px-6 py-4 text-slate-800 font-medium max-w-[200px] truncate" title={b.descripcion}>{b.descripcion}</td>
                    <td className="px-6 py-4 text-slate-600">{b.departamento_asignado}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{b.valor_adquisicion}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-max ${
                        b.estado_fisico === 'Operativo' ? 'bg-green-100 text-green-700' :
                        b.estado_fisico === 'Dañado' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {b.estado_fisico}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {b.estado_fisico === 'Operativo' && <button onClick={() => cambiarEstado(b.id, 'Dañado')} className="text-xs text-amber-600 hover:underline">Reportar Daño</button>}
                        {b.estado_fisico === 'Dañado' && <button onClick={() => cambiarEstado(b.id, 'Operativo')} className="text-xs text-green-600 hover:underline">Reparado</button>}
                        {b.estado_fisico !== 'Desincorporado' && <button onClick={() => cambiarEstado(b.id, 'Desincorporado')} className="text-xs text-red-600 hover:underline font-medium">Desincorporar</button>}
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
