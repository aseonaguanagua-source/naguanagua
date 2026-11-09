'use client';
import { Save, Lock, CheckCircle2, AlertCircle, Eye, EyeOff, Home, Store, Building2 } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariantsExact, formatActividad } from '@/lib/formatters';
import { groupInmueblesByLocal, InmuebleBasic } from '@/lib/cajaHelpers';

export default function DatosContribuyentePage() {
  const [userData, setUserData] = useState({
    nombre: '', codigo: '', docType: 'V', docNum: '',
    email: '', telefonoMovil: '', telefonoFijo: '', direccion: '',
    nombreComercial: '', esCondominio: false
  });
  const [inmueblesList, setInmueblesList] = useState<InmuebleBasic[]>([]);
  const [filtroCat, setFiltroCat] = useState<'TODOS' | 'RESIDENCIAL' | 'COMERCIAL'>('TODOS');
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
        const variants = getIdentidadVariantsExact(fullDoc);
        const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

        // 1. Obtener datos maestros del contribuyente
        const { data: contribData } = await supabase
          .from('contribuyentes')
          .select('nombre, email, telefono, direccion')
          .or(orFilter)
          .limit(1)
          .maybeSingle();

        // 2. Obtener inmuebles asociados para categorizar Residencial vs Comercial
        const { data: inmsDataRaw } = await supabase
          .from('inmuebles')
          .select('id, identidad, inmueble, contribuyente, cant_inmuebles, mmv_mes, deuda_mmv, deuda_congelada_bs, clasificacion, tipo, correo_electronico, telefono, direccion, actividad_principal, agente_retencion, multa_bs, meses_deuda, es_condominio, condominio_padre_id, padre_id, estado')
          .or(orFilter)
          .order('id', { ascending: true });

        const inmsData = (inmsDataRaw || []).filter((i: any) => {
          const est = (i.estado || 'Activo').trim().toLowerCase();
          return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
        });

        setInmueblesList(inmsData as InmuebleBasic[]);

        const rInm = inmsData && inmsData.length > 0
          ? (
              inmsData.find(i => !i.condominio_padre_id && !i.padre_id && !i.es_condominio && (i.actividad_principal || '').trim().toUpperCase() !== 'N/A') ||
              inmsData.find(i => !i.condominio_padre_id && !i.es_condominio) ||
              inmsData.find(i => (i.actividad_principal || '').trim().toUpperCase() !== 'N/A') ||
              inmsData[0]
            )
          : null;

        let condoData: any = null;
        if (!inmsData || inmsData.length === 0) {
          const { data: cUnit } = await supabase
            .from('condominio_unidades')
            .select('propietario, inmueble, actividad, telefono, correo')
            .neq('estado', 'Eliminada')
            .or(orFilter)
            .limit(1)
            .maybeSingle();
          condoData = cUnit;
        }

        const freshNombre = contribData?.nombre || rInm?.contribuyente || condoData?.propietario || nombre;
        const freshCodigo = rInm?.inmueble || condoData?.inmueble || codigo;

        if (freshNombre && freshNombre !== nombre) {
          localStorage.setItem('portal_user', freshNombre);
        }
        if (freshCodigo && freshCodigo !== codigo) {
          localStorage.setItem('portal_codigo', freshCodigo);
        }

        setUserData(prev => ({
          ...prev,
          nombre: freshNombre,
          codigo: freshCodigo,
          email: rInm?.correo_electronico || contribData?.email || condoData?.correo || prev.email,
          telefonoMovil: rInm?.telefono || contribData?.telefono || condoData?.telefono || prev.telefonoMovil,
          direccion: rInm?.direccion || contribData?.direccion || prev.direccion,
          nombreComercial: (rInm?.actividad_principal && rInm.actividad_principal.trim().toUpperCase() !== 'N/A') 
            ? formatActividad(rInm.actividad_principal) 
            : (condoData?.actividad ? formatActividad(condoData.actividad) : freshNombre),
          esCondominio: !!(rInm?.actividad_principal?.toLowerCase().includes('condominio') || condoData)
        }));
      }
    };
    fetchUserData();
  }, []);

  // Agrupación y Categorización Residencial vs Comercial
  const clusters = useMemo(() => groupInmueblesByLocal(inmueblesList), [inmueblesList]);
  const residenciales = useMemo(() => clusters.filter(c => c.tipo === 'RESIDENCIAL'), [clusters]);
  const comerciales = useMemo(() => clusters.filter(c => c.tipo === 'COMERCIAL'), [clusters]);

  const categoriaGlobal = useMemo(() => {
    if (comerciales.length > 0 && residenciales.length > 0) return 'MIXTO';
    if (comerciales.length > 0) return 'COMERCIAL';
    if (residenciales.length > 0) return 'RESIDENCIAL';
    // Fallback por tipo de documento si aún no tiene clusters cargados
    if (userData.docType === 'J' || userData.docType === 'G') return 'COMERCIAL';
    return 'RESIDENCIAL';
  }, [comerciales.length, residenciales.length, userData.docType]);

  const clustersMostrados = useMemo(() => {
    if (filtroCat === 'RESIDENCIAL') return residenciales;
    if (filtroCat === 'COMERCIAL') return comerciales;
    return clusters;
  }, [clusters, residenciales, comerciales, filtroCat]);

  const handleSave = async () => {
    const fullDoc = localStorage.getItem('portal_doc');
    if (!fullDoc) return;
    setIsSaving(true); setMessage('');
    try {
      const variants = getIdentidadVariantsExact(fullDoc);
      const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');
      
      // 1. Actualizar inmuebles
      const { error } = await supabase.from('inmuebles').update({ correo_electronico: userData.email, telefono: userData.telefonoMovil, direccion: userData.direccion })
        .or(orFilter);
      if (error) throw error;

      // 2. Cascada en contribuyentes, condominios y condominio_unidades
      await Promise.allSettled([
        supabase.from('contribuyentes').update({ email: userData.email, telefono: userData.telefonoMovil, direccion: userData.direccion }).or(orFilter),
        supabase.from('condominio_unidades').update({ correo: userData.email, telefono: userData.telefonoMovil }).or(orFilter),
        supabase.from('condominios').update({ correo: userData.email, telefono: userData.telefonoMovil, direccion: userData.direccion }).or(orFilter)
      ]);

      setMessage('Datos actualizados correctamente en todo el sistema');
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
      const variants = getIdentidadVariantsExact(fullDoc);
      const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');
      const { data: check } = await supabase.from('inmuebles').select('clave_portal')
        .or(orFilter).limit(1).single();
      if (!check || check.clave_portal !== claveActual) {
        setClaveMsg({ type: 'err', txt: 'Clave actual incorrecta.' });
        setIsSavingClave(false); return;
      }
      await supabase.from('inmuebles').update({ clave_portal: claveNueva })
        .or(orFilter);
      try {
        await supabase.from('contribuyentes').update({ clave_portal: claveNueva }).or(orFilter);
      } catch (_) {}

      setClaveMsg({ type: 'ok', txt: 'Clave actualizada exitosamente.' });
      setClaveActual(''); setClaveNueva(''); setClaveConfirm('');
    } catch { setClaveMsg({ type: 'err', txt: 'Error al cambiar la clave.' }); }
    setIsSavingClave(false);
  };

  const inputCls = 'w-full text-sm border border-slate-300 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
  const inputDisCls = 'w-full text-sm border border-slate-200 rounded px-3 py-2 bg-slate-50 text-slate-700 font-bold cursor-default';

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-16">
      {/* ══ TARJETA PRINCIPAL DE CATEGORIZACIÓN (RESIDENCIAL / COMERCIAL) AL INGRESAR ══ */}
      <div className={`rounded-2xl shadow-md border p-5 transition-all ${
        categoriaGlobal === 'COMERCIAL'
          ? 'bg-gradient-to-br from-blue-900 via-slate-900 to-slate-900 border-blue-500/40 text-white'
          : categoriaGlobal === 'MIXTO'
          ? 'bg-gradient-to-br from-emerald-900 via-slate-900 to-blue-950 border-emerald-400/40 text-white'
          : 'bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-900 border-emerald-500/40 text-white'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
              categoriaGlobal === 'COMERCIAL'
                ? 'bg-blue-500 text-white'
                : 'bg-[#84cc16] text-slate-950'
            }`}>
              {categoriaGlobal === 'COMERCIAL' ? <Store className="w-6 h-6" /> : <Home className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/15 text-lime-300 border border-white/20">
                  CATEGORÍA DEL CONTRIBUYENTE
                </span>
                {categoriaGlobal === 'RESIDENCIAL' && (
                  <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                    🏠 RESIDENCIAL
                  </span>
                )}
                {categoriaGlobal === 'COMERCIAL' && (
                  <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-0.5 rounded-full bg-sky-400 text-slate-950">
                    🏪 COMERCIAL
                  </span>
                )}
                {categoriaGlobal === 'MIXTO' && (
                  <span className="inline-flex items-center gap-1 text-xs font-black px-3 py-0.5 rounded-full bg-amber-400 text-slate-950">
                    🏠 RESIDENCIAL & 🏪 COMERCIAL
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mt-1.5 leading-snug">
                {userData.nombre || 'Contribuyente IAMEC'}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Documento: <b>{userData.docType}-{userData.docNum}</b> · {clusters.length} {clusters.length === 1 ? 'Inmueble registrado' : 'Inmuebles registrados'}
              </p>
            </div>
          </div>

          {/* Botones de clasificación rápida Residencial / Comercial */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setFiltroCat('RESIDENCIAL')}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer border ${
                filtroCat === 'RESIDENCIAL' || (filtroCat === 'TODOS' && categoriaGlobal === 'RESIDENCIAL')
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
              }`}
            >
              <span>🏠 Residencial</span>
              <span className="px-1.5 py-0.5 rounded-md bg-black/20 text-[11px]">{residenciales.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroCat('COMERCIAL')}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer border ${
                filtroCat === 'COMERCIAL' || (filtroCat === 'TODOS' && categoriaGlobal === 'COMERCIAL')
                  ? 'bg-sky-400 text-slate-950 border-sky-200 shadow'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
              }`}
            >
              <span>🏪 Comercial</span>
              <span className="px-1.5 py-0.5 rounded-md bg-black/20 text-[11px]">{comerciales.length}</span>
            </button>
            {clusters.length > 1 && filtroCat !== 'TODOS' && (
              <button
                type="button"
                onClick={() => setFiltroCat('TODOS')}
                className="px-2.5 py-2 rounded-xl text-xs font-bold bg-white/10 text-slate-200 hover:bg-white/20 cursor-pointer"
              >
                Ver Todos ({clusters.length})
              </button>
            )}
          </div>
        </div>

        {/* Resumen rápido de inmuebles categorizados */}
        {clustersMostrados.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-white/15 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {clustersMostrados.slice(0, 4).map((cl) => (
              <div
                key={cl.localId}
                className="bg-slate-950/60 border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-xs text-lime-300">{cl.localId}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      cl.tipo === 'COMERCIAL'
                        ? 'bg-sky-500/25 text-sky-300 border border-sky-400/30'
                        : 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/30'
                    }`}>
                      {cl.tipo === 'COMERCIAL' ? '🏪 Comercial' : '🏠 Residencial'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate mt-1">
                    {cl.direccion || 'Naguanagua'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-black text-white">{cl.totalMmv.toFixed(2)} UCD</div>
                  <Link href="/portal/inmuebles" className="text-[10px] text-lime-300 font-bold hover:underline">
                    Ver detalle →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Alerta de Actualización de Correo para Facturación Digital */}
      {(!userData.email || userData.email.toLowerCase().includes('facturacion.naguanagua@gmail.com') || userData.email.toLowerCase().includes('globalgreenca')) && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3 text-amber-900 shadow-xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-black text-sm">Actualización Requerida de Correo Electrónico Fiscal</h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Estimado contribuyente: Actualmente su expediente no cuenta con un correo electrónico personal registrado para el despacho directo de sus <strong>Facturas Fiscales Digitales (SENIAT / The Factory HKA)</strong>. Por favor complete su correo a continuación y guarde los cambios.
            </p>
          </div>
        </div>
      )}

      {/* Datos Principales */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 uppercase text-sm tracking-wide">Datos del Contribuyente</h2>
          {message && <span className={'text-xs font-semibold ' + (message.includes('Error') ? 'text-red-500' : 'text-emerald-600')}>{message}</span>}
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo / Nro. Identidad</label>
            <div className="flex gap-2">
              <input type="text" value={userData.docType} disabled className="w-14 text-sm border border-slate-200 rounded px-2 py-2 bg-slate-50 text-slate-700 font-bold text-center cursor-default" />
              <input type="text" value={userData.docNum} disabled className={inputDisCls} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Categoría del Contribuyente</label>
            <div className={`w-full text-sm border rounded px-3 py-2 font-black flex items-center gap-2 ${
              categoriaGlobal === 'COMERCIAL'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : categoriaGlobal === 'MIXTO'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              {categoriaGlobal === 'COMERCIAL' ? '🏪 COMERCIAL' : categoriaGlobal === 'MIXTO' ? '🏠 RESIDENCIAL / 🏪 COMERCIAL' : '🏠 RESIDENCIAL'}
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
