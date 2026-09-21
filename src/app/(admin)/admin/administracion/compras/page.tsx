'use client';
import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Search, X, FileText, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ComprasPage() {
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [partidas, setPartidas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    numero_orden: '', proveedor: '', rif_proveedor: '', descripcion_compra: '',
    monto_total: 0, partida_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Cargar ordenes
    const { data: ordData, error: ordError } = await supabase.from('admin_compras_ordenes').select('*, admin_partidas_presupuestarias(codigo_partida, descripcion)').order('created_at', { ascending: false });
    if (!ordError && ordData) {
      setOrdenes(ordData);
    }
    
    // Cargar partidas para el select
    const { data: partData, error: partError } = await supabase.from('admin_partidas_presupuestarias').select('id, codigo_partida, descripcion').order('codigo_partida', { ascending: true });
    if (!partError && partData) {
      setPartidas(partData);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_compras_ordenes').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Orden de compra/servicio generada exitosamente');
      setShowForm(false);
      setFormData({
        numero_orden: '', proveedor: '', rif_proveedor: '', descripcion_compra: '',
        monto_total: 0, partida_id: ''
      });
      fetchData();
    } else {
      alert('Error al generar orden: ' + error.message);
    }
  };

  // Función para aprobar/pagar orden
  const cambiarEstatus = async (id: string, nuevoEstatus: string) => {
    const { error } = await supabase.from('admin_compras_ordenes').update({ estatus: nuevoEstatus }).eq('id', id);
    if (!error) fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-fuchsia-500" />
            Compras y Servicios
          </h1>
          <p className="text-slate-500 mt-1">Gestión de proveedores, órdenes de compra y contratación de servicios.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Crear Orden de Compra
          </button>
        </div>
      </div>

      {/* MODAL CREAR ORDEN */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-slate-800">Generar Orden de Compra/Servicio</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Número de Orden / Correlativo</label>
                  <input required type="text" value={formData.numero_orden} onChange={e => setFormData({...formData, numero_orden: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" placeholder="Ej. OC-2026-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto Total (EUR)</label>
                  <input required type="number" step="0.01" value={formData.monto_total} onChange={e => setFormData({...formData, monto_total: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500 font-bold text-fuchsia-700" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RIF del Proveedor</label>
                  <input required type="text" value={formData.rif_proveedor} onChange={e => setFormData({...formData, rif_proveedor: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" placeholder="J-123456789" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Proveedor / Razón Social</label>
                  <input required type="text" value={formData.proveedor} onChange={e => setFormData({...formData, proveedor: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Partida Presupuestaria Afectada</label>
                  <select required value={formData.partida_id} onChange={e => setFormData({...formData, partida_id: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500">
                    <option value="">Seleccione a qué partida cargar el gasto...</option>
                    {partidas.map(p => (
                      <option key={p.id} value={p.id}>{p.codigo_partida} - {p.descripcion}</option>
                    ))}
                  </select>
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción de la Compra o Servicio</label>
                  <textarea required value={formData.descripcion_compra} onChange={e => setFormData({...formData, descripcion_compra: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500" rows={3} placeholder="Materiales de oficina, servicios de mantenimiento, etc." />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 transition-colors disabled:opacity-50">
                  {saving ? 'Generando...' : 'Generar Orden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA PRINCIPAL DE ORDENES */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Buscar por número de orden o proveedor..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-fuchsia-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Nº Orden</th>
                <th className="px-6 py-4">Proveedor</th>
                <th className="px-6 py-4">Concepto / Partida</th>
                <th className="px-6 py-4">Monto (EUR)</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">Cargando órdenes de compra...</td></tr>
              ) : ordenes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No se han emitido órdenes de compra.</p>
                  </td>
                </tr>
              ) : (
                ordenes.map((orden) => (
                  <tr key={orden.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{orden.numero_orden}</td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-800">{orden.proveedor}</p>
                      <p className="text-xs text-slate-500">RIF: {orden.rif_proveedor}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <p className="text-sm max-w-[250px] truncate" title={orden.descripcion_compra}>{orden.descripcion_compra}</p>
                      <p className="text-xs text-fuchsia-600 font-medium">{orden.admin_partidas_presupuestarias?.codigo_partida || 'Sin partida vinculada'}</p>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{orden.monto_total}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-max ${
                        orden.estatus === 'En Revisión' ? 'bg-amber-100 text-amber-700' :
                        orden.estatus === 'Pagada' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {orden.estatus === 'Pagada' && <CheckCircle className="w-3 h-3" />}
                        {orden.estatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {orden.estatus === 'En Revisión' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => cambiarEstatus(orden.id, 'Anulada')} className="text-xs text-red-600 hover:underline">Anular</button>
                          <button onClick={() => cambiarEstatus(orden.id, 'Pagada')} className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Aprobar Pago</button>
                        </div>
                      )}
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
