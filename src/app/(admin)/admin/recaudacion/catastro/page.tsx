'use client';
import { useState, useEffect } from 'react';
import { Building2, Plus, Search, X, MapPin, Calculator, FileCheck2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function CatastroPage() {
  const [inmuebles, setInmuebles] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showCalcForm, setShowCalcForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    numero_catastral: '', propietario: '', cedula_rif: '', direccion: '',
    metros_terreno: 0, metros_construccion: 0, uso_inmueble: 'Residencial', valor_inmueble: 0
  });

  const [calcData, setCalcData] = useState({
    inmueble_id: '', planta_valores: 0, derecho_frente_anual: 0
  });

  useEffect(() => {
    fetchInmuebles();
  }, []);

  const fetchInmuebles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('hacienda_catastro').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setInmuebles(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('hacienda_catastro').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Ficha catastral registrada exitosamente');
      setShowForm(false);
      setFormData({
        numero_catastral: '', propietario: '', cedula_rif: '', direccion: '', 
        metros_terreno: 0, metros_construccion: 0, uso_inmueble: 'Residencial', valor_inmueble: 0
      });
      fetchInmuebles();
    } else {
      alert('Error al registrar inmueble: ' + error.message);
    }
  };

  const handleCalcSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const inm = inmuebles.find(i => i.id === calcData.inmueble_id);
    if (!inm) return;

    let derechoAnual = calcData.derecho_frente_anual;
    if (derechoAnual === 0) {
      // Fórmula genérica: (Terreno * Planta + Construccion * Planta * 1.5) * 1%
      const base = (inm.metros_terreno * calcData.planta_valores) + (inm.metros_construccion * calcData.planta_valores * 1.5);
      derechoAnual = base * 0.01;
    }

    const { error } = await supabase.from('hacienda_catastro').update({ 
      planta_valores: calcData.planta_valores,
      derecho_frente_anual: derechoAnual 
    }).eq('id', inm.id);
    setSaving(false);

    if (!error) {
      alert(`Cálculo guardado. Derecho de frente anual: ${derechoAnual.toFixed(2)} EUR`);
      setShowCalcForm(false);
      fetchInmuebles();
    } else {
      alert('Error al guardar cálculo: ' + error.message);
    }
  };

  const calcularDerecho = () => {
    const inm = inmuebles.find(i => i.id === calcData.inmueble_id);
    if (inm && calcData.planta_valores > 0) {
      const base = (inm.metros_terreno * calcData.planta_valores) + (inm.metros_construccion * calcData.planta_valores * 1.5);
      setCalcData({ ...calcData, derecho_frente_anual: base * 0.01 });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-500" />
            Catastro y Propiedad
          </h1>
          <p className="text-slate-500 mt-1">Gestión de fichas catastrales, planta de valores y derecho de frente.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nueva Ficha Catastral
          </button>
        </div>
      </div>

      {/* MODAL FICHA CATASTRAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-slate-800">Registrar Inmueble</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nº Catastral</label>
                  <input required type="text" value={formData.numero_catastral} onChange={e => setFormData({...formData, numero_catastral: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" placeholder="Ej. 11-03-02..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cédula / RIF</label>
                  <input required type="text" value={formData.cedula_rif} onChange={e => setFormData({...formData, cedula_rif: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Propietario</label>
                  <input required type="text" value={formData.propietario} onChange={e => setFormData({...formData, propietario: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                  <textarea required value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" rows={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Metros Terreno (m²)</label>
                  <input required type="number" step="0.01" value={formData.metros_terreno} onChange={e => setFormData({...formData, metros_terreno: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Metros Construcción (m²)</label>
                  <input required type="number" step="0.01" value={formData.metros_construccion} onChange={e => setFormData({...formData, metros_construccion: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Uso del Inmueble</label>
                  <select value={formData.uso_inmueble} onChange={e => setFormData({...formData, uso_inmueble: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500">
                    <option value="Residencial">Residencial</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Terreno Baldío">Terreno Baldío</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar Ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CALCULO DERECHO FRENTE */}
      {showCalcForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800">Calcular Derecho de Frente</h2>
              <button onClick={() => setShowCalcForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCalcSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Inmueble</label>
                <select required value={calcData.inmueble_id} onChange={e => setCalcData({...calcData, inmueble_id: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500">
                  <option value="">Seleccione un inmueble...</option>
                  {inmuebles.map(i => (
                    <option key={i.id} value={i.id}>{i.numero_catastral} - {i.propietario}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Planta de Valores Referencial (EUR/m²)</label>
                  <div className="flex gap-2">
                    <input required type="number" step="0.01" value={calcData.planta_valores} onChange={e => setCalcData({...calcData, planta_valores: parseFloat(e.target.value)})} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500" />
                    <button type="button" onClick={calcularDerecho} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2">
                      <Calculator className="w-4 h-4" /> Calcular
                    </button>
                  </div>
                </div>

                {calcData.derecho_frente_anual > 0 && (
                  <div className="col-span-2 p-4 bg-emerald-50 border border-emerald-100 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="text-sm text-emerald-600 font-medium">Derecho de Frente Anual:</p>
                      <p className="text-2xl font-bold text-emerald-800">{calcData.derecho_frente_anual.toFixed(2)} EUR</p>
                    </div>
                    <FileCheck2 className="w-8 h-8 text-emerald-300" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowCalcForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving || calcData.derecho_frente_anual === 0} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  {saving ? 'Procesando...' : 'Fijar Impuesto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TABLA CATASTRO */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Buscar por Nº Catastral o Propietario..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Nº Catastral</th>
                <th className="px-6 py-4">Propietario</th>
                <th className="px-6 py-4">Uso</th>
                <th className="px-6 py-4">Metros (T/C)</th>
                <th className="px-6 py-4">Frente Anual</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">Cargando inmuebles...</td></tr>
              ) : inmuebles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay inmuebles registrados aún.</p>
                  </td>
                </tr>
              ) : (
                inmuebles.map((inm) => (
                  <tr key={inm.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-500" />
                      {inm.numero_catastral}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{inm.propietario}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{inm.uso_inmueble}</td>
                    <td className="px-6 py-4 text-slate-600">{inm.metros_terreno} / {inm.metros_construccion}</td>
                    <td className="px-6 py-4">
                      {inm.derecho_frente_anual ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          {inm.derecho_frente_anual} EUR
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Sin calcular</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => { setCalcData({...calcData, inmueble_id: inm.id}); setShowCalcForm(true); }} className="text-emerald-600 hover:text-emerald-800 font-medium text-xs">Fijar Impuesto</button>
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
