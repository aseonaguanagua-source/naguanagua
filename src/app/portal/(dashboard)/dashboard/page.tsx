'use client';
import { Save, Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function DatosContribuyentePage() {
  const [userData, setUserData] = useState({
    nombre: '', codigo: '', docType: 'V', docNum: '',
    email: '', telefonoMovil: '', telefonoFijo: '', direccion: '',
    nombreComercial: '', esCondominio: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Cambio de clave
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveConfirm, setClaveConfirm] = useState('');
  const [showClave, setShowClave] = useState(false);
  const [isSavingClave, setIsSavingClave] = useState(false);
  const [claveMsg, setClaveMsg] = useState<{type:'ok'|'err', txt:string}|null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const nombre = localStorage.getItem('portal_user') || '';
      const codigo = localStorage.getItem('portal_codigo') || '';
      const fullDoc = localStorage.getItem('portal_doc') || '';
      setUserData(prev => ({ ...prev, nombre, codigo, docType: fullDoc ? fullDoc.charAt(0) : 'V', docNum: fullDoc ? fullDoc.substring(1) : '' }));
      if (fullDoc) {
        const idLimpio = fullDoc.replace(/-/g, '').toUpperCase();
        const idFormateado = idLimpio.charAt(0) + '-' + idLimpio.slice(1);
        const soloNumeros = fullDoc.replace(/D/g, '');
        const { data } = await supabase.from('inmuebles')
          .select('correo_electronico, telefono, direccion, actividad_principal')
          .or('identidad.eq.' + idFormateado + ',identidad.eq.' + idLimpio + ',identidad.eq.' + fullDoc.toUpperCase() + ',identidad.eq.' + soloNumeros)
          .order('id', { ascending: true }).limit(1);
        if (data && data.length > 0) {
          const r = data[0];
          setUserData(prev => ({ ...prev, email: r.correo_electronico || '', telefonoMovil: r.telefono || '', direccion: r.direccion || '', nombreComercial: r.actividad_principal || '', esCondominio: !!(r.actividad_principal?.toLowerCase().includes('condominio')) }));
        }
      }
    };
    fetchUserData();
  }, []);

  const handleSave = async () => {
    const fullDoc = localStorage.getItem('portal_doc');
    if (!fullDoc) return;
    setIsSaving(true); setMessage('');
    try {
      const idLimpio = fullDoc.replace(/-/g, '').toUpperCase();
      const idFormateado = idLimpio.charAt(0) + '-' + idLimpio.slice(1);
      const soloNumeros = fullDoc.replace(/D/g, '');
      const { error } = await supabase.from('inmuebles').update({ correo_electronico: userData.email, telefono: userData.telefonoMovil, direccion: userData.direccion })
        .or('identidad.eq.' + idFormateado + ',identidad.eq.' + idLimpio + ',identidad.eq.' + fullDoc.toUpperCase() + ',identidad.eq.' + soloNumeros);
      if (error) throw error;
      setMessage('Datos actualizados correctamente');
      setTimeout(() => setMessage(''), 3000);
    } catch { setMessage('Error al actualizar datos'); }
    setIsSaving(false);
  };

  const handleCambioClave = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaveMsg(null);
    if (!claveActual) { setClaveMsg({ type: 'err', txt: 'Ingrese su clave actual.' }); return; }
    if (claveNueva.length < 6) { setClaveMsg({ type: 'err', txt: 'La nueva clave debe tener al menos 6 caracteres.' }); return; }
    if (claveNueva !== claveConfirm) { setClaveMsg({ type: 'err', txt: 'Las claves nuevas no coinciden.' }); return; }
    setIsSavingClave(true);
    try {
      const fullDoc = localStorage.getItem('portal_doc') || '';
      const idLimpio = fullDoc.replace(/-/g, '').toUpperCase();
      const idFormateado = idLimpio.charAt(0) + '-' + idLimpio.slice(1);
      // Verificar clave actual
      const { data: check } = await supabase.from('inmuebles').select('clave_portal')
        .or('identidad.eq.' + idFormateado + ',identidad.eq.' + idLimpio).limit(1).single();
      if (!check || check.clave_portal !== claveActual) {
        setClaveMsg({ type: 'err', txt: 'Clave actual incorrecta.' });
        setIsSavingClave(false); return;
      }
      const { error } = await supabase.from('inmuebles').update({ clave_portal: claveNueva })
        .or('identidad.eq.' + idFormateado + ',identidad.eq.' + idLimpio);
      if (error) throw error;
      setClaveMsg({ type: 'ok', txt: 'Clave actualizada exitosamente.' });
      setClaveActual(''); setClaveNueva(''); setClaveConfirm('');
    } catch { setClaveMsg({ type: 'err', txt: 'Error al cambiar la clave.' }); }
    setIsSavingClave(false);
  };

  const inputCls = 'w-full text-sm border border-slate-300 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
  const inputDisCls = 'w-full text-sm border border-slate-200 rounded px-3 py-2 bg-slate-50 text-slate-700 font-bold cursor-default';

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-16">
      {/* Acceso directo a Estado de Cuenta */}
      <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-xl shadow-lg border border-red-900 overflow-hidden text-white flex flex-col md:flex-row items-center justify-between p-6 gap-4">
        <div>
          <h2 className="text-xl font-black mb-1">Consulta tu Estado de Cuenta</h2>
          <p className="text-red-100 text-sm">Verifica tu deuda actual, recibos pendientes y descarga tu comprobante en formato PDF al instante.</p>
        </div>
        <Link 
          href="/portal/estado-cuenta" 
          className="bg-white text-red-700 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wide hover:bg-red-50 transition-colors shadow-md whitespace-nowrap"
        >
          Ir al Estado de Cuenta
        </Link>
      </div>

      {/* Datos Principales */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 uppercase text-sm tracking-wide">Datos del Contribuyente</h2>
          {message && <span className={'text-xs font-semibold ' + (message.includes('Error') ? 'text-red-500' : 'text-emerald-600')}>{message}</span>}
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Código</label>
            <input type="text" value={userData.codigo} disabled className={inputDisCls} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo / Nro. Identidad</label>
            <div className="flex gap-2">
              <input type="text" value={userData.docType} disabled className="w-14 text-sm border border-slate-200 rounded px-2 py-2 bg-slate-50 text-slate-700 font-bold text-center cursor-default" />
              <input type="text" value={userData.docNum} disabled className={inputDisCls} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre / Razón Social</label>
            <input type="text" value={userData.nombre} disabled className="w-full text-sm border border-emerald-200 rounded px-3 py-2 bg-emerald-50 text-emerald-800 font-bold cursor-default" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Teléfono Móvil</label>
            <input type="text" value={userData.telefonoMovil} onChange={e => setUserData({...userData, telefonoMovil: e.target.value})} className={inputCls} placeholder="Ej. 0414-1234567" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Teléfono Fijo</label>
            <input type="text" value={userData.telefonoFijo} onChange={e => setUserData({...userData, telefonoFijo: e.target.value})} className={inputCls} placeholder="Ej. 0261-1234567" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Correo Electrónico <span className="text-red-400">*</span></label>
            <input type="email" value={userData.email} onChange={e => setUserData({...userData, email: e.target.value})} className={inputCls} placeholder="correo@ejemplo.com" />
            <p className="text-[10px] text-slate-400 mt-1">Se usará para notificaciones y recuperación de clave.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dirección Fiscal</label>
            <input type="text" value={userData.direccion} onChange={e => setUserData({...userData, direccion: e.target.value})} className={inputCls} placeholder="Dirección como aparece en el RIF" />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button onClick={handleSave} disabled={isSaving} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 flex items-center gap-2 transition-colors disabled:opacity-50">
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </div>

      {/* Cambiar Clave */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-slate-700 uppercase text-sm tracking-wide">Cambiar Contraseña</h3>
        </div>
        <form onSubmit={handleCambioClave} className="p-5 space-y-4">
          {claveMsg && (
            <div className={'flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ' + (claveMsg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200')}>
              {claveMsg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {claveMsg.txt}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Clave Actual</label>
              <div className="relative">
                <input type={showClave ? 'text' : 'password'} value={claveActual} onChange={e => setClaveActual(e.target.value)} className={inputCls + ' pr-10'} placeholder="••••••••" required />
                <button type="button" onClick={() => setShowClave(!showClave)} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600">
                  {showClave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nueva Clave</label>
              <input type={showClave ? 'text' : 'password'} value={claveNueva} onChange={e => setClaveNueva(e.target.value)} className={inputCls} placeholder="mínimo 6 caracteres" required />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Confirmar Nueva</label>
              <input type={showClave ? 'text' : 'password'} value={claveConfirm} onChange={e => setClaveConfirm(e.target.value)} className={inputCls} placeholder="repetir clave" required />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isSavingClave} className="px-5 py-2 bg-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 transition-colors disabled:opacity-50">
              <Lock className="w-4 h-4" />
              {isSavingClave ? 'Actualizando...' : 'Actualizar Contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
