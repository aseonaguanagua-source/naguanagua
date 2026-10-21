'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Users, Building2, Store, FileText, MapPin, Phone, Mail,
  Calendar, DollarSign, Download, Printer, Percent, Calculator,
  AlertCircle, CheckCircle, Clock, ShieldCheck, AlertTriangle,
  Receipt, Wallet, ExternalLink, ArrowRight, Copy, Check, Eye,
  ChevronDown, ChevronUp, Layers, PieChart, Trash2, CreditCard, Plus
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatBs, getIdentidadVariantsExact, parseLocalFloat, formatLocalNumberInput } from '@/lib/formatters';
import {
  calcularMensualidad, isResidencialInm, isTerrenoInm, isExoneradoTotalMultas,
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
  onAsignarMulta?: (row: any) => void;
  onDeleteFactura?: (factura: any) => void;
  onRefresh?: () => void;
}

function formatPeriodosPagados(det: any, p?: any): string {
  if (!det && !p) return '—';

  // 1. Si viene explícito en periodos_pagados
  if (det?.periodos_pagados && typeof det.periodos_pagados === 'string' && det.periodos_pagados.trim()) {
    return det.periodos_pagados.trim();
  }

  // 2. Si viene en recibo_caja (array de strings u objetos)
  if (Array.isArray(det?.recibo_caja) && det.recibo_caja.length > 0) {
    const rawList: string[] = det.recibo_caja
      .map((r: any) => (typeof r === 'object' ? r?.periodo : r))
      .filter((r: any): r is string => Boolean(r && typeof r === 'string' && r.trim()));
    const unique = [...new Set(rawList)];
    if (unique.length === 1) return unique[0];
    if (unique.length > 1) {
      return `${unique[0]} a ${unique[unique.length - 1]}`;
    }
  } else if (typeof det?.recibo_caja === 'string' && det.recibo_caja.trim()) {
    return det.recibo_caja.trim();
  }

  // 3. Si viene en det.periodos (ej: ['2026-01', '2026-02', '2026-03'])
  if (Array.isArray(det?.periodos) && det.periodos.length > 0) {
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const fmt = (k: string) => {
      const [y, m] = String(k).split('-');
      const idx = parseInt(m, 10) - 1;
      return idx >= 0 && idx < 12 ? `${MESES[idx]} ${y}` : k;
    };
    const sorted = [...det.periodos].sort();
    if (sorted.length === 1) return fmt(sorted[0]);
    const firstParts = String(sorted[0]).split('-');
    const lastParts = String(sorted[sorted.length - 1]).split('-');
    const m1 = parseInt(firstParts[1], 10) - 1;
    const m2 = parseInt(lastParts[1], 10) - 1;
    if (firstParts[0] === lastParts[0] && m1 >= 0 && m2 >= 0) {
      return `${MESES[m1]} a ${MESES[m2]} ${firstParts[0]}`;
    }
    return `${fmt(sorted[0])} a ${fmt(sorted[sorted.length - 1])}`;
  }

  // 4. Si viene en det.periodo
  if (det?.periodo && typeof det.periodo === 'string' && det.periodo.trim()) {
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const [y, m] = det.periodo.split('-');
    if (y && m) {
      const idx = parseInt(m, 10) - 1;
      if (idx >= 0 && idx < 12) return `${MESES[idx]} ${y}`;
    }
    return det.periodo;
  }

  // 5. Si es comprobante de retención
  if (det?.es_retencion || p?.tipo === 'RETENCION_75' || /^RET-/i.test(p?.referencia || '')) {
    return 'Retención IVA 75%';
  }

  // 6. Si son multas sueltas
  if (Array.isArray(det?.recibos) && det.recibos.some((r: string) => /^MULTA-/i.test(r))) {
    return 'Multa Administrativa';
  }

  return '—';
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
  onAsignarMulta,
  onDeleteFactura,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'inmuebles' | 'deuda' | 'pagos' | 'servicios' | 'notas'>('perfil');
  const [copiedId, setCopiedId] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eliminandoCode, setEliminandoCode] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Notas de crédito y saldo a favor
  const [notasDb, setNotasDb] = useState<any[]>([]);
  const [isAddNotaOpen, setIsAddNotaOpen] = useState(false);
  const [notaMonto, setNotaMonto] = useState('');
  const [notaMotivo, setNotaMotivo] = useState('');
  const [notaRef, setNotaRef] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [notaEditando, setNotaEditando] = useState<any | null>(null);
  const [notaEditMonto, setNotaEditMonto] = useState('');
  const [notaEditRef, setNotaEditRef] = useState('');
  const [notaEditMotivo, setNotaEditMotivo] = useState('');
  const [guardandoEditNota, setGuardandoEditNota] = useState(false);
  const [pagosConciliacionPendientes, setPagosConciliacionPendientes] = useState<any[]>([]);

  // Datos específicos del contribuyente cargados desde la base de datos
  const [inmueblesList, setInmueblesList] = useState<any[]>([]);
  const [facturasDb, setFacturasDb] = useState<any[]>([]);
  const [pagosDb, setPagosDb] = useState<any[]>([]);
  const [serviciosEspDb, setServiciosEspDb] = useState<any[]>([]);
  const [conveniosDb, setConveniosDb] = useState<any[]>([]);
  const [selectedInmSolvencia, setSelectedInmSolvencia] = useState('');
  const [expandedNAs, setExpandedNAs] = useState<Record<string, boolean>>({});
  const [selectedInmCode, setSelectedInmCode] = useState<string | null>(null);
  const [otrosInmuebles, setOtrosInmuebles] = useState<any[]>([]);
  const [claveWeb, setClaveWeb] = useState<string>('');
  const [editandoClave, setEditandoClave] = useState<boolean>(false);
  const [guardandoClave, setGuardandoClave] = useState<boolean>(false);

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

    // 1. Cargar el inmueble seleccionado y sus vínculos jerárquicos (padres / hijos N/A). NUNCA unificar por cédula.
    const fetchInmuebles = async () => {
      try {
        let query = supabase.from('inmuebles').select('*').neq('estado', 'Eliminado').neq('estado', 'Inactivo');
        if (codes.length > 0) {
          // Solo cargar la cuenta/inmueble seleccionada y sus actividades/padres N/A.
          query = query.or(`${codes.map(c => `inmueble.eq.${c}`).join(',')},${codes.map(c => `padre_id.eq.${c}`).join(',')}`);
        } else if (idVariants.length > 0) {
          query = query.or(idVariants.map(v => `identidad.eq.${v}`).join(','));
        }
        const { data } = await query.order('inmueble', { ascending: true });
        let allInms = [...(data || [])].filter((i: any) => {
          const st = String(i.estado || '').trim().toLowerCase();
          return st !== 'eliminado' && st !== 'inactivo' && st !== 'desactivado';
        });

        // 1.1 Si encontramos inmuebles, buscar si alguno tiene locales hijos asociados por padre_id
        const foundCodes = allInms.map((i: any) => i.inmueble).filter(Boolean);
        if (foundCodes.length > 0) {
          const { data: hijosData } = await supabase
            .from('inmuebles')
            .select('*')
            .neq('estado', 'Eliminado')
            .neq('estado', 'Inactivo')
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
            .neq('estado', 'Inactivo')
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

        // Consultar otros inmuebles independientes que tenga el titular (para aviso informativo, sin unificar deudas)
        if (idVariants.length > 0 && codes.length > 0) {
          try {
            const { data: otros } = await supabase
              .from('inmuebles')
              .select('inmueble, tipo, actividad_principal, direccion')
              .neq('estado', 'Eliminado')
              .neq('estado', 'Inactivo')
              .is('padre_id', null)
              .in('identidad', idVariants);
            const otrosFiltrados = (otros || []).filter((o: any) => !codes.includes(o.inmueble));
            if (isMounted) setOtrosInmuebles(otrosFiltrados);
          } catch (_) {}
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

          // Cargar clave web portal
          try {
            const { data: cClave } = await supabase
              .from('contribuyentes')
              .select('clave_portal')
              .eq('identidad', ident)
              .maybeSingle();
            if (cClave?.clave_portal) {
              setClaveWeb(cClave.clave_portal);
            } else if (allInms[0]?.clave_portal) {
              setClaveWeb(allInms[0].clave_portal);
            } else {
              setClaveWeb('');
            }
          } catch (_) {}
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

    const fetchNotas = async () => {
      try {
        const res = await fetch(`/api/admin/documentos/listar-notas-credito?identidad=${encodeURIComponent(ident)}&codigo=${encodeURIComponent(codes[0] || '')}`);
        const j = await res.json();
        if (isMounted && j.ok && Array.isArray(j.notas)) setNotasDb(j.notas);
      } catch (err) {
        console.error('Error cargando notas de credito:', err);
      }
    };

    const fetchPagosPendientes = async () => {
      try {
        const { data } = await supabase
          .from('pagos_reportados')
          .select('*')
          .in('estado', ['Por Verificar', 'Pendiente'])
          .order('created_at', { ascending: false })
          .limit(200);
        if (isMounted && data) {
          const idClean = ident.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const match = data.filter((p: any) => {
            const pId = String(p.identidad || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            if (idClean && (pId === idClean || pId.includes(idClean) || idClean.includes(pId))) return true;
            const detStr = (typeof p.detalles === 'string' ? p.detalles : JSON.stringify(p.detalles || '')).toLowerCase();
            return codes.some(c => c && detStr.includes(c.toLowerCase()));
          });
          setPagosConciliacionPendientes(match);
        }
      } catch (err) {
        console.error('Error cargando pagos pendientes:', err);
      }
    };

    const fetchConvenios = async () => {
      try {
        const idClean = ident.replace(/\D/g, '');
        let allConv: any[] = [];
        if (idVariants.length > 0) {
          const { data } = await supabase
            .from('convenios_pago')
            .select('*, convenios_cuotas(*)')
            .or(idVariants.map(v => `identidad.eq.${v}`).join(','));
          if (data && data.length > 0) allConv = data;
        }

        if (allConv.length === 0) {
          const orFilters = [
            ...(idClean.length >= 4 ? [`identidad.ilike.%${idClean}%`] : []),
            ...codes.map(c => `numero.ilike.%${c.replace(/\D/g, '')}%`)
          ];
          if (orFilters.length > 0) {
            const { data: convFallback } = await supabase
              .from('convenios_pago')
              .select('*, convenios_cuotas(*)')
              .or(orFilters.join(','));
            if (convFallback && convFallback.length > 0) allConv = convFallback;
          }
        }
        if (isMounted) setConveniosDb(allConv);
      } catch (err) {
        console.error('Error cargando convenios en modal:', err);
      }
    };

    Promise.all([fetchInmuebles(), fetchFacturas(), fetchPagos(), fetchServicios(), fetchConvenios(), fetchNotas(), fetchPagosPendientes()])
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, viewData, refreshKey]);

  const reloadNotas = async () => {
    const ident = viewData?.Identidad || '';
    const code = String(viewData?.CodCont || viewData?.cod_cont || '');
    try {
      const res = await fetch(`/api/admin/documentos/listar-notas-credito?identidad=${encodeURIComponent(ident)}&codigo=${encodeURIComponent(code)}`);
      const j = await res.json();
      if (j.ok && Array.isArray(j.notas)) setNotasDb(j.notas);
    } catch (e) {}
  };

  const handleCrearNota = async () => {
    const montoParsed = parseLocalFloat(notaMonto);
    if (!montoParsed || montoParsed <= 0) return alert('Ingrese un monto válido para la Nota de Crédito.');
    setGuardandoNota(true);
    try {
      const res = await fetch('/api/admin/documentos/crear-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identidad: viewData.Identidad,
          contribuyente: viewData.Contribuyente,
          monto: montoParsed,
          motivo: notaMotivo.trim() || 'Nota de Crédito generada administrativamente',
          referencia: notaRef.trim(),
          codigoCondominio: viewData.CodCont || viewData.cod_cont,
          usuario: 'Admin'
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Error al crear la Nota de Crédito');
      alert(`✅ Nota de crédito de Bs. ${montoParsed.toLocaleString('es-VE', { minimumFractionDigits: 2 })} generada y saldo a favor acreditado con éxito.`);
      setIsAddNotaOpen(false);
      setNotaMonto('');
      setNotaMotivo('');
      setNotaRef('');
      await reloadNotas();
      setRefreshKey(prev => prev + 1);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setGuardandoNota(false);
    }
  };

  const handleEliminarNota = async (docId: string, monto: any) => {
    const montoNum = parseLocalFloat(monto);
    if (!confirm(`¿Está seguro de quitar y eliminar esta Nota de Crédito por Bs. ${formatBs(montoNum)}?\n\nEsto revertirá automáticamente el saldo a favor del contribuyente.`)) {
      return;
    }
    try {
      const res = await fetch('/api/admin/documentos/eliminar-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docId,
          motivo: 'Eliminación manual desde Ficha de Contribuyente',
          usuario: 'Admin'
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Error al eliminar nota');
      alert('✅ Nota de crédito eliminada y saldo a favor revertido con éxito.');
      await reloadNotas();
      setRefreshKey(prev => prev + 1);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleAbrirEditarNota = (nota: any) => {
    const det = typeof nota.detalles === 'string' ? JSON.parse(nota.detalles || '{}') : (nota.detalles || {});
    const rawMonto = parseLocalFloat(det.monto_bs ?? det.monto ?? 0);
    setNotaEditando(nota);
    setNotaEditMonto(formatLocalNumberInput(rawMonto.toFixed(2).replace('.', ',')));
    setNotaEditRef(det.origen_referencia || '');
    setNotaEditMotivo(det.motivo || '');
  };

  const handleGuardarEditarNota = async () => {
    if (!notaEditando) return;
    const montoParsed = parseLocalFloat(notaEditMonto);
    if (!montoParsed || montoParsed <= 0) return alert('Ingrese un monto válido mayor a 0');
    setGuardandoEditNota(true);
    try {
      const res = await fetch('/api/admin/documentos/editar-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: notaEditando.id,
          nuevoMonto: montoParsed,
          nuevaReferencia: notaEditRef.trim(),
          nuevoMotivo: notaEditMotivo.trim(),
          usuario: 'Admin'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al editar nota');

      alert('✅ Nota de crédito actualizada con éxito.');
      setNotaEditando(null);
      await reloadNotas();
      setRefreshKey(prev => prev + 1);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setGuardandoEditNota(false);
    }
  };

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
        .update({ estado: 'Eliminado', mmv_mes: 0, deuda_mmv: 0, cant_inmuebles: 0 })
        .eq('inmueble', inmCode);

      if (errInm) throw new Error('Error al actualizar inmueble: ' + errInm.message);

      // 2. Recalcular cant_inmuebles, mmv_mes y deuda_mmv en el padre o en el inmueble restante
      const targetPadre = padreCode || (inmCode !== viewData.CodCont && viewData.CodCont ? viewData.CodCont : null);
      const identExacta = viewData.Identidad || '';

      const { data: allActive } = await supabase
        .from('inmuebles')
        .select('*')
        .neq('estado', 'Eliminado')
        .neq('estado', 'Inactivo')
        .neq('inmueble', inmCode)
        .or(`padre_id.eq.${targetPadre || inmCode},inmueble.eq.${targetPadre || inmCode},identidad.eq.${identExacta}`);

      const remainingInms = allActive || [];
      const remainingHijos = targetPadre ? remainingInms.filter(h => h.padre_id === targetPadre && h.inmueble !== targetPadre) : [];
      const padreObj = targetPadre ? remainingInms.find(h => h.inmueble === targetPadre) : null;

      if (targetPadre && padreObj) {
        if (remainingHijos.length > 0) {
          const newMMV = remainingHijos.reduce((acc: number, h: any) => acc + (parseFloat(h.mmv_mes) || 0), 0);
          const mesesPadre = parseInt(padreObj.meses_deuda || '1') || 1;
          const newDeuda = Math.round(newMMV * mesesPadre * 100) / 100;
          await supabase
            .from('inmuebles')
            .update({
              mmv_mes: newMMV > 0 ? newMMV : 0.91,
              cant_inmuebles: remainingHijos.length,
              deuda_mmv: newDeuda
            })
            .eq('inmueble', targetPadre);
        } else {
          // Ya no tiene hijos: vuelve a ser un inmueble individual de 1 sola unidad
          const mmvIndividual = parseFloat(padreObj.mmv_mes) > 0 ? parseFloat(padreObj.mmv_mes) : 0.91;
          const mesesPadre = parseInt(padreObj.meses_deuda || '1') || 1;
          const newDeuda = Math.round(mmvIndividual * mesesPadre * 100) / 100;
          await supabase
            .from('inmuebles')
            .update({
              cant_inmuebles: 1,
              mmv_mes: mmvIndividual,
              deuda_mmv: newDeuda
            })
            .eq('inmueble', targetPadre);
        }
      } else if (remainingInms.length === 1) {
        // Queda un único inmueble activo para este contribuyente
        const unico = remainingInms[0];
        const mmvU = parseFloat(unico.mmv_mes) > 0 ? parseFloat(unico.mmv_mes) : 0.91;
        const mesesU = parseInt(unico.meses_deuda || '1') || 1;
        const newDeuda = Math.round(mmvU * mesesU * 100) / 100;
        await supabase
          .from('inmuebles')
          .update({
            cant_inmuebles: 1,
            deuda_mmv: newDeuda
          })
          .eq('inmueble', unico.inmueble);
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
  // Inmuebles sin eliminar ni inactivos
  const userInms = useMemo(() => {
    return inmueblesList.filter(i => {
      const st = String(i.estado || '').trim().toLowerCase();
      return st !== 'eliminado' && st !== 'inactivo' && st !== 'desactivado';
    });
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
        
        // La tarifa del N/A es la sumatoria exacta de las actividades de sus hijos
        const mmvTotal = (isNA && hijos.length > 0 && sumHijosMMV > 0) 
          ? sumHijosMMV 
          : (parseFloat(inm.mmv_mes) || 0.91);

        const mesesPadre = parseInt(inm.meses_deuda || '0');
        const maxMesesHijos = hijos.length > 0 ? Math.max(...hijos.map(h => parseInt(h.meses_deuda || '0'))) : 0;
        const mesesDeuda = hijos.length > 0 ? maxMesesHijos : mesesPadre;

        return {
          inm,
          codigo: inm.inmueble,
          isNAParent: isNA && hijos.length > 0,
          isNA,
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
      const { inm, isNAParent, isNA, mmvTotal, mesesDeuda, hijos } = group;
      if (isTerrenoInm(inm)) return; // Terrenos no pagan ni generan multas

      // Regla de Condominios: ninguna información de los condominios sale por sistema,
      // solo la multa de los usuarios. Todo lo demás lo hace condominio por oficina.
      const isCondo = (inm.condominio_padre_id || inm.es_condominio) && !isNAParent;
      if (isCondo) {
        const m = (parseFloat(inm.multa_bs || '0') || 0) + (parseFloat(inm.deuda_congelada_bs || '0') || 0);
        totalMultas += m;
        return;
      }

      const meses = Math.max(0, mesesDeuda);
      if (meses > mesesMax) mesesMax = meses;
      if (meses <= 0) {
        const m = (parseFloat(inm.multa_bs || '0') || 0) + (parseFloat(inm.deuda_congelada_bs || '0') || 0);
        totalMultas += m;
        return;
      }

      const esRes = isResidencialInm(inm);
      const esExon = isExoneradoTotalMultas(inm.notas);
      const cantExon = getMesesExoneradosCount(inm.notas);
      const mesesConMulta = esExon ? 0 : Math.max(0, meses - 1 - cantExon);

      let baseMes = 0;
      let ivaMes = 0;
      let multaMes = 0;

      if (isNAParent && hijos && hijos.length > 0) {
        // EXACTO COMO EN CAJA: Suma de las cuotas redondeadas individuales de cada actividad comercial
        hijos.forEach((h: any) => {
          const hRes = isResidencialInm(h);
          const hBase = Math.round(calcularMensualidad(h, tasaEfectiva) * 100) / 100;
          const hIva = hRes ? 0 : Math.round((hBase * 0.16) * 100) / 100;
          const hMora = hRes ? 0.10 : 0.12;
          const hMulta = esExon ? 0 : Math.round((hBase * hMora) * 100) / 100;
          baseMes += hBase;
          ivaMes += hIva;
          multaMes += hMulta;
        });
      } else {
        const rawBase = isNAParent 
          ? calcularMensualidad({ ...inm, mmv_mes: mmvTotal, cant_inmuebles: 1, isNAParent: true }, tasaEfectiva) 
          : calcularMensualidad({ ...inm, cant_inmuebles: inm.es_condominio ? (isNA ? 1 : inm.cant_inmuebles) : 1 }, tasaEfectiva);
        baseMes = Math.round(rawBase * 100) / 100;
        ivaMes = esRes ? 0 : Math.round((baseMes * 0.16) * 100) / 100;
        const moraTasa = esRes ? 0.10 : 0.12;
        multaMes = esExon ? 0 : Math.round((baseMes * moraTasa) * 100) / 100;
      }

      baseMes = Math.round(baseMes * 100) / 100;
      ivaMes = Math.round(ivaMes * 100) / 100;
      multaMes = Math.round(multaMes * 100) / 100;

      const baseInm = Math.round((baseMes * meses) * 100) / 100;
      const ivaInm = Math.round((ivaMes * meses) * 100) / 100;
      const multaInm = Math.round((multaMes * mesesConMulta) * 100) / 100;

      totalBase += baseInm;
      totalIva += ivaInm;
      totalMultas += multaInm;
    });

    totalBase = Math.round(totalBase * 100) / 100;
    totalIva = Math.round(totalIva * 100) / 100;
    totalMultas = Math.round(totalMultas * 100) / 100;

    const subtotal = Math.round((totalBase + totalIva + totalMultas) * 100) / 100;
    const retencion75 = esAgente ? Math.round(totalIva * 0.75 * 100) / 100 : 0;
    const totalPagar = Math.max(0, Math.round((subtotal - retencion75) * 100) / 100);

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

        {/* ══ BANNER DE CONCILIACIÓN PENDIENTE EN MODAL ══ */}
        {pagosConciliacionPendientes.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-400 p-4 flex items-start gap-3">
            <div className="p-1.5 bg-amber-200/80 rounded-lg text-amber-900 text-lg font-bold shrink-0">⚠️</div>
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs font-black uppercase text-amber-950 tracking-wide">
                  Atención: Pagos / Conciliación Pendiente de Verificación
                </h4>
                <span className="text-[11px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                  {pagosConciliacionPendientes.length} {pagosConciliacionPendientes.length === 1 ? 'operación pendiente' : 'operaciones pendientes'}
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-1">
                Este contribuyente tiene un monto acumulado por conciliar de{' '}
                <strong className="text-sm font-black text-amber-950">
                  Bs. {pagosConciliacionPendientes.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
                {' '}en el módulo de Conciliación bancaria.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {pagosConciliacionPendientes.map((p, idx) => (
                  <span key={idx} className="text-[11px] bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded font-mono font-semibold shadow-2xs">
                    Ref: {p.referencia || 'S/R'} — Bs. {parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({p.tipo || 'Transferencia'})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ BARRA DE PESTAÑAS (TABS NAVEGABLES) ══ */}
        <div className="bg-slate-100/80 border-b border-slate-200 px-4 sm:px-6 flex gap-1 overflow-x-auto shrink-0 select-none">
          {[
            { id: 'perfil', label: 'Perfil y Contacto', icon: Users },
            { id: 'inmuebles', label: `Inmuebles (${unifiedInmuebles.length}${userInms.length > unifiedInmuebles.length ? ` · ${userInms.length} act.` : ''})`, icon: Building2 },
            { id: 'deuda', label: `Estado de Cuenta (${facturasDb.length} recibos)`, icon: DollarSign },
            { id: 'pagos', label: `Historial de Pagos (${pagosDb.length})`, icon: Receipt },
            { id: 'servicios', label: `Servicios y Convenios (${serviciosEspDb.length + (conveniosDb.length > 0 ? conveniosDb.length : (conveniosGlobal || []).filter(c => { const cIdClean = (c.identidad || '').replace(/\D/g, ''); const vIdClean = (viewData?.Identidad || '').replace(/\D/g, ''); return vIdClean.length >= 4 && cIdClean === vIdClean; }).length)})`, icon: FileText },
            { id: 'notas', label: `Notas de Crédito (${notasDb.length})`, icon: CreditCard },
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
              {otrosInmuebles.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 flex items-start gap-3 shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 flex-1">
                    <span className="font-bold text-slate-800 block text-xs">
                      Este titular posee {otrosInmuebles.length} otro(s) inmueble(s) independiente(s) registrado(s):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {otrosInmuebles.map((o: any) => (
                        <span key={o.inmueble} className="bg-white border border-amber-300 text-amber-950 px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] shadow-2xs">
                          {o.inmueble} · {cleanClasificacionActividad(o.actividad_principal) || o.actividad_principal || o.tipo || 'Inmueble'}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] text-amber-800 block">
                      📌 Cada inmueble se gestiona por separado con su propio estado de cuenta, facturación y solvencia individual.
                    </span>
                  </div>
                </div>
              )}

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

                    {/* Contraseña del Portal Web (Soy Contribuyente) */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Contraseña del Portal Web</span>
                        {!editandoClave && (
                          <button
                            type="button"
                            onClick={() => setEditandoClave(true)}
                            className="text-[11px] font-bold text-violet-700 hover:text-violet-900 underline cursor-pointer"
                          >
                            {claveWeb ? 'Cambiar Clave' : 'Asignar Clave'}
                          </button>
                        )}
                      </div>
                      {editandoClave ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={claveWeb}
                            onChange={e => setClaveWeb(e.target.value)}
                            placeholder="Nueva contraseña"
                            className="text-xs border border-violet-300 rounded-lg px-2.5 py-1.5 font-mono outline-none focus:ring-2 focus:ring-violet-400 w-full bg-white text-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const digits = (viewData.Identidad || '').replace(/\D/g, '');
                              if (digits) setClaveWeb(digits);
                            }}
                            className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer"
                            title="Usar número de cédula o RIF"
                          >
                            Usar RIF
                          </button>
                          <button
                            type="button"
                            disabled={guardandoClave}
                            onClick={async () => {
                              setGuardandoClave(true);
                              try {
                                const nueva = claveWeb.trim() || null;
                                const identExacta = viewData.Identidad;
                                const idClean = identExacta.replace(/-/g, '').toUpperCase();
                                await supabase.from('contribuyentes').update({ clave_portal: nueva }).eq('identidad', identExacta);
                                await supabase.from('inmuebles').update({ clave_portal: nueva }).or(`identidad.eq.${identExacta},identidad.eq.${idClean}`);
                                alert('Contraseña del portal guardada exitosamente.');
                                setEditandoClave(false);
                                if (onRefresh) onRefresh();
                              } catch (err: any) {
                                alert('Error al guardar contraseña: ' + err.message);
                              } finally {
                                setGuardandoClave(false);
                              }
                            }}
                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold shrink-0 disabled:opacity-50 cursor-pointer"
                          >
                            {guardandoClave ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditandoClave(false)}
                            className="px-2 py-1.5 text-slate-500 hover:text-slate-800 text-xs shrink-0 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 text-sm flex items-center gap-1.5">
                            🔑 {claveWeb ? <span className="bg-violet-50 text-violet-900 border border-violet-200 px-2 py-0.5 rounded text-xs">{claveWeb}</span> : <span className="text-amber-600 font-sans font-normal text-xs">Sin clave asignada (Usa RIF)</span>}
                          </span>
                        </div>
                      )}
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
                    const esRes = isResidencialInm(inm);
                    const isCondoInm = (inm.condominio_padre_id || inm.es_condominio) && !isNAParent;
                    const multaInmTotal = (parseFloat(inm.multa_bs || '0') || 0) + (parseFloat(inm.deuda_congelada_bs || '0') || 0);
                    let baseMes = 0;
                    let ivaMes = 0;
                    if (isNAParent && hijos && hijos.length > 0) {
                      hijos.forEach((h: any) => {
                        const hRes = isResidencialInm(h);
                        const hBase = Math.round(calcularMensualidad(h, tasaEfectiva) * 100) / 100;
                        const hIva = hRes ? 0 : Math.round((hBase * 0.16) * 100) / 100;
                        baseMes += hBase;
                        ivaMes += hIva;
                      });
                    } else {
                      const rawBase = isNAParent 
                        ? calcularMensualidad({ ...inm, mmv_mes: mmvTotal, cant_inmuebles: 1, isNAParent: true }, tasaEfectiva) 
                        : calcularMensualidad({ ...inm, cant_inmuebles: inm.es_condominio ? (inm.actividad_principal?.toUpperCase() === 'N/A' ? 1 : inm.cant_inmuebles) : 1 }, tasaEfectiva);
                      baseMes = Math.round(rawBase * 100) / 100;
                      ivaMes = esRes ? 0 : Math.round((baseMes * 0.16) * 100) / 100;
                    }
                    baseMes = Math.round(baseMes * 100) / 100;
                    ivaMes = Math.round(ivaMes * 100) / 100;
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
                                  Bs. {formatBs(baseMes + ivaMes)}
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
                                        const rawHijoBase = calcularMensualidad(hijo, tasaEfectiva);
                                        const hijoBase = Math.round(rawHijoBase * 100) / 100;
                                        const hijoIva = isResidencialInm(hijo) ? 0 : Math.round((hijoBase * 0.16) * 100) / 100;
                                        const hijoBs = hijoBase + hijoIva;
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
                                          Bs. {formatBs(baseMes + ivaMes)}
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

                          {isCondoInm ? (
                            multaInmTotal > 0 ? (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                Multa Bs. {formatBs(multaInmTotal)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60" title="Aseo administrado directamente por la oficina del condominio">
                                Condominio (Oficina)
                              </span>
                            )
                          ) : (
                            <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                              meses > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {meses > 0 ? `${meses} meses de deuda` : 'Al día'}
                            </span>
                          )}
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
                              Bs. {formatBs(baseMes + ivaMes)}
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

                  {onAsignarMulta && (
                    <button
                      onClick={() => onAsignarMulta(viewData)}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      title="Asignar multa a un período específico"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Asignar Multa</span>
                    </button>
                  )}

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
                          <th className="px-4 py-2.5">Período(s) Pagado(s)</th>
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
                          const periodoTexto = formatPeriodosPagados(det, p);

                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-2.5 text-slate-600 font-medium whitespace-nowrap">
                                {p.created_at ? new Date(p.created_at).toLocaleDateString('es-VE') : '---'}
                              </td>
                              <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                                {p.referencia || p.id}
                              </td>
                              <td className="px-4 py-2.5 text-slate-700">
                                <span className="font-semibold">{p.metodo || p.tipo || 'Pago'}</span>
                                {p.banco && <span className="text-slate-400 block text-[10px]">{p.banco}</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                                  periodoTexto.includes('Retención')
                                    ? 'bg-purple-50 text-purple-800 border-purple-200/80'
                                    : periodoTexto.includes('Multa')
                                    ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                                    : 'bg-sky-50 text-sky-800 border-sky-200/80'
                                }`}>
                                  <Calendar className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                  <span>{periodoTexto}</span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-black text-emerald-700 whitespace-nowrap">
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
                  const vIdClean = (viewData.Identidad || '').replace(/\D/g, '');
                  const vInmCodes = new Set([
                    (viewData.CodCont || viewData.inmueble || '').toUpperCase(),
                    ...((viewData.inmuebles || []).map((i: any) => (i.inmueble || '').toUpperCase()))
                  ]);
                  const convSource = conveniosDb.length > 0 ? conveniosDb : (conveniosGlobal || []);
                  const userConvenios = convSource.filter((c: any) => {
                    const cIdClean = (c.identidad || '').replace(/\D/g, '');
                    const idMatch = vIdClean.length >= 4 && (cIdClean === vIdClean || cIdClean.includes(vIdClean) || vIdClean.includes(cIdClean));
                    const inmMatch = c.inmueble && vInmCodes.has(String(c.inmueble).toUpperCase());
                    const numMatch = Array.from(vInmCodes).some((code: string) => code && (c.numero || '').toUpperCase().includes(code.replace(/\D/g, '')));
                    return idMatch || inmMatch || numMatch;
                  });
                  if (userConvenios.length === 0) {
                    return (
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
                        No tiene convenios de pago activos formalizados.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {userConvenios.map((conv: any, idx: number) => {
                        let cuotasList: any[] = [];
                        if (Array.isArray(conv.convenios_cuotas) && conv.convenios_cuotas.length > 0) {
                          cuotasList = conv.convenios_cuotas;
                        } else if (conv.detalle_cuotas) {
                          try {
                            cuotasList = typeof conv.detalle_cuotas === 'string' ? JSON.parse(conv.detalle_cuotas) : conv.detalle_cuotas;
                          } catch (_) {}
                        }

                        return (
                          <div key={conv.id || idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-800 text-sm">{conv.numero || `Convenio N° ${idx + 1}`}</span>
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full font-bold text-[10px]">{conv.estado || 'Activo'}</span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-medium">
                                Creado: {conv.created_at ? String(conv.created_at).slice(0, 10) : 'N/A'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <div>
                                <span className="text-[11px] text-slate-500 block">Monto Total Financiado</span>
                                <span className="font-black text-slate-900 text-sm">Bs. {formatBs(conv.monto_total)}</span>
                              </div>
                              <div>
                                <span className="text-[11px] text-slate-500 block">Cuotas Pactadas</span>
                                <span className="font-bold text-slate-800">{conv.cuotas || cuotasList.length} cuotas</span>
                              </div>
                              <div>
                                <span className="text-[11px] text-slate-500 block">Cuota Inicial</span>
                                <span className="font-bold text-slate-800">Bs. {formatBs(conv.inicial || 0)}</span>
                              </div>
                            </div>

                            {cuotasList && cuotasList.length > 0 && (
                              <div className="mt-2">
                                <h4 className="font-bold text-slate-700 text-[11px] mb-1.5 uppercase tracking-wider">Cronograma de Cuotas</h4>
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                      <tr>
                                        <th className="px-3 py-2">N°</th>
                                        <th className="px-3 py-2">Fecha Vencimiento</th>
                                        <th className="px-3 py-2 text-right">Monto (Bs)</th>
                                        <th className="px-3 py-2 text-center">Estado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {cuotasList.map((cuota: any, cIdx: number) => {
                                        const cEstado = cuota.estado || (cuota.pagado ? 'Pagada' : 'Pendiente');
                                        const isPagada = cEstado.toLowerCase().includes('pag');
                                        return (
                                          <tr key={cuota.id || cIdx} className="hover:bg-slate-50">
                                            <td className="px-3 py-2 font-bold text-slate-700">Cuota {cIdx + 1}</td>
                                            <td className="px-3 py-2 text-slate-600">{cuota.fecha ? String(cuota.fecha).slice(0, 10) : 'N/A'}</td>
                                            <td className="px-3 py-2 text-right font-black text-slate-900">Bs. {formatBs(cuota.monto)}</td>
                                            <td className="px-3 py-2 text-center">
                                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                isPagada ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                              }`}>
                                                {cEstado}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB 6: NOTAS DE CRÉDITO Y SALDO A FAVOR
             ══════════════════════════════════════════════════════ */}
          {activeTab === 'notas' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">Control de Notas de Crédito y Saldos a Favor</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Saldo a Favor actual: <strong className="text-emerald-700 font-black">Bs. {formatBs(viewData.SaldoFavor || 0)}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddNotaOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Agregar Nota de Crédito</span>
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-black tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Referencia / Comprobante</th>
                        <th className="px-4 py-3">Motivo / Concepto</th>
                        <th className="px-4 py-3 text-right">Monto (Bs)</th>
                        <th className="px-4 py-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {notasDb.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            No hay notas de crédito registradas para este contribuyente.
                          </td>
                        </tr>
                      ) : (
                        notasDb.map((n: any, idx: number) => {
                          const det = typeof n.detalles === 'string' ? JSON.parse(n.detalles || '{}') : (n.detalles || {});
                          const monto = parseFloat(det.monto || det.monto_bs || 0) || 0;
                          const fecha = det.fecha_emision || n.created_at || '';
                          const ref = det.origen_referencia || n.referencia || 'N/A';
                          const motivo = det.motivo || 'Nota de Crédito';

                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-medium text-slate-600">
                                {fecha ? String(fecha).slice(0, 10) : '-'}
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-slate-800">
                                {ref}
                              </td>
                              <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={motivo}>
                                {motivo}
                              </td>
                              <td className="px-4 py-3 text-right font-black text-emerald-700 tabular-nums">
                                Bs. {formatBs(monto)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleAbrirEditarNota(n)}
                                    className="px-2.5 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                                    title="Editar monto y concepto de esta Nota de Crédito"
                                  >
                                    <span>✏️</span>
                                    <span>Editar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEliminarNota(n.id, monto)}
                                    className="px-2.5 py-1 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                                    title="Eliminar esta Nota de Crédito y revertir el saldo a favor"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Quitar</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal para Agregar Nota de Crédito Manual */}
        {isAddNotaOpen && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  Agregar Nota de Crédito (Saldo a Favor)
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddNotaOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Monto de la Nota de Crédito (Bs.) *</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej: 500,00"
                    value={notaMonto}
                    onChange={e => setNotaMonto(formatLocalNumberInput(e.target.value))}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <span className="font-bold text-slate-700 block mb-1">Referencia u Origen (opcional)</span>
                  <input
                    type="text"
                    placeholder="Ej: NC-001 o Ref bancaria"
                    value={notaRef}
                    onChange={e => setNotaRef(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <span className="font-bold text-slate-700 block mb-1">Motivo o Justificación</span>
                  <textarea
                    rows={3}
                    placeholder="Ej: Ajuste por pago anterior o nota de crédito acordada"
                    value={notaMotivo}
                    onChange={e => setNotaMotivo(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddNotaOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCrearNota}
                  disabled={guardandoNota}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {guardandoNota ? 'Guardando...' : 'Crear y Acreditar Saldo'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para Editar Nota de Crédito Manual */}
        {notaEditando && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  Editar Nota de Crédito
                </h3>
                <button
                  onClick={() => setNotaEditando(null)}
                  disabled={guardandoEditNota}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                Al modificar el monto, el <strong>saldo a favor</strong> del contribuyente se ajustará automáticamente por la diferencia.
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Monto de la Nota (Bs) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej. 1.500,50"
                    value={notaEditMonto}
                    onChange={e => setNotaEditMonto(formatLocalNumberInput(e.target.value))}
                    onBlur={e => {
                      const p = parseLocalFloat(e.target.value);
                      if (p > 0) setNotaEditMonto(formatLocalNumberInput(p.toFixed(2).replace('.', ',')));
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Referencia / Comprobante
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. REF-12345678"
                    value={notaEditRef}
                    onChange={e => setNotaEditRef(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Motivo / Concepto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Ajuste de saldo a favor"
                    value={notaEditMotivo}
                    onChange={e => setNotaEditMotivo(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNotaEditando(null)}
                  disabled={guardandoEditNota}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGuardarEditarNota}
                  disabled={guardandoEditNota}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {guardandoEditNota ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        )}

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
