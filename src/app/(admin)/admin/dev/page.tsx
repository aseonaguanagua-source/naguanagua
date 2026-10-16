'use client';
import { useState, useEffect } from 'react';
import { 
  Database, Save, Search, AlertOctagon, Code, ShieldAlert, 
  Zap, CheckCircle2, User, Building, DollarSign, RefreshCw,
  Power, Trash2, ShieldCheck, ArrowRight, ExternalLink, Sliders, Terminal
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getFromIndexedDB, saveToIndexedDB, clearAllIndexedDB } from '@/lib/indexedDbCache';

export default function DevGodMode() {
  const router = useRouter();
  const [pass, setPass] = useState('Sehile18-');
  const [activeTab, setActiveTab] = useState<'god_editor' | 'toggles' | 'table' | 'sql'>('god_editor');
  
  // Mantenimiento State
  const [isMaintenanceActive, setIsMaintenanceActive] = useState<boolean>(true);
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);

  // God Editor State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedInmueble, setSelectedInmueble] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [condominiosList, setCondominiosList] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');

  // Toggles State
  const [toggles, setToggles] = useState<any[]>([]);
  const [isTogglesLoading, setIsTogglesLoading] = useState(false);
  const [togglesError, setTogglesError] = useState('');
  
  // SQL State
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlError, setSqlError] = useState('');
  const [isSqlLoading, setIsSqlLoading] = useState(false);

  // Table State
  const [tableName, setTableName] = useState('inmuebles');
  const [searchMatch, setSearchMatch] = useState('{"inmueble": "URB000001"}');
  const [tableResult, setTableResult] = useState<any[]>([]);
  const [tableError, setTableError] = useState('');
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [editRowData, setEditRowData] = useState<string>('');
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const passParam = searchParams.get('pass') || searchParams.get('admin');
      if (passParam === 'Sehile18-' || passParam === '1756762') {
        localStorage.setItem('dev_mode_active', '1');
        localStorage.setItem('portal_master_active', '1');
      }

      const devMode = localStorage.getItem('dev_mode_active');
      if (devMode !== '1' && localStorage.getItem('portal_master_active') !== '1') {
        router.push('/admin');
      } else {
        loadMaintenanceStatus();
        loadCondosList();
        loadToggles();
      }
    }
  }, [router]);

  const loadMaintenanceStatus = async () => {
    try {
      const res = await fetch('/api/admin/dev/god-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_maintenance', pass })
      });
      const data = await res.json();
      if (data.success && typeof data.mantenimiento === 'boolean') {
        setIsMaintenanceActive(data.mantenimiento);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleMaintenance = async () => {
    try {
      setIsTogglingMaintenance(true);
      const res = await fetch('/api/admin/dev/god-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_maintenance', pass })
      });
      const data = await res.json();
      if (data.success) {
        setIsMaintenanceActive(data.mantenimiento);
        alert(`Modo Mantenimiento ${data.mantenimiento ? 'ACTIVADO' : 'DESACTIVADO'} globalmente en el sistema.`);
        await loadToggles();
      } else {
        alert('Error: ' + (data.error || 'No se pudo actualizar'));
      }
    } catch (e: any) {
      alert('Error de conexión: ' + e.message);
    } finally {
      setIsTogglingMaintenance(false);
    }
  };

  const loadCondosList = async () => {
    try {
      const res = await fetch('/api/admin/dev/god-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'condos_list', pass })
      });
      const data = await res.json();
      if (data.success) {
        setCondominiosList(data.condominios || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Buscar inmuebles para Modo Dios
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setIsSearching(true);
    setSaveSuccessMsg('');
    setSaveErrorMsg('');
    try {
      const res = await fetch('/api/admin/dev/god-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: searchQuery.trim(), pass })
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results || []);
        if (data.results && data.results.length === 1) {
          selectInmueble(data.results[0]);
        }
      } else {
        alert('Error en búsqueda: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const selectInmueble = (item: any) => {
    setSelectedInmueble(item);
    setFormData({
      identidad: item.identidad || '',
      contribuyente: item.contribuyente || '',
      cod_cont: item.cod_cont || '',
      estado: item.estado || 'Activo',
      meses_deuda: item.meses_deuda ?? 0,
      deuda_mmv: item.deuda_mmv ?? 0,
      deuda_congelada_bs: item.deuda_congelada_bs ?? 0,
      multa_bs: item.multa_bs ?? 0,
      saldo_favor_bs: item.saldo_favor_bs ?? 0,
      mmv_mes: item.mmv_mes ?? 0,
      cant_inmuebles: item.cant_inmuebles ?? 1,
      clasificacion: item.clasificacion || 'Comercial',
      tipo: item.tipo || 'Comercial',
      actividad_principal: item.actividad_principal || '',
      es_condominio: !!item.es_condominio,
      condominio_padre_id: item.condominio_padre_id || '',
      agente_retencion: !!item.agente_retencion,
      clave_portal: item.clave_portal || '',
      correo_electronico: item.correo_electronico || '',
      telefono: item.telefono || '',
      direccion: item.direccion || '',
      notas: item.notas || ''
    });
    setSaveSuccessMsg('');
    setSaveErrorMsg('');
  };

  // Guardar Cambios Modo Dios
  const handleSaveGodMode = async () => {
    if (!selectedInmueble?.id) return;
    setIsSaving(true);
    setSaveSuccessMsg('');
    setSaveErrorMsg('');
    try {
      const res = await fetch('/api/admin/dev/god-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: selectedInmueble.id,
          data: formData,
          pass
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo guardar');
      }

      const updatedRow = data.updated;
      setSelectedInmueble(updatedRow);

      // Actualizar en la lista de resultados de búsqueda
      setSearchResults(prev => prev.map(p => p.id === updatedRow.id ? updatedRow : p));

      // INVALIDAR / ACTUALIZAR CACHÉ INDEXEDDB PARA QUE NUNCA QUEDE "SIGUE IGUAL"
      try {
        const cached = await getFromIndexedDB<any>('naguanagua_full_cache');
        if (cached && Array.isArray(cached.inmuebles)) {
          const idx = cached.inmuebles.findIndex((x: any) => x.id === updatedRow.id || x.inmueble === updatedRow.inmueble);
          if (idx !== -1) {
            cached.inmuebles[idx] = { ...cached.inmuebles[idx], ...updatedRow };
            await saveToIndexedDB('naguanagua_full_cache', cached);
          }
        }
      } catch (e) {
        console.warn('Cache sync error:', e);
      }

      setSaveSuccessMsg(`¡Cambios guardados exitosamente en Supabase (Sin RLS) y sincronizados en caché local!`);
    } catch (err: any) {
      setSaveErrorMsg(err.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Action Buttons
  const quickSolvente = () => {
    setFormData((prev: any) => ({
      ...prev,
      meses_deuda: 0,
      deuda_mmv: 0,
      deuda_congelada_bs: 0,
      multa_bs: 0
    }));
  };

  const quickExonerarMulta = () => {
    setFormData((prev: any) => ({ ...prev, multa_bs: 0 }));
  };

  const quickActivar = () => {
    setFormData((prev: any) => ({ ...prev, estado: 'Activo' }));
  };

  const quickEliminar = () => {
    setFormData((prev: any) => ({
      ...prev,
      estado: 'Eliminado',
      mmv_mes: 0,
      deuda_mmv: 0,
      cant_inmuebles: 0
    }));
  };

  const quickSacarCondominio = () => {
    setFormData((prev: any) => ({
      ...prev,
      es_condominio: false,
      condominio_padre_id: ''
    }));
  };

  const quickCrearNA = () => {
    setFormData((prev: any) => ({
      ...prev,
      contribuyente: 'N/A',
      identidad: 'N/A'
    }));
  };

  // Toggles Tab Helpers
  const loadToggles = async () => {
    setIsTogglesLoading(true);
    setTogglesError('');
    try {
      const res = await fetch('/api/admin/dev/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', table: 'system_config', pass: '1756762' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar interruptores');
      setToggles(data.data || []);
    } catch (e: any) {
      setTogglesError(e.message);
    } finally {
      setIsTogglesLoading(false);
    }
  };

  const toggleConfig = async (key: string, currentValue: string) => {
    try {
      setIsTogglesLoading(true);
      const newValue = currentValue === 'true' ? 'false' : 'true';
      if (key === 'PORTAL_EN_MANTENIMIENTO') {
        await handleToggleMaintenance();
        return;
      }
      const res = await fetch('/api/admin/dev/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'update', 
          table: 'system_config', 
          data: { value: newValue },
          match: { key }, 
          pass: '1756762' 
        })
      });
      if (!res.ok) throw new Error('Error al actualizar');
      await loadToggles();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsTogglesLoading(false);
    }
  };

  // SQL Tab Helpers
  const runSql = async () => {
    setIsSqlLoading(true);
    setSqlError('');
    setSqlResult(null);
    try {
      const res = await fetch('/api/admin/dev/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery, pass: '1756762' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error SQL');
      setSqlResult(data);
    } catch (e: any) {
      setSqlError(e.message);
    } finally {
      setIsSqlLoading(false);
    }
  };

  // Table Manager Helpers
  const loadTable = async () => {
    setIsTableLoading(true);
    setTableError('');
    setTableResult([]);
    setActiveRowIndex(null);
    try {
      let matchObj = null;
      if (searchMatch.trim()) {
        try {
          matchObj = JSON.parse(searchMatch);
        } catch (e: any) {
          throw new Error(`JSON no válido: ${e.message}`);
        }
      }
      const res = await fetch('/api/admin/dev/table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', table: tableName, match: matchObj, pass: '1756762' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error Table');
      setTableResult(data.data || []);
    } catch (e: any) {
      setTableError(e.message);
    } finally {
      setIsTableLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl border-b-4 border-fuchsia-500 shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-fuchsia-400 w-8 h-8 shrink-0" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Modo Dios (Dev Engine)
            </h1>
          </div>
          <p className="text-slate-300 text-sm mt-1">
            Control maestro absoluto: edición de contribuyentes, multas, meses, deudas, condominios e interruptores globales.
          </p>
        </div>

        {/* Global Maintenance Status Card */}
        <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700 p-3 rounded-xl">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portal Soy Contribuyente</p>
            <p className={`text-sm font-black ${isMaintenanceActive ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isMaintenanceActive ? '🛠️ EN MANTENIMIENTO' : '🟢 ACTIVO EN LÍNEA'}
            </p>
          </div>
          <button
            onClick={handleToggleMaintenance}
            disabled={isTogglingMaintenance}
            className={`px-3 py-2 rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 ${
              isMaintenanceActive 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50' 
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/50'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {isTogglingMaintenance ? 'Actualizando...' : (isMaintenanceActive ? 'Activar Portal' : 'Poner Mantenimiento')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('god_editor')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'god_editor' ? 'border-fuchsia-600 text-fuchsia-700 bg-fuchsia-50/50 rounded-t-lg' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Zap className="w-4 h-4 text-fuchsia-600" /> 👑 Editor Total (Modo Dios)
        </button>
        <button 
          onClick={() => setActiveTab('toggles')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'toggles' ? 'border-fuchsia-600 text-fuchsia-700 bg-fuchsia-50/50 rounded-t-lg' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sliders className="w-4 h-4" /> Interruptores Globales
        </button>
        <button 
          onClick={() => setActiveTab('table')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'table' ? 'border-fuchsia-600 text-fuchsia-700 bg-fuchsia-50/50 rounded-t-lg' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Database className="w-4 h-4" /> Gestor de Tablas Raw
        </button>
        <button 
          onClick={() => setActiveTab('sql')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'sql' ? 'border-fuchsia-600 text-fuchsia-700 bg-fuchsia-50/50 rounded-t-lg' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Code className="w-4 h-4" /> Consola SQL Directa
        </button>
      </div>

      {/* TAB 1: MODO DIOS EDITOR TOTAL */}
      {activeTab === 'god_editor' && (
        <div className="space-y-6">
          {/* Buscador */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-fuchsia-600" />
              Buscar Contribuyente o Inmueble a Modificar
            </h2>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Escribe Cédula, RIF (ej. J-123456789), Código URB/AURI (ej. URB016119), o Nombre..."
                className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 text-sm font-medium"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-colors"
              >
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar en Todo
              </button>
            </form>

            {/* Resultados de Búsqueda */}
            {searchResults.length > 0 && (
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-600 flex justify-between">
                  <span>Resultados Encontrados ({searchResults.length})</span>
                  <span>Seleccione un registro para editarlo con permisos absolutos</span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.map(r => (
                    <div 
                      key={r.id}
                      onClick={() => selectInmueble(r)}
                      className={`p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-fuchsia-50 transition-colors ${
                        selectedInmueble?.id === r.id ? 'bg-fuchsia-100/70 border-l-4 border-fuchsia-600' : ''
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded">{r.inmueble}</span>
                          <span className="font-bold text-slate-700">{r.contribuyente}</span>
                          <span className="font-mono text-slate-500">{r.identidad}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.estado === 'Activo' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {r.estado}
                          </span>
                        </div>
                        <div className="text-slate-500 text-[11px] flex gap-3">
                          <span>Meses Deuda: <b>{r.meses_deuda ?? 0}</b></span>
                          <span>Deuda MMV: <b>{r.deuda_mmv ?? 0}</b></span>
                          <span>Multa: <b>Bs {r.multa_bs ?? 0}</b></span>
                          <span>Tipo: <b>{r.clasificacion || r.tipo}</b></span>
                          {r.es_condominio && <span className="text-sky-600 font-bold">Condominio</span>}
                        </div>
                      </div>
                      <button className="px-3 py-1 bg-white border border-slate-300 hover:border-fuchsia-500 text-fuchsia-700 font-bold rounded-lg text-xs">
                        Editar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Formulario de Edición Total */}
          {selectedInmueble && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Encabezado Inmueble */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-fuchsia-950 text-white p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold tracking-wider text-fuchsia-400">Editando en Modo Dios</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded font-mono font-black text-xs">{selectedInmueble.inmueble}</span>
                    <span className="text-xs text-slate-300">ID: {selectedInmueble.id}</span>
                  </div>
                  <h3 className="text-xl font-black mt-1">{formData.contribuyente || 'Sin Nombre'}</h3>
                  <p className="text-xs text-slate-400 font-mono">{formData.identidad || 'Sin Identidad'}</p>
                </div>

                {/* Botones de Acción Rápida (1-Click) */}
                <div className="flex flex-wrap gap-1.5">
                  <button 
                    type="button" 
                    onClick={quickSolvente}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
                    title="Poner meses, deuda y multa en 0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Solvente (0 Deuda)
                  </button>
                  <button 
                    type="button" 
                    onClick={quickExonerarMulta}
                    className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
                    title="Poner multa en 0"
                  >
                    Exonerar Multa
                  </button>
                  <button 
                    type="button" 
                    onClick={quickActivar}
                    className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold"
                  >
                    Activar
                  </button>
                  <button 
                    type="button" 
                    onClick={quickEliminar}
                    className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </button>
                  <button 
                    type="button" 
                    onClick={quickSacarCondominio}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
                  >
                    Sacar de Condominio
                  </button>
                  <button 
                    type="button" 
                    onClick={quickCrearNA}
                    className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold"
                  >
                    Poner N/A
                  </button>
                </div>
              </div>

              {/* Mensajes de Alerta */}
              {saveSuccessMsg && (
                <div className="m-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  {saveSuccessMsg}
                </div>
              )}
              {saveErrorMsg && (
                <div className="m-4 p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                  {saveErrorMsg}
                </div>
              )}

              {/* Formulario Multi-Columna */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                {/* COLUMNA 1: IDENTIDAD Y TITULAR */}
                <div className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b pb-2">
                    <User className="w-4 h-4 text-fuchsia-600" />
                    1. Identidad y Datos del Titular
                  </h4>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Cédula o RIF Fiscal</label>
                    <input
                      type="text"
                      value={formData.identidad || ''}
                      onChange={e => setFormData({ ...formData, identidad: e.target.value })}
                      placeholder="Ej. J-123456789 o V-12345678"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nombre / Razón Social</label>
                    <input
                      type="text"
                      value={formData.contribuyente || ''}
                      onChange={e => setFormData({ ...formData, contribuyente: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Código Contribuyente</label>
                      <input
                        type="text"
                        value={formData.cod_cont || ''}
                        onChange={e => setFormData({ ...formData, cod_cont: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Clave Portal</label>
                      <input
                        type="text"
                        value={formData.clave_portal || ''}
                        onChange={e => setFormData({ ...formData, clave_portal: e.target.value })}
                        placeholder="Contraseña portal"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={formData.correo_electronico || ''}
                      onChange={e => setFormData({ ...formData, correo_electronico: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={formData.telefono || ''}
                      onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Dirección</label>
                    <textarea
                      rows={2}
                      value={formData.direccion || ''}
                      onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                </div>

                {/* COLUMNA 2: DEUDA, MESES Y TARIFAS */}
                <div className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b pb-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    2. Deuda, Meses y Tarifas
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Meses de Deuda</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.meses_deuda ?? 0}
                        onChange={e => setFormData({ ...formData, meses_deuda: parseInt(e.target.value) || 0 })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-base text-red-600 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Multa Bs</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.multa_bs ?? 0}
                        onChange={e => setFormData({ ...formData, multa_bs: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Deuda MMV</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.deuda_mmv ?? 0}
                        onChange={e => setFormData({ ...formData, deuda_mmv: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Deuda Congelada Bs</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.deuda_congelada_bs ?? 0}
                        onChange={e => setFormData({ ...formData, deuda_congelada_bs: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tarifa MMV / Mes</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.mmv_mes ?? 0}
                        onChange={e => setFormData({ ...formData, mmv_mes: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Cant. Inmuebles</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.cant_inmuebles ?? 1}
                        onChange={e => setFormData({ ...formData, cant_inmuebles: parseInt(e.target.value) || 1 })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Saldo a Favor Bs (Nota de Crédito)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.saldo_favor_bs ?? 0}
                      onChange={e => setFormData({ ...formData, saldo_favor_bs: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-emerald-700 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Estado del Inmueble</label>
                    <select
                      value={formData.estado || 'Activo'}
                      onChange={e => setFormData({ ...formData, estado: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold bg-white"
                    >
                      <option value="Activo">Activo (Facturación Regular)</option>
                      <option value="Eliminado">Eliminado (De baja / Sin deuda)</option>
                      <option value="Inactivo">Inactivo / Suspendido</option>
                      <option value="Exonerado">Exonerado</option>
                    </select>
                  </div>
                </div>

                {/* COLUMNA 3: ACTIVIDAD, CONDICIÓN Y CONDOMINIO */}
                <div className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b pb-2">
                    <Building className="w-4 h-4 text-indigo-600" />
                    3. Actividad, Clasificación y Condominio
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Clasificación</label>
                      <select
                        value={formData.clasificacion || 'Comercial'}
                        onChange={e => setFormData({ ...formData, clasificacion: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold bg-white"
                      >
                        <option value="Comercial">Comercial</option>
                        <option value="Residencial">Residencial</option>
                        <option value="Industrial">Industrial</option>
                        <option value="Oficial">Oficial / Público</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tipo</label>
                      <input
                        type="text"
                        value={formData.tipo || ''}
                        onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                        placeholder="Ej. Local, Galpón..."
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Actividad Principal</label>
                    <input
                      type="text"
                      value={formData.actividad_principal || ''}
                      onChange={e => setFormData({ ...formData, actividad_principal: e.target.value.toUpperCase() })}
                      placeholder="Ej. FARMACIA, PANADERIA, RESTAURANTE..."
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-bold uppercase"
                    />
                  </div>

                  {/* Switch Agente de Retención */}
                  <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                    <div>
                      <span className="font-bold text-slate-800 block">Agente de Retención IVA</span>
                      <span className="text-[11px] text-slate-500">Aplica retención del 75% en facturación</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!formData.agente_retencion}
                      onChange={e => setFormData({ ...formData, agente_retencion: e.target.checked })}
                      className="w-5 h-5 accent-fuchsia-600 cursor-pointer"
                    />
                  </div>

                  {/* Switch Condominio */}
                  <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                    <div>
                      <span className="font-bold text-slate-800 block">Es Condominio</span>
                      <span className="text-[11px] text-slate-500">Define si es cuenta matriz de condominio</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!formData.es_condominio}
                      onChange={e => setFormData({ ...formData, es_condominio: e.target.checked })}
                      className="w-5 h-5 accent-indigo-600 cursor-pointer"
                    />
                  </div>

                  {/* Asignación de Condominio Padre */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Condominio Padre al que Pertenece</label>
                    <select
                      value={formData.condominio_padre_id || ''}
                      onChange={e => setFormData({ ...formData, condominio_padre_id: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-xs"
                    >
                      <option value="">-- Sin Condominio Padre (Independiente) --</option>
                      {condominiosList.map(c => (
                        <option key={c.id || c.codigo} value={c.codigo || c.id}>
                          {c.codigo} - {c.nombre} ({c.tipo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Notas Administrativas</label>
                    <input
                      type="text"
                      value={formData.notas || ''}
                      onChange={e => setFormData({ ...formData, notas: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Barra de Guardado */}
              <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-500 italic">
                  * Al guardar en Modo Dios, los cambios se aplican inmediatamente en Supabase omitiendo RLS y se actualiza la caché local.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectInmueble(selectedInmueble)}
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                  >
                    Descartar Cambios
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveGodMode}
                    disabled={isSaving}
                    className="px-6 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-fuchsia-900/30 transition-all"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Cambios Absolutos
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTERRUPTORES */}
      {activeTab === 'toggles' && (
        <div className="space-y-6">
          {/* Tarjeta Destacada: Modo Mantenimiento */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-fuchsia-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-fuchsia-600">Interruptor Crítico Principal</span>
                <h3 className="text-xl font-black text-slate-900 mt-0.5">Modo Mantenimiento de Soy Contribuyente</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                  Controla si los contribuyentes externos pueden ingresar al portal público. 
                  Cuando está <b>ACTIVADO</b>, el portal muestra la pantalla de mantenimiento para todos los contribuyentes ordinarios, 
                  permitiendo acceso exclusivo para ti mediante tu contraseña maestra <b>Sehile18-</b>.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-500">Estado Actual</p>
                  <p className={`text-base font-black ${isMaintenanceActive ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {isMaintenanceActive ? '🛠️ En Mantenimiento' : '🟢 Portal Abierto'}
                  </p>
                </div>
                <button
                  onClick={handleToggleMaintenance}
                  disabled={isTogglingMaintenance}
                  className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors cursor-pointer ${
                    isMaintenanceActive ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                >
                  <span className={`inline-block h-8 w-8 transform rounded-full bg-white shadow-md transition-transform ${
                    isMaintenanceActive ? 'translate-x-11' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Otros Interruptores del Sistema (system_config)</h2>
            {togglesError ? (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-red-700 font-bold mb-2">{togglesError}</p>
                <button onClick={loadToggles} className="mt-2 bg-red-600 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-red-700">Reintentar</button>
              </div>
            ) : (
              <div className="space-y-3">
                {isTogglesLoading && <p className="text-slate-500 font-bold text-sm">Cargando interruptores...</p>}
                {toggles.map((t) => (
                  <div key={t.key} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100/70 transition-colors">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm font-mono">{t.key}</h3>
                      <p className="text-xs text-slate-500">{t.description}</p>
                    </div>
                    <button
                      onClick={() => toggleConfig(t.key, t.value)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${t.value === 'true' ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${t.value === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GESTOR DE TABLAS */}
      {activeTab === 'table' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-600 mb-1">Nombre de Tabla</label>
              <input 
                type="text" 
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                placeholder="inmuebles, condominios, pagos_reportados..."
                className="w-full border border-slate-300 rounded px-3 py-2 outline-none focus:border-fuchsia-500 font-mono text-sm"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-600 mb-1">Filtro Match (JSON)</label>
              <input 
                type="text" 
                value={searchMatch}
                onChange={e => setSearchMatch(e.target.value)}
                placeholder='{"inmueble": "URB000001"}'
                className="w-full border border-slate-300 rounded px-3 py-2 outline-none focus:border-fuchsia-500 font-mono text-sm"
              />
            </div>
            <button 
              onClick={loadTable}
              disabled={isTableLoading}
              className="bg-fuchsia-600 text-white px-5 py-2 rounded font-bold text-sm hover:bg-fuchsia-700 flex items-center gap-2"
            >
              {isTableLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Cargar
            </button>
          </div>

          {tableError && (
            <div className="bg-red-50 p-4 border border-red-200 text-red-700 font-bold rounded text-sm">
              {tableError}
            </div>
          )}

          {tableResult.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 text-slate-200 uppercase">
                  <tr>
                    {Object.keys(tableResult[0]).map(k => (
                      <th key={k} className="p-3 border-b border-slate-700">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableResult.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {Object.values(row).map((v: any, vIdx) => (
                        <td key={vIdx} className="p-3 max-w-[200px] truncate">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SQL RAW */}
      {activeTab === 'sql' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Code className="w-4 h-4 text-fuchsia-600" />
              Consola SQL Cruda (Bypass RLS)
            </h2>
            <textarea
              rows={4}
              value={sqlQuery}
              onChange={e => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM inmuebles WHERE estado = 'Activo' LIMIT 10;"
              className="w-full border border-slate-300 rounded-lg p-3 font-mono text-xs outline-none focus:border-fuchsia-500 bg-slate-900 text-emerald-400"
            />
            <button
              onClick={runSql}
              disabled={isSqlLoading}
              className="mt-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-lg font-bold text-xs flex items-center gap-2"
            >
              {isSqlLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
              Ejecutar SQL
            </button>
          </div>

          {sqlError && (
            <div className="bg-red-50 p-4 border border-red-200 text-red-700 font-mono text-xs rounded">
              {sqlError}
            </div>
          )}

          {sqlResult && (
            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-96">
              <pre>{JSON.stringify(sqlResult, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
