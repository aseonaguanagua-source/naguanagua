'use client';
import { useState, useEffect } from 'react';
import { Calculator, Plus, Search, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function PresupuestoPage() {
  const [partidas, setPartidas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    codigo_partida: '', descripcion: '', monto_asignado: 0, anio_fiscal: new Date().getFullYear()
  });

  useEffect(() => {
    fetchPartidas();
  }, []);

  const fetchPartidas = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('admin_partidas_presupuestarias').select('*').order('codigo_partida', { ascending: true });
    if (!error && data) {
      setPartidas(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_partidas_presupuestarias').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Partida presupuestaria creada exitosamente');
      setShowForm(false);
      setFormData({
        codigo_partida: '', descripcion: '', monto_asignado: 0, anio_fiscal: new Date().getFullYear()
      });
      fetchPartidas();
    } else {
      alert('Error al crear partida: ' + error.message);
    }
  };

  const calcularTotales = () => {
    const asignado = partidas.reduce((acc, curr) => acc + Number(curr.monto_asignado), 0);
    const ejecutado = partidas.reduce((acc, curr) => acc + Number(curr.monto_ejecutado), 0);
    const disponible = asignado - ejecutado;
    const porcentaje = asignado > 0 ? ((ejecutado / asignado) * 100).toFixed(1) : 0;
    return { asignado, ejecutado, disponible, porcentaje };
  };

  const totales = calcularTotales();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-indigo-500" />
            Presupuesto Público
          </h1>
          <p className="text-slate-500 mt-1">Formulación, partidas y control de ejecución presupuestaria.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Formular Partida
          </button>
        </div>
      </div>

      {/* DASHBOARD DE EJECUCION */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 text-sm font-medium mb-1">Presupuesto Aprobado (Total)</h3>
          <p className="text-2xl font-bold text-slate-800">{totales.asignado.toLocaleString('es-ES', { minimumFractionDigits: 2 })} EUR</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 text-sm font-medium mb-1">Monto Ejecutado</h3>
          <p className="text-2xl font-bold text-orange-600">{totales.ejecutado.toLocaleString('es-ES', { minimumFractionDigits: 2 })} EUR</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-slate-500 text-sm font-medium mb-1">Disponible</h3>
          <p className="text-2xl font-bold text-green-600">{totales.disponible.toLocaleString('es-ES', { minimumFractionDigits: 2 })} EUR</p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 shadow-sm flex flex-col justify-center">
          <h3 className="text-indigo-600 text-sm font-medium mb-1">Nivel de Ejecución</h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
              <div className="bg-indigo-500 h-full" style={{ width: `${totales.porcentaje}%` }}></div>
            </div>
            <span className="font-bold text-indigo-700 text-sm">{totales.porcentaje}%</span>
          </div>
        </div>
      </div>

      {/* MODAL CREAR PARTIDA */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800">Formular Partida Presupuestaria</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código de Partida</label>
                  <input required type="text" value={formData.codigo_partida} onChange={e => setFormData({...formData, codigo_partida: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" placeholder="Ej. 4.01.01.02.00" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                  <input required type="text" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" placeholder="Sueldos Básicos Personal Fijo" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Asignación Inicial (EUR)</label>
                  <input required type="number" step="0.01" value={formData.monto_asignado} onChange={e => setFormData({...formData, monto_asignado: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Año Fiscal</label>
                  <input required type="number" value={formData.anio_fiscal} onChange={e => setFormData({...formData, anio_fiscal: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Aprobar Partida'}
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
            <input type="text" placeholder="Buscar por código o descripción..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Partida</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Aprobado</th>
                <th className="px-6 py-4">Ejecutado</th>
                <th className="px-6 py-4">Disponible</th>
                <th className="px-6 py-4">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">Cargando partidas...</td></tr>
              ) : partidas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay partidas formuladas para el ejercicio actual.</p>
                  </td>
                </tr>
              ) : (
                partidas.map((p) => {
                  const asig = Number(p.monto_asignado);
                  const ejec = Number(p.monto_ejecutado);
                  const disp = asig - ejec;
                  const pct = asig > 0 ? ((ejec / asig) * 100).toFixed(1) : '0.0';
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-700">{p.codigo_partida}</td>
                      <td className="px-6 py-4 text-slate-600 max-w-[250px] truncate">{p.descripcion}</td>
                      <td className="px-6 py-4 text-slate-600">{asig.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-orange-600 font-medium">{ejec.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-green-600 font-medium">{disp.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${Number(pct) > 90 ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
