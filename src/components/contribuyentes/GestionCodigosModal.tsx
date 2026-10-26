'use client';
import React, { useState, useEffect } from 'react';
import { X, Building2, Store, Home as HomeIcon, Trash2, AlertCircle, RefreshCw, Layers, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cleanClasificacionActividad, isResidencialInm, isTerrenoInm } from '@/lib/calculos';
import { formatBs } from '@/lib/formatCurrency';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contribuyente: any;
  inmueblesGlobal: any[];
  tcmmv: number;
  onRefresh: () => Promise<void> | void;
}

export function GestionCodigosModal({
  isOpen,
  onClose,
  contribuyente,
  inmueblesGlobal,
  tcmmv,
  onRefresh
}: Props) {
  const [inmueblesList, setInmueblesList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [eliminandoCode, setEliminandoCode] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !contribuyente) {
      setInmueblesList([]);
      setFeedbackMsg(null);
      return;
    }
    cargarInmuebles();
  }, [isOpen, contribuyente]);

  const cargarInmuebles = async () => {
    if (!contribuyente) return;
    setIsLoading(true);
    setFeedbackMsg(null);

    try {
      const ident = String(contribuyente.Identidad || contribuyente.identidad || '').trim();
      const rawCodes = String(contribuyente.CodCont || contribuyente.cod_cont || contribuyente.inmueble || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      // Buscar todos los inmuebles activos del contribuyente desde Supabase para tener la data más fresca
      let query = supabase
        .from('inmuebles')
        .select('*')
        .neq('estado', 'Eliminado');

      if (ident && rawCodes.length > 0) {
        query = query.or(`identidad.eq.${ident},inmueble.in.(${rawCodes.join(',')}),padre_id.in.(${rawCodes.join(',')})`);
      } else if (ident) {
        query = query.eq('identidad', ident);
      } else if (rawCodes.length > 0) {
        query = query.or(`inmueble.in.(${rawCodes.join(',')}),padre_id.in.(${rawCodes.join(',')})`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error cargando inmuebles:', error);
        // Fallback a memoria global
        const inmsMem = (inmueblesGlobal || []).filter((i: any) => {
          if (i.estado === 'Eliminado' || i.Estado === 'Eliminado') return false;
          const cod = String(i.inmueble || '').trim().toUpperCase();
          const pId = String(i.padre_id || '').trim().toUpperCase();
          const matchIdent = ident && String(i.identidad || '').trim().toUpperCase() === ident.toUpperCase();
          const matchCode = rawCodes.includes(cod) || (pId && rawCodes.includes(pId));
          return matchIdent || matchCode;
        });
        setInmueblesList(inmsMem);
      } else {
        setInmueblesList(data || []);
      }
    } catch (err: any) {
      console.error(err);
      setFeedbackMsg({ type: 'error', text: 'Error al consultar inmuebles en el servidor.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuitarCodigo = async (targetInm: any) => {
    const cod = targetInm.inmueble;
    const actDesc = cleanClasificacionActividad(targetInm.actividad_principal) || targetInm.actividad_principal || 'Actividad / Inmueble';
    const isSingleRemaining = inmueblesList.length <= 1;

    const warnSingle = isSingleRemaining
      ? '\n\n⚠️ ATENCIÓN: Este es el ÚNICO código/inmueble activo de este contribuyente. Al quitarlo quedará sin códigos activos.'
      : '';

    const confirmMsg = `¿Está seguro de que desea QUITAR el código ${cod} (${actDesc}) de este contribuyente?${warnSingle}\n\nEl inmueble será desvinculado y marcado como dado de baja en el sistema.`;

    if (!window.confirm(confirmMsg)) return;

    setEliminandoCode(cod);
    setFeedbackMsg(null);

    try {
      // 1. Dar de baja en la tabla inmuebles
      const { error: errInm } = await supabase
        .from('inmuebles')
        .update({
          estado: 'Eliminado',
          mmv_mes: 0,
          deuda_mmv: 0,
          cant_inmuebles: 0,
          padre_id: null
        })
        .eq('inmueble', cod);

      if (errInm) throw new Error('Error al actualizar inmueble: ' + errInm.message);

      // 2. Si tenía padre o era parte de un grupo de códigos, reajustar el padre
      const targetPadre = targetInm.padre_id || (inmueblesList.find(i => i.inmueble !== cod && (i.cant_inmuebles > 1 || i.padre_id))?.inmueble);

      if (targetPadre && targetPadre !== cod) {
        // Consultar los hijos restantes
        const { data: remainingHijos } = await supabase
          .from('inmuebles')
          .select('*')
          .neq('estado', 'Eliminado')
          .neq('inmueble', cod)
          .eq('padre_id', targetPadre);

        const hijos = remainingHijos || [];
        if (hijos.length > 0) {
          const newMMV = hijos.reduce((acc: number, h: any) => acc + (parseFloat(h.mmv_mes) || 0), 0);
          await supabase
            .from('inmuebles')
            .update({
              cant_inmuebles: hijos.length,
              mmv_mes: newMMV > 0 ? newMMV : 0.91
            })
            .eq('inmueble', targetPadre);
        } else {
          // Ya no tiene hijos: vuelve a ser un inmueble individual de 1 sola unidad
          await supabase
            .from('inmuebles')
            .update({
              cant_inmuebles: 1
            })
            .eq('inmueble', targetPadre);
        }
      }

      // 3. Registrar auditoría
      try {
        const u = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('usuario') || '{}') : {};
        await supabase.from('auditoria').insert([{
          accion: 'Código Inmueble Quitado a Mano',
          usuario: u.nombre || u.usuario || 'admin',
          modulo: '/admin/contribuyentes',
          detalles: {
            inmueble: cod,
            actividad: actDesc,
            padre_id: targetInm.padre_id || null,
            contribuyente: contribuyente.Contribuyente || contribuyente.contribuyente,
            identidad: contribuyente.Identidad || contribuyente.identidad,
            criticidad: 'ALTA'
          }
        }]);
      } catch (_) {}

      setFeedbackMsg({
        type: 'success',
        text: `El código ${cod} (${actDesc}) fue quitado y desvinculado exitosamente.`
      });

      // Recargar lista local
      await cargarInmuebles();

      // Refrescar datos globales de la aplicación
      if (onRefresh) {
        await onRefresh();
      }
    } catch (e: any) {
      console.error(e);
      setFeedbackMsg({
        type: 'error',
        text: 'No se pudo quitar el código: ' + (e?.message || 'Error desconocido')
      });
    } finally {
      setEliminandoCode(null);
    }
  };

  if (!isOpen || !contribuyente) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                Gestión de Códigos del Contribuyente
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                <span className="font-semibold text-white">{contribuyente.Contribuyente}</span> • <span className="font-mono text-emerald-300">{contribuyente.Identidad}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones de éxito o error */}
        {feedbackMsg && (
          <div className={`p-3 text-xs font-semibold flex items-center justify-between border-b ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedbackMsg.text}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600 text-sm">
              ✕
            </button>
          </div>
        )}

        {/* Contenido / Listado */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-600">
              Aquí puedes visualizar todos los códigos e inmuebles asociados a este usuario y <strong className="text-slate-800">quitarlos a mano</strong> si están duplicados, erróneos o desocupados.
            </div>
            <button
              onClick={cargarInmuebles}
              disabled={isLoading}
              className="text-xs flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-2xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
              Refrescar
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm font-semibold">Cargando códigos e inmuebles...</p>
            </div>
          ) : inmueblesList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300 p-6">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">No se encontraron códigos activos</p>
              <p className="text-xs text-slate-500 mt-1">Este contribuyente no posee ningún código de inmueble activo en el sistema.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between px-1">
                <span>Códigos Vinculados ({inmueblesList.length})</span>
                <span className="text-[11px] text-slate-400 font-normal">Acciones directas</span>
              </div>

              {inmueblesList.map((inm, idx) => {
                const cod = inm.inmueble;
                const isEliminando = eliminandoCode === cod;
                const esRes = isResidencialInm(inm);
                const esTerreno = isTerrenoInm(inm);
                const actLimpia = cleanClasificacionActividad(inm.actividad_principal) || inm.actividad_principal || (esRes ? 'Residencial' : 'Comercial');
                const isPadre = inm.cant_inmuebles > 1 || (!inm.padre_id && inmueblesList.some(other => other.padre_id === cod));
                const isHijo = Boolean(inm.padre_id && inm.padre_id !== cod);

                return (
                  <div
                    key={cod || idx}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-xl border transition-all ${
                      isEliminando 
                        ? 'opacity-50 pointer-events-none bg-slate-100 border-slate-200' 
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                      <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        esRes 
                          ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      }`}>
                        {esRes ? <HomeIcon className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-slate-900 text-sm bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {cod}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            esRes 
                              ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {esRes ? 'Residencial' : 'Comercial'}
                          </span>
                          {isPadre && (
                            <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                              Matriz / Agrupador
                            </span>
                          )}
                          {isHijo && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                              Vinculado a: {inm.padre_id}
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-semibold text-slate-800 mt-1 truncate" title={actLimpia}>
                          {actLimpia}
                        </div>

                        <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={inm.direccion || 'Sin dirección registrada'}>
                          📍 {inm.direccion || 'Sin dirección registrada'}
                        </div>
                      </div>
                    </div>

                    {/* Botón Quitar a Mano */}
                    <div className="mt-3 sm:mt-0 shrink-0 w-full sm:w-auto flex items-center justify-end">
                      <button
                        onClick={() => handleQuitarCodigo(inm)}
                        disabled={isEliminando}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-xs font-bold transition-all shadow-2xs group"
                        title={`Quitar código ${cod} permanentemente de este contribuyente`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500 group-hover:text-rose-700" />
                        <span>{isEliminando ? 'Quitando...' : 'Quitar Código'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <span>Las bajas quedan registradas en el módulo de auditoría fiscal.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
