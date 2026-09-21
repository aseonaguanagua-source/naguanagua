'use client';
import { useState, useEffect } from 'react';
import { Wallet, Search, Plus, CheckCircle, Receipt, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function PagosPage() {
  const [pagos, setPagos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    contribuyente_identidad: '',
    contribuyente_nombre: '',
    concepto: '',
    monto_total: 0,
    metodo_pago: 'Punto de Venta',
    referencia_comprobante: ''
  });

  useEffect(() => {
    fetchPagos();
  }, []);

  const fetchPagos = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('hacienda_pagos').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setPagos(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('hacienda_pagos').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Pago procesado y registrado exitosamente');
      setShowForm(false);
      setFormData({
        contribuyente_identidad: '', contribuyente_nombre: '', concepto: '',
        monto_total: 0, metodo_pago: 'Punto de Venta', referencia_comprobante: ''
      });
      fetchPagos();
    } else {
      alert('Error al registrar el pago. Verifique que creó la tabla hacienda_pagos en Supabase.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-green-500" />
            Caja y Pasarela de Pagos
          </h1>
          <p className="text-slate-500 mt-1">Gestión centralizada de cobros, transferencias y recibos.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Procesar Nuevo Pago
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-green-500" /> 
                Procesar Pago en Caja
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cédula / RIF</label>
                  <input required type="text" value={formData.contribuyente_identidad} onChange={e => setFormData({...formData, contribuyente_identidad: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-green-500" placeholder="Ej. V-12345678" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Razón Social</label>
                  <input required type="text" value={formData.contribuyente_nombre} onChange={e => setFormData({...formData, contribuyente_nombre: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-green-500" />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Concepto del Pago</label>
                  <input required type="text" value={formData.concepto} onChange={e => setFormData({...formData, concepto: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-green-500" placeholder="Ej. Impuesto Mensual Julio 2026 / Trimestre Vehicular" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto a Cobrar (EUR)</label>
                  <input required type="number" step="0.01" value={formData.monto_total} onChange={e => setFormData({...formData, monto_total: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-green-500 text-lg font-bold text-green-700" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
                  <select value={formData.metodo_pago} onChange={e => setFormData({...formData, metodo_pago: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-green-500">
                    <option value="Punto de Venta">Punto de Venta (Débito/Crédito)</option>
                    <option value="Transferencia">Transferencia Bancaria</option>
                    <option value="Efectivo">Efectivo</option>
                  </select>
                </div>

                {formData.metodo_pago !== 'Efectivo' && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nº Comprobante / Referencia / Lote</label>
                    <input required type="text" value={formData.referencia_comprobante} onChange={e => setFormData({...formData, referencia_comprobante: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-green-500" placeholder="Número de referencia del banco o voucher" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving || formData.monto_total <= 0} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
                  {saving ? 'Procesando...' : 'Registrar Cobro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA PRINCIPAL DE PAGOS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Buscar por referencia, cédula o concepto..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Contribuyente</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4">Monto</th>
                <th className="px-6 py-4">Método / Ref</th>
                <th className="px-6 py-4">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">Cargando historial de pagos...</td></tr>
              ) : pagos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No se han registrado pagos en caja aún.</p>
                  </td>
                </tr>
              ) : (
                pagos.map((pago) => (
                  <tr key={pago.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-700">{pago.contribuyente_nombre}</p>
                      <p className="text-xs text-slate-500">{pago.contribuyente_identidad}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate">{pago.concepto}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{pago.monto_total} EUR</td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-600">{pago.metodo_pago}</p>
                      <p className="text-xs text-slate-500">Ref: {pago.referencia_comprobante || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1 w-max">
                        <CheckCircle className="w-3 h-3" />
                        {pago.estatus}
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
