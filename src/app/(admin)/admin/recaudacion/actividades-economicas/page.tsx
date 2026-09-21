'use client';
import { useState, useEffect } from 'react';
import { Briefcase, Plus, FileText, Search, X, Calculator, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ActividadesEconomicasPage() {
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDeclForm, setShowDeclForm] = useState(false);
  const [showLicForm, setShowLicForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Empresa Form
  const [formData, setFormData] = useState({
    rif: '', razon_social: '', representante_legal: '', direccion: '',
    telefono: '', correo: '', clasificador_actividad: '', alicuota: 0
  });

  // Declaracion Form
  const [declData, setDeclData] = useState({
    empresa_id: '', periodo: '', tipo_declaracion: 'Mensual', ingresos_brutos: 0, impuesto_calculado: 0
  });

  // Licencia Form
  const [licData, setLicData] = useState({
    empresa_id: '', numero_licencia: '', tipo_licencia: 'Funcionamiento', 
    fecha_emision: new Date().toISOString().split('T')[0], 
    fecha_vencimiento: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchEmpresas();
  }, []);

  const fetchEmpresas = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('hacienda_empresas').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setEmpresas(data);
    }
    setLoading(false);
  };

  const handleEmpresaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('hacienda_empresas').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Empresa registrada exitosamente');
      setShowForm(false);
      fetchEmpresas();
    }
  };

  const handleDeclSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const empresa = empresas.find(emp => emp.id === declData.empresa_id);
    let impuesto = declData.impuesto_calculado;
    if (empresa && impuesto === 0 && declData.ingresos_brutos > 0) {
      impuesto = (declData.ingresos_brutos * empresa.alicuota) / 100;
    }

    const { error } = await supabase.from('hacienda_declaraciones').insert([{ ...declData, impuesto_calculado: impuesto }]);
    setSaving(false);
    
    if (!error) {
      alert('Declaración procesada. Impuesto: ' + impuesto + ' EUR');
      setShowDeclForm(false);
    }
  };

  const handleLicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const { error } = await supabase.from('hacienda_licencias').insert([licData]);
    setSaving(false);
    
    if (!error) {
      alert('Licencia emitida exitosamente.');
      setShowLicForm(false);
    } else {
      alert('Error al emitir licencia: ' + error.message);
    }
  };

  const calcularImpuesto = () => {
    const empresa = empresas.find(emp => emp.id === declData.empresa_id);
    if (empresa && declData.ingresos_brutos > 0) {
      const calculo = (declData.ingresos_brutos * empresa.alicuota) / 100;
      setDeclData({ ...declData, impuesto_calculado: calculo });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-500" />
            Actividades Económicas
          </h1>
          <p className="text-slate-500 mt-1">Gestión de empresas, patentes, licencias y declaraciones juradas.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Registrar Empresa
          </button>
        </div>
      </div>

      {/* MODALES OCULTOS POR ESPACIO... */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Registrar Empresa</h2>
              <button onClick={() => setShowForm(false)}><X /></button>
            </div>
            <form onSubmit={handleEmpresaSubmit} className="grid grid-cols-2 gap-4">
              <input required value={formData.rif} onChange={e=>setFormData({...formData,rif:e.target.value})} placeholder="RIF" className="border p-2 rounded" />
              <input required value={formData.razon_social} onChange={e=>setFormData({...formData,razon_social:e.target.value})} placeholder="Razón Social" className="border p-2 rounded" />
              <input required value={formData.representante_legal} onChange={e=>setFormData({...formData,representante_legal:e.target.value})} placeholder="Representante" className="border p-2 rounded" />
              <input required value={formData.clasificador_actividad} onChange={e=>setFormData({...formData,clasificador_actividad:e.target.value})} placeholder="Ramo / Actividad" className="border p-2 rounded" />
              <input required type="number" step="0.01" value={formData.alicuota} onChange={e=>setFormData({...formData,alicuota:parseFloat(e.target.value)})} placeholder="Alícuota %" className="border p-2 rounded" />
              <input value={formData.telefono} onChange={e=>setFormData({...formData,telefono:e.target.value})} placeholder="Teléfono" className="border p-2 rounded" />
              <div className="col-span-2 text-right mt-4">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeclForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Declaración Jurada</h2>
              <button onClick={() => setShowDeclForm(false)}><X /></button>
            </div>
            <form onSubmit={handleDeclSubmit} className="space-y-4">
              <input required value={declData.periodo} onChange={e=>setDeclData({...declData,periodo:e.target.value})} placeholder="Período" className="w-full border p-2 rounded" />
              <div className="flex gap-2">
                <input required type="number" step="0.01" value={declData.ingresos_brutos} onChange={e=>setDeclData({...declData,ingresos_brutos:parseFloat(e.target.value)})} placeholder="Ingresos Brutos" className="flex-1 border p-2 rounded" />
                <button type="button" onClick={calcularImpuesto} className="bg-slate-800 text-white px-4 py-2 rounded">Calcular</button>
              </div>
              {declData.impuesto_calculado > 0 && <p className="font-bold text-blue-600">Impuesto: {declData.impuesto_calculado.toFixed(2)} EUR</p>}
              <div className="text-right">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Procesar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLicForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5"/> Emitir Licencia</h2>
              <button onClick={() => setShowLicForm(false)}><X /></button>
            </div>
            <form onSubmit={handleLicSubmit} className="space-y-4">
              <input required value={licData.numero_licencia} onChange={e=>setLicData({...licData,numero_licencia:e.target.value})} placeholder="Número de Licencia / Resolución" className="w-full border p-2 rounded" />
              <select value={licData.tipo_licencia} onChange={e=>setLicData({...licData,tipo_licencia:e.target.value})} className="w-full border p-2 rounded">
                <option value="Funcionamiento">Licencia de Funcionamiento</option>
                <option value="Licores">Licencia de Licores</option>
                <option value="Eventos Especiales">Permiso Eventos Especiales</option>
              </select>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm">Emisión</label><input type="date" required value={licData.fecha_emision} onChange={e=>setLicData({...licData,fecha_emision:e.target.value})} className="w-full border p-2 rounded" /></div>
                <div><label className="text-sm">Vencimiento</label><input type="date" required value={licData.fecha_vencimiento} onChange={e=>setLicData({...licData,fecha_vencimiento:e.target.value})} className="w-full border p-2 rounded" /></div>
              </div>
              <div className="text-right mt-4">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Generar Licencia</button>
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
            <input type="text" placeholder="Buscar por RIF o Razón Social..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">RIF</th>
                <th className="px-6 py-4">Razón Social</th>
                <th className="px-6 py-4">Alícuota</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">Cargando empresas...</td></tr>
              ) : empresas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay empresas registradas aún.</p>
                  </td>
                </tr>
              ) : (
                empresas.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700">{emp.rif}</td>
                    <td className="px-6 py-4 text-slate-600">{emp.razon_social}</td>
                    <td className="px-6 py-4 text-slate-600">{emp.alicuota}%</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        {emp.estatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-3">
                      <button onClick={() => { setDeclData({...declData, empresa_id: emp.id}); setShowDeclForm(true); }} className="text-blue-600 font-medium text-xs">Declarar</button>
                      <button onClick={() => { setLicData({...licData, empresa_id: emp.id}); setShowLicForm(true); }} className="text-amber-600 font-medium text-xs">Emitir Licencia</button>
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
