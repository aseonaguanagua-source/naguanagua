'use client';
import { useState, useEffect } from 'react';
import { Wallet, Plus, Search, X, Landmark, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function FinanzasPage() {
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [showCuentaForm, setShowCuentaForm] = useState(false);
  const [showMovForm, setShowMovForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'cuentas'|'movimientos'>('cuentas');
  
  const [cuentaData, setCuentaData] = useState({
    banco: '', numero_cuenta: '', tipo_cuenta: 'Corriente', saldo_actual: 0
  });

  const [movData, setMovData] = useState({
    cuenta_id: '', tipo_movimiento: 'Ingreso', monto: 0, concepto: ''
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    if (activeTab === 'cuentas') {
      const { data, error } = await supabase.from('admin_finanzas_cuentas').select('*').order('banco', { ascending: true });
      if (!error && data) setCuentas(data);
    } else {
      const { data: mData, error: mError } = await supabase.from('admin_finanzas_movimientos').select('*, admin_finanzas_cuentas(banco, numero_cuenta)').order('created_at', { ascending: false });
      if (!mError && mData) setMovimientos(mData);
      
      const { data: cData } = await supabase.from('admin_finanzas_cuentas').select('id, banco, numero_cuenta');
      if (cData) setCuentas(cData);
    }
    setLoading(false);
  };

  const handleCuentaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('admin_finanzas_cuentas').insert([cuentaData]);
    setSaving(false);
    
    if (!error) {
      alert('Cuenta bancaria registrada exitosamente');
      setShowCuentaForm(false);
      setCuentaData({ banco: '', numero_cuenta: '', tipo_cuenta: 'Corriente', saldo_actual: 0 });
      fetchData();
    } else {
      alert('Error al registrar cuenta: ' + error.message);
    }
  };

  const handleMovSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    // Registrar el movimiento
    const { error } = await supabase.from('admin_finanzas_movimientos').insert([movData]);
    
    if (!error) {
      // Actualizar el saldo de la cuenta
      const cuenta = cuentas.find(c => c.id === movData.cuenta_id);
      if (cuenta) {
        const factor = movData.tipo_movimiento === 'Ingreso' ? 1 : -1;
        const nuevoSaldo = Number(cuenta.saldo_actual) + (Number(movData.monto) * factor);
        await supabase.from('admin_finanzas_cuentas').update({ saldo_actual: nuevoSaldo }).eq('id', cuenta.id);
      }

      alert('Movimiento registrado exitosamente');
      setShowMovForm(false);
      setMovData({ cuenta_id: '', tipo_movimiento: 'Ingreso', monto: 0, concepto: '' });
      fetchData();
    } else {
      alert('Error al registrar movimiento: ' + error.message);
    }
    setSaving(false);
  };

  const conciliarMovimiento = async (id: string) => {
    const { error } = await supabase.from('admin_finanzas_movimientos').update({ conciliado: true }).eq('id', id);
    if (!error) fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-teal-500" />
            Finanzas y Conciliaciones
          </h1>
          <p className="text-slate-500 mt-1">Control de cuentas bancarias de la alcaldía, ingresos y egresos.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowCuentaForm(true)} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2">
            <Landmark className="w-4 h-4" />
            Añadir Cuenta
          </button>
          <button onClick={() => setShowMovForm(true)} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Registrar Movimiento
          </button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('cuentas')} 
          className={`px-4 py-2 font-medium ${activeTab === 'cuentas' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Cuentas Bancarias
        </button>
        <button 
          onClick={() => setActiveTab('movimientos')} 
          className={`px-4 py-2 font-medium ${activeTab === 'movimientos' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Movimientos y Conciliación
        </button>
      </div>

      {/* MODAL CREAR CUENTA */}
      {showCuentaForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Registrar Cuenta Bancaria</h2>
              <button onClick={() => setShowCuentaForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleCuentaSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Entidad Bancaria</label>
                <input required type="text" value={cuentaData.banco} onChange={e => setCuentaData({...cuentaData, banco: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500" placeholder="Ej. Banco de Venezuela" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Número de Cuenta</label>
                <input required type="text" value={cuentaData.numero_cuenta} onChange={e => setCuentaData({...cuentaData, numero_cuenta: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500" placeholder="0102-0000-00-0000000000" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Cuenta</label>
                  <select value={cuentaData.tipo_cuenta} onChange={e => setCuentaData({...cuentaData, tipo_cuenta: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500">
                    <option value="Corriente">Corriente</option>
                    <option value="Ahorro">Ahorro</option>
                    <option value="Moneda Extranjera">Moneda Extranjera</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Saldo Inicial (EUR)</label>
                  <input required type="number" step="0.01" value={cuentaData.saldo_actual} onChange={e => setCuentaData({...cuentaData, saldo_actual: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500 font-bold" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowCuentaForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">Guardar Cuenta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR MOVIMIENTO */}
      {showMovForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Registrar Ingreso / Egreso</h2>
              <button onClick={() => setShowMovForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <form onSubmit={handleMovSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta Bancaria Afectada</label>
                <select required value={movData.cuenta_id} onChange={e => setMovData({...movData, cuenta_id: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500">
                  <option value="">Seleccione una cuenta...</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco} - {c.numero_cuenta}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Movimiento</label>
                  <select value={movData.tipo_movimiento} onChange={e => setMovData({...movData, tipo_movimiento: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500">
                    <option value="Ingreso">Ingreso (+)</option>
                    <option value="Egreso">Egreso (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto (EUR)</label>
                  <input required type="number" step="0.01" value={movData.monto} onChange={e => setMovData({...movData, monto: parseFloat(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500 font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto / Referencia</label>
                <textarea required value={movData.concepto} onChange={e => setMovData({...movData, concepto: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-teal-500" rows={2} />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowMovForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50">Registrar Movimiento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VISTAS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab === 'cuentas' && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {loading ? <p className="text-slate-500">Cargando...</p> : 
              cuentas.map(c => (
                <div key={c.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center">
                      <Landmark className="w-5 h-5 text-teal-600" />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-full">{c.tipo_cuenta}</span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg mb-1">{c.banco}</h3>
                  <p className="text-slate-500 text-sm font-mono mb-4">{c.numero_cuenta}</p>
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Saldo Disponible</p>
                    <p className="text-2xl font-bold text-teal-700">{Number(c.saldo_actual).toLocaleString('es-ES', { minimumFractionDigits: 2 })} EUR</p>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {activeTab === 'movimientos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Concepto</th>
                  <th className="px-6 py-4">Cuenta Banco</th>
                  <th className="px-6 py-4">Monto (EUR)</th>
                  <th className="px-6 py-4 text-center">Conciliación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-500">Cargando movimientos...</td></tr>
                ) : movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-600">{new Date(m.fecha_movimiento).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      {m.tipo_movimiento === 'Ingreso' ? 
                        <span className="flex items-center gap-1 text-green-600 font-medium"><ArrowUpRight className="w-4 h-4"/> Ingreso</span> : 
                        <span className="flex items-center gap-1 text-red-600 font-medium"><ArrowDownRight className="w-4 h-4"/> Egreso</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-700 max-w-[200px] truncate">{m.concepto}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <p className="font-medium">{m.admin_finanzas_cuentas?.banco}</p>
                      <p className="text-xs font-mono">{m.admin_finanzas_cuentas?.numero_cuenta}</p>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">{m.monto}</td>
                    <td className="px-6 py-4 text-center">
                      {m.conciliado ? (
                        <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium">
                          <CheckCircle2 className="w-3 h-3"/> Conciliado
                        </span>
                      ) : (
                        <button onClick={() => conciliarMovimiento(m.id)} className="text-xs font-medium text-teal-600 hover:text-teal-800 bg-teal-50 px-3 py-1 rounded-full hover:bg-teal-100 transition-colors">
                          Marcar Conciliado
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
