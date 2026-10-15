'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Users, Building2, Store, FileText, MapPin, Phone, Mail,
  Calendar, DollarSign, Download, Printer, Percent, Calculator,
  AlertCircle, CheckCircle, Clock, ShieldCheck, AlertTriangle,
  Receipt, Wallet, ExternalLink, ArrowRight, Copy, Check, Eye,
  ChevronDown, ChevronUp, Layers, PieChart, Trash2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatBs, getIdentidadVariantsExact } from '@/lib/formatters';
import {
  calcularMensualidad, isResidencialInm, isExoneradoTotalMultas,
  isMesExoneradoMulta, getMesesExoneradosCount, cleanClasificacionActividad,
  extractNivelZona
} from '@/lib/calculos';

interface DetallesContribuyenteModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewData: any;
  inmueblesGlobal?: any[];
  recibosGlobal?: any[];
  conveniosGlobal?: any[];
  tcmmv: number;
  bcvRate: number;
  economicActivitiesBase?: Record<string, string>;
  onImprimirEstadoDeCuenta: (targetInmueble?: string, modo?: 'separados' | 'unificado') => void;
  onGenerarSolvencia: (row: any, targetInmueble?: string) => void;
  onEdit: (row: any) => void;
  onAjustarDeuda: (row: any) => void;
  onExonerarMultas: (row: any) => void;
  onDeleteFactura?: (factura: any) => void;
  onRefresh?: () => void;
}

export const DetallesContribuyenteModal: React.FC<DetallesContribuyenteModalProps> = ({
  isOpen,
  onClose,
  viewData,
  inmueblesGlobal = [],
  recibosGlobal = [],
  conveniosGlobal = [],
  tcmmv,
  bcvRate,
  economicActivitiesBase = {},
  onImprimirEstadoDeCuenta,
  onGenerarSolvencia,
  onEdit,
  onAjustarDeuda,
  onExonerarMultas,
  onDeleteFactura,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'inmuebles' | 'deuda' | 'pagos' | 'servicios'>('perfil');
  const [copiedId, setCopiedId] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eliminandoCode, setEliminandoCode] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Datos específicos del contribuyente cargados desde la base de datos
  const [inmueblesList, setInmueblesList] = useState<any[]>([]);
  const [facturasDb, setFacturasDb] = useState<any[]>([]);
  const [pagosDb, setPagosDb] = useState<any[]>([]);
  const [serviciosEspDb, setServiciosEspDb] = useState<any[]>([]);
  const [selectedInmSolvencia, setSelectedInmSolvencia] = useState('');
  const [expandedNAs, setExpandedNAs] = useState<Record<string, boolean>>({});
  const [selectedInmCode, setSelectedInmCode] = useState<string | null>(null);

  const toggleExpandNA = (code: string) => {
    setExpandedNAs(prev => ({ ...prev, [code]: !prev[code] }));
  };

  // Cargar datos en vivo al abrir el modal
  useEffect(() => {
    if (!isOpen || !viewData) return;

    let isMounted = true;
    setLoading(true);

    const ident = viewData.Identidad || '';
    const idVariants = getIdentidadVariantsExact(ident);
    const codes = String(viewData.CodCont || viewData.cod_cont || viewData.inmueble || '')
      .split(/\s+/)
      .map(c => c.trim().toUpperCase())
      .filter(Boolean);

    // 1. Cargar todos los inmuebles de este contribuyente y sus vínculos jerárquicos (padres / hijos)
    const fetchInmuebles = async () => {
      try {
        let query = supabase.from('inmuebles').select('*').neq('estado', 'Eliminado');
        if (idVariants.length > 0 && codes.length > 0) {
          query = query.or(`${idVariants.map(v => `identidad.eq.${v}`).join(',')},${codes.map(c => `inmueble.eq.${c}`).join(',')}`);
        } else if (idVariants.length > 0) {
          query = query.or(idVariants.map(v => `identidad.eq.${v}`).join(','));
        } else if (codes.length > 0) {
          query = query.in('inmueble', codes);
        }
        const { data } = await query.order('inmueble', { ascending: true });
        let allInms = [...(data || [])];

        // 1.1 Si encontramos inmuebles, buscar si alguno tiene locales hijos asociados por padre_id
        const foundCodes = allInms.map((i: any) => i.inmueble).filter(Boolean);
        if (foundCodes.length > 0) {
          const { data: hijosData } = await supabase
            .from('inmuebles')
            .select('*')
            .neq('estado', 'Eliminado')
            .in('padre_id', foundCodes);
          if (hijosData && hijosData.length > 0) {
            const existingCodes = new Set(allInms.map((i: any) => i.inmueble));
            hijosData.forEach((h: any) => {
              if (!existingCodes.has(h.inmueble)) {
                allInms.push(h);
                existingCodes.add(h.inmueble);
              }
            });
          }
        }

        // 1.2 Si algún inmueble tiene padre_id que no esté en la lista, traer al padre N/A
        const missingPadres = allInms
          .map((i: any) => i.padre_id)
          .filter((p): p is string => Boolean(p) && !allInms.some((x: any) => x.inmueble === p));
        if (missingPadres.length > 0) {
          const { data: padresData } = await supabase
            .from('inmuebles')
            .select('*')
            .neq('estado', 'Eliminado')
            .in('inmueble', missingPadres);
          if (padresData && padresData.length > 0) {
            const existingCodes = new Set(allInms.map((i: any) => i.inmueble));
            padresData.forEach((p: any) => {
              if (!existingCodes.has(p.inmueble)) {
                allInms.push(p);
                existingCodes.add(p.inmueble);
              }
            });
          }
        }

        if (isMounted) {
          if (allInms.length > 0) {
            setInmueblesList(allInms);
            // Auto expandir N/A por defecto
            const defaultExpanded: Record<string, boolean> = {};
            allInms.forEach((i: any) => {
              if (i.inmueble) defaultExpanded[i.inmueble] = true;
            });
            setExpandedNAs(prev => ({ ...defaultExpanded, ...prev }));
          } else {
            // Fallback a los que tengamos en memoria
            const memInms = inmueblesGlobal.filter((i: any) =>
              (i.identidad || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === (ident || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
            );
            setInmueblesList(memInms);
          }
        }
      } catch (err) {
        console.error('Error cargando inmuebles del contribuyente:', err);
      }
    };

    // 2. Cargar facturas / recibos pendientes y abonados
    const fetchFacturas = async () => {
      try {
        const { data } = await supabase
          .from('facturas')
          .select('*')
          .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
          .or(idVariants.map(v => `identidad.eq.${v}`).join(','))
          .order('emision', { ascending: true });

        if (isMounted) setFacturasDb(data || []);
      } catch (err) {
        console.error('Error cargando facturas:', err);
      }
    };

    // 3. Cargar pagos reportados
    const fetchPagos = async () => {
      try {
        const { data } = await supabase
          .from('pagos_reportados')
          .select('*')
          .or(idVariants.map(v => `identidad.eq.${v}`).join(','))
          .order('created_at', { ascending: false });

        if (isMounted) setPagosDb(data || []);
      } catch (err) {
        console.error('Error cargando pagos reportados:', err);
      }
    };

    // 4. Cargar servicios especiales e inspecciones
    const fetchServicios = async () => {
      try {
        const { data } = await supabase
          .from('servicios_especiales')
          .select('*')
          .or(idVariants.map(v => `identidad.eq.${v}`).join(','))
          .order('fecha', { ascending: false });

        if (isMounted) setServiciosEspDb(data || []);
      } catch (err) {
        console.error('Error cargando servicios especiales:', err);
      }
    };

    Promise.all([fetchInmuebles(), fetchFacturas(), fetchPagos(), fetchServicios()])
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, viewData, refreshKey]);

  const copyIdentidad = () => {
    if (viewData?.Identidad) {
      navigator.clipboard.writeText(viewData.Identidad);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleQuitarActividad = async (inmCode: string, actDesc: string, padreCode?: string) => {
    if (!window.confirm(`¿Está seguro de que desea quitar la actividad comercial "${actDesc}" (${inmCode}) de este contribuyente?\n\nAl confirmar, este inmueble/actividad será dado de baja en el sistema.`)) {
      return;
    }

    setEliminandoCode(inmCode);
    try {
      // 1. Dar de baja en la tabla inmuebles
      const { error: errInm } = await supabase
        .from('inmuebles')
        .update({ estado: 'Eliminado', mmv_mes: 0, deuda_mmv: 0 })
        .eq('inmueble', inmCode);

      if (errInm) throw new Error('Error al actualizar inmueble: ' + errInm.message);

      // 2. Si tenía padre N/A, recalcular la tarifa sumatoria del padre N/A
      if (padreCode) {
        const { data: remainingHijos } = await supabase
          .from('inmuebles')
          .select('mmv_mes')
          .neq('estado', 'Eliminado')
          .eq('padre_id', padreCode)
          .neq('inmueble', inmCode);

        const newMMV = (remainingHijos || []).reduce((acc: number, h: any) => acc + (parseFloat(h.mmv_mes) || 0), 0);
        await supabase
          .from('inmuebles')
          .update({ mmv_mes: newMMV > 0 ? newMMV : 0.91 })
          .eq('inmueble', padreCode);
      }

      // 3. Auditoría
      try {
        const u = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('usuario') || '{}') : {};
        await supabase.from('auditoria').insert([{
          accion: 'Actividad Comercial Eliminada',
          usuario: u.nombre || u.usuario || 'admin',
          modulo: '/admin/contribuyentes',
          detalles: {
            inmueble: inmCode,
            actividad: actDesc,
            padre_id: padreCode || null,
            contribuyente: viewData.Contribuyente,
            identidad: viewData.Identidad,
            criticidad: 'MEDIA'
          }
        }]);
      } catch (_) {}

      // 4. Refrescar datos en el modal y globalmente
      setRefreshKey(k => k + 1);
      if (onRefresh) onRefresh();

      alert(`La actividad comercial ${inmCode} (${actDesc}) fue quitada exitosamente.`);
    } catch (e: any) {
      console.error(e);
      alert('No se pudo quitar la actividad: ' + (e?.message || 'Error desconocido'));
    } finally {
      setEliminandoCode(null);
    }
  };

  // Cálculo de deuda consolidada
  const tasaEfectiva = tcmmv > 0 ? tcmmv : (bcvRate > 0 ? bcvRate : 1);
  // Inmuebles sin eliminar
  const userInms = useMemo(() => {
    return inmueblesList.filter(i => i.estado !== 'Eliminado');
  }, [inmueblesList]);

  // Unificación jerárquica: Inmuebles N/A con sus locales e hijos
  const unifiedInmuebles = useMemo(() => {
    // 1. Agrupar hijos por su padre_id
    const hijosByPadre = new Map<string, any[]>();
    userInms.forEach(i => {
      const p = i.padre_id;
      if (p) {
        if (!hijosByPadre.has(p)) hijosByPadre.set(p, []);
        hijosByPadre.get(p)!.push(i);
      }
    });

    // 2. Identificar cuáles inmuebles son hijos de un padre presente en userInms
    const childCodesSet = new Set<string>();
    userInms.forEach(i => {
      if (i.padre_id && userInms.some(p => p.inmueble === i.padre_id && p.inmueble !== i.inmueble)) {
        childCodesSet.add(i.inmueble);
      }
    });

    // 3. Generar entidades principales (los hijos quedan unificados bajo su padre N/A)
    return userInms
      .filter(i => !childCodesSet.has(i.inmueble))
      .map(inm => {
        const hijos = hijosByPadre.get(inm.inmueble) || [];
        const isNA = /^(N\/?A|NA|NINGUNA|SIN ACTIVIDAD|-)$/i.test((inm.actividad_principal || '').trim()) || hijos.length > 0;
        const sumHijosMMV = hijos.reduce((acc, h) => acc + (parseFloat(h.mmv_mes) || 0), 0);
        
        // La tarifa del N/A es la sumatoria de las actividades de sus hijos
        const mmvTotal = (isNA && hijos.length > 0 && sumHijosMMV > 0) 
          ? (parseFloat(inm.mmv_mes) || sumHijosMMV) 
          : (parseFloat(inm.mmv_mes) || 0.91);

        const mesesPadre = parseInt(inm.meses_deuda || '0');
        const maxMesesHijos = hijos.length > 0 ? Math.max(...hijos.map(h => parseInt(h.meses_deuda || '0'))) : 0;
        const mesesDeuda = Math.max(mesesPadre, maxMesesHijos);

        return {
          inm,
          codigo: inm.inmueble,
          isNAParent: isNA && hijos.length > 0,
          hijos,
          sumHijosMMV,
          mmvTotal,
          mesesDeuda
        };
      });
  }, [userInms]);

  // Verificar si es agente de retención (75% IVA)
  const esAgente = useMemo(() => {
    return userInms.some(i => i.agente_retencion === true || String(i.agente_retencion) === 'true');
  }, [userInms]);

  // Deuda total acumulada de los inmuebles (unificada para no duplicar N/A con sus hijos)
  const resumenDeudaInmuebles = useMemo(() => {
    let totalBase = 0;
    let totalIva = 0;
    let totalMultas = 0;
    let mesesMax = 0;

    unifiedInmuebles.forEach((group) => {
      const { inm, isNAParent, mmvTotal, mesesDeuda } = group;
      const meses = Math.max(0, mesesDeuda);
      if (meses > mesesMax) mesesMax = meses;
      if (meses <= 0) return;

      const esRes = isResidencialInm(inm);
      // Para un N/A matriz, su mensualidad base se computa sobre mmvTotal (sumatoria de sus hijos)
      const baseMes = isNAParent 
        ? calcularMensualidad({ ...inm, mmv_mes: mmvTotal }, tasaEfectiva) 
        : calcularMensualidad(inm, tasaEfectiva);
      const baseInm = baseMes * meses;
      const ivaInm = esRes ? 0 : baseInm * 0.16;

      const esExon = isExoneradoTotalMultas(inm.notas);
      const cantExon = getMesesExoneradosCount(inm.notas);
      const multaMes = esExon ? 0 : baseMes * (esRes ? 0.10 : 0.12);
      const mesesConMulta = esExon ? 0 : Math.max(0, meses - 1 - cantExon);
      const multaInm = multaMes * mesesConMulta;

      totalBase += baseInm;
      totalIva += ivaInm;
      totalMultas += multaInm;
    });

    const subtotal = totalBase + totalIva + totalMultas;
    const retencion75 = esAgente ? Math.round(totalIva * 0.75 * 100) / 100 : 0;
    const totalPagar = Math.max(0, subtotal - retencion75);

    return { totalBase, totalIva, totalMultas, subtotal, retencion75, totalPagar, mesesMax };
  }, [unifiedInmuebles, tasaEfectiva, esAgente]);

  // Condominio padre si aplica
  const condominioPadre = useMemo(() => {
    const pId = viewData?.condominio_padre_id || userInms.find(i => i.condominio_padre_id)?.condominio_padre_id;
    if (!pId) return null;
    const parentInm = inmueblesGlobal.find(i => i.inmueble === pId || i.id === pId);
    return {
      codigo: pId,
      nombre: viewData?.condominio_padre_nombre || parentInm?.contribuyente || parentInm?.nombre || 'Condominio Matriz'
    };
  }, [viewData, userInms, inmueblesGlobal]);

  // Inmuebles solventes para descarga de solvencia
  const inmsSolventes = useMemo(() => {
    return userInms.filter(inm => {
      const meses = parseInt(inm.meses_deuda || '0', 10);
      const mmv = parseFloat(inm.deuda_mmv || '0');
      const cong = parseFloat(inm.deuda_congelada_bs || '0');
      const mult = parseFloat(inm.multa_bs || '0');
      return meses === 0 && mmv <= 0.0001 && cong <= 0.01 && mult <= 0.01 && inm.estado !== 'Eliminado';
    });
  }, [userInms]);

  if (!isOpen || !viewData) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col border border-slate-200">
        
        {/* ══ ENCABEZADO PRINCIPAL (MODERNO & PROFESIONAL) ══ */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 sm:p-6 shrink-0 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 relative z-10">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-md border border-emerald-800/80 flex items-center gap-1.5">
                  {viewData.Identidad || 'SIN-RIF'}
                  <button onClick={copyIdentidad} className="hover:text-white transition-colors" title="Copiar Cédula/RIF">
                    {copiedId ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                  </button>
                </span>

                {condominioPadre && (
                  <span className="bg-indigo-900/80 text-indigo-200 text-xs font-bold px-2.5 py-0.5 rounded-md border border-indigo-700/80 flex items-center gap-1">
                    🏢 Filial de: {condominioPadre.nombre} ({condominioPadre.codigo})
                  </span>
                )}

                {esAgente && (
                  <span className="bg-violet-900/80 text-violet-200 text-xs font-bold px-2.5 py-0.5 rounded-md border border-violet-700/80">
                    Agente de Retención (75% IVA)
                  </span>
                )}

                <span className={`text-xs font-black px-2.5 py-0.5 rounded-md border ${
                  resumenDeudaInmuebles.totalPagar > 0.01
                    ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                }`}>
                  {resumenDeudaInmuebles.totalPagar > 0.01 ? `MORA (${resumenDeudaInmuebles.mesesMax}m)` : 'SOLVENTE'}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate" title={viewData.Contribuyente}>
                {viewData.Contribuyente}
              </h2>
              <div className="text-xs text-slate-300 flex items-center gap-1.5 truncate flex-wrap pt-0.5">
                <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-200">{cleanClasificacionActividad(viewData.Actividad || viewData.actividad_principal) || 'Contribuyente Municipal'}</span>
                {extractNivelZona(viewData.Actividad || viewData.actividad_principal).nivel && (
                  <span className="bg-purple-900/80 text-purple-200 text-[10px] font-extrabold px-2 py-0.5 rounded border border-purple-700/80">
                    Nivel {extractNivelZona(viewData.Actividad || viewData.actividad_principal).nivel}
                  </span>
                )}
                {extractNivelZona(viewData.Actividad || viewData.actividad_principal).zona && (
                  <span className="bg-emerald-900/80 text-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded border border-emerald-700/80">
                    {extractNivelZona(viewData.Actividad || viewData.actividad_principal).zona}
                  </span>
                )}
                {viewData.CodCont && <span className="font-mono text-slate-400">· {viewData.CodCont}</span>}
              </div>
            </div>

            {/* Acciones Rápidas del Encabezado */}
            <div className="flex items-center gap-2 self-start shrink-0">
              <a
                href={`/admin/caja?cedula=${encodeURIComponent(viewData.Identidad || '')}`}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                title="Cobrar en Caja General"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Cobrar en Caja</span>
              </a>

              <button
                onClick={() => onImprimirEstadoDeCuenta(undefined, 'separados')}
                className="px-3 py-2 bg-slate-700/80 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-600 shadow-sm transition-all"
                title="Descargar Estado de Cuenta PDF Consolidado"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Estado Cuenta PDF</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                title="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tarjetas resumen en el encabezado */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-700/60 text-xs">
            <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Adeudado</span>
              <span className={`text-base font-black tabular-nums ${resumenDeudaInmuebles.totalPagar > 0.01 ? 'text-rose-400' : 'text-emerald-400'}`}>
                Bs. {formatBs(resumenDeudaInmuebles.totalPagar)}
              </span>
            </div>

            <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Inmuebles / Locales</span>
              <span className="text-base font-black text-white tabular-nums">
                {unifiedInmuebles.length} {unifiedInmuebles.length === 1 ? 'unidad' : 'unidades'}
                {userInms.length > unifiedInmuebles.length ? ` (${userInms.length} actividades)` : ''}
              </span>
            </div>

            <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Saldo a Favor</span>
              <span className="text-base font-black text-emerald-400 tabular-nums">
                Bs. {formatBs(viewData.SaldoFavor || 0)}
              </span>
            </div>

            <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tasa Oficial Activa</span>
              <span className="text-base font-black text-amber-300 tabular-nums">
                Bs. {formatBs(tasaEfectiva)}
              </span>
            </div>
          </div>
        </div>

        {/* ══ BARRA DE PESTAÑAS (TABS NAVEGABLES) ══ */}
        <div className="bg-slate-100/80 border-b border-slate-200 px-4 sm:px-6 flex gap-1 overflow-x-auto shrink-0 select-none">
          {[
            { id: 'perfil', label: 'Perfil y Contacto', icon: Users },
            { id: 'inmuebles', label: `Inmuebles (${unifiedInmuebles.length}${userInms.length > unifiedInmuebles.length ? ` · ${userInms.length} act.` : ''})`, icon: Building2 },
            { id: 'deuda', label: `Estado de Cuenta (${facturasDb.length} recibos)`, icon: DollarSign },
            { id: 'pagos', label: `Historial de Pagos (${pagosDb.length})`, icon: Receipt },
            { id: 'servicios', label: `Servicios y Convenios (${serviciosEspDb.length})`, icon: FileText },
          ].map(tab => {
            const Icon = tab.icon;
            const isAct = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3.5 text-xs font-extrabold border-b-2 flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
                  isAct
                    ? 'border-emerald-600 text-emerald-800 bg-white shadow-2xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isAct ? 'text-emerald-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ══ CONTENIDO DINÁMICO POR PESTAÑA ══ */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">

          {/* ══════════════════════════════════════════════════════
              TAB 1: PERFIL Y DATOS DE CONTACTO
             ══════════════════════════════════════════════════════ */}
          {activeTab === 'perfil' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Tarjeta de Información Fiscal */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" /> Datos de Identificación Fiscal
                    </h3>
                    <button
                      onClick={() => {
                        onClose();
                        onEdit(viewData);
                      }}
                      className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      ✏️ Editar datos
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">R.I.F. / Cédula</span>
                      <span className="font-bold font-mono text-slate-800">{viewData.Identidad || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Clasificación</span>
                      <span className="font-bold text-slate-800">{viewData.Clasificacion || 'Comercial'}</span>
                    </div>

                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Razón Social</span>
                      <span className="font-bold text-slate-900 text-sm block">{viewData.Contribuyente}</span>
                    </div>

                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Actividad Principal</span>
                      <span className="font-bold text-slate-800">{cleanClasificacionActividad(viewData.Actividad || viewData.actividad_principal) || 'No registrada'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Nivel Tarifario</span>
                      {extractNivelZona(viewData.Actividad || viewData.actividad_principal).nivel ? (
                        <span className="inline-flex items-center gap-1 font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          ⚡ {extractNivelZona(viewData.Actividad || viewData.actividad_principal).nivel}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">N/A</span>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Zona Catastral</span>
                      {extractNivelZona(viewData.Actividad || viewData.actividad_principal).zona ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          📍 {extractNivelZona(viewData.Actividad || viewData.actividad_principal).zona}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">N/A</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tarjeta de Contacto y Ubicación */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Phone className="w-4 h-4 text-emerald-600" /> Contacto y Localización
                    </h3>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Teléfono</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        📞 {viewData.Telefono && viewData.Telefono !== 'No registrado' ? viewData.Telefono : <span className="text-amber-600 font-normal">Sin teléfono registrado</span>}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Correo Electrónico</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        ✉️ {viewData.Correo && viewData.Correo !== 'No registrado' ? viewData.Correo : <span className="text-amber-600 font-normal">Sin correo registrado</span>}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Dirección Fiscal / Ubicación</span>
                      <p className="font-medium text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {viewData.Direccion || 'No especificada'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Observaciones y Notas Administrativas */}
              {viewData.Observaciones && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">Observaciones del Registro</span>
                    <p className="text-xs text-amber-800 font-medium whitespace-pre-wrap leading-relaxed">
                      {viewData.Observaciones}
                    </p>
                  </div>
                </div>
              )}

              {/* Botón rápido para solvencia individual si está solvente */}
              {inmsSolventes.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-7 h-7 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-emerald-950 text-sm">Inmuebles Solventes Listos para Certificado</h4>
                      <p className="text-xs text-emerald-800">Tiene {inmsSolventes.length} inmueble(s) al día con derecho a solvencia municipal inmediata.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onGenerarSolvencia(viewData, inmsSolventes[0]?.inmueble)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descargar Solvencia ({inmsSolventes[0]?.inmueble})</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB 2: INMUEBLES Y LOCALES
             ══════════════════════════════════════════════════════ */}
          {/* ══════════════════════════════════════════════════════
              TAB 2: INMUEBLES Y LOCALES (UNIFICACIÓN N/A Y ACTIVIDADES)
             ══════════════════════════════════════════════════════ */}
          {activeTab === 'inmuebles' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Catálogo de Inmuebles y Locales Asociados</h3>
                  <p className="text-xs text-slate-500">
                    Listado de unidades pertenecientes o declaradas ({unifiedInmuebles.length} {unifiedInmuebles.length === 1 ? 'unidad principal' : 'unidades principales'}{userInms.length > unifiedInmuebles.length ? `, con ${userInms.length} actividades/locales en total` : ''}).
                  </p>
                </div>
              </div>

              {unifiedInmuebles.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
                  No se encontraron inmuebles registrados bajo esta cédula/RIF.
                </div>
              ) : (
                <div className="space-y-4">
                  {unifiedInmuebles.map((group, idx) => {
                    const { inm, isNAParent, hijos, sumHijosMMV, mmvTotal, mesesDeuda } = group;
                    const meses = mesesDeuda;
                    const baseMes = isNAParent 
                      ? calcularMensualidad({ ...inm, mmv_mes: mmvTotal }, tasaEfectiva) 
                      : calcularMensualidad(inm, tasaEfectiva);
                    const esRes = isResidencialInm(inm);
                    const isExpanded = !!expandedNAs[inm.inmueble];
                    const isSelected = selectedInmCode === inm.inmueble;

                    if (isNAParent) {
                      return (
                        <div 
                          key={idx} 
                          className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                            isSelected 
                              ? 'border-indigo-400 ring-2 ring-indigo-200 shadow-md' 
                              : 'border-indigo-200/90 shadow-2xs hover:shadow-sm'
                          }`}
                        >
                          {/* Encabezado Matriz N/A */}
                          <div 
                            onClick={() => {
                              setSelectedInmCode(inm.inmueble);
                              toggleExpandNA(inm.inmueble);
                            }}
                            className="p-4 bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 cursor-pointer border-b border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-black text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                                  🏛️ {inm.inmueble}
                                </span>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-600 text-white uppercase tracking-wider flex items-center gap-1">
                                  <Layers className="w-3 h-3" />
                                  Unidad Matriz N/A
                                </span>
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                  {hijos.length} {hijos.length === 1 ? 'actividad/local' : 'actividades/locales'} agrupados
                                </span>
                                <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                                  meses > 0 ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {meses > 0 ? `${meses} meses de deuda` : 'Al día'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 pt-1 text-xs">
                                <span className="font-bold text-slate-800">
                                  Tarifa Mensual Agrupada:
                                </span>
                                <span className="font-black text-indigo-950 text-sm">
                                  Bs. {formatBs(baseMes * (esRes ? 1 : 1.16))}
                                </span>
                                <span className="text-xs text-indigo-700 font-semibold bg-indigo-100/60 px-2 py-0.5 rounded">
                                  {mmvTotal.toFixed(2)} MMV
                                </span>
                                <span className="text-[11px] text-slate-500 italic hidden md:inline">
                                  (Sumatoria exacta de sus {hijos.length} actividades)
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onImprimirEstadoDeCuenta(inm.inmueble, 'separados');
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                                title={`Descargar Estado de Cuenta del Inmueble Matriz ${inm.inmueble}`}
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>PDF Matriz N/A</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedInmCode(inm.inmueble);
                                  toggleExpandNA(inm.inmueble);
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl transition-colors shadow-2xs"
                              >
                                <span>{isExpanded ? 'Ocultar Desglose' : `Ver ${hijos.length} Actividades`}</span>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-600" />}
                              </button>
                            </div>
                          </div>

                          {/* Sección Desplegable: Desglose de Actividades Hijas */}
                          {isExpanded && (
                            <div className="p-4 bg-slate-50/70 border-t border-indigo-100 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <PieChart className="w-4 h-4 text-indigo-600" />
                                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                                    Desglose de Actividades y Locales que Componen la Tarifa N/A
                                  </h4>
                                </div>
                                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200">
                                  ∑ {sumHijosMMV.toFixed(2)} MMV
                                </span>
                              </div>

                              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100/80 text-slate-600 font-bold text-[10px] uppercase border-b border-slate-200">
                                      <tr>
                                        <th className="px-3 py-2.5">Código Inmueble / Local</th>
                                        <th className="px-3 py-2.5">Actividad Económica Declarada</th>
                                        <th className="px-3 py-2.5 text-right">Tarifa (MMV)</th>
                                        <th className="px-3 py-2.5 text-right">Monto Estimado (Bs)</th>
                                        <th className="px-3 py-2.5 text-center">Ponderación (%)</th>
                                        <th className="px-3 py-2.5 text-center">Acción</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {hijos.map((hijo: any, hIdx: number) => {
                                        const hijoMMV = parseFloat(hijo.mmv_mes || 0);
                                        const hijoBase = calcularMensualidad(hijo, tasaEfectiva);
                                        const hijoBs = hijoBase * (isResidencialInm(hijo) ? 1 : 1.16);
                                        const pct = mmvTotal > 0 ? (hijoMMV / mmvTotal) * 100 : 0;

                                        return (
                                          <tr key={hIdx} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-3 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                                                {hijo.inmueble}
                                              </span>
                                              {hijo.numero_local && (
                                                <span className="ml-1.5 text-[10px] text-slate-500">
                                                  Loc. {hijo.numero_local}
                                                </span>
                                              )}
                                            </td>

                                            <td className="px-3 py-2.5">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-bold text-slate-800">
                                                  {cleanClasificacionActividad(hijo.actividad_principal) || hijo.actividad_principal || 'Actividad Comercial'}
                                                </span>
                                                {extractNivelZona(hijo.actividad_principal).nivel && (
                                                  <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 py-0.2 rounded border border-purple-200">
                                                    Nivel {extractNivelZona(hijo.actividad_principal).nivel}
                                                  </span>
                                                )}
                                                {extractNivelZona(hijo.actividad_principal).zona && (
                                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                                                    {extractNivelZona(hijo.actividad_principal).zona}
                                                  </span>
                                                )}
                                              </div>
                                              {hijo.direccion && (
                                                <span className="text-[10px] text-slate-400 block truncate max-w-xs" title={hijo.direccion}>
                                                  {hijo.direccion}
                                                </span>
                                              )}
                                            </td>

                                            <td className="px-3 py-2.5 text-right font-black text-indigo-950 whitespace-nowrap">
                                              {hijoMMV.toFixed(2)} MMV
                                            </td>

                                            <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                                              Bs. {formatBs(hijoBs)}
                                            </td>

                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                              <div className="inline-flex items-center gap-1.5">
                                                <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                                                  <div 
                                                    className="bg-indigo-600 h-2 rounded-full" 
                                                    style={{ width: `${Math.min(100, pct)}%` }} 
                                                  />
                                                </div>
                                                <span className="font-bold text-[10px] text-slate-600 w-9 text-right">
                                                  {pct.toFixed(1)}%
                                                </span>
                                              </div>
                                            </td>

                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                              <div className="inline-flex items-center gap-1.5">
                                                <button
                                                  type="button"
                                                  onClick={() => onImprimirEstadoDeCuenta(hijo.inmueble, 'separados')}
                                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                                  title={`Estado de Cuenta individual de ${hijo.inmueble}`}
                                                >
                                                  <Printer className="w-3 h-3" />
                                                  <span>PDF Local</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={eliminandoCode === hijo.inmueble}
                                                  onClick={() => handleQuitarActividad(hijo.inmueble, cleanClasificacionActividad(hijo.actividad_principal) || hijo.actividad_principal || 'Actividad Comercial', inm.inmueble)}
                                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                                  title={`Quitar actividad comercial ${hijo.inmueble} de este contribuyente`}
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                  <span>{eliminandoCode === hijo.inmueble ? 'Quitando...' : 'Quitar'}</span>
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot className="bg-indigo-50/60 font-black text-indigo-950 border-t border-indigo-200 text-xs">
                                      <tr>
                                        <td colSpan={2} className="px-3 py-2 text-right">
                                          Total Sumatoria de Actividades ({hijos.length}):
                                        </td>
                                        <td className="px-3 py-2 text-right text-indigo-900">
                                          {sumHijosMMV.toFixed(2)} MMV
                                        </td>
                                        <td className="px-3 py-2 text-right text-indigo-900">
                                          Bs. {formatBs(calcularMensualidad({ ...inm, mmv_mes: sumHijosMMV }, tasaEfectiva) * (esRes ? 1 : 1.16))}
                                        </td>
                                        <td colSpan={2} className="px-3 py-2 text-center text-[10px] text-emerald-700 font-bold">
                                          ✓ Cuadratura exacta con Matriz {inm.inmueble}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Inmueble independiente / no N/A
                    return (
                      <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-sm transition-all space-y-3">
                        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div>
                            <span className="font-mono text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {inm.inmueble || `Inmueble ${idx + 1}`}
                            </span>
                            <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {inm.tipo || 'LOCAL'}
                            </span>
                          </div>

                          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                            meses > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {meses > 0 ? `${meses} meses de deuda` : 'Al día'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="col-span-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Actividad / Ramo</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-800" title={inm.actividad_principal}>
                                {cleanClasificacionActividad(inm.actividad_principal) || 'No especificada'}
                              </span>
                              {extractNivelZona(inm.actividad_principal).nivel && (
                                <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 py-0.2 rounded border border-purple-200">
                                  Nivel {extractNivelZona(inm.actividad_principal).nivel}
                                </span>
                              )}
                              {extractNivelZona(inm.actividad_principal).zona && (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                                  {extractNivelZona(inm.actividad_principal).zona}
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Tarifa Mensual</span>
                            <span className="font-black text-slate-900">
                              Bs. {formatBs(baseMes * (esRes ? 1 : 1.16))}
                            </span>
                            <span className="text-[10px] text-slate-400 block">{inm.mmv_mes || 0.91} MMV</span>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Metraje Declarado</span>
                            <span className="font-semibold text-slate-700">{inm.area || inm.area_operativa || 'N/A'} m²</span>
                          </div>

                          <div className="col-span-2 pt-1 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Dirección Local</span>
                            <span className="font-medium text-slate-600 text-[11px] line-clamp-2" title={inm.direccion}>
                              {inm.direccion || 'Sin dirección específica'}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onImprimirEstadoDeCuenta(inm.inmueble, 'separados')}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                            title={`Descargar Estado de Cuenta en PDF para este local (${inm.inmueble})`}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>PDF Estado Cuenta Local</span>
                          </button>

                          <div className="flex items-center gap-2">
                            {meses === 0 && parseFloat(inm.deuda_mmv || '0') <= 0.0001 && parseFloat(inm.deuda_congelada_bs || '0') <= 0.01 && (
                              <button
                                type="button"
                                onClick={() => onGenerarSolvencia(viewData, inm.inmueble)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                                title="Descargar Solvencia de este inmueble"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Solvencia</span>
                              </button>
                            )}

                            {userInms.length > 1 && (
                              <button
                                type="button"
                                disabled={eliminandoCode === inm.inmueble}
                                onClick={() => handleQuitarActividad(inm.inmueble, cleanClasificacionActividad(inm.actividad_principal) || inm.actividad_principal || 'Actividad Comercial')}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                                title={`Quitar esta actividad comercial (${inm.inmueble})`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{eliminandoCode === inm.inmueble ? 'Quitando...' : 'Quitar Actividad'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB 3: ESTADO DE CUENTA Y DEUDA
             ══════════════════════════════════════════════════════ */}
          {activeTab === 'deuda' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Tarjeta Ejecutiva de Deuda */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Deuda Acumulada</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-rose-600 tabular-nums">
                      Bs. {formatBs(resumenDeudaInmuebles.totalPagar)}
                    </span>
                    {esAgente && (
                      <span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">
                        Retención 75% aplicada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Base Aseo: Bs. {formatBs(resumenDeudaInmuebles.totalBase)} · IVA 16%: Bs. {formatBs(resumenDeudaInmuebles.totalIva)} · Multas: Bs. {formatBs(resumenDeudaInmuebles.totalMultas)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onExonerarMultas(viewData)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Exonerar multas por mora"
                  >
                    <Percent className="w-3.5 h-3.5 text-rose-600" />
                    <span>Exonerar Multas</span>
                  </button>

                  <button
                    onClick={() => onAjustarDeuda(viewData)}
                    className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Ajustar deuda o meses"
                  >
                    <Calculator className="w-3.5 h-3.5 text-amber-600" />
                    <span>Ajustar Deuda</span>
                  </button>

                  <button
                    onClick={() => onImprimirEstadoDeCuenta(undefined, 'separados')}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Exportar Estado de Cuenta Completo en PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Descargar PDF</span>
                  </button>
                </div>
              </div>

              {/* Aviso normativo de ordenanza */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Conforme a la Ordenanza Municipal, el mes corriente más reciente está exento de recargo de mora.</span>
              </div>

              {/* Desglose Explicativo de Tarifas para Inmuebles N/A */}
              {unifiedInmuebles.some(g => g.isNAParent) && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-700" />
                      <h4 className="font-bold text-xs text-indigo-950 uppercase tracking-wide">
                        Composición de Tarifas para Inmuebles Matriz N/A (Sumatoria de Actividades Hijas)
                      </h4>
                    </div>
                    <span className="text-[10px] font-extrabold text-indigo-800 bg-white px-2.5 py-0.5 rounded border border-indigo-200 shadow-2xs">
                      Regla Ordenanza
                    </span>
                  </div>

                  <p className="text-xs text-indigo-900 leading-relaxed">
                    Las unidades clasificadas como <span className="font-bold font-mono">N/A</span> agrupan múltiples locales u oficinas. La tarifa mensual facturada corresponde a la <span className="font-bold">sumatoria exacta</span> de las actividades económicas de sus locales hijos:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {unifiedInmuebles.filter(g => g.isNAParent).map((g, gIdx) => (
                      <div key={gIdx} className="bg-white rounded-xl p-3.5 border border-indigo-200 shadow-2xs space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <span className="font-mono font-black text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            🏛️ {g.codigo} (Matriz N/A)
                          </span>
                          <span className="font-black text-indigo-950 text-xs">
                            {g.mmvTotal.toFixed(2)} MMV / mes
                          </span>
                        </div>
                        <ul className="space-y-1.5 text-[11px] text-slate-700">
                          {g.hijos.map((h: any, hIdx: number) => (
                            <li key={hIdx} className="flex items-center justify-between">
                              <span className="truncate pr-2 font-medium text-slate-800">
                                • <span className="font-mono font-bold text-slate-600">{h.inmueble}</span>: {cleanClasificacionActividad(h.actividad_principal)}
                              </span>
                              <span className="font-mono font-bold text-indigo-900 shrink-0">
                                {parseFloat(h.mmv_mes || 0).toFixed(2)} MMV
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
                          <span>Total ({g.hijos.length} actividades):</span>
                          <span className="font-black text-indigo-950 font-mono">
                            {g.sumHijosMMV.toFixed(2)} MMV = {g.mmvTotal.toFixed(2)} MMV
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabla de Períodos Facturados */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-700 uppercase tracking-wide">
                    Detalle Cronológico de Recibos y Meses Pendientes ({facturasDb.length})
                  </span>
                </div>

                {facturasDb.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No hay recibos de facturación pendientes emitidos.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 uppercase font-bold text-[10px] sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">Referencia</th>
                          <th className="px-4 py-2.5">Período / Emisión</th>
                          <th className="px-4 py-2.5 text-center">Estado</th>
                          <th className="px-4 py-2.5 text-right">Monto Adeudado (Bs)</th>
                          {onDeleteFactura && <th className="px-3 py-2.5 text-center w-10">Acción</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {facturasDb.map((f, idx) => {
                          const isUltimo = idx === facturasDb.length - 1;
                          const rawMonto = parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-2.5 font-mono font-bold text-slate-800">{f.referencia}</td>
                              <td className="px-4 py-2.5 text-slate-700 font-medium">
                                {f.emision || '---'}
                                {isUltimo && (
                                  <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    Sin Mora
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  f.estado === 'Abonado' ? 'bg-amber-100 text-amber-800' :
                                  f.estado === 'Por Verificar' ? 'bg-blue-100 text-blue-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {f.estado || 'Pendiente'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-black text-rose-600">
                                Bs. {formatBs(rawMonto)}
                              </td>
                              {onDeleteFactura && (
                                <td className="px-3 py-2.5 text-center">
                                  <button
                                    onClick={() => onDeleteFactura(f)}
                                    className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                                    title="Eliminar recibo"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB 4: HISTORIAL DE PAGOS Y FACTURACIÓN
             ══════════════════════════════════════════════════════ */}
          {activeTab === 'pagos' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Historial de Pagos y Transacciones Reportadas</h3>
                  <p className="text-xs text-slate-500">Transacciones procesadas en Caja y reportes bancarios registrados.</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                {pagosDb.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No se registran pagos previos en el sistema para este contribuyente.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 uppercase font-bold text-[10px] sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">Fecha</th>
                          <th className="px-4 py-2.5">Referencia</th>
                          <th className="px-4 py-2.5">Método / Banco</th>
                          <th className="px-4 py-2.5 text-right">Monto (Bs)</th>
                          <th className="px-4 py-2.5 text-center">Estado</th>
                          <th className="px-4 py-2.5 text-center">Comprobante Fiscal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagosDb.map((p, idx) => {
                          let det: any = {};
                          try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch {}
                          const facturaDigital = det.factura_digital;

                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-2.5 text-slate-600 font-medium">
                                {p.created_at ? new Date(p.created_at).toLocaleDateString('es-VE') : '---'}
                              </td>
                              <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                                {p.referencia || p.id}
                              </td>
                              <td className="px-4 py-2.5 text-slate-700">
                                <span className="font-semibold">{p.metodo || p.tipo || 'Pago'}</span>
                                {p.banco && <span className="text-slate-400 block text-[10px]">{p.banco}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right font-black text-emerald-700">
                                Bs. {formatBs(p.monto)}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  p.estado === 'Aprobado' || p.estado === 'Conciliado' ? 'bg-emerald-100 text-emerald-800' :
                                  p.estado === 'Por Verificar' ? 'bg-amber-100 text-amber-800' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {p.estado || 'Procesado'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {facturaDigital?.url ? (
                                  <a
                                    href={facturaDigital.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border border-blue-200 transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Ver Factura TFHKA</span>
                                  </a>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB 5: SERVICIOS ESPECIALES Y CONVENIOS
             ══════════════════════════════════════════════════════ */}
          {activeTab === 'servicios' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Servicios Especiales e Inspecciones */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    Servicios Especiales, Visto Bueno e Inspecciones Ambientales
                  </h3>
                  <span className="text-xs font-semibold text-slate-500">
                    {serviciosEspDb.length} registrados
                  </span>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  {serviciosEspDb.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs">
                      No hay servicios especiales o inspecciones registradas.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-600 uppercase font-bold text-[10px] sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Tipo</th>
                            <th className="px-4 py-2.5">Descripción</th>
                            <th className="px-4 py-2.5">Fecha</th>
                            <th className="px-4 py-2.5 text-center">Estado</th>
                            <th className="px-4 py-2.5 text-right">Monto (Bs)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {serviciosEspDb.map((s, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-2.5 font-bold text-emerald-700 capitalize">
                                {String(s.tipo || '').replace(/_/g, ' ')}
                              </td>
                              <td className="px-4 py-2.5 text-slate-700 font-medium">{s.descripcion}</td>
                              <td className="px-4 py-2.5 text-slate-500">{s.fecha || '---'}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  s.estado === 'Pagado' ? 'bg-emerald-100 text-emerald-800' :
                                  s.estado === 'Por Verificar' ? 'bg-amber-100 text-amber-800' :
                                  'bg-rose-100 text-rose-800'
                                }`}>
                                  {s.estado || 'Pendiente'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-black text-slate-900">
                                Bs. {formatBs(s.monto)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Convenios de Pago */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-orange-600" />
                    Convenios de Pago Activos y Cuotas
                  </h3>
                </div>

                {(() => {
                  const userConvenios = conveniosGlobal.filter(c => c.identidad === viewData.Identidad);
                  if (userConvenios.length === 0) {
                    return (
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
                        No tiene convenios de pago activos formalizados.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {userConvenios.map((conv, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2 text-xs">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-800">Convenio N° {conv.numero || idx + 1}</span>
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded font-bold text-[10px]">{conv.estado}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Monto Total Financiado:</span>
                            <span className="font-bold text-slate-900">Bs. {formatBs(conv.monto_total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ══ PIE DEL MODAL (FOOTER LIMPIO) ══ */}
        <div className="bg-white border-t border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Cédula/RIF: <strong className="font-mono text-slate-800">{viewData.Identidad}</strong></span>
            {userInms.length > 0 && <span>· <strong>{userInms.length}</strong> inmueble(s) asociados</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
