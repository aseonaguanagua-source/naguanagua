'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Building2, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  ArrowRight, 
  Unlink, 
  Link2,
  X,
  FileText,
  KeyRound,
  ArrowRightLeft
} from 'lucide-react';

interface InmuebleRow {
  id: string;
  inmueble: string;
  identidad: string;
  contribuyente: string;
  telefono: string | null;
  correo_electronico: string | null;
  direccion: string | null;
  actividad_principal: string | null;
  clasificacion: string | null;
  condominio_padre_id: string | null;
  condominio_padre_nombre?: string | null;
  es_condominio?: boolean;
  estado: string;
  mmv_mes: number;
}

interface CondominioOption {
  codigo: string;
  nombre: string;
  id?: string;
}

interface ConflictoCodigo {
  tipo: string;
  codigo: string;
  nombre: string;
  identidad: string;
  direccion?: string;
  estado?: string;
  inmueble_id?: string;
  condominio_id?: string;
}

export default function DepuracionRifPage() {
  const [items, setItems] = useState<InmuebleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [condominios, setCondominios] = useState<CondominioOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'sin_condominio' | 'con_condominio' | 'solo_condominios'>('todos');

  // Modal / Edición
  const [selectedItem, setSelectedItem] = useState<InmuebleRow | null>(null);
  const [editCodigo, setEditCodigo] = useState('');
  const [editRif, setEditRif] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editCorreo, setEditCorreo] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [selectedCondoCode, setSelectedCondoCode] = useState<string>('');
  const [filterCondoSearch, setFilterCondoSearch] = useState('');
  
  // Conflicto de código repetido
  const [conflicto, setConflicto] = useState<ConflictoCodigo | null>(null);
  const [checkingCodigo, setCheckingCodigo] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cargar lista de condominios
  const loadCondominios = async () => {
    try {
      const res = await fetch('/api/admin/depuracion-rif?condominios=true');
      const data = await res.json();
      if (data.ok && Array.isArray(data.condominios)) {
        setCondominios(data.condominios);
      }
    } catch (err) {
      console.error('Error al cargar condominios:', err);
    }
  };

  // Cargar inmuebles según búsqueda y filtro
  const fetchItems = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (filtro) params.set('filtro', filtro);
      params.set('limit', '80');

      const res = await fetch(`/api/admin/depuracion-rif?${params.toString()}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('Error buscando registros:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCondominios();
    fetchItems();
  }, [filtro]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems();
  };

  const openEditor = (item: InmuebleRow) => {
    setSelectedItem(item);
    setEditCodigo(item.inmueble || '');
    setEditRif(item.identidad || '');
    setEditNombre(item.contribuyente || '');
    setEditTelefono(item.telefono || '');
    setEditCorreo(item.correo_electronico || '');
    setEditDireccion(item.direccion || '');
    setSelectedCondoCode(item.condominio_padre_id || '');
    setFilterCondoSearch('');
    setConflicto(null);
    setFeedback(null);
  };

  const closeEditor = () => {
    setSelectedItem(null);
    setConflicto(null);
    setSaving(false);
  };

  const filteredCondoOptions = useMemo(() => {
    if (!filterCondoSearch.trim()) return condominios;
    const q = filterCondoSearch.toLowerCase();
    return condominios.filter(c => 
      c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)
    );
  }, [condominios, filterCondoSearch]);

  // Verificar código en tiempo real al escribir
  const handleVerificarCodigo = async (codigoAChequear: string) => {
    const clean = codigoAChequear.trim().toUpperCase();
    if (!clean || clean === selectedItem?.inmueble?.toUpperCase()) {
      setConflicto(null);
      return;
    }
    setCheckingCodigo(true);
    try {
      const res = await fetch(`/api/admin/depuracion-rif?check_codigo=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data.ok && data.en_uso) {
        const cInm = (data.coincidencias_inmuebles || []).find((x: any) => x.id !== selectedItem?.id);
        const cCondo = (data.coincidencias_condominios || [])[0];
        if (cInm || cCondo) {
          setConflicto({
            tipo: cCondo ? 'Condominio' : (cInm?.es_condominio ? 'Condominio' : 'Inmueble / Local'),
            codigo: clean,
            nombre: cCondo?.nombre || cInm?.contribuyente || 'Sin nombre registrado',
            identidad: cCondo?.identidad || cInm?.identidad || 'Sin RIF',
            direccion: cCondo?.direccion || cInm?.direccion,
            estado: cCondo?.estado || cInm?.estado,
            inmueble_id: cInm?.id,
            condominio_id: cCondo?.id
          });
          return;
        }
      }
      setConflicto(null);
    } catch (err) {
      console.error('Error al verificar código:', err);
    } finally {
      setCheckingCodigo(false);
    }
  };

  const handleSave = async (forceTransfer = false) => {
    if (!selectedItem) return;

    if (editRif.trim() && !/^([VEJGP])-?0*(\d{5,10})$/i.test(editRif.trim())) {
      setFeedback({
        type: 'error',
        message: 'Formato de RIF / Cédula inválido. Ejemplos válidos: V-12345678, J-123456789 o G-200000000.'
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const payload: any = {
        inmueble_id: selectedItem.id,
        inmueble_codigo: selectedItem.inmueble,
        contribuyente: editNombre.trim() || undefined,
        telefono: editTelefono.trim() || null,
        correo: editCorreo.trim() || null,
        direccion: editDireccion.trim() || null,
        condominio_codigo: selectedCondoCode ? selectedCondoCode.trim() : null,
        usuario: typeof window !== 'undefined' ? (localStorage.getItem('adminUser') || 'Administrador') : 'Administrador',
      };

      if (editCodigo.trim() && editCodigo.trim().toUpperCase() !== selectedItem.inmueble.toUpperCase()) {
        payload.codigo_nuevo = editCodigo.trim().toUpperCase();
        if (forceTransfer) {
          payload.transferir_a_codigo = editCodigo.trim().toUpperCase();
        }
      }

      if (editRif.trim() && editRif.trim().toUpperCase() !== selectedItem.identidad?.toUpperCase()) {
        payload.identidad_nueva = editRif.trim();
      }

      const res = await fetch('/api/admin/depuracion-rif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.status === 409 && data.codigo_en_uso) {
        setConflicto(data.conflicto);
        setFeedback({
          type: 'error',
          message: data.error || 'Por favor código en uso, cambien provisionalmente un número o use la opción de transferir.'
        });
        setSaving(false);
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo guardar la actualización.');
      }

      // Actualizar registro localmente
      const updated = data.inmueble;
      setItems(prev => prev.map(item => item.id === selectedItem.id ? { ...item, ...updated } : item));

      setFeedback({
        type: 'success',
        message: data.mensaje || 'Registro actualizado con éxito en cascada en todo el sistema.'
      });

      // Recargar la lista en segundo plano para reflejar exactamente la BD
      fetchItems();

      setTimeout(() => {
        closeEditor();
      }, 1200);

    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al guardar los cambios.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-emerald-800 to-teal-900 p-6 rounded-2xl text-white shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-700/50 rounded-xl backdrop-blur-sm border border-emerald-500/30">
              <ShieldCheck className="w-7 h-7 text-emerald-200" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Depuración y Modificación en Cascada</h1>
              <p className="text-emerald-200 text-sm mt-0.5">
                Modifique RIF, Cédula, Código o Nombre de cualquier contribuyente en cascada, detecte duplicados en tiempo real o transfiera información entre inmuebles y condominios.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchItems()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:scale-95 transition rounded-xl text-sm font-semibold shadow-md border border-emerald-500/40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Barra de búsqueda y filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por Nombre, Razón Social, Código (URB..., AURI...) o Cédula / RIF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-sm rounded-lg shadow transition flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500 uppercase tracking-wider">Filtrar por:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setFiltro('todos')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${filtro === 'todos' ? 'bg-white shadow text-emerald-800' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Todos / Provisionales
              </button>
              <button
                type="button"
                onClick={() => setFiltro('sin_condominio')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${filtro === 'sin_condominio' ? 'bg-white shadow text-amber-800' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Sin Condominio Asignado
              </button>
              <button
                type="button"
                onClick={() => setFiltro('con_condominio')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${filtro === 'con_condominio' ? 'bg-white shadow text-blue-800' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Con Condominio Vinculado
              </button>
              <button
                type="button"
                onClick={() => setFiltro('solo_condominios')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${filtro === 'solo_condominios' ? 'bg-white shadow text-purple-800' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Condominios Matrices
              </button>
            </div>
          </div>
          <span className="text-slate-500 font-medium">
            Registros encontrados: <strong>{items.length}</strong>
          </span>
        </div>
      </div>

      {/* Tabla de registros */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="font-medium text-sm">Consultando registros...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <p className="font-semibold text-slate-700">No se encontraron inmuebles con los criterios ingresados.</p>
            <p className="text-xs text-slate-400">Intente buscar por otro nombre, código o RIF.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Código Inmueble</th>
                  <th className="py-3 px-4">RIF / Cédula</th>
                  <th className="py-3 px-4">Contribuyente / Razón Social</th>
                  <th className="py-3 px-4">Condominio Padre</th>
                  <th className="py-3 px-4">Actividad / Tarifa</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => {
                  const es0000 = row.identidad?.includes('0000') || row.identidad?.includes('URB') || row.identidad?.includes('AURI');
                  const tieneCondo = Boolean(row.condominio_padre_id);
                  const esCondoMatriz = Boolean(row.es_condominio);

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                          {row.inmueble}
                          {esCondoMatriz && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-800 border border-purple-200 font-sans">
                              Matriz
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                          es0000 
                            ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {row.identidad || 'SIN RIF'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{row.contribuyente || 'Sin nombre'}</div>
                        {row.direccion && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs" title={row.direccion}>
                            {row.direccion}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {tieneCondo ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-blue-700 flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-blue-600" />
                              {row.condominio_padre_id}
                            </span>
                            <span className="text-[11px] text-slate-500 truncate max-w-[200px]" title={row.condominio_padre_nombre || ''}>
                              {row.condominio_padre_nombre || 'Condominio matriz'}
                            </span>
                          </div>
                        ) : esCondoMatriz ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            <Building2 className="w-3 h-3" />
                            Es Condominio Matriz
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Unlink className="w-3 h-3" />
                            Sin Condominio
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-700 truncate max-w-[180px]" title={row.actividad_principal || ''}>
                          {row.actividad_principal || 'No asignada'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {row.mmv_mes ? `${row.mmv_mes} MMV` : '0 MMV'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => openEditor(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-medium rounded-lg text-xs shadow-sm transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Modificar / Cascada
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Modificación Integral y Cascada */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600/30 rounded-lg border border-emerald-500/40">
                  <Edit3 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Modificar Inmueble {selectedItem.inmueble}</h2>
                  <p className="text-xs text-slate-400">Modificación de Código, RIF, Nombre y Condominio en Cascada</p>
                </div>
              </div>
              <button 
                onClick={closeEditor}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {feedback && (
                <div className={`p-4 rounded-xl flex items-start gap-3 border ${
                  feedback.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}>
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs font-medium leading-relaxed">{feedback.message}</div>
                </div>
              )}

              {/* SECCIÓN 1: MODIFICACIÓN DE CÓDIGO */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-emerald-600" />
                    Código de Inmueble
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    Actual: <strong>{selectedItem.inmueble}</strong>
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej. URB012345, AURI001..."
                    value={editCodigo}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setEditCodigo(val);
                      handleVerificarCodigo(val);
                    }}
                    className={`w-full px-3.5 py-2 rounded-lg border font-mono text-sm uppercase focus:outline-none focus:ring-2 ${
                      conflicto 
                        ? 'border-rose-400 focus:ring-rose-400/20 text-rose-900 bg-rose-50/50' 
                        : 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-600'
                    }`}
                  />
                  {checkingCodigo && (
                    <div className="absolute right-3 top-2.5">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>

                {/* ALERTA DE CÓDIGO EN USO Y TRANSFERENCIA */}
                {conflicto && (
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 text-amber-900 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <p className="font-bold text-amber-950">
                          Por favor código en uso, cambien provisionalmente un número o transfieran a este inmueble/condominio:
                        </p>
                        <p className="text-amber-800">
                          El código <strong>{conflicto.codigo}</strong> ya le pertenece a:
                        </p>
                        <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200 font-mono text-[11px] space-y-0.5">
                          <div><strong>Tipo:</strong> {conflicto.tipo}</div>
                          <div><strong>Nombre / Razón Social:</strong> {conflicto.nombre}</div>
                          <div><strong>RIF:</strong> {conflicto.identidad}</div>
                          {conflicto.direccion && <div><strong>Dirección:</strong> {conflicto.direccion}</div>}
                          <div><strong>Estado:</strong> {conflicto.estado || 'Activo'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-amber-200/80">
                      <button
                        type="button"
                        onClick={() => {
                          // Modificar provisionalmente agregando sufijo
                          setEditCodigo(`${conflicto.codigo}-1`);
                          setConflicto(null);
                        }}
                        className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-semibold rounded-lg transition"
                      >
                        Cambiar provisionalmente (-1)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(true)}
                        disabled={saving}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Transferir todo a este código en cascada
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECCIÓN 2: MODIFICACIÓN DE RIF / CÉDULA */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-600" />
                    RIF o Cédula
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    Actual: <strong>{selectedItem.identidad}</strong>
                  </span>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Ej. V-18456123, J-304567891, G-200000000"
                    value={editRif}
                    onChange={(e) => setEditRif(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Se actualizará el RIF en cascada en las facturas, retenciones y pagos asociados a este inmueble.
                  </p>
                </div>
              </div>

              {/* SECCIÓN 3: NOMBRE / RAZÓN SOCIAL */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Nombre / Razón Social del Contribuyente
                </label>
                <input
                  type="text"
                  placeholder="Nombre completo o Razón Social..."
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 uppercase font-medium"
                />
                <p className="text-[11px] text-slate-500">
                  Al modificar el nombre se actualizará en cascada en la ficha de contribuyente, facturas y registros de cobro.
                </p>
              </div>

              {/* SECCIÓN 4: ASIGNACIÓN A CONDOMINIO */}
              <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    Asignar / Mover a Condominio Matriz
                  </label>
                  {selectedCondoCode && (
                    <button
                      type="button"
                      onClick={() => setSelectedCondoCode('')}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1"
                    >
                      <Unlink className="w-3 h-3" />
                      Desvincular de condominio
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Filtrar condominio por nombre o código (ej. RESIDENCIAS, URB...)..."
                    value={filterCondoSearch}
                    onChange={(e) => setFilterCondoSearch(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  />

                  <select
                    value={selectedCondoCode}
                    onChange={(e) => setSelectedCondoCode(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-xs bg-white text-slate-800 font-medium"
                  >
                    <option value="">-- Sin condominio asignado (Unidad independiente) --</option>
                    {filteredCondoOptions.map((condo) => (
                      <option key={condo.codigo} value={condo.codigo}>
                        {condo.codigo} - {condo.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-blue-700">
                  {selectedCondoCode ? (
                    <>Asignado al condominio matriz <strong>{selectedCondoCode}</strong>. Se sincronizará inmediatamente en la tabla de inmuebles y en la base de datos de condominios.</>
                  ) : (
                    'Este inmueble no pertenece a ningún condominio matriz (se factura de manera individual).'
                  )}
                </p>
              </div>

              {/* SECCIÓN 5: DATOS DE CONTACTO ESPECÍFICOS */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                  Datos de Contacto y Dirección del Inmueble
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={editTelefono}
                      onChange={(e) => setEditTelefono(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={editCorreo}
                      onChange={(e) => setEditCorreo(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Dirección del Inmueble</label>
                  <input
                    type="text"
                    value={editDireccion}
                    onChange={(e) => setEditDireccion(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-semibold shadow transition flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Guardando cambios en cascada...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Guardar Cambios en Cascada
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
