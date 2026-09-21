'use client';
import { useState, useEffect } from 'react';
import { Users, Plus, Search, X, DollarSign, Calculator, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function RRHHPage() {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showNominaForm, setShowNominaForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Empleado Form
  const [formData, setFormData] = useState({
    cedula: '', nombres: '', apellidos: '', cargo: '', departamento: '',
    tipo_personal: 'Fijo', sueldo_base: 0, fecha_ingreso: new Date().toISOString().split('T')[0]
  });

  // Nomina Form
  const [nominaData, setNominaData] = useState({
    empleado_id: '', periodo: '', asignaciones: 0, deducciones: 0, total_neto: 0
  });

  useEffect(() => {
    fetchEmpleados();
  }, []);

  const fetchEmpleados = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('admin_rrhh_empleados').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setEmpleados(data);
    }
    setLoading(false);
  };

  const handleEmpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_rrhh_empleados').insert([formData]);
    setSaving(false);
    
    if (!error) {
      alert('Trabajador registrado exitosamente');
      setShowForm(false);
      fetchEmpleados();
    } else {
      alert('Error al registrar trabajador: ' + error.message);
    }
  };

  const handleNominaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_nomina').insert([nominaData]);
    setSaving(false);
    
    if (!error) {
      alert('Nómina procesada exitosamente.');
      setShowNominaForm(false);
    } else {
      alert('Error al procesar nómina: ' + error.message);
    }
  };

  const calcularNomina = () => {
    const emp = empleados.find(e => e.id === nominaData.empleado_id);
    if (emp) {
      const base = Number(emp.sueldo_base);
      const asig = Number(nominaData.asignaciones);
      const deduc = Number(nominaData.deducciones);
      setNominaData({ ...nominaData, total_neto: base + asig - deduc });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-500" />
            Recursos Humanos y Nómina
          </h1>
          <p className="text-slate-500 mt-1">Control de personal fijo, contratado, jubilado y pagos.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            Ingresar Personal
          </button>
        </div>
      </div>

      {/* MODAL INGRESAR PERSONAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-slate-800">Ficha de Nuevo Ingreso</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleEmpSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cédula de Identidad</label>
                  <input required type="text" value={formData.cedula} onChange={e => setFormData({...formData, cedula: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Ingreso</label>
                  <input required type="date" value={formData.fecha_ingreso} onChange={e => setFormData({...formData, fecha_ingreso: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombres</label>
                  <input required type="text" value={formData.nombres} onChange={e => setFormData({...formData, nombres: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apellidos</label>
                  <input required type="text" value={formData.apellidos} onChange={e => setFormData({...formData, apellidos: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cargo</label>
                  <input required type="text" value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" placeholder="Ej. Analista Administrativo" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
                  <input required type="text" value={formData.departamento} onChange={e => setFormData({...formData, departamento: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" placeholder="Ej. Dirección de Hacienda" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Condición</label>
                  <select value={formData.tipo_personal} onChange={e => setFormData({...formData, tipo_personal: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500">
                    <option value="Fijo">Personal Fijo</option>
                    <option value="Contratado">Contratado</option>
                    <option value="Jubilado">Jubilado</option>
                    <option value="Pensionado">Pensionado</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sueldo Base Mensual (EUR)</label>
                  <input required type="number" step="0.01" value={formData.sueldo_base} onChange={e => setFormData({...formData, sueldo_base: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500 font-bold text-sky-700" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Registrar Trabajador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PROCESAR NOMINA */}
      {showNominaForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl">
              <h2 className="text-xl font-bold text-slate-800">Procesar Recibo de Pago</h2>
              <button onClick={() => setShowNominaForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleNominaSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Trabajador</label>
                <select required value={nominaData.empleado_id} onChange={e => setNominaData({...nominaData, empleado_id: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500">
                  <option value="">Seleccione al trabajador...</option>
                  {empleados.map(e => (
                    <option key={e.id} value={e.id}>{e.cedula} - {e.nombres} {e.apellidos}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Período de Nómina</label>
                  <input required type="text" value={nominaData.periodo} onChange={e => setNominaData({...nominaData, periodo: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" placeholder="Ej. 1ra Quincena Julio 2026" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Asignaciones / Bonos</label>
                  <input required type="number" step="0.01" value={nominaData.asignaciones} onChange={e => setNominaData({...nominaData, asignaciones: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deducciones (SS, IVSS)</label>
                  <input required type="number" step="0.01" value={nominaData.deducciones} onChange={e => setNominaData({...nominaData, deducciones: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-sky-500" />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button type="button" onClick={calcularNomina} className="w-full px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                    <Calculator className="w-4 h-4" /> Calcular Neto a Pagar
                  </button>
                </div>

                {nominaData.total_neto > 0 && (
                  <div className="col-span-2 p-4 bg-sky-50 border border-sky-100 rounded-lg flex justify-between items-center mt-2">
                    <div>
                      <p className="text-sm text-sky-600 font-medium">Sueldo Base + Asignaciones - Deducciones</p>
                      <p className="text-2xl font-bold text-sky-800">{nominaData.total_neto.toFixed(2)} EUR</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-sky-300" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowNominaForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving || nominaData.total_neto === 0} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50">
                  {saving ? 'Procesando...' : 'Generar Recibo'}
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
            <input type="text" placeholder="Buscar por cédula, nombre o cargo..." className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Cargo / Dpto</th>
                <th className="px-6 py-4">Condición</th>
                <th className="px-6 py-4">Sueldo Base</th>
                <th className="px-6 py-4 text-right">Nómina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-500">Cargando personal...</td></tr>
              ) : empleados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No hay personal registrado en la alcaldía.</p>
                  </td>
                </tr>
              ) : (
                empleados.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-700">{emp.nombres} {emp.apellidos}</p>
                      <p className="text-xs text-slate-500">CI: {emp.cedula}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <p className="font-medium text-slate-700">{emp.cargo}</p>
                      <p className="text-xs text-slate-500">{emp.departamento}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        emp.tipo_personal === 'Fijo' ? 'bg-sky-100 text-sky-700' : 
                        emp.tipo_personal === 'Jubilado' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {emp.tipo_personal}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{emp.sueldo_base} EUR</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-3">
                      <button onClick={() => { setNominaData({...nominaData, empleado_id: emp.id}); setShowNominaForm(true); }} className="text-sky-600 hover:text-sky-800 font-medium text-xs bg-sky-50 px-3 py-1 rounded-lg">
                        Procesar Pago
                      </button>
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
