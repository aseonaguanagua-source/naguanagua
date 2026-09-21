'use client';
import { useState, useEffect } from 'react';
import { Package, Plus, Search, X, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AlmacenPage() {
  const [insumos, setInsumos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    codigo_articulo: '', nombre: '', categoria: 'Papelería', cantidad_disponible: 0,
    punto_reorden: 10, unidad_medida: 'Unidad'
  });

  useEffect(() => {
    fetchInsumos();
  }, []);

  const fetchInsumos = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('admin_almacen_insumos').select('*').order('nombre', { ascending: true });
    if (!error && data) {
      setInsumos(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_almacen_insumos').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Insumo registrado en el almacén exitosamente');
      setShowForm(false);
      setFormData({
        codigo_articulo: '', nombre: '', categoria: 'Papelería', cantidad_disponible: 0,
        punto_reorden: 10, unidad_medida: 'Unidad'
      });
      fetchInsumos();
    } else {
      alert('Error al registrar insumo: ' + error.message);
    }
  };

  // Función simulada para darle salida/entrada a materiales rápido
  const ajustarInventario = async (id: string, delta: number, actual: number) => {
    const nuevo = actual + delta;
    if (nuevo < 0) return;
    const { error } = await supabase.from('admin_almacen_insumos').update({ cantidad_disponible: nuevo }).eq('id', id);
    if (!error) fetchInsumos();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" />
            Control de Almacén
          </h1>
          <p className="text-slate-500 mt-1">Gestión de insumos de uso diario e inventarios de la Alcaldía.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Registrar Insumo
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800">Nuevo Insumo al Inventario</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código de Artículo</label>
                  <input required type="text" value={formData.codigo_articulo} onChange={e => setFormData({...formData, codigo_articulo: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500" placeholder="Ej. PAP-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Descripción</label>
                  <input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500" placeholder="Resma de Papel Carta" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                  <select value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500">
                    <option value="Papelería">Papelería y Oficina</option>
                    <option value="Limpieza">Artículos de Limpieza</option>
                    <option value="Ferretería">Herramientas / Ferretería</option>
                    <option value="Repuestos">Repuestos Automotrices</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unidad de Medida</label>
                  <select value={formData.unidad_medida} onChange={e => setFormData({...formData, unidad_medida: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500">
                    <option value="Unidad">Unidad (C/U)</option>
                    <option value="Cajas">Cajas</option>
                    <option value="Resmas">Resmas</option>
                    <option value="Litros">Litros</option>
                    <option value="Kg">Kilogramos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock Inicial (Existencia)</label>
                  <input required type="number" value={formData.cantidad_disponible} onChange={e => setFormData({...formData, cantidad_disponible: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Punto de Reorden (Alerta Mínima)</label>
                  <input required type="number" value={formData.punto_reorden} onChange={e => setFormData({...formData, punto_reorden: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Crear Insumo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA PRINCIPAL DE INVENTARIO */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Buscar por código o nombre..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-amber-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Categoría / U.M.</th>
                <th className="px-6 py-4">Existencia</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right">Ajuste Rápido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">Cargando inventario...</td></tr>
              ) : insumos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay insumos registrados en el almacén central.</p>
                  </td>
                </tr>
              ) : (
                insumos.map((insumo) => {
                  const bajoStock = insumo.cantidad_disponible <= insumo.punto_reorden;
                  return (
                    <tr key={insumo.id} className={`hover:bg-slate-50 transition-colors ${bajoStock ? 'bg-red-50/30' : ''}`}>
                      <td className="px-6 py-4 font-medium text-slate-700">{insumo.codigo_articulo}</td>
                      <td className="px-6 py-4 font-bold text-slate-800">{insumo.nombre}</td>
                      <td className="px-6 py-4 text-slate-600">
                        <p>{insumo.categoria}</p>
                        <p className="text-xs text-slate-500">{insumo.unidad_medida}</p>
                      </td>
                      <td className={`px-6 py-4 font-bold text-lg ${bajoStock ? 'text-red-600' : 'text-slate-700'}`}>
                        {insumo.cantidad_disponible}
                      </td>
                      <td className="px-6 py-4">
                        {bajoStock ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-1 w-max">
                            <AlertCircle className="w-3 h-3" /> Reordenar
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Stock Óptimo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => ajustarInventario(insumo.id, -1, insumo.cantidad_disponible)} className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold" title="Salida (Despacho)">-</button>
                          <button onClick={() => ajustarInventario(insumo.id, 1, insumo.cantidad_disponible)} className="w-8 h-8 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 flex items-center justify-center font-bold" title="Entrada (Recepción)">+</button>
                        </div>
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
