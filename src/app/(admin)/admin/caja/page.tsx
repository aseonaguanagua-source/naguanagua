'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { exportToExcelWithLogos } from '@/lib/excelExport';
import { TreePine, Search, CreditCard, Landmark, CheckCircle, XCircle, FileText, Handshake, Calendar as CalendarIcon, Wrench, ShieldCheck, ClipboardCheck, FlaskConical, Printer, X, Building2, Store, Receipt, CheckSquare, Square, Filter, ChevronRight, DollarSign, Sparkles, AlertCircle, Coins, Zap, Trash2, Eye } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { actualizarPago } from '@/lib/actualizarPago';
import { formatBs, formatPhoneNumber, isFictitiousEmail, formatMonthYear, getIdentidadVariants, parseLocalFloat, formatLocalNumberInput } from '@/lib/formatCurrency';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import { ReciboImprimible } from '@/components/ReciboImprimible';
import { ModalComprobante } from '@/components/caja/ModalComprobante';
import { logAudit } from '@/lib/audit';
import { calcularMensualidad, getFO, getFAR, isResidencialInm, isTerrenoInm, isCondominioPagoIndividual, isMesExoneradoMulta, cleanClasificacionActividad } from '@/lib/calculos';
import { getUserInmuebles, getCajeroId, isSameLocal, clusterInmueblesByLocal, getShortAddress } from '@/lib/cajaHelpers';
import { acreditarSaldoFavor, descontarSaldoFavor } from '@/lib/saldoFavor';
import { useCajaCalculations } from './hooks/useCajaCalculations';
import { useCajaSelection } from './hooks/useCajaSelection';
import { LISTA_BANCOS } from '@/lib/bancos';
import { obtenerTasaEuroFecha, fechaDMY, valorUCD } from '@/lib/tasaHistorica';
import { generarCorteCajaPDF } from '../reportes/generators/PdfReports';

// ─ Constante oficial de bancos de Venezuela actualizada ─
const BANCOS_VENEZUELA = LISTA_BANCOS;

const updateServiciosEspecialesEstado = async (referencias: string[], estado: string) => {
  if (!referencias || referencias.length === 0) return;
  try {
    await fetch('/api/admin/servicios-especiales', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referencias, estado })
    });
  } catch (err) {
    console.error('Error actualizando servicios_especiales:', err);
  }
};

/**
 * Foto de la deuda de los inmuebles ANTES del cobro (se guarda en detalles.deuda_previa del pago).
 * Permite revertir un pago sin depender del respaldo de SIGYR. Nunca bloquea el cobro.
 */
const snapshotDeudaPrevia = async (identidad: string, hijosIds: string[] = []) => {
  try {
    const cols = 'id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs';
    const { data: propios } = await supabase.from('inmuebles').select(cols).eq('identidad', identidad);
    let hijos: any[] = [];
    const ids = (hijosIds || []).filter(Boolean);
    if (ids.length > 0) {
      const { data } = await supabase.from('inmuebles').select(cols).in('id', ids);
      hijos = data || [];
    }
    const vistos = new Set<string>();
    return [...(propios || []), ...hijos].filter((i: any) => !vistos.has(i.id) && vistos.add(i.id));
  } catch (e) {
    console.warn('No se pudo tomar la deuda previa:', e);
    return [];
  }
};



export default function CajaPage() {
  const { inmuebles, convenios, contribuyentes, documentos, tcmmv, refreshData, refreshUserData } = useAppContext();
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'Pagos' | 'NotasCredito'>('Pagos');

  // Search State
  const [docType, setDocType] = useState('V');
  const [docNumber, setDocNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<any>(null);
  

  // Condominio State
  const [isCondominio, setIsCondominio] = useState(false);
  const [condominioHijos, setCondominioHijos] = useState<any[]>([]);
  // Separación de condominios: códigos que solo se cobran en la Caja de Condominios
  const [codigosSeparados, setCodigosSeparados] = useState<Set<string>>(new Set());
  React.useEffect(() => {
    fetch('/api/admin/condominios/separados', { cache: 'no-store' }).then(r => r.json())
      .then(j => setCodigosSeparados(new Set(j?.separados ? (j.codigos || []) : []))).catch(() => {});
  }, []);
  const [condominioModo, setCondominioModo] = useState<'Total' | 'Local' | 'Abono'>('Total');
  const [condominioSearch, setCondominioSearch] = useState("");
  const [montoAbonoCondo, setMontoAbonoCondo] = useState("");
  const [selectedHijos, setSelectedHijos] = useState<string[]>([]);
  const [hijosMesesAPagar, setHijosMesesAPagar] = useState<Record<string, number>>({});
  
  // Impuestos y Retenciones
  const [ivaPercent, setIvaPercent] = useState<number>(0); // 0 o 0.16
  const [retencionIVA, setRetencionIVA] = useState<number>(0); // 0, 75 o 100
  const [comprobanteRetencion, setComprobanteRetencion] = useState<string>('');
  const [comprobanteRetencionFile, setComprobanteRetencionFile] = useState<File | null>(null);
  const [modalPagoComp, setModalPagoComp] = useState<any | null>(null);
  const [esAgenteRetencion, setEsAgenteRetencion] = useState<boolean>(false);

  // Debt State
  const [recibos, setRecibos] = useState<any[]>([]);
  const [cuotas, setCuotas] = useState<any[]>([]);
  const [pagosPendientes, setPagosPendientes] = useState<any[]>([]); // Pagos multiples en verificacion
  const [serviciosEsp, setServiciosEsp] = useState<any[]>([]);
  const [talaPoda, setTalaPoda] = useState<any[]>([]);
  const [selectedTalaPoda, setSelectedTalaPoda] = useState<string[]>([]);

  // Inmuebles frescos — se consultan de Supabase en cada búsqueda para evitar datos stale del contexto React
  const [freshInmuebles, setFreshInmuebles] = useState<any[]>([]);
  
  // Selection State
  const [selectedRecibos, setSelectedRecibos] = useState<string[]>([]);
  const [selectedCuotas, setSelectedCuotas] = useState<{convId: string, cuotaId: number}[]>([]);
  const [selectedServicios, setSelectedServicios] = useState<string[]>([]);
  const [totalBs, setTotalBs] = useState(0);
  const [sumBase, setSumBase] = useState(0);
  const [sumIVA, setSumIVA] = useState(0);
  const [sumIVARetencionable, setSumIVARetencionable] = useState(0);
  const [sumMulta, setSumMulta] = useState(0);
  // Computed — estrictamente derivado del IVA de los comercios agentes de retención
  const montoRetencionIVA = sumIVARetencionable * (retencionIVA / 100);
  const montoRetencionIVARounded = Math.round((sumIVARetencionable * (retencionIVA / 100)) * 100) / 100;

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'Debito' | 'Credito' | 'TMD' | 'TVD' | 'Transferencia' | 'Deposito' | 'Saldo a Favor'>('Debito');
  const [referenciaDebito, setReferenciaDebito] = useState('');
  const [montoDebito, setMontoDebito] = useState<string>(''); // Monto manual punto de venta
  const [banco, setBanco] = useState('Banco de Venezuela');
  const [bancoDestino, setBancoDestino] = useState('BANCAMIGA - 0172 - 0717');
  const [referencia, setReferencia] = useState('');
  const [montoTransferido, setMontoTransferido] = useState<string>('');
  const [fechaTransaccion, setFechaTransaccion] = useState<string>(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()));
  const [fechaCorteCaja, setFechaCorteCaja] = useState<string>(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()));
  const [dupRefWarning, setDupRefWarning] = useState<string>('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [customBcvRate, setCustomBcvRate] = useState<string>('');
  const [justificacionBcv, setJustificacionBcv] = useState<string>('');
  const [selectedUcdDate, setSelectedUcdDate] = useState<string>(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()));
  const [useSaldoFavor, setUseSaldoFavor] = useState<boolean>(true);
  
  const [isNotaModalOpen, setIsNotaModalOpen] = useState(false);
  const [contribNotas, setContribNotas] = useState<any[]>([]);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [notaTab, setNotaTab] = useState<'lista' | 'crear'>('lista');
  const [isPagoMultiple, setIsPagoMultiple] = useState(false);

  // Modal de Confirmación de Pago
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<any>(null);

  // Modal de Actualización de Contacto (Correo / Teléfono)
  const [showUpdateContactModal, setShowUpdateContactModal] = useState(false);
  const [contactModalEmail, setContactModalEmail] = useState('');
  const [contactModalPhone, setContactModalPhone] = useState('');
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactSaveError, setContactSaveError] = useState('');

  // Historial de pagos de la sesión actual
  const [sessionPagos, setSessionPagos] = useState<any[]>([]);
  const [filterInm, setFilterInm] = useState<string>('');

  // Recibo imprimible post-pago
  const [reciboData, setReciboData] = React.useState<any>(null);
  // Pagos / Abonos pendientes por conciliar para el contribuyente consultado
  const [pagosPorConciliar, setPagosPorConciliar] = React.useState<any[]>([]);
  const [montoPorConciliar, setMontoPorConciliar] = React.useState<number>(0);
  const [notificacionConciliacion, setNotificacionConciliacion] = React.useState<{ monto: number; referencia?: string; visible: boolean } | null>(null);
  // Pago al que pertenece el próximo recibo generado: el recibo se guarda en ese pago
  // (detalles.recibo_caja) para poder descargarlo después desde Facturación Electrónica.
  const ultimoPagoIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const pagoIdRecibo = ultimoPagoIdRef.current;
    if (!reciboData || !pagoIdRecibo) return;
    ultimoPagoIdRef.current = null;
    (async () => {
      try {
        const { data: p } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoIdRecibo).maybeSingle();
        let det: any = p?.detalles || {};
        if (typeof det === 'string') { try { det = JSON.parse(det); } catch { det = {}; } }
        det.recibo_caja = Array.isArray(reciboData) ? reciboData : [reciboData];
        det.recibo_caja_at = new Date().toISOString();
        await actualizarPago(pagoIdRecibo, { detalles: det });
      } catch (e) { console.warn('No se pudo guardar el recibo en el pago:', e); }
    })();
  }, [reciboData]);
  // Filtro de meses para el recibo
  const [reciboFiltro, setReciboFiltro] = React.useState<'todos' | 'rango'>('todos');
  const [reciboDesde, setReciboDesde] = React.useState<string>('');   // 'YYYY-MM' e.g. '2026-07'
  const [reciboHasta, setReciboHasta] = React.useState<string>('');

  // Notas de Crédito — carga directa desde Supabase con cleanup anti-memory-leak (fix A-3)
  const [notasCredito, setNotasCredito] = useState<any[]>([]);
  const [isLoadingNotas, setIsLoadingNotas] = useState(false);
  const fetchNotasCreditoAbortRef = useRef<AbortController | null>(null);

  const fetchNotasCredito = useCallback(async () => {
    // Cancelar fetch anterior si estaba en curso (evita setState en componente desmontado)
    fetchNotasCreditoAbortRef.current?.abort();
    const controller = new AbortController();
    fetchNotasCreditoAbortRef.current = controller;

    setIsLoadingNotas(true);
    try {
      const { data, error } = await supabase
        .from('documentos')
        .select('id,tipo,estado,identidad,contribuyente,detalles,created_at') // solo cols necesarias
        .eq('tipo', 'Nota de Credito')
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);
      if (!error && data && !controller.signal.aborted) setNotasCredito(data);
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error(e);
    }
    if (!controller.signal.aborted) setIsLoadingNotas(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'NotasCredito') fetchNotasCredito();
    // Cleanup: cancelar si se desmonta el tab
  }, [activeTab, fetchNotasCredito]);

  // Manejo de Notas de Crédito
  const [filtroNotas, setFiltroNotas] = useState('');
  const [deletingNotaId, setDeletingNotaId] = useState<string | null>(null);

  const handleEliminarNotaCredito = async (n: any, formattedMonto: string) => {
    const confirmMsg = `¿Está seguro de eliminar esta Nota de Crédito por Bs. ${formattedMonto} perteneciente a ${n.contribuyente} (${n.identidad})?\n\nEsta acción eliminará el registro y revertirá cualquier saldo a favor pendiente asociado a esta nota.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingNotaId(n.id);
    try {
      const res = await fetch('/api/admin/documentos/eliminar-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: n.id,
          usuario: getCajeroId() || 'Admin'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      setSuccessMsg(data.mensaje || 'Nota de crédito eliminada correctamente');
      setTimeout(() => setSuccessMsg(''), 5000);
      fetchNotasCredito();
      if (foundUser && (foundUser.Identidad === n.identidad || foundUser.Contribuyente === n.contribuyente)) {
        handleSearch();
      }
    } catch (err: any) {
      alert('Error eliminando nota de crédito: ' + (err.message || err));
    } finally {
      setDeletingNotaId(null);
    }
  };

  const [notaEditando, setNotaEditando] = useState<any | null>(null);
  const [notaEditMonto, setNotaEditMonto] = useState('');
  const [notaEditRef, setNotaEditRef] = useState('');
  const [notaEditMotivo, setNotaEditMotivo] = useState('');
  const [guardandoEditNota, setGuardandoEditNota] = useState(false);

  const handleAbrirEditarNota = (n: any) => {
    let details: any = {};
    try {
      details = typeof n.detalles === 'string' ? JSON.parse(n.detalles) : (n.detalles || {});
    } catch(e){}
    const rawMonto = parseLocalFloat(details.monto_bs ?? details.monto ?? 0);
    setNotaEditando(n);
    setNotaEditMonto(formatLocalNumberInput(rawMonto.toFixed(2).replace('.', ',')));
    setNotaEditRef(details.origen_referencia || '');
    setNotaEditMotivo(details.motivo || '');
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
          usuario: getCajeroId() || 'Admin'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al editar nota de crédito');

      setSuccessMsg(data.mensaje || 'Nota de crédito actualizada correctamente');
      setTimeout(() => setSuccessMsg(''), 5000);
      setNotaEditando(null);
      fetchNotasCredito();
      if (foundUser?.Identidad) {
        await fetchContribNotas(foundUser.Identidad);
        await refreshUserData(foundUser.Identidad);
      }
    } catch (err: any) {
      alert('Error editando nota de crédito: ' + (err.message || err));
    } finally {
      setGuardandoEditNota(false);
    }
  };

  // BCV Rate Override States
  const [showRateModal, setShowRateModal] = useState(false);
  const [tempBcvRate, setTempBcvRate] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [rateNote, setRateNote] = useState<string>('');
  const [rateAuthError, setRateAuthError] = useState<string>('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [notaManualMonto, setNotaManualMonto] = useState('');
  const [notaManualRef, setNotaManualRef] = useState('');
  

  // ─── useCajaCalculations hook (Fase 2) ────────────────────────────────────────
  const { getReciboMonto } = useCajaCalculations({
    foundUser,
    customBcvRate,
    tcmmv,
    freshInmuebles,
    condominioHijos,
    inmuebles,
    pagosPendientes,
  });

  // Tasa efectiva activa (personalizada o BCV global)
  const currentBcvRate = customBcvRate && !isNaN(parseFloat(customBcvRate)) ? parseFloat(customBcvRate) : tcmmv;

  // ─ Helpers de Condominio ─
  const getLocalLabel = useCallback((inm: any): string => {
    if (inm?.numero_unidad) return `Local ${inm.numero_unidad}`;
    if (inm?.unidad) return `Local ${inm.unidad}`;
    if (inm?.local) return `Local ${inm.local}`;
    const dir = inm?.direccion || '';
    const startMatch = dir.match(/^\s*(?:[0-9]+\s+)+([A-Za-z0-9\-]+)/);
    if (startMatch && startMatch[1].length <= 12) return `Local ${startMatch[1].toUpperCase()}`;
    const match = dir.match(/(?:LOCAL\s*(?:COMERCIAL\s*)?(?:NRO\.?\s*)?([A-Za-z0-9\-]+)|([A-Z]\-[0-9]+))/i);
    if (match) return `Local ${(match[1] || match[2]).toUpperCase()}`;
    return inm?.inmueble ? `Inmueble ${inm.inmueble}` : (inm?.identidad || 'Local');
  }, []);

  const getHijoDebt = useCallback((hijo: any, customMeses?: number) => {
    const currentTasa = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);
    // CRÍTICO: Si el hijo es residencial o el condominio padre es estrictamente residencial (no comercial), es Exento (0% IVA)
    // Para locales de centros comerciales o comercios, aplica 16% IVA y 12% multa comercial
    const esRes = isResidencialInm(hijo) || (isResidencialInm(foundUser) && !String(hijo?.tipo || '').toUpperCase().includes('COMERCIAL'));
    const baseMensual = parseFloat(calcularMensualidad(hijo, currentTasa).toFixed(2));
    const ivaMensual = esRes ? 0 : parseFloat((baseMensual * 0.16).toFixed(2));
    const mesesTotales = Math.max(0, parseInt(hijo?.meses_deuda ?? '0'));
    const mesesAPagar = customMeses !== undefined ? customMeses : (hijosMesesAPagar[hijo?.id] ?? mesesTotales);

    if (isTerrenoInm(hijo) || mesesAPagar <= 0 || mesesTotales <= 0) {
      return {
        baseMensual: 0,
        ivaMensual: 0,
        base: 0,
        iva: 0,
        mesesTotales: 0,
        mesesAPagar: 0,
        multa: 0,
        total: 0,
        esRes
      };
    }

    let jNotas: any = null;
    try {
      if (hijo?.notas) jNotas = typeof hijo.notas === 'string' ? JSON.parse(hijo.notas) : hijo.notas;
      else if (hijo?.periodos_custom) jNotas = { periodos_custom: hijo.periodos_custom };
    } catch {}

    if (jNotas?.periodos_custom && Object.keys(jNotas.periodos_custom).length > 0) {
      const keys = Object.keys(jNotas.periodos_custom).sort();
      const periodosUsar = keys.slice(0, mesesAPagar);
      let sumBase = 0;
      let sumIva = 0;
      let sumMulta = 0;
      periodosUsar.forEach((p) => {
        const cfg = jNotas.periodos_custom[p];
        const mmv = cfg.tarifa_mmv !== null && cfg.tarifa_mmv !== undefined ? Number(cfg.tarifa_mmv) : (jNotas.tarifa_activa_mmv || 3.77);
        const b = Math.round((mmv * 57 * currentTasa * (esRes ? 1 : 0.128) + Number.EPSILON) * 100) / 100;
        const iv = esRes ? 0 : Math.round((b * 0.16 + Number.EPSILON) * 100) / 100;
        const esUltimo = p === keys[keys.length - 1];
        const m = cfg.lleva_multa && !esUltimo ? Math.round((b * (esRes ? 0.10 : 0.12) + Number.EPSILON) * 100) / 100 : 0;
        sumBase += b;
        sumIva += iv;
        sumMulta += m;
      });
      const tot = Math.round((sumBase + sumIva + sumMulta + Number.EPSILON) * 100) / 100;
      return {
        baseMensual,
        ivaMensual,
        base: Math.round(sumBase * 100) / 100,
        iva: Math.round(sumIva * 100) / 100,
        mesesTotales,
        mesesAPagar,
        multa: Math.round(sumMulta * 100) / 100,
        total: tot,
        esRes
      };
    }

    const base = parseFloat((baseMensual * mesesAPagar).toFixed(2));
    const iva = esRes ? 0 : parseFloat((ivaMensual * mesesAPagar).toFixed(2));
    // Multa mensual por mora: 10% residencial, 12% comercial sobre los meses adeudados vencidos (septiembre se paga en octubre sin multa; multas aplican hasta agosto)
    const porcentajeMulta = esRes ? 0.10 : 0.12;
    const mesesConMora = Math.max(0, mesesAPagar - 1);
    const multaCalculada = parseFloat((baseMensual * porcentajeMulta * (mesesTotales > 1 ? mesesConMora : 0)).toFixed(2));
    const multaGuardada = parseFloat(hijo?.multa_bs || '0');
    const multa = (mesesTotales <= 1 || mesesConMora === 0) ? 0 : Math.max(multaCalculada, multaGuardada);
    const total = parseFloat((base + iva + multa).toFixed(2));

    return {
      baseMensual,
      ivaMensual,
      base,
      iva,
      mesesTotales,
      mesesAPagar,
      multa,
      total,
      esRes
    };
  }, [customBcvRate, tcmmv, hijosMesesAPagar, foundUser]);

  const totalDeudaCondominio = useMemo(() => {
    if (!isCondominio || condominioHijos.length === 0) return 0;
    return condominioHijos.reduce((acc: number, h: any) => {
      const meses = Math.max(0, parseInt(h.meses_deuda ?? '0'));
      return acc + getHijoDebt(h, meses).total;
    }, 0);
  }, [isCondominio, condominioHijos, getHijoDebt]);

  // ─ Fix C-3: pendingRefsSet — O(1) lookup en lugar de O(n) find+recalc por render ─
  // Mapeo ref → monto calculado para eliminar el doble recalc en isItemPending
  const reciboMontoMap = useMemo(() => {
    const map = new Map<string, number>();
    recibos.forEach((r: any) => {
      map.set(r.referencia, parseFloat(getReciboMonto(r) || '0'));
    });
    return map;
  }, [recibos, getReciboMonto]);

  // Set de referencias bloqueadas por pago en verificación: O(1) lookup
  const pendingRefsSet = useMemo(() => {
    const blocked = new Set<string>();
    recibos.forEach((r: any) => {
      const monto = reciboMontoMap.get(r.referencia) ?? 0;
      if (monto <= 0 && r.estado !== 'Abonado' && r.estado !== 'Pagado') {
        blocked.add(r.referencia);
      }
    });
    // Referencias reportadas en pagos_reportados con estado 'Por Verificar'
    pagosPendientes.forEach((p: any) => {
      let det: any = {};
      try {
        det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {});
      } catch (_) {}
      const refs: string[] = det.recibos || [];
      refs.forEach(ref => blocked.add(ref));
    });
    return blocked;
  }, [recibos, reciboMontoMap, pagosPendientes]);

  // isItemPending: O(1) — solo consulta el Set precalculado
  const isItemPending = useCallback(
    (ref: string) => pendingRefsSet.has(ref),
    [pendingRefsSet]
  );

  // Mapa de recibos pendientes a su objeto pago_reportado correspondiente
  const pendingPagoMap = useMemo(() => {
    const map = new Map<string, any>();
    pagosPendientes.forEach((p: any) => {
      let det: any = {};
      try {
        det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {});
      } catch (_) {}
      const refs: string[] = det.recibos || [];
      refs.forEach(ref => map.set(ref, p));
    });
    return map;
  }, [pagosPendientes]);

  // bancosVenezuela movido a BANCOS_VENEZUELA (constante de módulo, fix A-4)


  const handleAuthorizeRateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateAuthError('');
    setIsAuthorizing(true);
    
    if (rateNote.trim().length < 5) {
      setRateAuthError('Escriba la nota/motivo del cambio (mínimo 5 caracteres).');
      setIsAuthorizing(false);
      return;
    }
    
    const adminPass = process.env.NEXT_PUBLIC_ADMIN_PASS || 'dzara';
    if (adminPassword !== adminPass) {
      const { data, error } = await supabase
        .from('trabajadores')
        .select('*')
        .eq('clave', adminPassword)
        .in('rol', ['Administrador', 'Super Admin', 'Admin'])
        .maybeSingle();
        
      if (error || !data) {
        setRateAuthError('Contraseña incorrecta o el usuario no es Administrador');
        setIsAuthorizing(false);
        return;
      }
    }
    
    if (!rateNote.trim()) {
      setRateAuthError('Debe agregar una nota o motivo');
      setIsAuthorizing(false);
      return;
    }

    setCustomBcvRate(tempBcvRate);
    setJustificacionBcv(rateNote);
    setShowRateModal(false);
    setAdminPassword('');
    setIsAuthorizing(false);
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setFoundUser(null);
    setSelectedRecibos([]);
    setSelectedCuotas([]);
    setSelectedServicios([]);
    setServiciosEsp([]);
    setPagosPendientes([]);
    setPagosPorConciliar([]);
    setMontoPorConciliar(0);
    setNotificacionConciliacion(null);
    setTotalBs(0);

    // Extraer prefijo si fue pegado o escrito en el input (ej: J-075477308 o V075477308)
    let activePrefix = docType;
    let inputClean = docNumber.trim();
    const rawSearch = inputClean.toUpperCase();
    const prefixMatch = inputClean.match(/^([VEJPGvejpg])[-_\s]?(.*)$/);
    if (prefixMatch && !rawSearch.startsWith('AURI') && !rawSearch.startsWith('URB')) {
      activePrefix = prefixMatch[1].toUpperCase();
      inputClean = prefixMatch[2].trim();
      setDocType(activePrefix);
      setDocNumber(inputClean);
    }

    let user: any = null;
    const isCodeFormat = /^(AURI|URB|[A-Z]{3,})\d+/i.test(rawSearch) || /^[A-Z]+\d+$/i.test(rawSearch);

    // 1. PRIORIDAD ABSOLUTA: Búsqueda exacta por Código de Inmueble (AURI..., URB...)
    const matchedInm = (inmuebles || []).find((i: any) => {
      const cod = (i.inmueble || i.Inmueble || i.cod_cont || '').trim().toUpperCase();
      const vivo = i.estado !== 'Eliminado' && i.Estado !== 'Eliminado';
      return vivo && (cod === rawSearch || cod === inputClean.toUpperCase());
    });

    if (matchedInm) {
      user = {
        Identidad: matchedInm.identidad,
        Contribuyente: matchedInm.contribuyente || matchedInm.nombre || 'Sin Nombre',
        Telefono: matchedInm.telefono || 'No registrado',
        Correo: matchedInm.correo_electronico || matchedInm.correo || 'No registrado',
        CodCont: matchedInm.inmueble || matchedInm.cod_cont,
        cod_cont: matchedInm.inmueble || matchedInm.cod_cont,
        Direccion: matchedInm.direccion,
        Clasificacion: matchedInm.clasificacion || (matchedInm.es_condominio ? 'Condominio' : 'Individual'),
        Tipo: matchedInm.tipo || 'RESIDENCIAL',
        Actividad: matchedInm.actividad_principal || matchedInm.actividad || '',
        SaldoFavor: parseFloat(matchedInm.saldo_favor_bs || '0'),
        Estado: matchedInm.estado || 'Activo',
        condominio_padre_id: matchedInm.condominio_padre_id,
        es_condominio: matchedInm.es_condominio,
        isSearchByCode: true
      };
      
      // Si buscaron exactamente por un CÓDIGO (AURI / URB) y resulta ser una matriz de condominio,
      // redirigir directamente a la Caja de Condominios (los condominios no se cobran en Caja general).
      if (user.isSearchByCode && user.es_condominio === true) {
        alert(`El código "${user.CodCont}" pertenece al Condominio "${user.Contribuyente}".\n\nLos condominios se gestionan y cobran en la Caja de Condominios.\n\nRedirigiendo a Caja de Condominios...`);
        window.location.href = `/admin/condominios/caja?codigo=${user.CodCont}`;
        setIsSearching(false);
        return;
      }
    }

    // Si tiene formato de código y no estaba en memoria, buscar en Supabase por coincidencia exacta
    if (!user && isCodeFormat) {
      const { data: inmDirect } = await supabase
        .from('inmuebles')
        .select('*')
        .ilike('inmueble', rawSearch)
        .neq('estado', 'Eliminado')
        .limit(1)
        .maybeSingle();

      if (inmDirect) {
        user = {
          Identidad: inmDirect.identidad,
          Contribuyente: inmDirect.contribuyente || inmDirect.nombre || 'Sin Nombre',
          Telefono: inmDirect.telefono || 'No registrado',
          Correo: inmDirect.correo_electronico || inmDirect.correo || 'No registrado',
          CodCont: inmDirect.inmueble || inmDirect.cod_cont,
          cod_cont: inmDirect.inmueble || inmDirect.cod_cont,
          Direccion: inmDirect.direccion,
          Clasificacion: inmDirect.clasificacion || (inmDirect.es_condominio ? 'Condominio' : 'Individual'),
          Tipo: inmDirect.tipo || 'RESIDENCIAL',
          Actividad: inmDirect.actividad_principal || inmDirect.actividad || '',
          SaldoFavor: parseFloat(inmDirect.saldo_favor_bs || '0'),
          Estado: inmDirect.estado || 'Activo',
          condominio_padre_id: inmDirect.condominio_padre_id,
          es_condominio: inmDirect.es_condominio,
          isSearchByCode: true
        };
        
        if (user.isSearchByCode && user.es_condominio === true) {
          alert(`El código "${user.CodCont}" pertenece al Condominio "${user.Contribuyente}".\n\nLos condominios se gestionan y cobran en la Caja de Condominios.\n\nRedirigiendo a Caja de Condominios...`);
          window.location.href = `/admin/condominios/caja?codigo=${user.CodCont}`;
          setIsSearching(false);
          return;
        }
      }
    }

    // 2. Si no es búsqueda por código de inmueble, buscar por Cédula / RIF
    if (!user) {
      const searchVariants = getIdentidadVariants(inputClean, activePrefix);
      const searchVariantsSet = new Set(searchVariants.map(v => v.replace(/-/g, '').toUpperCase()));
      // Primero: coincidencia exacta con el prefijo seleccionado (evita tomar a otra persona con E-/J- y mismo número)
      const exactSet = /^\d+$/.test(inputClean)
        ? new Set(getIdentidadVariantsExact(`${activePrefix}-${inputClean}`).map(v => v.replace(/-/g, '').toUpperCase()))
        : new Set<string>();

      user = contribuyentes.find((c: any) => c.Estado !== 'Eliminado' && c.Identidad && exactSet.has(String(c.Identidad).replace(/-/g, '').toUpperCase()))
        || contribuyentes.find((c: any) => {
          if (!c.Identidad || c.Estado === 'Eliminado') return false;
          const idClean = String(c.Identidad).replace(/-/g, '').toUpperCase();
          return searchVariantsSet.has(idClean);
        });

      // 3. Si no encontró por cédula, y se ingresó un nombre de más de 2 letras (no dígitos), buscar por nombre
      if (!user && !/^\d+$/.test(inputClean) && inputClean.length >= 3) {
        const searchWords = rawSearch.split(/\s+/).filter((w: string) => w.length >= 2);
        user = contribuyentes.find((c: any) => {
          if (c.Estado === 'Eliminado') return false;
          const cName = (c.Contribuyente || c.nombre || '').toUpperCase();
          return searchWords.every((w: string) => cName.includes(w));
        });
      }

      // Fallback a Supabase (búsqueda segura por cédula o por palabras clave del nombre)
      if (!user) {
        const isNameSearch = !/^\d+$/.test(inputClean) && inputClean.length >= 3;
        const searchWords = isNameSearch ? rawSearch.split(/\s+/).filter((w: string) => w.length >= 2) : [];

        let inmFallback: any = null;

        if (isNameSearch && searchWords.length > 0) {
          let qInm = supabase.from('inmuebles').select('*').neq('estado', 'Eliminado');
          for (const w of searchWords) {
            qInm = qInm.ilike('contribuyente', `%${w}%`);
          }
          const { data: inmByName } = await qInm.limit(1).maybeSingle();
          inmFallback = inmByName;
        } else {
          const orConditions = searchVariants.map(v => `identidad.eq.${v}`);
          const { data: inmById } = await supabase
            .from('inmuebles')
            .select('*')
            .neq('estado', 'Eliminado')
            .or(orConditions.join(','))
            .limit(1)
            .maybeSingle();
          inmFallback = inmById;
        }

        if (inmFallback) {
          user = {
            Identidad: inmFallback.identidad,
            Contribuyente: inmFallback.contribuyente,
            Telefono: inmFallback.telefono || 'No registrado',
            Correo: inmFallback.correo_electronico || 'No registrado',
            CodCont: inmFallback.inmueble || inmFallback.cod_cont,
            cod_cont: inmFallback.inmueble || inmFallback.cod_cont,
            Direccion: inmFallback.direccion,
            Clasificacion: inmFallback.clasificacion || (inmFallback.es_condominio ? 'Condominio' : 'Individual'),
            Tipo: inmFallback.tipo || 'RESIDENCIAL',
            Actividad: inmFallback.actividad_principal || inmFallback.actividad || '',
            SaldoFavor: parseFloat(inmFallback.saldo_favor_bs || '0'),
            Estado: inmFallback.estado || 'Activo',
            condominio_padre_id: inmFallback.condominio_padre_id,
            es_condominio: inmFallback.es_condominio
          };
          // Eliminado el bloqueo estricto aquí: si es una búsqueda por cédula/nombre,
          // no bloqueamos. Simplemente el filtro más abajo ocultará los inmuebles de condominio.
        } else {
          // Fallback 2: buscar en tabla contribuyentes directamente (por palabras del nombre o por cédula)
          let contribFallback: any = null;
          if (isNameSearch && searchWords.length > 0) {
            let qC = supabase.from('contribuyentes').select('*');
            for (const w of searchWords) {
              qC = qC.ilike('nombre', `%${w}%`);
            }
            const { data: cByName } = await qC.limit(1).maybeSingle();
            contribFallback = cByName;
          } else {
            const { data: cById } = await supabase
              .from('contribuyentes')
              .select('*')
              .or(searchVariants.map(v => `identidad.eq.${v}`).join(','))
              .limit(1)
              .maybeSingle();
            contribFallback = cById;
          }

          if (contribFallback) {
            user = {
              Identidad: contribFallback.identidad,
              Contribuyente: contribFallback.nombre,
              Telefono: contribFallback.telefono || 'No registrado',
              Correo: contribFallback.email || 'No registrado',
              CodCont: contribFallback.identidad,
              cod_cont: contribFallback.identidad,
              Direccion: contribFallback.direccion,
              Clasificacion: 'Individual',
              Actividad: '',
              SaldoFavor: 0,
              Estado: 'Activo'
            };
          }
        }
      }

      // Fallback 3: buscar en tabla servicios_especiales (por código único de planilla o por cédula/RIF)
      if (!user) {
        const isSrvPattern = /^SRV-/i.test(rawSearch) || rawSearch.toUpperCase().includes('SRV-');
        let qSrv = supabase.from('servicios_especiales').select('*');
        if (isSrvPattern) {
          qSrv = qSrv.ilike('referencia', `%${rawSearch.trim()}%`);
        } else {
          const srvOrFilters = [
            `referencia.ilike.%${rawSearch.trim()}%`,
            ...searchVariants.map(v => `identidad.eq.${v}`)
          ];
          qSrv = qSrv.or(srvOrFilters.join(','));
        }
        const { data: srvFallbackList } = await qSrv.order('created_at', { ascending: false });
        if (srvFallbackList && srvFallbackList.length > 0) {
          const srvPendientes = srvFallbackList.filter((s: any) => s.estado === 'Pendiente');
          const srvListToUse = srvPendientes.length > 0 ? srvPendientes : srvFallbackList;
          const srv = srvListToUse[0];
          user = {
            Identidad: srv.identidad || 'N/A',
            Contribuyente: srv.contribuyente || 'Contribuyente',
            Telefono: srv.telefono || 'No registrado',
            Correo: srv.correo || 'No registrado',
            CodCont: srv.referencia,
            cod_cont: srv.referencia,
            Direccion: srv.direccion_evento || 'Municipio Naguanagua',
            Clasificacion: 'Servicio Especial',
            Tipo: 'SERVICIO',
            Actividad: srv.descripcion || 'Servicio Especial',
            SaldoFavor: 0,
            DeudaTotal: parseFloat(srv.monto || '0'),
            Estado: srv.estado || 'Activo',
            isServicioEspecialDirecto: true,
            _serviciosCargados: srvListToUse
          };
        }
      }
    }
    
    if (user) {
      // Si se cargó directamente desde un Servicio Especial con código único de planilla
      if (user.isServicioEspecialDirecto) {
        setFoundUser(user);
        setFreshInmuebles([]);
        const srvs = user._serviciosCargados || [];
        const srvEsp = srvs.filter((s: any) => s.tipo !== 'tala_poda');
        const tala = srvs.filter((s: any) => s.tipo === 'tala_poda');
        setServiciosEsp(srvEsp);
        setTalaPoda(tala);
        setRecibos([]);
        setCuotas([]);
        setPagosPendientes([]);
        // Auto-seleccionar para cobro inmediato en taquilla
        setSelectedServicios(srvEsp.map((s: any) => s.referencia));
        setSelectedTalaPoda(tala.map((s: any) => s.referencia));
        // Los servicios especiales ya tienen el monto total con IVA incluido / tasa exenta
        setIvaPercent(0);
        setRetencionIVA(0);
        setEsAgenteRetencion(false);
        setIsSearching(false);
        return;
      }

      // Sincronizar el prefijo visual en el dropdown si es distinto
      if (user.Identidad && /^[A-Z]-/i.test(user.Identidad)) {
        const detectedPrefix = user.Identidad.charAt(0).toUpperCase();
        if (detectedPrefix !== docType) setDocType(detectedPrefix);
      }

      // Obtener datos frescos del inmueble desde Supabase
      const userIdentVariants = getIdentidadVariantsExact(user.Identidad);
      let orFilterInms = '';
      if (isCodeFormat && (user.CodCont || user.cod_cont)) {
        const specificCode = String(user.CodCont || user.cod_cont).trim().toUpperCase();
        // REQUISITO: Cuando se busca por código, debe salir la información de ese código y de su local/unidad.
        // Si el código buscado pertenece a un local unificado (tiene padre_id o es una matriz N/A),
        // traer tanto la matriz como todas sus actividades hijas unificadas para no romper la tarifa del local.
        let parentToInclude = (user.padre_id || user.condominio_padre_id);
        if (!parentToInclude) {
          const mInmLocal = (inmuebles || []).find((i: any) => String(i.inmueble || '').toUpperCase() === specificCode);
          if (mInmLocal?.padre_id || mInmLocal?.condominio_padre_id) {
            parentToInclude = mInmLocal.padre_id || mInmLocal.condominio_padre_id;
          }
        }
        if (!parentToInclude) {
          const { data: codeInmDb } = await supabase.from('inmuebles').select('padre_id, condominio_padre_id').eq('inmueble', specificCode).maybeSingle();
          if (codeInmDb?.padre_id || codeInmDb?.condominio_padre_id) {
            parentToInclude = codeInmDb.padre_id || codeInmDb.condominio_padre_id;
          }
        }

        const codesArray = [specificCode];
        if (parentToInclude) codesArray.push(parentToInclude);

        orFilterInms = [
          ...codesArray.map(c => `inmueble.eq.${c}`),
          ...codesArray.map(c => `padre_id.eq.${c}`),
          ...codesArray.map(c => `condominio_padre_id.eq.${c}`)
        ].join(',');
      } else {
        // Búsqueda por Cédula o RIF: "si busco por cedula o rif que salga todo"
        orFilterInms = [
          ...userIdentVariants.map(v => `identidad.eq.${v}`),
          `condominio_padre_id.eq.${user.CodCont || user.cod_cont}`,
          `condominio_padre_id.eq.${user.Identidad}`,
          ...(user.CodCont || user.cod_cont ? [`padre_id.eq.${user.CodCont || user.cod_cont}`] : [])
        ].filter(Boolean).join(',');
      }

      const { data: inmFresh } = await supabase
        .from('inmuebles')
        .select('*')
        .or(orFilterInms);

      // N/A = suma de sus actividades. Si la deuda (meses) está registrada en el contenedor N/A,
      // sus actividades hijas heredan esos meses (misma lógica que Estado de Cuenta y Detalles Contribuyente).
      const mesesEf = (x: any) => {
        const m = parseInt(String(x?.meses_deuda || 0), 10) || 0;
        return m > 0 ? m : ((parseFloat(String(x?.deuda_mmv || 0)) || 0) > 0 || (parseFloat(String(x?.deuda_congelada_bs || 0)) || 0) > 0 ? 1 : 0);
      };
      const naMesesMap = new Map<string, number>();
      (inmFresh || []).forEach((i: any) => {
        if ((i.actividad_principal || '').trim().toUpperCase() === 'N/A') {
          const ef = mesesEf(i);
          if (ef > 0) naMesesMap.set(i.inmueble, ef);
        }
      });
      (inmFresh || []).forEach((i: any) => {
        const p = i.padre_id;
        if (p) {
          const mChild = mesesEf(i);
          const currentP = naMesesMap.get(p) || 0;
          if (mChild > currentP) naMesesMap.set(p, mChild);
        }
      });
      
      // Filtrar los inmuebles eliminados/inactivos y sincronizar meses de deuda heredados
      const specificCode = (user.CodCont || user.cod_cont || '').toUpperCase();
      const activeInmFresh = (inmFresh || []).filter((i: any) => {
        const st = String(i.estado || '').trim().toLowerCase();
        if (st === 'eliminado' || st === 'inactivo' || st === 'desactivado') return false;
        if (i.es_condominio === true) return false;
        // Si es el código específico buscado se permite (por si vinieron a pagar para reactivarlo),
        // pero todos los demás inmuebles del RIF deben ser estrictamente Activos para no mezclar inactivos
        const esEspecifico = isCodeFormat && String(i.inmueble || '').toUpperCase() === specificCode;
        if (esEspecifico) return true;
        return st === 'activo';
      }).map((i: any) => {
        const p = i.padre_id;
        const mNa = p ? naMesesMap.get(p) : undefined;
        if (mNa && mNa > mesesEf(i)) {
          return { ...i, meses_deuda: mNa };
        }
        if (naMesesMap.has(i.inmueble) && naMesesMap.get(i.inmueble)! > mesesEf(i)) {
          return { ...i, meses_deuda: naMesesMap.get(i.inmueble) };
        }
        return i;
      });

      if (activeInmFresh.length === 0 && (inmFresh || []).some((i:any) => i.es_condominio === true)) {
         alert('El código consultado es una matriz de condominio. Para cobrar el edificio completo, debe dirigirse al módulo de Condominios -> Caja.');
         setIsSearching(false);
         return;
      }

      // Adoptar la Identidad real y actualizada desde el inmueble buscado o el primer inmueble fresco
      const searchedInm = isCodeFormat ? activeInmFresh.find((i: any) => String(i.inmueble || '').toUpperCase() === specificCode) : activeInmFresh[0];
      const primaryInm = searchedInm || activeInmFresh[0];
      if (primaryInm && primaryInm.identidad) {
        user.Identidad = primaryInm.identidad;
        if (primaryInm.contribuyente) user.Contribuyente = primaryInm.contribuyente;
      }
      if (isCodeFormat) {
        user.CodCont = specificCode;
        user.cod_cont = specificCode;
        user.isSearchByCode = true;
      }

      // Recalcular variantes porque la Identidad pudo haber cambiado al tomarla de Supabase
      const updatedUserIdentVariants = getIdentidadVariantsExact(user.Identidad);

      // También consultar en contribuyentes para tener los datos oficiales más recientes
      const { data: freshContrib } = await supabase
        .from('contribuyentes')
        .select('*')
        .or(updatedUserIdentVariants.map(v => `identidad.eq.${v}`).join(','))
        .limit(1)
        .maybeSingle();

      if (freshContrib) {
        user.Identidad = freshContrib.identidad || user.Identidad;
        if (!isCodeFormat || !primaryInm?.contribuyente) {
          user.Contribuyente = freshContrib.nombre || user.Contribuyente;
        }
        const freshTel = formatPhoneNumber(freshContrib.telefono);
        if (freshTel) user.Telefono = freshTel;
        const freshEmail = freshContrib.email || freshContrib.correo_electronico;
        user.Correo = isFictitiousEmail(freshEmail) ? '' : (freshEmail || user.Correo);
      }

      // Sincronizar el prefijo visual en el dropdown si es distinto
      if (user.Identidad && /^[A-Z]-/i.test(user.Identidad)) {
        const detectedPrefix = user.Identidad.charAt(0).toUpperCase();
        if (detectedPrefix !== docType) setDocType(detectedPrefix);
      }
      
      // Detectar y resolver si el usuario o alguno de sus inmuebles pertenece a un condominio
      // NOTA: Si el usuario tiene múltiples inmuebles independientes (ej. Granja a Color con 4 sedes),
      // NO se estampa el condominio a nivel global del contribuyente a menos que la búsqueda haya sido
      // específicamente por el código de ese local filial o todos sus inmuebles pertenezcan al mismo condominio.
      const condoPadreId = user.isSearchByCode
        ? (user.condominio_padre_id || activeInmFresh.find((i: any) => i.inmueble === user.CodCont)?.condominio_padre_id)
        : (activeInmFresh.length === 1
            ? activeInmFresh[0].condominio_padre_id
            : (activeInmFresh.length > 0 && activeInmFresh.every((i: any) => i.condominio_padre_id && i.condominio_padre_id === activeInmFresh[0].condominio_padre_id)
                ? activeInmFresh[0].condominio_padre_id
                : undefined));
      if (condoPadreId) {
        user.condominio_padre_id = condoPadreId;
        const parentInMem = (inmuebles || []).find((i: any) => i.inmueble === condoPadreId || i.id === condoPadreId);
        if (parentInMem?.contribuyente || parentInMem?.nombre) {
          user.condominio_padre_nombre = parentInMem.contribuyente || parentInMem.nombre;
        } else {
          const { data: parentDb } = await supabase
            .from('inmuebles')
            .select('contribuyente, nombre')
            .eq('inmueble', condoPadreId)
            .maybeSingle();
          if (parentDb) {
            user.condominio_padre_nombre = parentDb.contribuyente || parentDb.nombre;
          }
        }
      }

      // Guardar inmuebles frescos para que getReciboMonto los use
      setFreshInmuebles(activeInmFresh);
      
      const saldoFavorFresh = isCodeFormat && searchedInm
        ? (parseInt(String(searchedInm.meses_deuda || '0')) > 0 ? 0 : (parseFloat(searchedInm.saldo_favor_bs || '0') || 0))
        : activeInmFresh.reduce(
            (sum: number, i: any) => {
              const mesesDeuda = parseInt(String(i.meses_deuda || '0'));
              // Si tiene meses_deuda, el saldo a favor (abono parcial) se descuenta visualmente de M1
              if (mesesDeuda > 0) return sum;
              return sum + (parseFloat(i.saldo_favor_bs || '0') || 0);
            }, 0
          );
      
      // Identificar contenedores N/A propios para no tratarlos como condominios externos
      const naParentCodesFresh = activeInmFresh
        .filter((i: any) =>
          (i.actividad_principal || '').trim().toUpperCase() === 'N/A' &&
          (parseInt(i.cant_inmuebles || '0') > 0 || activeInmFresh.some((c: any) => c.inmueble !== i.inmueble && (c.condominio_padre_id === i.inmueble || c.padre_id === i.inmueble)))
        )
        .map((i: any) => i.inmueble);

      // Calcular deuda total fresca (excluyendo contenedores N/A para evitar duplicar montos con sus actividades hijas)
      const billableActiveInms = activeInmFresh.filter(
        (i: any) => (i.actividad_principal || '').trim().toUpperCase() !== 'N/A' && !isTerrenoInm(i)
      );
      const deudaTotalFresh = billableActiveInms.reduce(
        (sum: number, i: any) => {
          // Si el inmueble es de condominio: ninguna información de condominios sale por sistema,
          // solo la multa del usuario si la tiene (todo lo demás lo hace condominio por oficina).
          const isCondoInm = (i.condominio_padre_id || i.es_condominio) && !naParentCodesFresh.includes(i.condominio_padre_id);
          if (isCondoInm) {
            const multa = parseFloat(i.multa_bs || '0') || 0;
            const congelada = parseFloat(i.deuda_congelada_bs || '0') || 0;
            return sum + multa + congelada;
          }

          const currentBcvRate = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : tcmmv;
          const meses = Math.max(0, parseInt(i.meses_deuda || '0'));
          let jNotas: any = null;
          try { if (i.notas) jNotas = typeof i.notas === 'string' ? JSON.parse(i.notas) : i.notas; } catch {}
          if (jNotas?.periodos_custom && Object.keys(jNotas.periodos_custom).length > 0) {
            const keys = Object.keys(jNotas.periodos_custom).sort();
            const esRes = isResidencialInm(i);
            let s = 0;
            keys.forEach((p, idx) => {
              const cfg = jNotas.periodos_custom[p];
              const mmv = cfg.tarifa_mmv !== null && cfg.tarifa_mmv !== undefined ? Number(cfg.tarifa_mmv) : (jNotas.tarifa_activa_mmv || 3.77);
              const base = Math.round((mmv * 57 * currentBcvRate * (esRes ? 1 : 0.128) + Number.EPSILON) * 100) / 100;
              const iva = esRes ? 0 : Math.round((base * 0.16 + Number.EPSILON) * 100) / 100;
              const esUltimo = idx === keys.length - 1;
              const multa = cfg.lleva_multa && !esUltimo ? Math.round((base * (esRes ? 0.10 : 0.12) + Number.EPSILON) * 100) / 100 : 0;
              s += base + iva + multa;
            });
            return sum + s;
          }
          if (meses > 0) {
            const esRes = isResidencialInm(i);
            const baseMes = Math.round(calcularMensualidad(i, currentBcvRate) * 100) / 100;
            const ivaMes = esRes ? 0 : Math.round((baseMes * 0.16) * 100) / 100;
            const moraTasa = esRes ? 0.10 : 0.12;
            const multaMes = Math.round((baseMes * moraTasa) * 100) / 100;
            const mesesConMulta = Math.max(0, meses - 1);
            return sum + ((baseMes + ivaMes) * meses) + (multaMes * mesesConMulta);
          }
          return sum + (parseFloat(i.deuda_mmv || '0') * currentBcvRate) + parseFloat(i.deuda_congelada_bs || '0');
        }, 0
      );
      
      setFoundUser({ ...user, SaldoFavor: saldoFavorFresh, DeudaTotal: deudaTotalFresh });

      // Auditoría: Registro de consulta de contribuyente
      logAudit('Consulta de Contribuyente en Caja', {
        identidad: user.Identidad,
        contribuyente: user.Contribuyente,
        codigo_inmueble: user.CodCont || user.cod_cont,
        deuda_total_bs: deudaTotalFresh,
        saldo_favor_bs: saldoFavorFresh,
        termino_busqueda: rawSearch
      }, 'CAJA', 'BAJA');

      // Verificar si el contribuyente carece de correo para solicitar actualización al cajero
      const tieneCorreoValido = user.Correo && !isFictitiousEmail(user.Correo);
      if (!tieneCorreoValido) {
        setContactModalEmail('');
        setContactModalPhone(user.Telefono && user.Telefono !== 'No registrado' ? user.Telefono : '');
        setContactSaveError('');
        setShowUpdateContactModal(true);
      }
      
      // Consulta directa a Supabase: siempre fresca, incluye todas las CM- mensuales
      const facturasOrFilter = isCodeFormat
        ? [
            ...userIdentVariants.map(v => `identidad.eq.${v}`),
            ...(activeInmFresh.length > 0 
                ? activeInmFresh.map((i: any) => `referencia.ilike.%${i.inmueble}%`)
                : [`referencia.ilike.%${specificCode}%`])
          ].filter(Boolean).join(',')
        : userIdentVariants.map(v => `identidad.eq.${v}`).join(',');
      const { data: allUserFacturas } = await supabase
        .from('facturas')
        .select('*')
        .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
        .or(facturasOrFilter)
        .order('emision', { ascending: true });

      // Fallback: buscar por nombre del contribuyente (cubre recibos con identidad en formato
      // distinto o NULL — ej: RECIB- generadas por ajuste de deuda sin guión V-)
      let fallbackFacturas: any[] = [];
      if ((allUserFacturas || []).length === 0 && user.Contribuyente) {
        const { data: fByName } = await supabase
          .from('facturas')
          .select('*')
          .in('estado', ['Pendiente', 'Por Verificar'])
          .eq('contribuyente', user.Contribuyente)
          .order('emision', { ascending: true });
        
        if (fByName && fByName.length > 0) {
          fallbackFacturas = fByName;
          // Backfill identidad en BD (fire-and-forget, no bloquea la búsqueda)
          const idsToUpdate = fByName.map((f: any) => f.id);
          Promise.resolve(
            supabase.from('facturas').update({ identidad: user.Identidad }).in('id', idsToUpdate)
          ).catch((e: any) => console.warn('Backfill identidad falló:', e));
        }
      }

      // NO combinar con contexto React (puede estar desactualizado tras un pago)
      // Solo usar datos frescos de Supabase
      let combined = [...(allUserFacturas || []), ...fallbackFacturas];

      // Si se buscó por código específico, aislar para que solo aparezcan facturas de ESTE inmueble o de sus hijos
      if (isCodeFormat && (user.CodCont || user.cod_cont)) {
        const specificCode = String(user.CodCont || user.cod_cont).toUpperCase();
        const allowedCodes = new Set([
          specificCode,
          ...activeInmFresh.map((i: any) => String(i.inmueble || '').toUpperCase())
        ]);
        combined = combined.filter((f: any) => {
          const fInm = String(f.inmueble || '').trim().toUpperCase();
          if (fInm) return allowedCodes.has(fInm);
          const ref = String(f.referencia || '').toUpperCase();
          const hasCodeInRef = Array.from(allowedCodes).some(code => ref.includes(code));
          if (hasCodeInRef) return true;
          // Facturas del contribuyente sin código de inmueble específico (ej. O-003146) se conservan
          return true;
        });
      }
      
      // Si no hay recibos, pero tiene inmuebles con deuda_mmv, inyectamos un recibo acumulado dinámico
      // Usar inmuebles frescos para evaluar si hay deuda
      const misInmuebles = activeInmFresh.length > 0 
        ? activeInmFresh
        : inmuebles.filter((i: any) => {
            if (i.estado === 'Eliminado' || i.Estado === 'Eliminado') return false;
            const ui = (user.Identidad || '').replace(/-/g,'').toUpperCase();
            const ii = (i.identidad || '').replace(/-/g,'').toUpperCase();
            const nakedUi = ui.replace(/^[VEJPG]/i, '');
            const nakedIi = ii.replace(/^[VEJPG]/i, '');
            return ui === ii || nakedUi === nakedIi;
          });
      if (misInmuebles && misInmuebles.length > 0) {
        // Identificar si existen contenedores "N/A" que solo envuelven actividades nietos/hijos
        const naParentCodes = misInmuebles
          .filter((i: any) => 
            (i.actividad_principal || '').trim().toUpperCase() === 'N/A' && 
            (parseInt(i.cant_inmuebles || '0') > 0 || misInmuebles.some((c: any) => c.inmueble !== i.inmueble && (c.condominio_padre_id === i.inmueble || c.padre_id === i.inmueble)))
          )
          .map((i: any) => i.inmueble);

        // N/A = suma de sus actividades. Si la deuda (meses) está registrada en el contenedor N/A,
        // sus actividades hijas heredan esos meses (misma regla que Estado de Cuenta).
        const naMeses = new Map<string, number>();
        misInmuebles.forEach((i: any) => {
          if ((i.actividad_principal || '').trim().toUpperCase() === 'N/A') {
            const ef = mesesEf(i);
            if (ef > 0) naMeses.set(i.inmueble, ef);
          }
        });

        // Los inmuebles cobrables son las actividades reales (o el contenedor N/A si no tiene hijos registrados)
        let billableInms = misInmuebles
          .filter((i: any) => {
            const isNA = (i.actividad_principal || '').trim().toUpperCase() === 'N/A';
            const hasChildren = misInmuebles.some((c: any) => c.inmueble !== i.inmueble && (c.condominio_padre_id === i.inmueble || c.padre_id === i.inmueble));
            return !isNA || !hasChildren;
          })
          .map((i: any) => {
            const p = i.padre_id || i.condominio_padre_id;
            const mNa = p ? naMeses.get(p) : undefined;
            if (mNa && mNa > mesesEf(i)) {
              return { ...i, meses_deuda: mNa };
            }
            return i;
          });
        // Búsqueda por CÓDIGO o RIF: mantener todos los inmuebles activos del RIF del contribuyente
        // (ya filtrados en activeInmFresh para no mezclar inmuebles inactivos ni condominios)

        const hasDeuda = billableInms.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
        if (hasDeuda && !isCondominio) {
          const now = new Date();
          billableInms.forEach((inm: any) => {
            if (isTerrenoInm(inm)) return; // Terrenos no pagan ni generan multas
            const esCondoPagoInd = isCondominioPagoIndividual(inm);

            const isParentContainerNA = inm.condominio_padre_id && naParentCodes.includes(inm.condominio_padre_id);

            // Si el inmueble pertenece a un condominio (o es filial de condominio):
            // Ninguna información de los condominios sale por sistema, solo la multa de los usuarios.
            // Todo lo demás lo hace condominio por oficina.
            if ((inm.condominio_padre_id || inm.es_condominio) && !isParentContainerNA) {
              const multa = parseFloat(inm.multa_bs || '0');
              const congelada = parseFloat(inm.deuda_congelada_bs || '0');
              if (multa > 0 || congelada > 0) {
                const totalMulta = (multa + congelada).toFixed(2);
                const fechaMora = new Date(now.getFullYear(), now.getMonth() - 2, 1, 12, 0, 0);
                combined.push({
                  id: `multa-${inm.inmueble}`,
                  referencia: `MULTA-${inm.inmueble}`,
                  inmueble: inm.inmueble,
                  identidad: user.Identidad,
                  contribuyente: user.Contribuyente,
                  emision: fechaMora.toISOString(),
                  vencimiento: fechaMora.toISOString(),
                  estado: 'Pendiente',
                  monto: totalMulta,
                  descripcion: `Multa Municipal - ${isResidencialInm(inm) ? 'Residencial' : 'Comercial'} (${inm.inmueble})`,
                  descripcion_periodo: `MULTA POR MORA (HASTA ${formatMonthYear(fechaMora.toISOString())})`
                });
              }
              return; // NO genera meses de aseo para condominios
            }

            // Para inmuebles directos (no condominios):
            // 2. Generar sus meses de aseo (RECIB-HIST-)
            const isTerreno = isTerrenoInm(inm);
            const deudaMMV = isTerreno ? 0 : parseFloat(inm.deuda_mmv || '0');
            const meses = isTerreno ? 0 : parseInt(inm.meses_deuda || 0);
            
            const recibosFormales = combined.filter((r: any) => 
              (r.referencia || '').includes(inm.inmueble) && 
              !r.referencia?.startsWith('RECIB-HIST-') && 
              !r.referencia?.startsWith('MULTA-')
            ).length;
            
            const numMeses = isTerreno ? 0 : Math.max(0, (meses > 0 ? meses : (deudaMMV > 0 ? 1 : 0)) - recibosFormales);

            // 1. Si NO tiene meses de aseo pendientes pero sí tiene multa acumulada aislada, generar recibo MULTA-
            // (La mora de los meses adeudados va distribuida dentro de cada RECIB-HIST-, idéntico a recibosContribuyente.ts)
            const multa = parseFloat(inm.multa_bs || '0');
            const congelada = parseFloat(inm.deuda_congelada_bs || '0');
            if (numMeses === 0 && (multa > 0 || congelada > 0)) {
              const totalMulta = (multa + congelada).toFixed(2);
              const fechaMora = new Date(now.getFullYear(), now.getMonth() - 2, 1, 12, 0, 0);
              combined.push({
                id: `multa-${inm.inmueble}`,
                referencia: `MULTA-${inm.inmueble}`,
                inmueble: inm.inmueble,
                identidad: user.Identidad,
                contribuyente: user.Contribuyente,
                emision: fechaMora.toISOString(),
                vencimiento: fechaMora.toISOString(),
                estado: 'Pendiente',
                monto: totalMulta,
                descripcion: `Multa Municipal (${inm.inmueble})`,
                descripcion_periodo: `MULTA POR MORA (HASTA ${formatMonthYear(fechaMora.toISOString())})`
              });
            }

            if (numMeses > 0) {
              // Generar un recibo dummy por cada mes de mora con fecha uniforme de calendario
              for (let i = 1; i <= numMeses; i++) {
                const targetDate = new Date(now.getFullYear(), now.getMonth() - numMeses + i - 1, 1, 12, 0, 0);
                const dateIso = targetDate.toISOString();
                combined.push({
                  id: `dummy-hist-${inm.inmueble}-${i}`,
                  referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
                  inmueble: inm.inmueble,
                  identidad: user.Identidad,
                  contribuyente: user.Contribuyente,
                  emision: dateIso,
                  vencimiento: dateIso,
                  estado: 'Pendiente',
                  monto: '0'
                });
              }
            }
          });
        }
      }

      // Ordenar: primero recibos normales (RECIB-), luego CM- por fecha
      combined.sort((a: any, b: any) => {
        const aIsCM = a.referencia?.startsWith('CM-');
        const bIsCM = b.referencia?.startsWith('CM-');
        if (!aIsCM && bIsCM) return -1;
        if (aIsCM && !bIsCM) return 1;
        return (a.emision || '').localeCompare(b.emision || '');
      });

      setRecibos(combined);

      
      // Load Convenios Cuotas
      const userConvenioVariants = new Set(userIdentVariants.map(v => v.replace(/-/g, '').toUpperCase()));
      const userConvenios = convenios.filter((c: any) => {
        const idCleanConv = (c.identidad || '').replace(/-/g, '').toUpperCase();
        const matchesUser = userConvenioVariants.has(idCleanConv) && c.estado === 'Al Día';
        if (!matchesUser) return false;
        const allowedInmCodes = new Set((activeInmFresh || []).map((i: any) => String(i.inmueble || '').toUpperCase()));
        if (c.inmueble && allowedInmCodes.size > 0 && !allowedInmCodes.has(c.inmueble.toUpperCase())) return false;
        return true;
      });
      const pendingCuotas: any[] = [];
      userConvenios.forEach((conv: any) => {
        let parsed = [];
        try { parsed = JSON.parse(conv.detalle_cuotas || '[]'); } catch(e){}
        parsed.forEach((c: any) => {
          if (c.estado === 'Pendiente') {
            pendingCuotas.push({
              convId: conv.id,
              numeroConv: conv.numero,
              cuotaId: c.id,
              fecha: c.fecha,
              monto: c.monto,
              rawConv: conv
            });
          }
        });
      });
      setCuotas(pendingCuotas);

      // Cargar servicios especiales y tala/poda pendientes vía API (bypassa RLS)
      let allServiciosData: any[] = [];
      try {
        const idSearch = user.Identidad || user.identidad || '';
        const res = await fetch(`/api/admin/servicios-especiales?identidad=${encodeURIComponent(idSearch)}&estado=Pendiente`);
        if (res.ok) {
          allServiciosData = await res.json();
        }
      } catch (e) {
        console.error('Error fetching servicios_especiales:', e);
      }

      const filteredServEsp = (allServiciosData || []).filter((s: any) => {
        if (s.tipo === 'tala_poda') return false;
        if (isCodeFormat && (user.CodCont || user.cod_cont)) {
          const specificCode = String(user.CodCont || user.cod_cont).toUpperCase();
          if (s.inmueble && s.inmueble.toUpperCase() !== specificCode) return false;
        }
        return true;
      });
      setServiciosEsp(filteredServEsp);

      // Cargar servicios de tala y poda pendientes
      const filteredTala = (allServiciosData || []).filter((s: any) => {
        if (s.tipo !== 'tala_poda') return false;
        if (isCodeFormat && (user.CodCont || user.cod_cont)) {
          const specificCode = String(user.CodCont || user.cod_cont).toUpperCase();
          if (s.inmueble && s.inmueble.toUpperCase() !== specificCode) return false;
        }
        return true;
      });
      setTalaPoda(filteredTala);

      // Cargar pagos pendientes de verificar para bloquear seleccion y notificar monto por conciliar
      const { data: allPorVerificar } = await supabase
        .from('pagos_reportados')
        .select('*')
        .in('estado', ['Por Verificar', 'Pendiente'])
        .order('created_at', { ascending: false })
        .limit(2000);

      const rawIdentList = [
        ...userIdentVariants,
        user.Identidad,
        user.identidad,
        user.CodCont,
        user.cod_cont,
        rawSearch,
        inputClean,
        ...(activeInmFresh || []).map((i: any) => i.inmueble),
        ...(activeInmFresh || []).map((i: any) => i.identidad_propietario)
      ].filter(Boolean);

      const cleanIdents = new Set(rawIdentList.map(id => String(id).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()));
      rawIdentList.forEach(id => {
        const nums = String(id).replace(/\D/g, '');
        if (nums.length >= 4) cleanIdents.add(nums);
      });

      const userInmCodes = Array.from(new Set([
        ...((activeInmFresh || []).map((i: any) => String(i.inmueble || '').trim().toLowerCase())),
        user.CodCont ? String(user.CodCont).trim().toLowerCase() : '',
        user.cod_cont ? String(user.cod_cont).trim().toLowerCase() : '',
        rawSearch ? String(rawSearch).trim().toLowerCase() : ''
      ].filter(Boolean)));

      const contribNombre = String(user.Contribuyente || user.contribuyente || '').trim().toLowerCase();

      const arrPagosPend = (allPorVerificar || []).filter((p: any) => {
        const pIdentClean = String(p.identidad || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const pIdentNums = String(p.identidad || '').replace(/\D/g, '');
        if (pIdentClean && cleanIdents.has(pIdentClean)) return true;
        if (pIdentNums.length >= 4 && cleanIdents.has(pIdentNums)) return true;

        const detStr = (typeof p.detalles === 'string' ? p.detalles : JSON.stringify(p.detalles || '')).toLowerCase();
        if (userInmCodes.some(code => code && detStr.includes(code))) return true;

        if (contribNombre && contribNombre.length > 5 && detStr.includes(contribNombre)) return true;

        return false;
      });

      const totalPendConciliar = arrPagosPend.reduce((acc: number, p: any) => acc + (parseFloat(p.monto) || 0), 0);
      setPagosPendientes(arrPagosPend);
      setPagosPorConciliar(arrPagosPend);
      setMontoPorConciliar(totalPendConciliar);

      // Buscar si es un Condominio (Padre)
      const parentCodes = (isCodeFormat && (user.CodCont || user.cod_cont))
        ? [user.CodCont || user.cod_cont]
        : activeInmFresh.map((i: any) => i.inmueble).filter(Boolean);
      const nombreContrib = (user.Contribuyente || user.contribuyente || '').toLowerCase();
      const isCondoByName = nombreContrib.includes('condominio') ||
                            nombreContrib.includes('conjunto') ||
                            nombreContrib.includes('edificio') ||
                            nombreContrib.includes('torre') ||
                            nombreContrib.includes('residencia');
      const isCondoByClasif = (user.Clasificacion || user.clasificacion || '').toLowerCase().includes('condominio');
      const isCondoByFlag = activeInmFresh.some((i: any) => i.es_condominio === true);
      const isResidencialUser = isResidencialInm(user) || (user.Tipo || '').toUpperCase().includes('RESIDENCIAL') || activeInmFresh.some((i: any) => isResidencialInm(i));

      // Un contribuyente comercial ordinario (ej. AGROAPA C A) NO es un condominio aunque sus inmuebles tengan código padre
      const isTrueCondoUser = isCondoByName || isCondoByClasif || (isCondoByFlag && isResidencialUser) || user.es_condominio === true;
      const hasNAGroup = activeInmFresh.some((i: any) => i.actividad_principal === 'N/A' || i.es_grupo === true);
      const codCont = user.cod_cont || user.CodCont || user.Identidad || user.identidad;

      if ((isTrueCondoUser || hasNAGroup) && parentCodes.length > 0) {
        const searchFilters: string[] = [];
        parentCodes.forEach((c: string) => {
          searchFilters.push(`condominio_padre_id.eq.${c}`);
          searchFilters.push(`actividad_principal.ilike.%[HIJO_DE:${c}]%`);
        });
        if (codCont && !parentCodes.includes(codCont)) {
          searchFilters.push(`condominio_padre_id.eq.${codCont}`);
          searchFilters.push(`actividad_principal.ilike.%[HIJO_DE:${codCont}]%`);
        }
        if (user.Identidad && !searchFilters.some(s => s.includes(user.Identidad))) {
          searchFilters.push(`condominio_padre_id.eq.${user.Identidad}`);
        }

        let hijosData: any[] = [];
        if (searchFilters.length > 0) {
          const { data: hijosById } = await supabase
            .from('inmuebles')
            .select('id, identidad, inmueble, tipo, clasificacion, mmv_mes, deuda_mmv, deuda_congelada_bs, actividad_principal, contribuyente, direccion, meses_deuda, cant_inmuebles, notas')
            .or(searchFilters.join(','));
          hijosData = (hijosById || []).filter((h: any) => !parentCodes.includes(h.inmueble));
        }

        // Un verdadero condominio tiene locales/apartamentos con diferentes contribuyentes/identidades.
        // Si todos los hijos tienen la misma identidad que el usuario buscado, se trata de un local con múltiples actividades económicas ("nietos"), NO un condominio.
        const distinctIdentidades = new Set(
          hijosData
            .map((h: any) => (h.identidad || '').replace(/^[VEJPG]-?/i, '').trim().toUpperCase())
            .filter((id: string) => id.length > 0)
        );
        const userIdNaked = (user.Identidad || '').replace(/^[VEJPG]-?/i, '').trim().toUpperCase();
        const esMultiplesActividades = distinctIdentidades.size <= 1 && (distinctIdentidades.has(userIdNaked) || distinctIdentidades.size === 0);

        // ALWAYS group children under the parent N/A, regardless of whether it's "multiples actividades" or a real condominio
        if (hijosData && hijosData.length > 0) {
          setIsCondominio(true);
          setCondominioHijos(hijosData);
          setSelectedHijos(hijosData.map(h => h.id));
          setCondominioModo('Total');
        } else {
          setIsCondominio(false);
          setCondominioHijos([]);
          setSelectedHijos([]);
        }
      } else {
        setIsCondominio(false);
        setCondominioHijos([]);
        setSelectedHijos([]);
      }
      
      // Calcular IVA inicial (RESIDENCIAL, CONDOMINIOS RESIDENCIALES Y SERVICIOS 100% EXENTOS DE IVA ADICIONAL)
      if (user.isServicioEspecialDirecto || user.Tipo === 'SERVICIO' || isResidencialUser || (user.Clasificacion || '').toLowerCase().includes('residencial')) {
        setIvaPercent(0);
        setRetencionIVA(0);
        setEsAgenteRetencion(false);
      } else {
        setIvaPercent(0.16); // 16% para comerciales
        // Detectar si es agente de retención
        const esAgente = !!(inmuebles as any[]).find(
          (inm: any) => (
            inm.identidad === user.Identidad ||
            inm.identidad === user.Identidad?.replace(/-/g, '')
          ) && inm.agente_retencion === true
        );
        setEsAgenteRetencion(esAgente);
        setRetencionIVA(0);
      }


    } else {
      alert("Contribuyente no encontrado. Puede intentar buscar por Código de Usuario.");
    }
    
    setIsSearching(false);
  };

  // Recalculate Total — O(n) con Maps, antes era O(n²) con .find() anidados (fix C-4)
  useEffect(() => {
    // ── Construir índices O(1) una sola vez por ejecución ────────────────────
    const recibosMap = new Map<string, any>(recibos.map((r: any) => [r.referencia, r]));
    const cuotasMap = new Map<string, any>(cuotas.map((c: any) => [`${c.convId}:${c.cuotaId}`, c]));
    const serviciosMap = new Map<string, any>(serviciosEsp.map((s: any) => [s.referencia, s]));
    const talaPodaMap = new Map<string, any>(talaPoda.map((s: any) => [s.referencia, s]));
    const allInms = [...(inmuebles || []), ...(freshInmuebles || [])];
    const inmueblesMap = new Map<string, any>(allInms.map((i: any) => [i.inmueble, i]));

    let tasaActualUse = (tcmmv || 0);
    if (customBcvRate && !isNaN(parseFloat(customBcvRate))) {
      const parsed = parseFloat(customBcvRate);
      if (tcmmv > 0 && Math.abs(parsed - tcmmv) < 0.05) {
        tasaActualUse = tcmmv;
      } else {
        tasaActualUse = parsed;
      }
    }
    let sb4 = 0, siva4 = 0, smulta4 = 0, sivaRetencionable4 = 0, extraSb = 0, extraMulta = 0;

    let total = 0;
    
    selectedRecibos.forEach(ref => {
      const f = recibosMap.get(ref);
      // Reutiliza reciboMontoMap precalculado para evitar recalcular getReciboMonto
      if (f) total += reciboMontoMap.get(ref) ?? parseFloat(getReciboMonto(f) || '0');
    });
    
    selectedCuotas.forEach(sc => {
      const c = cuotasMap.get(`${sc.convId}:${sc.cuotaId}`);
      if (c) total += parseFloat(c.monto || '0');
    });

    selectedServicios.forEach(ref => {
      const s = serviciosMap.get(ref);
      if (s) {
        const ucd = Number(s.valor_ucd || 0);
        const fac = Number(s.factor || 1);
        const nve = Number(s.nve || 1);
        const baseMonto = (ucd > 0 && tasaActualUse > 0) ? Math.round(ucd * fac * nve * tasaActualUse * 100) / 100 : parseFloat(s.monto || '0');
        total += baseMonto;
      }
    });

    selectedTalaPoda.forEach(ref => {
      const s = talaPodaMap.get(ref);
      if (s) {
        const ucd = Number(s.valor_ucd || 0);
        const fac = Number(s.factor || 1);
        const nve = Number(s.nve || 1);
        const baseMonto = (ucd > 0 && tasaActualUse > 0) ? Math.round(ucd * fac * nve * tasaActualUse * 100) / 100 : parseFloat(s.monto || '0');
        total += baseMonto;
      }
    });

    if (isCondominio && selectedRecibos.length === 0) {
      if (condominioModo === 'Abono') {
        const abonoVal = parseLocalFloat(montoAbonoCondo) || 0;
        total += abonoVal;
        sb4 += abonoVal;
      } else {
        const hijosToSum = condominioModo === 'Local'
          ? condominioHijos.filter(h => selectedHijos.includes(h.id))
          : (condominioModo === 'Total' ? condominioHijos : []);

        hijosToSum.forEach(h => {
          const debtInfo = getHijoDebt(h, condominioModo === 'Total' ? Math.max(0, parseInt(h.meses_deuda ?? '0')) : undefined);
          total += debtInfo.total;
          sb4 += debtInfo.base;
          siva4 += debtInfo.iva;
          smulta4 += debtInfo.multa;
          if (h.agente_retencion === true) {
            sivaRetencionable4 += debtInfo.iva;
          }
        });
      }
    }

    // Agrupar recibos seleccionados por inmueble para cálculo acumulado exacto idéntico al Estado de Cuenta
    const inmSelectedMap = new Map<string, { inm: any; totalMeses: number; mesesConMora: number }>();

    selectedRecibos.forEach(ref => {
      if (ref.startsWith('RECIB-HIST-')) {
        const parts = ref.split('-');
        const inmId = parts[2];
        const inm = inmueblesMap.get(inmId);
        if (inm) {
          if (!inmSelectedMap.has(inmId)) {
            inmSelectedMap.set(inmId, { inm, totalMeses: 0, mesesConMora: 0 });
          }
          const item = inmSelectedMap.get(inmId)!;
          item.totalMeses += 1;

          const f = recibosMap.get(ref);
          const emision = f?.emision ? new Date(f.emision) : new Date();
          const today = new Date();
          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
          const mNum = parseInt(parts[3]?.replace('M', '') || '0');
          const totalMesesDeuda = Math.max(1, parseInt(inm.meses_deuda || '1'));
          const isUltimoMes = mNum > 0 ? (mNum >= totalMesesDeuda) : false;
          const esMesExon = isMesExoneradoMulta(inm.notas, emision);

          if (!isUltimoMes && monthsDiff > 1 && !esMesExon) {
            item.mesesConMora += 1;
          }
        }
      } else if (ref.startsWith('CM-')) {
        const allUserInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);
        const userInmsLocal = allUserInms.filter((inm: any) => inm.inmueble && ref.includes(inm.inmueble));
        const targetInms = userInmsLocal.length > 0
          ? userInmsLocal
          : allUserInms.filter((i: any) => i.identidad === foundUser?.Identidad);

        targetInms.forEach((inm: any) => {
          const inmId = inm.inmueble || 'general';
          if (!inmSelectedMap.has(inmId)) {
            inmSelectedMap.set(inmId, { inm, totalMeses: 0, mesesConMora: 0 });
          }
          const item = inmSelectedMap.get(inmId)!;
          item.totalMeses += 1;

          const f = recibosMap.get(ref);
          const emision = f?.emision ? new Date(f.emision) : new Date();
          const today = new Date();
          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
          const allCmForInm = (recibos || []).filter((rc: any) =>
            rc.referencia?.startsWith('CM-') && (rc.referencia || '').includes(inm.inmueble || '')
          );
          const isUltimoMes = allCmForInm.length <= 1 || allCmForInm[allCmForInm.length - 1]?.referencia === ref || monthsDiff <= 1;
          const esMesExon = isMesExoneradoMulta(inm.notas, emision);

          if (!isUltimoMes && monthsDiff > 1 && !esMesExon) {
            item.mesesConMora += 1;
          }
        });
      } else if (ref.startsWith('MULTA-')) {
        const f = recibosMap.get(ref);
        if (f) extraMulta += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      } else {
        const f = recibosMap.get(ref);
        if (f) extraSb += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      }
    });

    const isCondominioPayer = foundUser?.es_condominio || 
      foundUser?.Clasificacion?.toLowerCase().includes('condo') ||
      (freshInmuebles || []).some((i: any) => i.es_condominio === true && (i.identidad === foundUser?.Identidad || i.inmueble === foundUser?.CodCont || i.inmueble === foundUser?.cod_cont));

    const isAgenteGlobal = Boolean(
      foundUser?.agente_retencion || 
      foundUser?.esAgenteRetencion || 
      (freshInmuebles || []).some((i: any) => {
        if (isCondominioPayer) {
          return i.es_condominio === true && i.agente_retencion === true;
        }
        return i.agente_retencion === true;
      })
    );

    // Calcular con precisión canónica de 2 decimales idéntica a recibos y factura SENIAT
    inmSelectedMap.forEach(({ inm, totalMeses, mesesConMora }) => {
      const esRes = isResidencialInm(inm);
      const bMes = Math.round(calcularMensualidad(inm, tasaActualUse) * 100) / 100;
      const tasaMora = esRes ? 0.10 : 0.12;

      // Base acumulada a 2 decimales
      const baseInm = Math.round((bMes * totalMeses) * 100) / 100;
      sb4 += baseInm;

      // IVA mensual y acumulado exacto coincidente con recibos y facturación
      const ivaMes = esRes ? 0 : Math.round((bMes * 0.16) * 100) / 100;
      const ivaInm = ivaMes * totalMeses;
      siva4 += ivaInm;

      const esAgente = inm.agente_retencion === true || isAgenteGlobal;
      if (!esRes && esAgente) {
        sivaRetencionable4 += ivaInm;
      }

      // Multa acumulada idéntica a la suma de cuotas mensuales de mora
      const multaMes = Math.round((bMes * tasaMora) * 100) / 100;
      const multaInm = Math.round((multaMes * mesesConMora) * 100) / 100;
      smulta4 += multaInm;
    });

    selectedCuotas.forEach(sc => {
      const c = cuotasMap.get(`${sc.convId}:${sc.cuotaId}`);
      if (c) extraSb += parseFloat(c.monto || '0');
    });

    selectedServicios.forEach(ref => {
      const s = serviciosMap.get(ref);
      if (s) {
        const ucd = Number(s.valor_ucd || 0);
        const fac = Number(s.factor || 1);
        const nve = Number(s.nve || 1);
        const baseMonto = (ucd > 0 && tasaActualUse > 0) ? Math.round(ucd * fac * nve * tasaActualUse * 100) / 100 : parseFloat(s.monto || '0');
        extraSb += baseMonto;
      }
    });
    selectedTalaPoda.forEach(ref => {
      const s = talaPodaMap.get(ref);
      if (s) {
        const ucd = Number(s.valor_ucd || 0);
        const fac = Number(s.factor || 1);
        const nve = Number(s.nve || 1);
        const baseMonto = (ucd > 0 && tasaActualUse > 0) ? Math.round(ucd * fac * nve * tasaActualUse * 100) / 100 : parseFloat(s.monto || '0');
        extraSb += baseMonto;
      }
    });

    const sb = Math.round((sb4 + extraSb) * 100) / 100;
    const siva = Math.round(siva4 * 100) / 100;
    const smulta = Math.round((smulta4 + extraMulta) * 100) / 100;
    const sivaRetencionable = Math.round(sivaRetencionable4 * 100) / 100;

    setSumBase(sb);
    setSumIVA(siva);
    setSumMulta(smulta);
    setSumIVARetencionable(sivaRetencionable);
    setTotalBs(isCondominio && selectedRecibos.length === 0 ? total : parseFloat((sb + siva + smulta).toFixed(2)));

    // Ajuste dinámico de retención:
    // Si hay IVA retenible, preconfigurar al 75% si estaba en 0.
    // Si los conceptos seleccionados NO son de agentes de retención, forzar a 0%.
    if (sivaRetencionable > 0) {
      setRetencionIVA(prev => (prev === 0 ? 75 : prev));
    } else {
      setRetencionIVA(0);
      setComprobanteRetencion('');
    }

  }, [selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda, inmuebles, customBcvRate, tcmmv, ivaPercent, foundUser, isCondominio, condominioModo, selectedHijos, condominioHijos, montoAbonoCondo, hijosMesesAPagar, getHijoDebt, reciboMontoMap, getReciboMonto]);

  // ─── useCajaSelection hook (Fase 2) ────────────────────────────────────────
  const { sortedRecibos, toggleRecibo, toggleCuota, toggleServicio, toggleTalaPoda } = useCajaSelection({
    recibos,
    freshInmuebles,
    condominioHijos,
    inmuebles,
    foundUser,
    selectedRecibos,
    setSelectedRecibos,
    selectedCuotas,
    setSelectedCuotas,
    selectedServicios,
    setSelectedServicios,
    selectedTalaPoda,
    setSelectedTalaPoda,
    isItemPending,
  });

  const [cargandoTasaFecha, setCargandoTasaFecha] = useState(false);
  const fetchTasaHistorica = async (fechaParam?: string) => {
    const fecha = fechaParam || selectedUcdDate;
    if (!fecha) return;
    const hoyVE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    if (fecha > hoyVE) { alert('No se puede usar una fecha futura.'); return; }
    if (fecha === hoyVE) {
      // Hoy: tasa automática del día (sin ajuste manual)
      setCustomBcvRate('');
      setJustificacionBcv('');
      return;
    }
    setCargandoTasaFecha(true);
    try {
      const { euro, fechaValor } = await obtenerTasaEuroFecha(fecha);
      setCustomBcvRate(String(euro));
      setJustificacionBcv(`Tasa BCV Euro del ${fechaDMY(fecha)}${fechaValor !== fecha ? ` (publicada con fecha valor ${fechaDMY(fechaValor)})` : ''}`);
    } catch (e: any) {
      alert(e?.message || 'No se pudo obtener la tasa de esa fecha');
    } finally {
      setCargandoTasaFecha(false);
    }
  };

  // ── Monto acordado puntual (autorizado por la administración) ──
  // Solo para el inmueble indicado, solo en la fecha indicada y solo si se cobra TODA su deuda con retención 75%.
  // Ajusta el redondeo para que el total sea exactamente el monto acordado y el pago salde la deuda completa.
  const MONTOS_ACORDADOS: Record<string, { monto: number; fecha: string }> = {
    URB007447: { monto: 45008.92, fecha: '2026-10-06' },
  };
  const ajusteMontoAcordado = (() => {
    const hoyVE = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
    for (const [cod, acuerdo] of Object.entries(MONTOS_ACORDADOS)) {
      if (acuerdo.fecha !== hoyVE || retencionIVA !== 75) continue;
      const pendCod = recibos.filter((r: any) => (r.referencia || '').includes(cod) && isItemPending(r)).map((r: any) => r.referencia);
      const soloEste = selectedRecibos.length > 0 && selectedRecibos.every(ref => ref.includes(cod));
      const todos = pendCod.length > 0 && pendCod.every((ref: string) => selectedRecibos.includes(ref));
      if (!soloEste || !todos || selectedCuotas.length || selectedServicios.length || selectedTalaPoda.length) continue;
      const neto = Math.round(((sumBase + sumIVA + sumMulta) - (sumIVARetencionable * 0.75)) * 100) / 100;
      const diff = Math.round((acuerdo.monto - neto) * 100) / 100;
      if (Math.abs(diff) <= 1) return diff; // solo redondeo, nunca un cambio grande
    }
    return 0;
  })();

  const totalNetoAPagar = Math.max(0, Math.round(((sumBase + sumIVA + sumMulta) - montoRetencionIVARounded + ajusteMontoAcordado - (useSaldoFavor ? (foundUser?.SaldoFavor || 0) : 0)) * 100) / 100);

  /** Códigos de inmueble que toca el cobro actual / el contribuyente buscado. */
  const codigosDelCobro = (soloSeleccion: boolean): string[] => {
    const s = new Set<string>();
    const refs: string[] = soloSeleccion ? selectedRecibos : recibos.map((r: any) => r.referencia);
    refs.forEach((ref: string) => {
      const m = String(ref || '').toUpperCase().match(/^(?:RECIB-HIST-(.+)-M\d+|MULTA-(.+?)(?:-M\d+)?)$/);
      if (m) s.add(m[1] || m[2]);
    });
    if (!soloSeleccion || isCondominio) {
      const cod = String(foundUser?.CodCont || foundUser?.cod_cont || '').toUpperCase();
      if (cod) s.add(cod);
      condominioHijos.forEach((h: any) => h?.inmueble && s.add(String(h.inmueble).toUpperCase()));
    }
    return [...s].filter(c => codigosSeparados.has(c));
  };

  const handlePayment = async () => {
    const separadosEnCobro = codigosSeparados.size ? codigosDelCobro(true) : [];
    if (separadosEnCobro.length) {
      return alert(`Estos inmuebles pertenecen al módulo de CONDOMINIOS y se cobran en "Caja de Condominios":\n${separadosEnCobro.slice(0, 15).join(', ')}${separadosEnCobro.length > 15 ? '…' : ''}\n\nQuite esos meses de la selección o cobre en Condominios → Caja de Condominios.`);
    }
    const isAbonoCondo = isCondominio && condominioModo === 'Abono';
    if (!isAbonoCondo && totalBs <= 0) {
      if (isCondominio && condominioModo === 'Local') {
        return alert("Debe seleccionar al menos un local comercial para realizar el cobro.");
      }
      return alert("Debe seleccionar al menos una deuda a pagar.");
    }
    if (isAbonoCondo && (parseLocalFloat(montoAbonoCondo) <= 0 || isNaN(parseLocalFloat(montoAbonoCondo)))) {
      return alert("Debe ingresar un monto válido a abonar para el condominio.");
    }
    
    // El comprobante de retención de IVA es OPCIONAL en Caja (decisión del municipio)
    const calculatedTotalBs = Math.round((sumBase + sumIVA + sumMulta) * 100) / 100;
    const realMontoRetencionIVA = Math.round((sumIVARetencionable * (retencionIVA / 100)) * 100) / 100;
    const totalConImpuestos = Math.round((calculatedTotalBs - realMontoRetencionIVA + ajusteMontoAcordado) * 100) / 100;
    const maxSaldoUsable = foundUser?.SaldoFavor || 0;
    // Cuando el método de pago ES Saldo a Favor, el checkbox no aplica
    // (evita doble deducción: una por descuento + otra por el método)
    const descuentoSaldoFavor = (paymentMethod !== 'Saldo a Favor' && useSaldoFavor)
      ? Math.round(Math.min(totalConImpuestos, maxSaldoUsable) * 100) / 100
      : 0;
    const finalTotal = Math.max(0, Math.round((totalConImpuestos - descuentoSaldoFavor) * 100) / 100);
    
    let saldoAFavorNuevo = 0;
    let esAbono = isAbonoCondo;
    let montoReal = isAbonoCondo ? parseLocalFloat(montoAbonoCondo) : finalTotal;
    
    const reqRef = ['Transferencia', 'Deposito'].includes(paymentMethod);

    if (reqRef) {
      if (!banco) return alert("Debe seleccionar el banco emisor.");
      if (referencia.length !== 8) return alert("La referencia debe tener exactamente 8 caracteres.");
      if (!fechaTransaccion) return alert("La fecha de transacción es obligatoria.");
      
      // Verificar referencia duplicada (excluyendo pagos rechazados, anulados o reversados)
      const { data: dupCheck } = await supabase
        .from('pagos_reportados')
        .select('id')
        .eq('referencia', referencia)
        .not('estado', 'in', '(Rechazado,Anulado,Reversado)')
        .limit(1);
      if (dupCheck && dupCheck.length > 0) {
        return alert(`⚠️ ADVERTENCIA: El número de referencia "${referencia}" ya fue registrado previamente en el sistema. Verifique antes de continuar.`);
      }

      // Si existe algún pago previo rechazado con esta referencia, asegurar liberación previa
      await supabase
        .from('pagos_reportados')
        .update({ referencia: `RECH-${referencia}-${Date.now().toString().slice(-4)}` })
        .eq('referencia', referencia)
        .in('estado', ['Rechazado', 'Anulado', 'Reversado']);

      const transferido = Math.round(parseLocalFloat(montoTransferido) * 100) / 100;
      if (isNaN(transferido) || transferido <= 0) return alert("Debe ingresar un monto transferido válido.");
      
      const diffTransferido = Math.round((transferido - finalTotal) * 100) / 100;
      if (diffTransferido < -0.02 || isPagoMultiple) {
        esAbono = true;
        montoReal = transferido;
      } else if (diffTransferido > 0.02) {
        saldoAFavorNuevo = diffTransferido;
        montoReal = transferido;
      } else {
        // Pago exacto (dentro de tolerancia de 2 céntimos)
        esAbono = false;
        montoReal = finalTotal;
      }
    } else if (['Debito', 'Credito', 'TMD', 'TVD'].includes(paymentMethod)) {
      const cardLabel = paymentMethod === 'TMD' ? 'Tarjeta Master (TMD)' : paymentMethod === 'TVD' ? 'Tarjeta Visa (TVD)' : paymentMethod === 'Credito' ? 'Tarjeta de Crédito' : 'Punto de Venta';
      if (!referenciaDebito.trim()) return alert(`Debe ingresar el número de comprobante o referencia del pago por ${cardLabel}.`);
      if (referenciaDebito.trim().length !== 8) return alert(`El número de referencia para ${cardLabel} debe tener exactamente 8 caracteres.`);
      if (montoDebito && (parseLocalFloat(montoDebito) <= 0 || isNaN(parseLocalFloat(montoDebito)))) {
        return alert("Si ingresa un monto manual, debe ser un valor válido mayor a 0.");
      }
      // Use manual debit amount if provided
      if (montoDebito && parseLocalFloat(montoDebito) > 0) {
        montoReal = parseLocalFloat(montoDebito);
        const diffDeb = Math.round((montoReal - finalTotal) * 100) / 100;
        if (diffDeb > 0.02) {
          saldoAFavorNuevo = diffDeb;
        } else if (diffDeb < -0.02) {
          esAbono = true;
        }
      }
    } else if (paymentMethod === 'Saldo a Favor') {
      // El método paga con el saldo directamente (totalBs completo, sin descuento previo)
      const saldoDisponible = foundUser?.SaldoFavor || 0;
      if (saldoDisponible <= 0) return alert("El contribuyente no tiene Saldo a Favor disponible.");
      if (saldoDisponible < totalConImpuestos) {
        return alert(`Saldo a Favor insuficiente. Disponible: Bs. ${formatBs(saldoDisponible)}. Deuda total: Bs. ${formatBs(totalConImpuestos)}.\nUse otro método de pago o combínelo con el descuento de saldo parcial.`);
      }
      montoReal = totalConImpuestos; // Paga la deuda completa con el saldo
    }
    
    if (customBcvRate && !justificacionBcv.trim()) {
      return alert("Al modificar la Tasa BCV manualmente, debe ingresar una justificación obligatoria.");
    }
    
    // ── Abrir modal de confirmación en lugar de confirm() nativo ──
    setConfirmPayload({
      montoReal, finalTotal, totalConImpuestos, saldoAFavorNuevo, esAbono, descuentoSaldoFavor, reqRef, realMontoRetencionIVA, comprobanteRetencion,
      recibosSeleccionados: selectedRecibos,
      cuotasSeleccionadas: selectedCuotas,
      serviciosSeleccionados: selectedServicios,
      talaPodaSeleccionada: selectedTalaPoda,
    });
    setIsConfirmModalOpen(true);
  };

  const handleConfirmAndPay = async () => {
    if (!confirmPayload) return;
    const { montoReal, finalTotal, saldoAFavorNuevo, esAbono, descuentoSaldoFavor, reqRef, realMontoRetencionIVA, comprobanteRetencion } = confirmPayload;
    const totalConImpuestos = confirmPayload.totalConImpuestos ?? Math.round((finalTotal + (realMontoRetencionIVA || 0) + (descuentoSaldoFavor || 0)) * 100) / 100;
    const totalFacturaBruto = Math.round((totalConImpuestos + (realMontoRetencionIVA || 0)) * 100) / 100;
    const isAutoAprobado = ['Debito', 'Credito', 'Saldo a Favor', 'TMD', 'TVD'].includes(paymentMethod);
    setIsConfirmModalOpen(false);
    setIsProcessing(true);
    ultimoPagoIdRef.current = null;

    // ── GENERADOR UNIFICADO DE RECIBOS POR INMUEBLE ──
    const armarRecibosCobro = (params: {
      selectedRefs: string[];
      montoReal: number;
      paymentMethod: string;
      banco: string;
      referencia: string;
      esAbono: boolean;
      montoPendiente?: number;
      selectedHijosIds?: string[];
    }) => {
      const { selectedRefs, montoReal, paymentMethod, banco, referencia, esAbono, montoPendiente, selectedHijosIds } = params;
      const cajero_id_recibo = getCajeroId();
      const refNumBase = (referencia || Date.now().toString()).slice(-7).padStart(7, '0');

      const allInmsPool = [
        ...(freshInmuebles || []),
        ...(condominioHijos || []),
        ...((inmuebles as any[]) || []),
        ...getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser)
      ];
      const inmsByCode = new Map<string, any>();
      allInmsPool.forEach((i: any) => {
        if (i?.inmueble) {
          const k = String(i.inmueble).trim().toUpperCase();
          if (!inmsByCode.has(k)) inmsByCode.set(k, i);
        }
      });
      const userInmsRec = Array.from(inmsByCode.values());

      const primerInm = userInmsRec[0] || (freshInmuebles && freshInmuebles[0]) || {
        inmueble: foundUser.CodCont || foundUser.cod_cont || foundUser.Identidad,
        cod_cont: foundUser.CodCont || foundUser.cod_cont || foundUser.Identidad,
        contribuyente: foundUser.Contribuyente || '',
        direccion: foundUser.Direccion || 'NAGUANAGUA, CARABOBO',
        tipo: foundUser.Tipo || 'RESIDENCIAL'
      };

      const MESES_REC = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
      const getMesRec = (emision: string) => {
        if (!emision) return '---';
        const p = emision.split('-');
        return p.length >= 2 ? `${MESES_REC[parseInt(p[1])-1]} ${p[0]}` : emision;
      };
      const mesKeyDeRef = (ref: string): string | null => {
        const f = recibos.find((r: any) => r.referencia === ref);
        if (f?.emision) {
          const p = String(f.emision).split('-');
          if (p.length >= 2) return `${p[0]}-${p[1].slice(0, 2)}`;
        }
        const m = ref.match(/^RECIB-HIST-(.+)-M(\d+)$/);
        if (m) {
          const inmR = userInmsRec.find((i: any) => i.inmueble === m[1]);
          const total = Math.max(1, parseInt(inmR?.meses_deuda || '0') || 0);
          const hoyR = new Date();
          const d = new Date(hoyR.getFullYear(), hoyR.getMonth() - total + parseInt(m[2]) - 1, 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        const cm = ref.match(/-(\d{2})-(\d{4})$/);
        if (cm) return `${cm[2]}-${cm[1]}`;
        return null;
      };
      const etiquetaMes = (ref: string) => { const k = mesKeyDeRef(ref); return k ? getMesRec(k) : ''; };
      const periodoDeKeys = (keys: (string | null)[]) => {
        const ks = [...new Set(keys.filter(Boolean) as string[])].sort();
        if (ks.length === 0) return undefined;
        if (ks.length === 1) return getMesRec(ks[0]);
        return `DESDE ${getMesRec(ks[0])} HASTA ${getMesRec(ks[ks.length - 1])} (${ks.length} MESES)`;
      };
      const periodoDeRefs = (refs: string[]) => periodoDeKeys(refs.filter(r => !/^MULTA-/i.test(r)).map(mesKeyDeRef));

      const formaPagoLabel = paymentMethod === 'TMD' ? 'TMD (TARJETA CRÉDITO MASTER)'
        : paymentMethod === 'TVD' ? 'TVD (TARJETA CRÉDITO VISA)'
        : paymentMethod === 'Credito' ? 'TARJETA DE CRÉDITO'
        : paymentMethod === 'Debito' ? 'PUNTO DE VENTA (DÉBITO)'
        : paymentMethod === 'Transferencia' ? 'TRANSFERENCIA'
        : paymentMethod;

      const bancoLabel = ['Debito', 'Credito', 'TMD', 'TVD'].includes(paymentMethod) ? paymentMethod : (banco || paymentMethod || 'Caja');

      const resolverInmuebleDeRef = (ref: string) => {
        if (!ref) return primerInm;
        // 1. Coincidencia directa por objeto en lista de recibos
        const f = recibos.find((r: any) => r.referencia === ref);
        if (f?.inmueble) {
          const cod = String(f.inmueble).trim().toUpperCase();
          const match = userInmsRec.find((i: any) => String(i.inmueble || '').trim().toUpperCase() === cod);
          if (match) return match;
          return {
            inmueble: cod,
            cod_cont: cod,
            contribuyente: f.contribuyente || foundUser.Contribuyente || '',
            direccion: f.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO',
            tipo: f.clasificacion || foundUser.Tipo || 'RESIDENCIAL'
          };
        }
        // 2. Extraer código con regex para RECIB-HIST- (admite guiones en el código)
        const mHist = ref.match(/^RECIB-HIST-(.+)-M\d+$/i);
        if (mHist) {
          const cod = mHist[1].trim().toUpperCase();
          const match = userInmsRec.find((i: any) => String(i.inmueble || '').trim().toUpperCase() === cod);
          if (match) return match;
          return {
            inmueble: cod,
            cod_cont: cod,
            contribuyente: foundUser.Contribuyente || '',
            direccion: foundUser.Direccion || 'NAGUANAGUA, CARABOBO',
            tipo: foundUser.Tipo || 'RESIDENCIAL'
          };
        }
        // 3. Extraer código con regex para MULTA-
        const mMulta = ref.match(/^MULTA-(.+?)(?:-M\d+)?$/i);
        if (mMulta) {
          const cod = mMulta[1].trim().toUpperCase();
          const match = userInmsRec.find((i: any) => String(i.inmueble || '').trim().toUpperCase() === cod);
          if (match) return match;
          return {
            inmueble: cod,
            cod_cont: cod,
            contribuyente: foundUser.Contribuyente || '',
            direccion: foundUser.Direccion || 'NAGUANAGUA, CARABOBO',
            tipo: foundUser.Tipo || 'RESIDENCIAL'
          };
        }
        // 4. CM-
        if (ref.startsWith('CM-')) {
          const matchSub = userInmsRec.find((i: any) => i.inmueble && ref.toUpperCase().includes(String(i.inmueble).toUpperCase()));
          if (matchSub) return matchSub;
        }
        if (f?._inmId && f._inmId !== 'Facturación General' && f._inmId !== 'Acumulados') {
          const cod = String(f._inmId).trim().toUpperCase();
          const match = userInmsRec.find((i: any) => String(i.inmueble || '').trim().toUpperCase() === cod);
          if (match) return match;
        }
        // 5. Subcadena de algún código de inmueble en la referencia
        const matchSub = userInmsRec.find((i: any) => i.inmueble && ref.toUpperCase().includes(String(i.inmueble).toUpperCase()));
        if (matchSub) return matchSub;
        return primerInm;
      };

      const facturasPorInmueble: Record<string, { inm: any; refs: string[] }> = {};
      if (selectedRefs && selectedRefs.length > 0) {
        selectedRefs.forEach((ref: string) => {
          const inm = resolverInmuebleDeRef(ref);
          const inmKey = (inm?.inmueble || primerInm?.inmueble || '__general__').toUpperCase();
          if (!facturasPorInmueble[inmKey]) {
            facturasPorInmueble[inmKey] = { inm: inm || primerInm, refs: [] };
          }
          facturasPorInmueble[inmKey].refs.push(ref);
        });
      }

      if (selectedHijosIds && selectedHijosIds.length > 0) {
        selectedHijosIds.forEach((hId: string) => {
          const matchHijo = allInmsPool.find((i: any) => i.id === hId || i.inmueble === hId);
          if (matchHijo) {
            const inmKey = String(matchHijo.inmueble || matchHijo.id).toUpperCase();
            if (!facturasPorInmueble[inmKey]) {
              facturasPorInmueble[inmKey] = { inm: matchHijo, refs: [] };
            }
          }
        });
      }

      const grupos = Object.values(facturasPorInmueble);

      if (grupos.length === 0) {
        const activeUserInms = userInmsRec.filter((i: any) => (i.actividad_principal || '').toUpperCase() !== 'N/A' && i.inmueble);
        if (activeUserInms.length > 1) {
          const porcion = Math.round((montoReal / activeUserInms.length) * 100) / 100;
          return activeUserInms.map((inmItem: any, idx: number) => {
            const refNum = `${refNumBase}-${idx + 1}`;
            const esResInm = isResidencialInm(inmItem);
            return {
              reciboNo: refNum,
              controlWeb: `WEB-${refNum}`,
              fechaEmision: new Date().toISOString().split('T')[0],
              codContribuyente: inmItem?.inmueble || inmItem?.cod_cont || foundUser.Identidad || '',
              razonSocial: inmItem?.contribuyente || foundUser.Contribuyente || '',
              domicilioFiscal: ((inmItem?.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
              rifCi: foundUser.Identidad,
              caja: cajero_id_recibo,
              periodo: periodoDeRefs(selectedRefs),
              conceptos: [{
                descripcion: esAbono ? `Abono Parcial a Deuda - Inmueble ${inmItem?.inmueble || ''}` : `Servicio de Aseo Urbano - Inmueble ${inmItem?.inmueble || ''}`,
                precioUnit: porcion,
                total: porcion
              }],
              subTotal: porcion,
              exento: esResInm ? porcion : 0,
              iva: esResInm ? 0 : parseFloat((porcion - (porcion / 1.16)).toFixed(2)),
              total: porcion,
              formaPago: formaPagoLabel,
              banco: bancoLabel,
              referencia: referencia || 'N/A',
              tasaBcv: currentBcvRate || tcmmv || undefined,
              tipoContribuyente: esResInm ? 'Residencial' : 'Comercial',
              esAbono: !!esAbono,
              montoCancelado: esAbono ? porcion : undefined,
              montoPendiente: esAbono ? (montoPendiente ? Math.round((montoPendiente / activeUserInms.length) * 100) / 100 : undefined) : undefined,
              pageBreakBefore: idx > 0,
            };
          });
        }
        const singleInm = primerInm;
        const refNum = refNumBase;
        const esServicioDirecto = foundUser.isServicioEspecialDirecto || foundUser.Tipo === 'SERVICIO' || (selectedServicios.length > 0 && selectedRecibos.length === 0) || (selectedTalaPoda.length > 0 && selectedRecibos.length === 0);
        const srvObj = selectedServicios.length > 0 ? serviciosEsp.find(s => selectedServicios.includes(s.referencia)) : talaPoda.find(s => selectedTalaPoda.includes(s.referencia));
        const srvDesc = srvObj?.descripcion || (selectedTalaPoda.length > 0 ? 'Servicio de Tala y Poda' : 'Servicio Especial / Tasa Administrativa');
        const esResInm = esServicioDirecto ? true : isResidencialInm(singleInm);
        return [{
          reciboNo: refNum,
          controlWeb: `WEB-${refNum}`,
          fechaEmision: new Date().toISOString().split('T')[0],
          codContribuyente: singleInm?.inmueble || singleInm?.cod_cont || foundUser.Identidad || '',
          razonSocial: singleInm?.contribuyente || foundUser.Contribuyente || '',
          domicilioFiscal: ((singleInm?.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
          rifCi: foundUser.Identidad,
          caja: cajero_id_recibo,
          periodo: periodoDeRefs(selectedRefs),
          conceptos: [{
            descripcion: esAbono ? `Abono Parcial a Deuda - Inmueble ${singleInm?.inmueble || ''}` : (esServicioDirecto ? srvDesc : `Servicio de Aseo Urbano y Domiciliario`),
            precioUnit: montoReal,
            total: montoReal
          }],
          subTotal: montoReal,
          exento: esResInm ? montoReal : 0,
          iva: esResInm ? 0 : parseFloat((montoReal - (montoReal / 1.16)).toFixed(2)),
          total: montoReal,
          formaPago: formaPagoLabel,
          banco: bancoLabel,
          referencia: referencia || 'N/A',
          tasaBcv: currentBcvRate || tcmmv || undefined,
          tipoContribuyente: esResInm ? 'Residencial / Tasa' : 'Comercial',
          esAbono: !!esAbono,
          montoCancelado: esAbono ? montoReal : undefined,
          montoPendiente: esAbono ? montoPendiente : undefined,
          pageBreakBefore: false,
        }];
      }

      const recibosGenerados = grupos.map((grupo, idx) => {
        const inmGrupo = grupo.inm || primerInm;
        const esResInm = isResidencialInm(inmGrupo);
        const conceptosGrupo: any[] = [];
        let sumaBase = 0;
        let sumaIva = 0;
        let sumaMulta = 0;

        grupo.refs.forEach((ref: string) => {
          if (ref.startsWith('RECIB-HIST-')) {
            const pDet = pagosPendientes.find((p: any) => p.facturas && p.facturas[0]?.referencia === ref);
            if (pDet && pDet.facturas && pDet.facturas[0]) {
              const f = pDet.facturas[0];
              const b = parseFloat(f.base) || 0;
              const v = parseFloat(f.iva) || 0;
              const m = parseFloat(f.multa) || 0;
              sumaBase += b;
              sumaIva += v;
              sumaMulta += m;
              conceptosGrupo.push({ descripcion: `Aseo Urbano ${etiquetaMes(ref) || `M${f.mesNum}`} - Base Imponible`, precioUnit: b, total: b });
              if (v > 0) {
                conceptosGrupo.push({ descripcion: `Aseo Urbano ${etiquetaMes(ref) || `M${f.mesNum}`} - IVA (16%)`, precioUnit: v, total: v });
              }
              const porcentajeMulta = f.clasificacion?.toLowerCase().includes('residencial') ? '10%' : '12%';
              if (m > 0) {
                conceptosGrupo.push({ descripcion: `Aseo Urbano ${etiquetaMes(ref) || `M${f.mesNum}`} - Multa (${porcentajeMulta})`, precioUnit: m, total: m });
              }
            } else {
              const mMatch = ref.match(/^RECIB-HIST-(.+)-M(\d+)$/i);
              const inmId = mMatch ? mMatch[1] : (ref.split('-')[2] || '');
              const mesNum = mMatch ? parseInt(mMatch[2]) : 1;
              const inm = userInmsRec.find((i: any) => i.inmueble === inmId) || inmuebles.find((i: any) => i.inmueble === inmId) || inmGrupo;
              const esRes = isResidencialInm(inm);
              const bm = parseFloat(calcularMensualidad(inm, currentBcvRate).toFixed(2));
              const f = recibos.find((r: any) => r.referencia === ref);
              const emision = f?.emision ? new Date(f.emision) : new Date();
              const today = new Date();
              const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
              const totalMeses = Math.max(1, parseInt(inm?.meses_deuda || '1'));
              const isUltimoMes = mesNum >= totalMeses || monthsDiff <= 1;
              const esMesExon = isMesExoneradoMulta(inm?.notas, emision);
              const multa = (!isUltimoMes && monthsDiff > 1 && !esMesExon) ? parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2)) : 0;
              const iva = esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
              sumaBase += bm;
              sumaIva += iva;
              sumaMulta += multa;
              conceptosGrupo.push({ descripcion: `Aseo Urbano ${etiquetaMes(ref) || `M${mesNum}`} - Base Imponible`, precioUnit: bm, total: bm });
              if (iva > 0) {
                conceptosGrupo.push({ descripcion: `Aseo Urbano ${etiquetaMes(ref) || `M${mesNum}`} - IVA (16%)`, precioUnit: iva, total: iva });
              }
              if (multa > 0) {
                conceptosGrupo.push({ descripcion: `Aseo Urbano ${etiquetaMes(ref) || `M${mesNum}`} - Multa (${esRes ? '10%' : '12%'})`, precioUnit: multa, total: multa });
              }
            }
          } else if (ref.startsWith('MULTA-')) {
            const f = recibos.find((r: any) => r.referencia === ref);
            const montoF = f ? parseFloat(getReciboMonto(f) || '0') : 0;
            sumaMulta += montoF;
            conceptosGrupo.push({
              descripcion: f?.descripcion || `Multa Municipal por Mora - Inmueble ${inmGrupo?.inmueble || ''}`,
              precioUnit: montoF,
              total: montoF
            });
          } else {
            const f = recibos.find((r: any) => r.referencia === ref);
            const montoF = f ? parseFloat(getReciboMonto(f) || '0') : 0;
            if (esResInm) {
              sumaBase += montoF;
            } else {
              const b = parseFloat((montoF / 1.16).toFixed(2));
              const v = parseFloat((montoF - b).toFixed(2));
              sumaBase += b;
              sumaIva += v;
            }
            conceptosGrupo.push({
              descripcion: f?.descripcion || `Servicio Aseo Residencial/Comercial. Correspondiente al mes de: ${getMesRec(f?.emision || '')}`,
              precioUnit: montoF,
              total: montoF
            });
          }
        });

        let totalGrupo = parseFloat((sumaBase + sumaIva + sumaMulta).toFixed(2));
        if (totalGrupo <= 0) {
          totalGrupo = conceptosGrupo.reduce((s: number, c: any) => s + c.total, 0);
        }

        // Si no es abono y hay un solo grupo, garantizar que totalGrupo coincida exactamente con montoReal
        if (!esAbono && grupos.length === 1 && montoReal > 0) {
          if (Math.abs(totalGrupo - montoReal) <= 0.05) {
            if (totalGrupo !== montoReal && conceptosGrupo.length > 0) {
              const diffCent = Math.round((montoReal - totalGrupo) * 100) / 100;
              const lastC = conceptosGrupo[conceptosGrupo.length - 1];
              lastC.total = Math.round((lastC.total + diffCent) * 100) / 100;
              lastC.precioUnit = lastC.total;
            }
            totalGrupo = montoReal;
          }
        }

        if (esAbono && grupos.length === 1 && montoReal > 0) {
          totalGrupo = montoReal;
          conceptosGrupo.length = 0;
          conceptosGrupo.push({
            descripcion: `Abono Parcial a Deuda - Inmueble ${inmGrupo?.inmueble || ''}`,
            precioUnit: montoReal,
            total: montoReal
          });
        } else if (esAbono && grupos.length > 1 && montoReal > 0) {
          const sumTotales = grupos.reduce((acc, g) => acc + (g.refs.length || 1), 0);
          const porcion = Math.round((montoReal * ((grupo.refs.length || 1) / (sumTotales || 1))) * 100) / 100;
          totalGrupo = porcion;
          conceptosGrupo.length = 0;
          conceptosGrupo.push({
            descripcion: `Abono Parcial a Deuda - Inmueble ${inmGrupo?.inmueble || ''}`,
            precioUnit: porcion,
            total: porcion
          });
        } else if (totalGrupo <= 0 && grupos.length > 1 && montoReal > 0) {
          const porcion = Math.round((montoReal / grupos.length) * 100) / 100;
          totalGrupo = porcion;
          conceptosGrupo.push({
            descripcion: `Servicio de Aseo Urbano - Inmueble ${inmGrupo?.inmueble || ''}`,
            precioUnit: porcion,
            total: porcion
          });
        }

        const refNum = grupos.length > 1 ? `${refNumBase}-${idx + 1}` : refNumBase;
        const subTotalCalculado = esResInm ? totalGrupo : (sumaBase > 0 ? parseFloat((sumaBase + sumaMulta).toFixed(2)) : parseFloat((totalGrupo / 1.16).toFixed(2)));
        const ivaCalculado = esResInm ? 0 : (sumaIva > 0 ? sumaIva : parseFloat((totalGrupo - subTotalCalculado).toFixed(2)));
        const exentoCalculado = esResInm ? totalGrupo : (sumaMulta > 0 ? sumaMulta : 0);

        return {
          reciboNo: refNum,
          controlWeb: `WEB-${refNum}`,
          fechaEmision: new Date().toISOString().split('T')[0],
          codContribuyente: inmGrupo?.inmueble || inmGrupo?.cod_cont || inmGrupo?.id || foundUser.Identidad,
          razonSocial: inmGrupo?.contribuyente || foundUser.Contribuyente || '',
          domicilioFiscal: ((inmGrupo?.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
          rifCi: foundUser.Identidad,
          caja: cajero_id_recibo,
          conceptos: conceptosGrupo.length > 0 ? conceptosGrupo : [{
            descripcion: `Servicio de Aseo Urbano - Inmueble ${inmGrupo?.inmueble || ''}`,
            precioUnit: totalGrupo || montoReal,
            total: totalGrupo || montoReal
          }],
          subTotal: subTotalCalculado,
          exento: exentoCalculado,
          iva: ivaCalculado,
          total: totalGrupo || montoReal,
          formaPago: formaPagoLabel,
          banco: bancoLabel,
          referencia: referencia || 'N/A',
          tasaBcv: currentBcvRate || tcmmv || undefined,
          tipoContribuyente: esResInm ? 'Residencial' : 'Comercial',
          periodo: periodoDeRefs(grupo.refs),
          esAbono: !!esAbono,
          montoCancelado: esAbono ? (totalGrupo || montoReal) : undefined,
          montoPendiente: esAbono ? montoPendiente : undefined,
          pageBreakBefore: idx > 0,
        };
      });

      return recibosGenerados;
    };
    
    try {
      // ── CONTROL DE CONCURRENCIA ATÓMICO (PREVENCIÓN DE COBRO DOBLE MULTI-OPERADOR) ──
      const realReceiptsToCheck = selectedRecibos.filter(r => !r.startsWith('RECIB-HIST-') && !r.startsWith('dummy-'));
      if (realReceiptsToCheck.length > 0) {
        const { data: alreadyPaid } = await supabase
          .from('facturas')
          .select('referencia, estado')
          .in('referencia', realReceiptsToCheck)
          .in('estado', ['Pagado', 'Por Verificar']);

        if (alreadyPaid && alreadyPaid.length > 0) {
          const refs = alreadyPaid.map((f: any) => f.referencia).join(', ');
          setIsProcessing(false);
          alert(`⚠️ OPERACIÓN DETENIDA: El trámite/recibo (${refs}) acaba de ser procesado o pagado por otro operador en este instante. Se canceló automáticamente para evitar cobros dobles.`);
          return;
        }
      }

      // Si se están liquidando multas o deudas históricas de inmuebles, verificar que sigan teniendo deuda en BD
      const histRefs = selectedRecibos.filter(r => r.startsWith('RECIB-HIST-') || r.startsWith('MULTA-'));
      if (histRefs.length > 0 && !reqRef && !esAbono) {
        const userInmCodes = (freshInmuebles.length > 0 ? freshInmuebles : inmuebles)
          .filter((i: any) => (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase())
          .map((i: any) => i.inmueble)
          .filter(Boolean);

        if (userInmCodes.length > 0) {
          const { data: dbCheckInms } = await supabase
            .from('inmuebles')
            .select('inmueble, deuda_mmv, multa_bs, deuda_congelada_bs, meses_deuda')
            .in('inmueble', userInmCodes);

          const isAlreadyClean = dbCheckInms && dbCheckInms.length > 0 && dbCheckInms.every((i: any) =>
            parseFloat(i.deuda_mmv || '0') <= 0 &&
            parseFloat(i.multa_bs || '0') <= 0 &&
            parseFloat(i.deuda_congelada_bs || '0') <= 0 &&
            parseInt(i.meses_deuda || '0') <= 0
          );

          if (isAlreadyClean) {
            setIsProcessing(false);
            alert(`⚠️ ATENCIÓN: La deuda de este contribuyente ya fue cancelada en otro puesto de cobro hace unos instantes. No se realizó ningún cargo duplicado.`);
            return;
          }
        }
      }

      // Si hay saldo a favor nuevo, generar Nota de Crédito
      if (saldoAFavorNuevo > 0) {
        await supabase.from('documentos').insert([{
          identidad: foundUser.Identidad,
          contribuyente: foundUser.Contribuyente,
          tipo: 'Nota de Credito',
          estado: 'Vigente',
          detalles: JSON.stringify({
            monto: formatBs(saldoAFavorNuevo),
            origen_referencia: reqRef ? referencia : 'Debito',
            fecha_emision: new Date().toISOString()
          })
        }]);
        // ─ Acreditar nuevo Saldo a Favor para métodos inmediatos (débito, crédito, punto, etc.) ─
        if (!reqRef || isAutoAprobado) {
          const result = await acreditarSaldoFavor(foundUser.Identidad, saldoAFavorNuevo, foundUser.CodCont || foundUser.cod_cont);
          if (!result.ok) console.error('Error acreditando saldo:', result.error);
        }
      }
      
      // ─ Descontar Saldo a Favor usado como descuento (fix I-6) ─
      if (descuentoSaldoFavor > 0) {
        const result = await descontarSaldoFavor(foundUser.Identidad, descuentoSaldoFavor);
        if (!result.ok) console.error('Error descontando saldo:', result.error);
      }

      // ─ Pago con método Saldo a Favor: descontar el monto completo (fix I-6) ─
      if (paymentMethod === 'Saldo a Favor') {
        const result = await descontarSaldoFavor(foundUser.Identidad, montoReal);
        if (!result.ok) console.error('Error al pagar con Saldo a Favor:', result.error);
      }

      // Detect abono: montoDebito provided and < finalTotal, o marcado como abono/pago multiple
      const diffDebito = montoDebito && parseLocalFloat(montoDebito) > 0 ? (confirmPayload.finalTotal + confirmPayload.descuentoSaldoFavor) - parseLocalFloat(montoDebito) : 0;
      const esAbonoParcial = (diffDebito > 0.02) || !!confirmPayload.esAbono || (montoReal < (confirmPayload.finalTotal + confirmPayload.descuentoSaldoFavor) - 0.02);
      const esAbonoDebito = esAbonoParcial;

      if (isAutoAprobado) {
        const formalRefs = selectedRecibos.filter(r => !r.startsWith('RECIB-HIST-') && !r.startsWith('MULTA-') && r !== 'RECIB-DEUDA');
        if (!esAbonoDebito) {
          // === PAGO COMPLETO: marcar todas las recibos formales como Pagado ===
          if (formalRefs.length > 0) {
            const { error: fErr } = await supabase
              .from('facturas')
              .update({ estado: 'Pagado' })
              .in('referencia', formalRefs);
            if (fErr) throw fErr;
          }
        } else {
          // === ABONO PARCIAL: descontar monto de las recibos formales ===
          let dineroDisponibleFacs = montoReal + (confirmPayload.realMontoRetencionIVA || 0) + (confirmPayload.descuentoSaldoFavor || 0);
          for (const ref of formalRefs) {
            const f = recibos.find(r => r.referencia === ref);
            if (!f) continue;
            const montoFac = parseFloat(getReciboMonto(f) || '0');
            if (dineroDisponibleFacs >= montoFac - 0.01) {
              // Recibo cubierta completamente
              dineroDisponibleFacs = Math.max(0, dineroDisponibleFacs - montoFac);
              const { error: fErr } = await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', ref);
              if (fErr) throw fErr;
            } else if (dineroDisponibleFacs > 0.01) {
              // Abono parcial: actualizar monto restante (mantener Pendiente)
              const montoRestante = (montoFac - dineroDisponibleFacs).toFixed(2);
              const { error: fErr } = await supabase.from('facturas').update({ monto: montoRestante, estado: 'Abonado' }).eq('referencia', ref);
              if (fErr) throw fErr;
              dineroDisponibleFacs = 0;
            }
            // Si dineroDisponible <= 0, la recibo queda Pendiente sin cambios
          }
        }
        
        if (selectedCuotas.length > 0) {
          // Group by convenio
          const convMap = new Map();
          selectedCuotas.forEach(sc => {
            const cq = cuotas.find(q => q.convId === sc.convId && q.cuotaId === sc.cuotaId);
            if (cq) {
              if (!convMap.has(sc.convId)) convMap.set(sc.convId, { raw: cq.rawConv, toUpdate: [] });
              convMap.get(sc.convId).toUpdate.push(sc.cuotaId);
            }
          });
          
          for (const [cId, data] of convMap.entries()) {
            let parsed = [];
            try { parsed = JSON.parse(data.raw.detalle_cuotas); } catch(e){}
            parsed.forEach((c: any) => {
              if (data.toUpdate.includes(c.id)) {
                c.estado = 'Pagado';
              }
            });
            await supabase.from('convenios').update({ detalle_cuotas: JSON.stringify(parsed) }).eq('id', cId);
          }
        }
        
        // Tala y Poda debito: pagar completo
        if (selectedTalaPoda.length > 0 && !esAbonoDebito) {
          await updateServiciosEspecialesEstado(selectedTalaPoda, 'Pagado');
        }
        // Servicios especiales: solo se pagan completos (no hay abono parcial)
        if (selectedServicios.length > 0) {
          if (!esAbonoDebito) {
            // Pago completo - marcar todos como Pagado
            await updateServiciosEspecialesEstado(selectedServicios, 'Pagado');
          } else {
            // Abono: calcular dinero restante despues de cubrir recibos
            let dineroPagado = 0;
            for (const ref of selectedRecibos) {
              const f = recibos.find(r => r.referencia === ref);
              if (f) dineroPagado += parseFloat(getReciboMonto(f) || '0');
            }
            let dineroRestanteParaServicios = Math.max(0, parseLocalFloat(montoDebito) - dineroPagado);
            
            for (const ref of selectedServicios) {
              const s = serviciosEsp.find(sv => sv.referencia === ref);
              if (!s) continue;
              const montoS = parseFloat(s.monto || '0');
              if (dineroRestanteParaServicios >= montoS - 0.01) {
                // Alcanza para cubrir el servicio completo
                dineroRestanteParaServicios = Math.max(0, dineroRestanteParaServicios - montoS);
                await updateServiciosEspecialesEstado([ref], 'Pagado');
              }
              // Si no alcanza: el servicio queda Pendiente INTACTO (sin modificar el monto)
            }
          }
        }

        const cajero_id = getCajeroId();

        if (justificacionBcv) {
          logAudit('Tasa BCV Modificada en Caja (Debito)', {
            identidad: foundUser.Identidad,
            tasa_aplicada: customBcvRate,
            justificacion: justificacionBcv,
          }, 'TASA');
        }

        const pagoId = crypto.randomUUID();
        const deudaPrevia = await snapshotDeudaPrevia(foundUser.Identidad, condominioHijos.map((h: any) => h.id));
        const hoyStr = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
        const fechaUTC = fechaCorteCaja === hoyStr 
          ? new Date().toISOString() 
          : new Date(`${fechaCorteCaja}T12:00:00-04:00`).toISOString();

        // Subir comprobante de pago si fue adjuntado
        let comprobanteUrl = '';
        let comprobanteB64 = '';
        if (comprobante) {
          try {
            const ext = comprobante.name.split('.').pop() || 'jpg';
            const filePath = `comprobantes/${(foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}.${ext}`;
            const uploadData = new FormData();
            uploadData.append('file', comprobante);
            uploadData.append('bucket', 'comprobantes');
            uploadData.append('path', filePath);
            const res = await fetch('/api/upload', { method: 'POST', body: uploadData });
            const resData = await res.json();
            if (res.ok && resData.success) comprobanteUrl = resData.publicUrl || '';
          } catch(e) {}
          if (!comprobanteUrl && comprobante.size < 5 * 1024 * 1024) {
            try {
              comprobanteB64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(comprobante);
              });
            } catch(e) {}
          }
        }

        // Subir comprobante de retención si fue adjuntado
        let compRetUrl = '';
        let compRetB64 = '';
        if (comprobanteRetencionFile) {
          try {
            const ext = comprobanteRetencionFile.name.split('.').pop() || 'pdf';
            const filePath = `retenciones/${(foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}.${ext}`;
            const uploadData = new FormData();
            uploadData.append('file', comprobanteRetencionFile);
            uploadData.append('bucket', 'retenciones');
            uploadData.append('path', filePath);
            const res = await fetch('/api/upload', { method: 'POST', body: uploadData });
            const resData = await res.json();
            if (res.ok && resData.success) compRetUrl = resData.publicUrl || '';
          } catch(e) {}
          if (!compRetUrl && comprobanteRetencionFile.size < 5 * 1024 * 1024) {
            try {
              compRetB64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(comprobanteRetencionFile);
              });
            } catch(e) {}
          }
        }

        const { error: insertErr } = await supabase.from('pagos_reportados').insert({
          id: pagoId,
          identidad: foundUser.Identidad,
          monto: montoReal,
          banco: paymentMethod === 'TMD' ? 'PUNTO TMD (MASTER)' : paymentMethod === 'TVD' ? 'PUNTO TVD (VISA)' : paymentMethod === 'Credito' ? 'PUNTO CRÉDITO' : paymentMethod,
          referencia: reqRef ? referencia : referenciaDebito,
          tipo: paymentMethod,
          estado: 'Aprobado',
          created_at: fechaUTC,
          detalles: JSON.stringify({
            contribuyente: foundUser.Contribuyente,
            contribuyente_nombre: foundUser.Contribuyente,
            recibos: selectedRecibos,
            cuotas: selectedCuotas,
            servicios: selectedServicios,
            tala_poda: selectedTalaPoda,
            cajero: cajero_id,
            es_abono: esAbonoDebito,
            monto_abonado: esAbonoDebito ? montoReal : undefined,
            tasa_bcv: currentBcvRate,
            deuda_total_sistema: foundUser.DeudaTotal,
            fecha_transaccion: fechaTransaccion,
            tasa_bcv_aplicada: customBcvRate ? customBcvRate : undefined,
            nota_cambio_tasa: justificacionBcv ? justificacionBcv : undefined,
            iva_percent: ivaPercent,
            es_condominio: isCondominio,
            condominio_modo: condominioModo,
            condominio_hijos_pagados: condominioModo === 'Local' ? selectedHijos : (condominioModo === 'Total' ? condominioHijos.map(h => h.id) : []),
            deuda_previa: deudaPrevia,
            // Comprobantes
            comprobante_url: comprobanteUrl || undefined,
            comprobante_b64: comprobanteB64 || undefined,
            comprobante_nombre: comprobante?.name || undefined,
            comprobante_retencion_url: compRetUrl || undefined,
            comprobante_retencion_b64: compRetB64 || undefined,
            comprobante_retencion_nombre: comprobanteRetencionFile?.name || undefined,
            // Desglose del pago por encima para la factura electrónica:
            saldo_favor: saldoAFavorNuevo,
            saldo_a_favor_nuevo: saldoAFavorNuevo > 0 ? saldoAFavorNuevo : undefined,
            monto_sobrante: saldoAFavorNuevo > 0 ? saldoAFavorNuevo : undefined,
            saldo_usado: descuentoSaldoFavor > 0 ? descuentoSaldoFavor : undefined,
            descuento_saldo_favor: descuentoSaldoFavor > 0 ? descuentoSaldoFavor : undefined,
            saldo_favor_usado: descuentoSaldoFavor > 0 ? descuentoSaldoFavor : undefined,
            monto_factura: (realMontoRetencionIVA > 0) ? totalFacturaBruto : totalConImpuestos, // Monto total bruto de la factura fiscal
            monto_neto_factura: finalTotal,
            total_seleccionado: totalBs,
            monto_retencion_iva: esAbonoDebito ? 0 : realMontoRetencionIVA,
            es_retencion: esAbonoDebito ? false : (realMontoRetencionIVA > 0),
            agente_retencion: esAbonoDebito ? false : (realMontoRetencionIVA > 0)
          })
        });
        if (insertErr) {
          console.error('Error insertando pago:', insertErr);
          throw new Error('No se pudo registrar el pago: ' + insertErr.message);
        }
        ultimoPagoIdRef.current = pagoId;
        // ── GENERAR COMPROBANTE DE RETENCIÓN DE IVA COMO NOTA DE CRÉDITO ──
        // REGLA: La retención solo se genera/aplica cuando se cubra el pago total del mes (no para abonos parciales)
        if (realMontoRetencionIVA > 0 && !esAbonoDebito) {
          const pagoRetId = crypto.randomUUID();
          await supabase.from('pagos_reportados').insert({
            id: pagoRetId,
            identidad: foundUser.Identidad,
            monto: realMontoRetencionIVA,
            banco: 'N/A',
            referencia: comprobanteRetencion || 'RET-' + Date.now().toString().slice(-6),
            tipo: 'Retencion de IVA',
            estado: 'Aprobado',
            created_at: fechaUTC,
            detalles: JSON.stringify({
              cajero: cajero_id,
              es_abono: false,
              pago_vinculado: pagoId,
              nota: 'Generado automáticamente por retención de agente.'
            })
          });
        }


        // ── TFHKA FACTURACIÓN DIGITAL (antes de limpiar deuda para tener los montos) ──
        if (pagoId) {
          try {
            // Para condominios, se emite UNA SOLA factura digital al condominio padre, NO a los locales individuales
            let digitalRecibos = [...selectedRecibos];
            let digitalMontos = selectedRecibos.reduce((acc: Record<string, number>, ref: string) => {
              acc[ref] = reciboMontoMap.get(ref) ?? 0;
              return acc;
            }, {} as Record<string, number>);

            if (isCondominio) {
              const refCondo = `CONDO-${foundUser.CodCont || foundUser.cod_cont || 'PADRE'}-${Date.now().toString().slice(-6)}`;
              digitalRecibos = [refCondo];
              digitalMontos = { [refCondo]: montoReal };
            }

            // Guardar detalles preparados para emisión manual controlada en el módulo de Facturación Electrónica
            const { data: currentPago } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoId).single();
            let currentDetalles: any = currentPago?.detalles || {};
            if (typeof currentDetalles === 'string') {
              try { currentDetalles = JSON.parse(currentDetalles); } catch(e) { currentDetalles = {}; }
            }
            if (!esAbonoDebito) {
              currentDetalles.factura_digital = currentDetalles.factura_digital || {
                emitida: false,
                pendiente: true,
                preparada_at: new Date().toISOString()
              };
            }
            currentDetalles.recibos = digitalRecibos;
            currentDetalles.montos = digitalMontos;
            currentDetalles.contribuyente = foundUser.Contribuyente;
            currentDetalles.identidad = foundUser.Identidad;
            currentDetalles.montoTotal = totalFacturaBruto;
            currentDetalles.saldo_favor = saldoAFavorNuevo;
            currentDetalles.saldo_a_favor_nuevo = saldoAFavorNuevo > 0 ? saldoAFavorNuevo : undefined;
            currentDetalles.monto_sobrante = saldoAFavorNuevo > 0 ? saldoAFavorNuevo : undefined;
            currentDetalles.monto_factura = totalFacturaBruto;
            currentDetalles.monto_neto_factura = finalTotal;
            currentDetalles.saldo_usado = descuentoSaldoFavor > 0 ? descuentoSaldoFavor : undefined;
            currentDetalles.descuento_saldo_favor = descuentoSaldoFavor > 0 ? descuentoSaldoFavor : undefined;
            currentDetalles.saldo_favor_usado = descuentoSaldoFavor > 0 ? descuentoSaldoFavor : undefined;
            currentDetalles.monto_retencion_iva = esAbonoDebito ? 0 : realMontoRetencionIVA;
            currentDetalles.es_retencion = esAbonoDebito ? false : (realMontoRetencionIVA > 0);
            currentDetalles.agente_retencion = esAbonoDebito ? false : (realMontoRetencionIVA > 0);
            currentDetalles.isCondominio = isCondominio;
            const fpsList: any[] = [];
            if (finalTotal > 0 || paymentMethod !== 'Saldo a Favor') {
              fpsList.push({
                descripcion: paymentMethod === 'TMD' ? 'TARJETA DE CRÉDITO MASTER (TMD)' : paymentMethod === 'TVD' ? 'TARJETA DE CRÉDITO VISA (TVD)' : paymentMethod === 'Credito' ? 'TARJETA DE CRÉDITO' : paymentMethod === 'Debito' ? 'TARJETA DE DÉBITO' : paymentMethod,
                fecha: new Date().toISOString(),
                forma: paymentMethod === 'Debito' ? '05' : ['Credito', 'TMD', 'TVD'].includes(paymentMethod) ? '06' : '99',
                banco: banco || undefined,
                referencia: reqRef ? referencia : referenciaDebito || undefined,
                monto: finalTotal
              });
            }
            if (descuentoSaldoFavor > 0) {
              fpsList.push({
                descripcion: 'COMPENSACIÓN (NOTA DE CRÉDITO / SALDO A FAVOR)',
                fecha: new Date().toISOString(),
                forma: '99',
                referencia: 'NC-SALDO-FAVOR',
                monto: descuentoSaldoFavor
              });
            }
            currentDetalles.formasPago = fpsList;
            await actualizarPago(pagoId, { detalles: currentDetalles });
          } catch(err) {
            console.error('Error guardando datos para factura digital', err);
          }
        }

        // ── LIMPIAR O REDUCIR DEUDA DE INMUEBLES (RECIB-HIST-* o RECIB-DEUDA) ──
        const histRefs = selectedRecibos.filter(r => r.startsWith('RECIB-HIST-'));
        if (selectedRecibos.includes('RECIB-DEUDA') || histRefs.length > 0 || esAbonoDebito) {
          // Leer la deuda ACTUAL de la BD (no la cargada en pantalla): en un pago múltiple el comprobante
          // anterior ya redujo la deuda, y usar datos viejos hacía que el siguiente no se aplicara bien.
          const { data: inmsBD, error: inmsBDErr } = await supabase
            .from('inmuebles')
            .select('*')
            .eq('identidad', foundUser.Identidad);
          if (inmsBDErr) throw new Error('No se pudo leer la deuda actual del inmueble: ' + inmsBDErr.message);
          const sourceInms = (inmsBD && inmsBD.length > 0) ? inmsBD : (freshInmuebles.length > 0 ? freshInmuebles : inmuebles);
          const userInmsClean = sourceInms.filter((i: any) =>
            (i.identidad || '').replace(/-/g,'').toUpperCase() === 
            (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
          );

          if (!esAbonoDebito) {
            // === PAGO COMPLETO DE LOS MESES SELECCIONADOS ===
            for (const inm of userInmsClean) {
              const histRefsThisInm = histRefs.filter(r => r.includes(`-${inm.inmueble || inm.codigo}-`));
              const numMesesInm = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
              if (selectedRecibos.includes('RECIB-DEUDA') || (histRefsThisInm.length >= numMesesInm && numMesesInm > 0)) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0, saldo_favor_bs: 0 }).eq('id', inm.id);
              } else if (histRefsThisInm.length > 0) {
                const nuevoMeses = Math.max(0, numMesesInm - histRefsThisInm.length);
                const d = parseFloat(String(inm.deuda_mmv || 0));
                const m = parseFloat(String(inm.multa_bs || 0));
                const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
                const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));
                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: nuevaDeudaMMV,
                  multa_bs: nuevaMultaBs,
                  saldo_favor_bs: 0,
                  ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                }).eq('id', inm.id);
              }
            }
          } else {
            // === ABONO PARCIAL / PAGO MÚLTIPLE: DESCONTAR MES A MES LO QUE ALCANCE ===
            let dineroParaInms = montoReal + (confirmPayload.realMontoRetencionIVA || 0) + (confirmPayload.descuentoSaldoFavor || 0);

            // Descontar facturas formales no históricas
            const formalRefs = selectedRecibos.filter(r => !r.startsWith('RECIB-HIST-') && !r.startsWith('MULTA-') && r !== 'RECIB-DEUDA');
            for (const ref of formalRefs) {
              const f = recibos.find((r: any) => r.referencia === ref);
              if (f) {
                const montoF = parseFloat(getReciboMonto(f) || '0');
                dineroParaInms = Math.max(0, dineroParaInms - montoF);
              }
            }
            // Descontar cuotas
            for (const sc of selectedCuotas) {
              const c = cuotas.find((q: any) => q.convId === sc.convId && q.cuotaId === sc.cuotaId);
              if (c) dineroParaInms = Math.max(0, dineroParaInms - parseFloat(c.monto || '0'));
            }
            // Descontar servicios
            for (const ref of selectedServicios) {
              const s = serviciosEsp.find((sv: any) => sv.referencia === ref);
              if (s) {
                const ucd = Number(s.valor_ucd || 0);
                const fac = Number(s.factor || 1);
                const nve = Number(s.nve || 1);
                const baseS = (ucd > 0 && currentBcvRate && currentBcvRate > 0) ? Math.round(ucd * fac * nve * currentBcvRate * 100) / 100 : parseFloat(s.monto || '0');
                dineroParaInms = Math.max(0, dineroParaInms - baseS);
              }
            }

            // Descontar multas separadas
            const multaRefsAbono = selectedRecibos.filter(r => r.startsWith('MULTA-'));
            for (const mRef of multaRefsAbono) {
              const f = recibos.find((r: any) => r.referencia === mRef);
              if (f) {
                const montoM = parseFloat(getReciboMonto(f) || '0');
                if (dineroParaInms >= montoM - 0.01) {
                  dineroParaInms = Math.max(0, dineroParaInms - montoM);
                  const inmCode = mRef.replace('MULTA-', '');
                  await supabase.from('inmuebles').update({ multa_bs: 0, deuda_congelada_bs: 0 }).eq('inmueble', inmCode);
                }
              }
            }

            const inmsToProcess = userInmsClean.filter(inm => {
              const histRefsThisInm = histRefs.filter(r => r.includes(`-${inm.inmueble || inm.codigo}-`));
              return histRefsThisInm.length > 0 || selectedRecibos.includes('RECIB-DEUDA');
            });

            for (let idx = 0; idx < inmsToProcess.length; idx++) {
              const inm = inmsToProcess[idx];
              const isLastInm = idx === inmsToProcess.length - 1;

              const histRefsThisInm = histRefs.filter(r => r.includes(`-${inm.inmueble || inm.codigo}-`));
              const mesesBD = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
              // meses_deuda = 0 con deuda guardada (deuda_mmv / congelada) = 1 mes pendiente (misma regla que muestra la Caja).
              const tieneResiduo = parseFloat(String(inm.deuda_mmv || 0)) > 0 || parseFloat(String(inm.deuda_congelada_bs || 0)) > 0;
              const numMesesInm = mesesBD > 0 ? mesesBD : (tieneResiduo ? 1 : 0);
              
              if (numMesesInm <= 0) continue;

              const bMes = calcularMensualidad(inm, currentBcvRate);
              const esRes = isResidencialInm(inm);
              const ivaMes = esRes ? 0 : Math.round((bMes * 0.16) * 100) / 100;
              const tasaMora = esRes ? 0.10 : 0.12;

              const saldoActual = parseFloat(String(inm.saldo_favor_bs || '0')) || 0;
              let dineroLocal = dineroParaInms + saldoActual;

              let mesesCubiertos = 0;
              const maxMeses = Math.min(numMesesInm, histRefsThisInm.length > 0 ? histRefsThisInm.length : numMesesInm);
              
              for (let m = 1; m <= maxMeses; m++) {
                const isUltimo = (m >= numMesesInm);
                const multaMes = isUltimo ? 0 : Math.round((bMes * tasaMora) * 100) / 100;
                const costoMes = Math.round((bMes + ivaMes) * 100) / 100 + multaMes;

                if (dineroLocal >= costoMes - 0.01) {
                  dineroLocal = Math.max(0, dineroLocal - costoMes);
                  mesesCubiertos++;
                } else {
                  break; 
                }
              }

              const nuevoMeses = Math.max(0, numMesesInm - mesesCubiertos);
              const d = parseFloat(String(inm.deuda_mmv || 0));
              const m = parseFloat(String(inm.multa_bs || 0));
              const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
              const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));

              let nuevoSaldo = 0;
              if (dineroLocal > dineroParaInms) {
                // We didn't consume all of saldoActual
                nuevoSaldo = dineroLocal - dineroParaInms;
              } else {
                // We consumed all of saldoActual, AND some of dineroParaInms
                dineroParaInms = dineroLocal; // Remaining global money
                nuevoSaldo = 0;
              }

              // Si es el último inmueble que estamos procesando, el sobrante global se le abona a él
              if (isLastInm && dineroParaInms > 0.01) {
                nuevoSaldo += dineroParaInms;
                dineroParaInms = 0;
              }
              
              nuevoSaldo = parseFloat(nuevoSaldo.toFixed(2));

              const { error: eAbono } = await supabase.from('inmuebles').update({
                meses_deuda: nuevoMeses,
                deuda_mmv: nuevaDeudaMMV,
                multa_bs: nuevaMultaBs,
                saldo_favor_bs: nuevoSaldo,
                ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
              }).eq('id', inm.id);
              if (eAbono) throw new Error(`El pago quedó registrado pero no se pudo descontar la deuda de ${inm.inmueble}: ${eAbono.message}. Avise a soporte.`);
            }
          }

          // Si algún inmueble pertenecía a un contenedor padre N/A (ej: URB033481) o condominio, limpiar también el contenedor padre si sus hijos ya no tienen deuda
          const parentCodesToSync = Array.from(new Set(userInmsClean.map((i: any) => i.condominio_padre_id || i.padre_id).filter(Boolean)));
          for (const pCode of parentCodesToSync) {
            const { data: parentInm } = await supabase.from('inmuebles').select('id, inmueble').eq('inmueble', pCode).maybeSingle();
            if (parentInm) {
              const { data: currentChildren } = await supabase
                .from('inmuebles')
                .select('meses_deuda, deuda_mmv')
                .or(`condominio_padre_id.eq.${pCode},padre_id.eq.${pCode}`)
                .neq('estado', 'Eliminado');
              const maxChildMonths = Math.max(0, ...(currentChildren || []).map((c: any) => parseInt(String(c.meses_deuda || 0))));
              const sumDeudaMmv = Math.round((currentChildren || []).reduce((s: number, c: any) => s + parseFloat(String(c.deuda_mmv || 0)), 0) * 10000) / 10000;
              if (maxChildMonths === 0 || selectedRecibos.includes('RECIB-DEUDA')) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0, saldo_favor_bs: 0 }).eq('id', parentInm.id);
              } else {
                await supabase.from('inmuebles').update({ meses_deuda: maxChildMonths, deuda_mmv: sumDeudaMmv }).eq('id', parentInm.id);
              }
            }
          }

          // Si todos los inmuebles del contribuyente quedaron solventes, actualizar facturas pendientes históricas
          if (foundUser?.Identidad) {
            const { data: currentInms } = await supabase.from('inmuebles').select('meses_deuda, deuda_mmv').eq('identidad', foundUser.Identidad).neq('estado', 'Eliminado');
            const todoSolvente = (currentInms || []).every((i: any) => parseInt(String(i.meses_deuda || 0)) === 0 && parseFloat(String(i.deuda_mmv || 0)) <= 0.0001);
            if (todoSolvente) {
              await supabase.from('facturas').update({ estado: 'Pagado', fecha_pago: new Date().toISOString().split('T')[0] }).eq('identidad', foundUser.Identidad).in('estado', ['Pendiente', 'Por Verificar']);
            }
          }
        }

        // ── LIMPIAR MULTAS DE OFICINA/LOCAL DE CONDOMINIO (MULTA-*) ──
        const multaRefs = selectedRecibos.filter(r => r.startsWith('MULTA-'));
        if (multaRefs.length > 0 && !esAbonoDebito) {
          for (const mRef of multaRefs) {
            const inmCode = mRef.replace('MULTA-', '');
            await supabase.from('inmuebles').update({ multa_bs: 0, deuda_congelada_bs: 0 }).eq('inmueble', inmCode);
          }
        }

        // ── LIMPIAR / REDUCIR DEUDA CONDOMINIO ──
        if (isCondominio) {
          if (condominioModo === 'Local' && selectedHijos.length > 0) {
            for (const hijoId of selectedHijos) {
              const hijo = condominioHijos.find((h: any) => h.id === hijoId);
              const mesesTotales = Math.max(1, parseInt(hijo?.meses_deuda || '1'));
              const mesesPagados = hijosMesesAPagar[hijoId] ?? mesesTotales;
              const mesesRestantes = Math.max(0, mesesTotales - mesesPagados);
              if (mesesRestantes === 0) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', hijoId);
              } else {
                await supabase.from('inmuebles').update({ meses_deuda: mesesRestantes }).eq('id', hijoId);
              }
            }
          } else if (condominioModo === 'Total' && condominioHijos.length > 0) {
            if (!esAbonoDebito) {
              const allHijoIds = condominioHijos.map((h: any) => h.id);
              await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).in('id', allHijoIds);
              const parentClean = (freshInmuebles.length > 0 ? freshInmuebles : inmuebles).filter((i: any) =>
                (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
              );
              for (const pi of parentClean) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', pi.id);
              }
            } else {
              // Abono total a condominio: descontar mes a mes de los hijos en orden
              let dineroCondo = montoReal;
              for (const hijo of condominioHijos) {
                const mesesHijo = Math.max(0, parseInt(hijo?.meses_deuda || '0'));
                if (mesesHijo <= 0 || dineroCondo <= 0) continue;
                const infoDebt = getHijoDebt(hijo);
                const costPorMes = mesesHijo > 0 ? (infoDebt.total / mesesHijo) : infoDebt.total;
                let cubiertos = 0;
                for (let m = 1; m <= mesesHijo; m++) {
                  if (dineroCondo >= costPorMes - 0.01) {
                    dineroCondo = Math.max(0, dineroCondo - costPorMes);
                    cubiertos++;
                  } else {
                    break;
                  }
                }
                const resto = Math.max(0, mesesHijo - cubiertos);
                if (resto === 0) {
                  await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', hijo.id);
                } else {
                  await supabase.from('inmuebles').update({ meses_deuda: resto }).eq('id', hijo.id);
                }
              }
              if (dineroCondo > 0.01) {
                const parentClean = (freshInmuebles.length > 0 ? freshInmuebles : inmuebles).find((i: any) =>
                  (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
                );
                if (parentClean) {
                  const sAct = parseFloat(String(parentClean.saldo_favor_bs || '0')) || 0;
                  await supabase.from('inmuebles').update({ saldo_favor_bs: sAct + parseFloat(dineroCondo.toFixed(2)) }).eq('id', parentClean.id);
                }
              }
            }
          }
        }



        if (esAbonoDebito) {
          (window as any).__lastPaymentAbono = { 
            esAbono: true, 
            montoCancelado: montoReal, 
            montoPendiente: Math.max(0, (isCondominio ? totalDeudaCondominio : (foundUser.DeudaTotal || finalTotal)) - montoReal),
            tasaBcv: currentBcvRate
          };
          try {
            const arr = armarRecibosCobro({
              selectedRefs: selectedRecibos,
              montoReal,
              paymentMethod,
              banco: ['Debito', 'Credito', 'TMD', 'TVD'].includes(paymentMethod) ? paymentMethod : (banco || 'Debito'),
              referencia: reqRef ? referencia : referenciaDebito,
              esAbono: true,
              montoPendiente: Math.max(0, (isCondominio ? totalDeudaCondominio : (foundUser.DeudaTotal || finalTotal)) - montoReal),
              selectedHijosIds: selectedHijos
            });
            setReciboData(arr.length === 1 ? arr[0] : arr);
          } catch(e) {}
        } else {
          (window as any).__lastPaymentAbono = { esAbono: false, tasaBcv: currentBcvRate };
        }
        setSuccessMsg(esAbonoDebito
          ? `Abono de Bs. ${formatBs(montoReal)} procesado. La deuda restante quedó actualizada.`
          : `Pago procesado exitosamente por ${paymentMethod === 'TMD' ? 'TMD (Tarjeta Crédito Master)' : paymentMethod === 'TVD' ? 'TVD (Tarjeta Crédito Visa)' : paymentMethod === 'Credito' ? 'Tarjeta de Crédito' : paymentMethod}. La deuda ha sido conciliada automáticamente.`
        );
        // ── CONCILIAR FACTURAS VIEJAS: si tras el cobro no queda deuda en inmuebles activos,
        // las facturas "Pendiente" del RIF quedan pagadas (si no, Contribuyentes y Solvencias mostrarían deuda que Caja no ve).
        if (!esAbonoDebito && foundUser?.Identidad) {
          (async () => {
            try {
              const variantes = getIdentidadVariantsExact(foundUser.Identidad);
              const { data: inmsPost } = await supabase.from('inmuebles')
                .select('estado, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs').in('identidad', variantes);
              const quedaDeuda = (inmsPost || []).some((i: any) => i.estado !== 'Eliminado' && (
                parseInt(i.meses_deuda || '0') > 0 || parseFloat(i.deuda_mmv || '0') > 0.0001 ||
                parseFloat(i.multa_bs || '0') > 0.01 || parseFloat(i.deuda_congelada_bs || '0') > 0.01));
              if (!quedaDeuda) {
                await supabase.from('facturas')
                  .update({ estado: 'Pagado', fecha_pago: new Date().toISOString(), metodo_pago: 'Conciliado con Caja', referencia_pago: String(ultimoPagoIdRef.current || '') })
                  .in('identidad', variantes).in('estado', ['Pendiente', 'Abonado']);
              }
            } catch (e) { console.warn('Conciliación de facturas viejas:', e); }
          })();
        }
        // ── AUDITORÍA: Cobro completado ──
        logAudit(
          esAbonoDebito ? 'Abono Parcial en Caja' : `Cobro por ${paymentMethod} en Caja`,
          {
            contribuyente: foundUser.Contribuyente,
            identidad: foundUser.Identidad,
            monto_bs: montoReal,
            metodo: paymentMethod,
            referencias: selectedRecibos,
            servicios: selectedServicios,
            cuotas: selectedCuotas.map((c: any) => c.convId),
            tasa_bcv: currentBcvRate,
            referencia_pago: reqRef ? referencia : referenciaDebito,
            es_abono: esAbonoDebito,
          },
          'COBRO'
        );
        if (justificacionBcv) {
          logAudit('Tasa BCV Modificada en Caja', {
            contribuyente: foundUser.Identidad,
            tasa_aplicada: customBcvRate,
            justificacion: justificacionBcv,
          }, 'TASA');
        }

        // ── RECIBO AUTOMÁTICO DESPUÉS DEL PAGO DÉBITO ──
        if (!esAbonoDebito) {
          try {
            const cajero_id_recibo = getCajeroId();
            const poolHijos = (condominioHijos && condominioHijos.length > 0) ? condominioHijos : [];
            const hijosPagados = selectedHijos.length > 0
              ? poolHijos.filter((h: any) => selectedHijos.includes(h.id))
              : (isCondominio && poolHijos.length > 0 ? poolHijos : []);

            const refNumBase = (referenciaDebito || Date.now().toString()).slice(-7).padStart(7, '0');

            if (hijosPagados.length > 1) {
              const MESES_C = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
              const hoyC = new Date();
              const mesDeuda = (total: number, i: number) => new Date(hoyC.getFullYear(), hoyC.getMonth() - total + i - 1, 1);
              const lblMes = (d: Date) => `${MESES_C[d.getMonth()]} ${d.getFullYear()}`;

              const arrCondo = hijosPagados.map((hijo: any, idx: number) => {
                const infoDebt = getHijoDebt(hijo);
                const localDesc = getLocalLabel(hijo);
                const nombreLocal = hijo.contribuyente ? ` - ${hijo.contribuyente}` : '';
                let rango = '';
                if (infoDebt.mesesTotales > 0 && infoDebt.mesesAPagar > 0) {
                  const ini = mesDeuda(infoDebt.mesesTotales, 1);
                  const fin = mesDeuda(infoDebt.mesesTotales, infoDebt.mesesAPagar);
                  rango = infoDebt.mesesAPagar === 1 ? lblMes(ini) : `${lblMes(ini)} a ${lblMes(fin)}`;
                }
                const descMeses = infoDebt.mesesTotales > 1
                  ? ` [${infoDebt.mesesAPagar} mes${infoDebt.mesesAPagar !== 1 ? 'es' : ''} cancelado${infoDebt.mesesAPagar !== 1 ? 's' : ''}${rango ? `: ${rango}` : ''}${infoDebt.mesesTotales > infoDebt.mesesAPagar ? ` • Restan ${infoDebt.mesesTotales - infoDebt.mesesAPagar}` : ' • Al día'}]`
                  : (rango ? ` [${rango}]` : '');

                const refNum = `${refNumBase}-${idx + 1}`;
                const esResInm = isResidencialInm(hijo);
                const montoHijo = infoDebt.total > 0 ? infoDebt.total : parseFloat((montoReal / hijosPagados.length).toFixed(2));
                return {
                  reciboNo: refNum,
                  controlWeb: `WEB-${refNum}`,
                  fechaEmision: new Date().toISOString().split('T')[0],
                  codContribuyente: hijo.inmueble || hijo.id || foundUser.Identidad,
                  razonSocial: hijo.contribuyente || foundUser.Contribuyente || '',
                  domicilioFiscal: ((hijo.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
                  rifCi: foundUser.Identidad,
                  caja: cajero_id_recibo,
                  periodo: rango || undefined,
                  conceptos: [{
                    descripcion: `Aseo Urbano - ${localDesc}${nombreLocal}${descMeses} (${hijo.inmueble || ''})`,
                    precioUnit: montoHijo,
                    total: montoHijo
                  }],
                  subTotal: montoHijo,
                  exento: esResInm ? montoHijo : 0,
                  iva: esResInm ? 0 : parseFloat((montoHijo - (montoHijo / 1.16)).toFixed(2)),
                  total: montoHijo,
                  formaPago: 'PUNTO DE VENTA',
                  banco: 'Debito',
                  referencia: reqRef ? referencia : referenciaDebito,
                  tasaBcv: currentBcvRate || tcmmv || undefined,
                  tipoContribuyente: esResInm ? 'Residencial' : 'Comercial',
                  esAbono: false,
                };
              });
              setReciboData(arrCondo);
            } else if (hijosPagados.length === 1) {
              const hijo = hijosPagados[0];
              const infoDebt = getHijoDebt(hijo);
              const localDesc = getLocalLabel(hijo);
              const nombreLocal = hijo.contribuyente ? ` - ${hijo.contribuyente}` : '';
              const refNum = refNumBase;
              const esResInm = isResidencialInm(hijo);
              const montoHijo = infoDebt.total > 0 ? infoDebt.total : montoReal;
              setReciboData({
                reciboNo: refNum,
                controlWeb: `WEB-${refNum}`,
                fechaEmision: new Date().toISOString().split('T')[0],
                codContribuyente: hijo.inmueble || hijo.id || foundUser.Identidad,
                razonSocial: hijo.contribuyente || foundUser.Contribuyente || '',
                domicilioFiscal: ((hijo.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
                rifCi: foundUser.Identidad,
                caja: cajero_id_recibo,
                conceptos: [{
                  descripcion: `Aseo Urbano - ${localDesc}${nombreLocal} (${hijo.inmueble || ''})`,
                  precioUnit: montoHijo,
                  total: montoHijo
                }],
                subTotal: montoHijo,
                exento: esResInm ? montoHijo : 0,
                iva: esResInm ? 0 : parseFloat((montoHijo - (montoHijo / 1.16)).toFixed(2)),
                total: montoHijo,
                formaPago: 'PUNTO DE VENTA',
                banco: 'Debito',
                referencia: reqRef ? referencia : referenciaDebito,
                tasaBcv: currentBcvRate || tcmmv || undefined,
                tipoContribuyente: esResInm ? 'Residencial' : 'Comercial',
                esAbono: false,
              });
            } else {
              const arr = armarRecibosCobro({
                selectedRefs: selectedRecibos,
                montoReal,
                paymentMethod,
                banco: ['Debito', 'Credito', 'TMD', 'TVD'].includes(paymentMethod) ? paymentMethod : (banco || 'Debito'),
                referencia: reqRef ? referencia : referenciaDebito,
                esAbono: false,
                selectedHijosIds: selectedHijos
              });
              setReciboData(arr.length === 1 ? arr[0] : arr);
            }
          } catch(rErr) { console.warn('Error al generar recibo automático:', rErr); }
        }

        
      } else {
        const cajero_id = getCajeroId();

        if (justificacionBcv) {
          logAudit('Tasa BCV Modificada en Caja (Transferencia)', {
            identidad: foundUser.Identidad,
            tasa_aplicada: customBcvRate,
            justificacion: justificacionBcv,
          }, 'TASA');
        }


        // Transferencia / PagoMovil -> Enviar a Verificación
        // Upload comprobante to Supabase Storage if present
        let comprobanteUrl = '';
        let comprobanteB64 = '';
        if (comprobante) {
          // Try Storage via /api/upload
          try {
            const ext = comprobante.name.split('.').pop() || 'jpg';
            const filePath = `comprobantes/${(foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}.${ext}`;
            const uploadData = new FormData();
            uploadData.append('file', comprobante);
            uploadData.append('bucket', 'comprobantes');
            uploadData.append('path', filePath);

            const res = await fetch('/api/upload', {
              method: 'POST',
              body: uploadData,
            });
            const resData = await res.json();
            if (res.ok && resData.success) {
              comprobanteUrl = resData.publicUrl || '';
            }
          } catch(e) { /* Storage no disponible, usar base64 */ }
          // Fallback: base64 (siempre, garantiza visualizacion aunque falle Storage)
          if (!comprobanteUrl && comprobante.size < 5 * 1024 * 1024) { // max 5MB
            try {
              comprobanteB64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(comprobante);
              });
            } catch(e) { console.warn('No se pudo convertir comprobante a base64:', e); }
          }
        }

        // Subir comprobante de retención si fue adjuntado
        let compRetUrlT = '';
        let compRetB64T = '';
        if (comprobanteRetencionFile) {
          try {
            const ext = comprobanteRetencionFile.name.split('.').pop() || 'pdf';
            const filePath = `retenciones/${(foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}.${ext}`;
            const uploadData = new FormData();
            uploadData.append('file', comprobanteRetencionFile);
            uploadData.append('bucket', 'retenciones');
            uploadData.append('path', filePath);
            const res = await fetch('/api/upload', { method: 'POST', body: uploadData });
            const resData = await res.json();
            if (res.ok && resData.success) compRetUrlT = resData.publicUrl || '';
          } catch(e) {}
          if (!compRetUrlT && comprobanteRetencionFile.size < 5 * 1024 * 1024) {
            try {
              compRetB64T = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(comprobanteRetencionFile);
              });
            } catch(e) {}
          }
        }

        const deudaPreviaT = await snapshotDeudaPrevia(foundUser.Identidad, condominioHijos.map((h: any) => h.id));
        const pagoIdT = crypto.randomUUID();
        const hoyStr = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
        const fechaUTC = fechaCorteCaja === hoyStr 
          ? new Date().toISOString() 
          : new Date(`${fechaCorteCaja}T12:00:00-04:00`).toISOString();
        const { error: pErr } = await supabase.from('pagos_reportados').insert({
          id: pagoIdT,
          identidad: foundUser.Identidad,
          monto: montoReal,
          banco: banco,
          referencia: referencia,
          tipo: paymentMethod,
          estado: 'Por Verificar',
          created_at: fechaUTC,
          detalles: JSON.stringify({ 
            contribuyente: foundUser.Contribuyente,
            contribuyente_nombre: foundUser.Contribuyente,
            recibos: selectedRecibos, 
            cuotas: selectedCuotas,
            servicios: selectedServicios,
            tala_poda: selectedTalaPoda,
            cajero: cajero_id,
            banco_destino: bancoDestino,
            saldo_favor: saldoAFavorNuevo,
            saldo_a_favor_nuevo: saldoAFavorNuevo > 0 ? saldoAFavorNuevo : undefined,
            monto_sobrante: saldoAFavorNuevo > 0 ? saldoAFavorNuevo : undefined,
            monto_factura: totalFacturaBruto,
            monto_neto_factura: finalTotal,
            monto_retencion_iva: esAbono ? 0 : realMontoRetencionIVA,
            es_retencion: esAbono ? false : (realMontoRetencionIVA > 0),
            agente_retencion: esAbono ? false : (realMontoRetencionIVA > 0),
            iva_percent: ivaPercent,
            es_abono: esAbono,
            monto_abonado: esAbono ? montoReal : undefined,
            total_seleccionado: totalBs,
            saldo_usado: descuentoSaldoFavor,
            tasa_bcv: currentBcvRate,
            deuda_total_sistema: foundUser.DeudaTotal,
            deuda_previa: deudaPreviaT,
            comprobante_nombre: comprobante?.name || '',
            comprobante_url: comprobanteUrl,
            comprobante_b64: comprobanteB64 || undefined,
            comprobante_retencion_nombre: comprobanteRetencionFile?.name || undefined,
            comprobante_retencion_url: compRetUrlT || undefined,
            comprobante_retencion_b64: compRetB64T || undefined,
            fecha_transaccion: fechaTransaccion,
            tasa_bcv_aplicada: customBcvRate ? customBcvRate : undefined,
            nota_cambio_tasa: justificacionBcv ? justificacionBcv : undefined
          })
        });
        
        if (pErr) throw pErr;
        ultimoPagoIdRef.current = pagoIdT;
        // ── GENERAR COMPROBANTE DE RETENCIÓN DE IVA COMO NOTA DE CRÉDITO ──
        // REGLA: La retención solo se genera/aplica cuando se cubra el pago total del mes (no para abonos parciales)
        if (realMontoRetencionIVA > 0 && !esAbono) {
          const pagoRetId = crypto.randomUUID();
          await supabase.from('pagos_reportados').insert({
            id: pagoRetId,
            identidad: foundUser.Identidad,
            monto: realMontoRetencionIVA,
            banco: 'N/A',
            referencia: comprobanteRetencion || 'RET-' + Date.now().toString().slice(-6),
            tipo: 'Retencion de IVA',
            estado: 'Aprobado', // Siempre Aprobado porque es un descuento matemático directo
            created_at: fechaUTC,
            detalles: JSON.stringify({
              cajero: cajero_id,
              es_abono: false,
              pago_vinculado: pagoIdT,
              nota: 'Generado automáticamente por retención de agente.'
            })
          });
        }

        
        // Update items to 'Por Verificar'
        if (selectedRecibos.length > 0 && !esAbono) {
          await supabase.from('facturas').update({ estado: 'Por Verificar' }).in('referencia', selectedRecibos);
        }
        
        if (selectedCuotas.length > 0) {
          const convMap = new Map();
          selectedCuotas.forEach(sc => {
            const cq = cuotas.find(q => q.convId === sc.convId && q.cuotaId === sc.cuotaId);
            if (cq) {
              if (!convMap.has(sc.convId)) convMap.set(sc.convId, { raw: cq.rawConv, toUpdate: [] });
              convMap.get(sc.convId).toUpdate.push(sc.cuotaId);
            }
          });
          
          for (const [cId, data] of convMap.entries()) {
            let parsed = [];
            try { parsed = JSON.parse(data.raw.detalle_cuotas); } catch(e){}
            parsed.forEach((c: any) => {
              if (data.toUpdate.includes(c.id)) {
                c.estado = 'Por Verificar';
              }
            });
            await supabase.from('convenios').update({ detalle_cuotas: JSON.stringify(parsed) }).eq('id', cId);
          }
        }

        // Tala y Poda Transferencia -> Por Verificar
        if (selectedTalaPoda.length > 0) {
          await updateServiciosEspecialesEstado(selectedTalaPoda, 'Por Verificar');
        }
        // Servicios especiales Transferencia → Por Verificar (incluir en detalles)
        if (selectedServicios.length > 0) {
          await updateServiciosEspecialesEstado(selectedServicios, 'Por Verificar');
        }

        const montoStr = montoReal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        setSuccessMsg(`✅ ${paymentMethod} registrado(a) con éxito. MONTO POR CONCILIAR: Bs. ${montoStr} (Ref: ${referencia || 'S/R'}). Ha sido enviado al módulo de Conciliación.`);
        setNotificacionConciliacion({
          monto: montoReal,
          referencia: referencia || 'S/R',
          visible: true
        });
        setPagosPorConciliar(prev => [...prev, { referencia: referencia || 'S/R', monto: montoReal, tipo: paymentMethod }]);
        setMontoPorConciliar(prev => prev + montoReal);

        // ── AUDITORÍA: Transferencia registrada ──
        logAudit(`${paymentMethod} Registrada (Por Verificar)`, {
          contribuyente: foundUser.Contribuyente,
          identidad: foundUser.Identidad,
          monto_bs: montoReal,
          banco: banco,
          referencia: referencia,
          fecha_transaccion: fechaTransaccion,
          referencias_facturas: selectedRecibos,
          es_abono: esAbono,
        }, 'TRANSFERENCIA');

        // Generar recibos independientes por inmueble para transferencia
        try {
          const poolHijos = (condominioHijos && condominioHijos.length > 0) ? condominioHijos : [];
          const hijosPagados = selectedHijos.length > 0
            ? poolHijos.filter((h: any) => selectedHijos.includes(h.id))
            : (isCondominio && poolHijos.length > 0 ? poolHijos : []);

          const cajero_id_recibo = getCajeroId();
          const refNumBase = (referencia || Date.now().toString()).slice(-7).padStart(7, '0');

          if (hijosPagados.length > 1) {
            const MESES_C = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
            const hoyC = new Date();
            const mesDeuda = (total: number, i: number) => new Date(hoyC.getFullYear(), hoyC.getMonth() - total + i - 1, 1);
            const lblMes = (d: Date) => `${MESES_C[d.getMonth()]} ${d.getFullYear()}`;

            const arrCondo = hijosPagados.map((hijo: any, idx: number) => {
              const infoDebt = getHijoDebt(hijo);
              const localDesc = getLocalLabel(hijo);
              const nombreLocal = hijo.contribuyente ? ` - ${hijo.contribuyente}` : '';
              let rango = '';
              if (infoDebt.mesesTotales > 0 && infoDebt.mesesAPagar > 0) {
                const ini = mesDeuda(infoDebt.mesesTotales, 1);
                const fin = mesDeuda(infoDebt.mesesTotales, infoDebt.mesesAPagar);
                rango = infoDebt.mesesAPagar === 1 ? lblMes(ini) : `${lblMes(ini)} a ${lblMes(fin)}`;
              }
              const descMeses = infoDebt.mesesTotales > 1
                ? ` [${infoDebt.mesesAPagar} mes${infoDebt.mesesAPagar !== 1 ? 'es' : ''} cancelado${infoDebt.mesesAPagar !== 1 ? 's' : ''}${rango ? `: ${rango}` : ''}${infoDebt.mesesTotales > infoDebt.mesesAPagar ? ` • Restan ${infoDebt.mesesTotales - infoDebt.mesesAPagar}` : ' • Al día'}]`
                : (rango ? ` [${rango}]` : '');

              const refNum = `${refNumBase}-${idx + 1}`;
              const esResInm = isResidencialInm(hijo);
              const montoHijo = infoDebt.total > 0 ? infoDebt.total : parseFloat((montoReal / hijosPagados.length).toFixed(2));
              return {
                reciboNo: refNum,
                controlWeb: `WEB-${refNum}`,
                fechaEmision: new Date().toISOString().split('T')[0],
                codContribuyente: hijo.inmueble || hijo.id || foundUser.Identidad,
                razonSocial: hijo.contribuyente || foundUser.Contribuyente || '',
                domicilioFiscal: ((hijo.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
                rifCi: foundUser.Identidad,
                caja: cajero_id_recibo,
                periodo: rango || undefined,
                conceptos: [{
                  descripcion: `Aseo Urbano - ${localDesc}${nombreLocal}${descMeses} (${hijo.inmueble || ''})`,
                  precioUnit: montoHijo,
                  total: montoHijo
                }],
                subTotal: montoHijo,
                exento: esResInm ? montoHijo : 0,
                iva: esResInm ? 0 : parseFloat((montoHijo - (montoHijo / 1.16)).toFixed(2)),
                total: montoHijo,
                formaPago: 'TRANSFERENCIA',
                banco: banco || 'Transferencia',
                referencia: referencia || 'N/A',
                tasaBcv: currentBcvRate || tcmmv || undefined,
                tipoContribuyente: esResInm ? 'Residencial' : 'Comercial',
                esAbono: !!esAbono,
              };
            });
            setReciboData(arrCondo);
          } else if (hijosPagados.length === 1) {
            const hijo = hijosPagados[0];
            const infoDebt = getHijoDebt(hijo);
            const localDesc = getLocalLabel(hijo);
            const nombreLocal = hijo.contribuyente ? ` - ${hijo.contribuyente}` : '';
            const refNum = refNumBase;
            const esResInm = isResidencialInm(hijo);
            const montoHijo = infoDebt.total > 0 ? infoDebt.total : montoReal;
            setReciboData({
              reciboNo: refNum,
              controlWeb: `WEB-${refNum}`,
              fechaEmision: new Date().toISOString().split('T')[0],
              codContribuyente: hijo.inmueble || hijo.id || foundUser.Identidad,
              razonSocial: hijo.contribuyente || foundUser.Contribuyente || '',
              domicilioFiscal: ((hijo.direccion || foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
              rifCi: foundUser.Identidad,
              caja: cajero_id_recibo,
              conceptos: [{
                descripcion: `Aseo Urbano - ${localDesc}${nombreLocal} (${hijo.inmueble || ''})`,
                precioUnit: montoHijo,
                total: montoHijo
              }],
              subTotal: montoHijo,
              exento: esResInm ? montoHijo : 0,
              iva: esResInm ? 0 : parseFloat((montoHijo - (montoHijo / 1.16)).toFixed(2)),
              total: montoHijo,
              formaPago: 'TRANSFERENCIA',
              banco: banco || 'Transferencia',
              referencia: referencia || 'N/A',
              tasaBcv: currentBcvRate || tcmmv || undefined,
              tipoContribuyente: esResInm ? 'Residencial' : 'Comercial',
              esAbono: !!esAbono,
            });
          } else {
            const arr = armarRecibosCobro({
              selectedRefs: selectedRecibos,
              montoReal,
              paymentMethod: 'Transferencia',
              banco: banco || 'Transferencia',
              referencia: referencia || 'N/A',
              esAbono: !!esAbono,
              montoPendiente: esAbono ? Math.max(0, (foundUser.DeudaTotal || finalTotal) - montoReal) : undefined,
              selectedHijosIds: selectedHijos
            });
            setReciboData(arr.length === 1 ? arr[0] : arr);
          }
        } catch(e) {}
      }

      // Agregar al historial de la sesión
      setSessionPagos(prev => [{
        contribuyente: foundUser?.Contribuyente || '',
        identidad: foundUser?.Identidad || '',
        inmueble: (() => {
          // Extraer inmuebles únicos de los recibos seleccionados
          const inmsSet = new Set<string>();
          selectedRecibos.forEach((ref: string) => {
            const f = recibos.find((r: any) => r.referencia === ref);
            if (f?.inmueble) inmsSet.add(f.inmueble);
          });
          if (inmsSet.size === 0) {
            // Fallback: extraer del código de referencia CM-I-000663-09-2026
            const firstRef = selectedRecibos[0] || '';
            const m = firstRef.match(/CM-(I-\d+)-/);
            if (m) inmsSet.add(m[1]);
          }
          return [...inmsSet].join(', ');
        })(),
        monto: montoReal,
        metodo: paymentMethod,
        referencia: reqRef ? referencia : referenciaDebito,
        hora: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        esAbono,
        saldoFavor: saldoAFavorNuevo,
      }, ...prev]);

      // Refrescar datos del contribuyente sin salir de la pantalla
      const wasServicioDirecto = !!foundUser?.isServicioEspecialDirecto;
      setTimeout(async () => {
        setSuccessMsg('');
        if (wasServicioDirecto) {
          setSelectedRecibos([]);
          setSelectedCuotas([]);
          setSelectedServicios([]);
          setSelectedTalaPoda([]);
          setReferencia('');
          setReferenciaDebito('');
          setMontoDebito('');
          setMontoTransferido('');
          setComprobante(null);
          setTotalBs(0);
          setConfirmPayload(null);
          setFoundUser(null);
          setDocNumber('');
        } else {
          // refreshUserData: refresca SOLO este contribuyente, evita recargar todo el sistema
          await refreshUserData(foundUser?.Identidad || '');
          setSelectedRecibos([]);
          setSelectedCuotas([]);
          setSelectedServicios([]);
          setSelectedTalaPoda([]);
          setReferencia('');
          setReferenciaDebito('');
          setMontoDebito('');
          setMontoTransferido('');
          setComprobante(null);
          setTotalBs(0);
          setConfirmPayload(null);
          await handleSearch();
        }
      }, 2500);
      
    } catch (err: any) {
      console.error(err);
      alert('Error: ' + err.message);
    }
    setIsProcessing(false);
  };

  const parseNotaDetalles = (d: any) => {
    if (!d) return {};
    if (typeof d === 'object') return d;
    try { return JSON.parse(d); } catch { return {}; }
  };

  const fetchContribNotas = async (identidad: string) => {
    if (!identidad) return;
    setLoadingNotas(true);
    try {
      const idClean = identidad.trim().toUpperCase();
      const sinGuion = idClean.replace(/-/g, '');
      const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : idClean;
      const variantes = [...new Set([idClean, sinGuion, conGuion].filter(Boolean))];

      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('tipo', 'Nota de Credito')
        .in('identidad', variantes)
        .order('id', { ascending: false });

      if (error) console.error('Error cargando notas de credito:', error);
      setContribNotas(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingNotas(false);
    }
  };

  const handleEliminarNota = async (nota: any) => {
    const det = parseNotaDetalles(nota.detalles);
    const montoNota = parseLocalFloat(det.monto_bs ?? det.monto ?? 0);
    if (!confirm(`¿Está seguro de eliminar esta Nota de Crédito por Bs. ${formatBs(montoNota)}?\n\nAl eliminarla, se anulará el documento y se descontará del saldo a favor del contribuyente.`)) return;

    try {
      const res = await fetch('/api/admin/documentos/eliminar-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: nota.id,
          motivo: 'Eliminación manual desde Caja',
          usuario: getCajeroId() || 'Admin'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al eliminar');

      alert('Nota de crédito eliminada y saldo a favor revertido exitosamente.');
      if (foundUser?.Identidad) {
        await fetchContribNotas(foundUser.Identidad);
        await refreshUserData(foundUser.Identidad);
      }
      fetchNotasCredito();
    } catch (err: any) {
      alert('Error eliminando nota de crédito: ' + err.message);
    }
  };

  const handleCrearNotaManual = async () => {
    const montoNota = parseLocalFloat(notaManualMonto);
    if (!montoNota || montoNota <= 0) return alert('Ingrese un monto válido mayor a 0');
    if (!notaManualRef || notaManualRef.trim().length < 3) return alert('La referencia debe tener al menos 3 caracteres.');
    if (!foundUser) return;
    
    try {
      const res = await fetch('/api/admin/documentos/crear-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identidad: foundUser.Identidad,
          contribuyente: foundUser.Contribuyente,
          monto: montoNota,
          motivo: 'Nota de crédito generada manualmente desde Caja',
          referencia: notaManualRef.trim(),
          codigoCondominio: foundUser.CodCont || foundUser.cod_cont,
          usuario: getCajeroId() || 'Admin'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al generar la nota');

      setSuccessMsg('Nota de crédito manual generada exitosamente.');
      setNotaManualMonto('');
      setNotaManualRef('');
      setNotaTab('lista');
      if (foundUser?.Identidad) {
        await fetchContribNotas(foundUser.Identidad);
        await refreshUserData(foundUser.Identidad);
      }
      fetchNotasCredito();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: any) {
      alert('Error creando nota: ' + e.message);
    }
  };

  const handleSaveContactModal = async () => {
    if (!foundUser) return;
    setContactSaveError('');

    const cleanEmail = contactModalEmail.trim().toLowerCase();
    const cleanPhone = formatPhoneNumber(contactModalPhone);

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setContactSaveError('Por favor ingrese un correo electrónico válido (ej. usuario@gmail.com).');
      return;
    }

    if (isFictitiousEmail(cleanEmail)) {
      setContactSaveError('El correo ingresado no es válido. No use correos ficticios o de prueba.');
      return;
    }

    setIsSavingContact(true);
    try {
      const currentInms = (freshInmuebles && freshInmuebles.length > 0) ? freshInmuebles : (inmuebles || []);
      const inmIds = currentInms
        .filter((i: any) => i.identidad === foundUser.Identidad || (foundUser.cod_cont && (i.inmueble === foundUser.cod_cont || i.cod_cont === foundUser.cod_cont)))
        .map((i: any) => i.id)
        .filter(Boolean);

      const res = await fetch('/api/admin/actualizar-contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identidad: foundUser.Identidad,
          nombre: foundUser.Contribuyente,
          email: cleanEmail,
          telefono: cleanPhone,
          inmueble_ids: inmIds
        })
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.ok) {
        throw new Error(resJson.error || 'Error al guardar los datos de contacto');
      }

      // 1. Actualizar estado local inmediato de foundUser
      setFoundUser((prev: any) => prev ? ({
        ...prev,
        Correo: cleanEmail,
        Telefono: cleanPhone || prev.Telefono
      }) : null);

      // 2. Actualizar inmuebles frescos en memoria
      setFreshInmuebles((prev: any[]) => (prev || []).map(i => ({
        ...i,
        correo_electronico: cleanEmail,
        ...(cleanPhone ? { telefono: cleanPhone } : {})
      })));

      // 3. Refrescar datos globales
      await refreshUserData(foundUser.Identidad);

      // 4. Cerrar modal y notificar éxito
      setShowUpdateContactModal(false);
      setSuccessMsg('Datos de contacto actualizados y almacenados exitosamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error('Error al guardar datos de contacto:', err);
      setContactSaveError(err.message || 'Error al guardar en el servidor. Intente de nuevo.');
    } finally {
      setIsSavingContact(false);
    }
  };

  const generarExcelNotasCredito = async () => {
    try {
      const notas = (documentos || []).filter(d => d.tipo === 'Nota de Credito');
      const XLSX = await import('xlsx');
      
      const excelData = notas.map(n => {
        let details: any = {};
        try { details = JSON.parse(n.detalles); } catch(e){}
        return {
          "Fecha": n.created_at ? new Date(n.created_at).toLocaleDateString() : '',
          "Cédula/RIF": n.identidad,
          "Contribuyente": n.contribuyente,
          "Monto (Bs)": details.monto || 0,
          "Origen Ref": details.origen_referencia || '',
          "Estado": n.estado
        };
      });
      
      const worksheet = exportToExcelWithLogos(excelData, `Notas_Credito_${new Date().getTime()}.xlsx`, "Notas de Crédito");
    } catch (e) {
      alert("Error exportando Excel");
    }
  };

  const handleDescargarReporteCajaDia = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: pagosHoy, error } = await supabase
        .from('pagos_reportados')
        .select('*')
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const cajeroActual = getCajeroId();
      const cajeroLower = cajeroActual.toLowerCase();

      let canViewAll = false;
      try {
        const udata = JSON.parse(localStorage.getItem('admin_user_data') || '{}');
        const hasPerm = (k: string) => {
          if (!udata?.permisos) return false;
          if (Array.isArray(udata.permisos)) return udata.permisos.includes(k);
          if (typeof udata.permisos === 'object') return Boolean(udata.permisos[k]);
          return false;
        };
        const uLower = (udata.usuario || cajeroActual || '').toLowerCase();
        const esPatricia = uLower === 'patricia' || uLower === 'n-patricia' || (udata.letra && udata.letra.toUpperCase() === 'N' && uLower.includes('patricia'));
        if (udata.rol === 'Administrador' || udata.rol === 'SuperAdmin' || uLower === 'administrador' || uLower === 'dzara' || hasPerm('ver_todos_reportes_caja') || esPatricia) {
          canViewAll = true;
        }
      } catch {}
      
      const pagosFiltrados = (pagosHoy || []).filter(p => {
        if (p.estado === 'Anulado' || p.estado === 'Reversado' || p.estado === 'Condonado' || p.estado === 'Rechazado') return false;
        if (cajeroActual === 'Administrador' || cajeroActual === 'Sistema' || canViewAll) return true;
        const det = typeof p.detalles === 'object' ? p.detalles : (JSON.parse(p.detalles || '{}'));
        const pCajero = (det.cajero || det.analista || '').toLowerCase();
        return pCajero === cajeroLower || pCajero.endsWith(`-${cajeroLower}`) || cajeroLower.endsWith(`-${pCajero}`);
      });

      if (pagosFiltrados.length === 0) {
        alert('No se encontraron pagos registrados para tu caja el día de hoy (' + today + ').');
        return;
      }

      generarCorteCajaPDF(
        pagosFiltrados,
        contribuyentes || [],
        today + 'T00:00',
        today + 'T23:59',
        parseFloat(customBcvRate) || tcmmv || 0,
        cajeroActual
      );
    } catch (err: any) {
      alert('Error al generar reporte de caja: ' + (err?.message || err));
    }
  };

  const isAdmin = typeof window !== 'undefined' && localStorage.getItem('adminUser')?.toUpperCase() === 'ADMINISTRADOR';

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Landmark className="w-8 h-8 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">Módulo de Caja</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-semibold border border-emerald-200 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-1">
              <span>Tasa BCV Aplicada:</span>
              <input 
                type="text"
                readOnly
                value={customBcvRate ? (parseFloat(customBcvRate) || 0).toFixed(2) : tcmmv.toFixed(2)}
                onClick={() => {
                  setTempBcvRate(customBcvRate || tcmmv.toFixed(2));
                  setShowRateModal(true);
                }}
                className="w-24 px-2 py-0.5 rounded border border-emerald-300 bg-white text-emerald-900 font-bold outline-none cursor-pointer hover:bg-emerald-100 transition-colors"
                title="Tasa BCV Manual (Requiere Autorización)"
              />
            </div>
            <div className="text-[10px] font-semibold text-emerald-800">
              UCD (Euro × 57): Bs {valorUCD(currentBcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {customBcvRate && (
              <div className="text-xs px-2 py-1 bg-emerald-100 border border-emerald-300 rounded text-emerald-800 break-words">
                <span className="font-bold block mb-0.5">Motivo del ajuste:</span>
                {justificacionBcv}
              </div>
            )}
            <div className="flex items-center gap-1 mt-1 border-t border-emerald-200 pt-1">
              <CalendarIcon size={12} />
              <input 
                type="date" 
                value={selectedUcdDate}
                onChange={e => { setSelectedUcdDate(e.target.value); if (e.target.value) fetchTasaHistorica(e.target.value); }}
                max={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date())}
                className="bg-transparent border-none text-[10px] outline-none text-emerald-700 font-bold"
              />
              <button onClick={() => fetchTasaHistorica()} disabled={cargandoTasaFecha} className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded ml-auto disabled:opacity-50">{cargandoTasaFecha ? '...' : 'Fijar Día'}</button>
            </div>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1 items-center gap-1">
            <button
              onClick={() => setActiveTab('Pagos')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'Pagos' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Procesar Pagos
            </button>
            <button
              onClick={() => setActiveTab('NotasCredito')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'NotasCredito' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Notas de Crédito
            </button>
            <button
              onClick={handleDescargarReporteCajaDia}
              className="px-3 py-2 text-sm font-bold rounded-md bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
              title="Descargar Reporte del Día en PDF"
            >
              <Printer size={15} />
              <span>Reporte del Día (PDF)</span>
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'NotasCredito' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-slate-800">Control de Saldos a Favor (Notas de Crédito)</h2>
            <button onClick={generarExcelNotasCredito} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" /> Exportar a Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-600 uppercase bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cédula / RIF</th>
                  <th className="px-4 py-3">Contribuyente</th>
                  <th className="px-4 py-3 text-right">Monto (Bs)</th>
                  <th className="px-4 py-3 text-center">Ref. Origen</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingNotas ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500"><div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>Cargando notas de crédito...</div></td></tr>
                ) : notasCredito.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No hay notas de crédito registradas en el sistema.</td></tr>
                ) : notasCredito.map(n => {
                  let details: any = {};
                  try {
                    details = typeof n.detalles === 'string' ? JSON.parse(n.detalles) : (n.detalles || {});
                  } catch(e){}
                  const rawMonto = parseLocalFloat(details.monto_bs ?? details.monto ?? 0);
                  const formattedMonto = formatBs(rawMonto);
                  return (
                    <tr key={n.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3">{new Date(n.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium">{n.identidad}</td>
                      <td className="px-4 py-3">{n.contribuyente}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">Bs. {formattedMonto}</td>
                      <td className="px-4 py-3 text-center">{details.origen_referencia || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-1 rounded text-xs font-semibold">{n.estado}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAbrirEditarNota(n)}
                            className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                            title="Editar monto y referencia de la Nota de Crédito"
                          >
                            <span>✏️</span>
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminarNotaCredito(n, formattedMonto)}
                            disabled={deletingNotaId === n.id}
                            className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                            title="Eliminar Nota de Crédito y revertir saldo a favor"
                          >
                            <span>🗑️</span>
                            <span>{deletingNotaId === n.id ? 'Eliminando...' : 'Eliminar'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div className="space-y-6">
        {successMsg && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg border border-emerald-200 flex items-center gap-2 font-medium">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {foundUser && codigosSeparados.size > 0 && codigosDelCobro(false).length > 0 && (
        <div id="aviso-condominio-separado" className="bg-amber-50 text-amber-900 p-4 rounded-lg border border-amber-300 flex items-start gap-2 text-sm">
          <Building2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            {foundUser.es_condominio ? (
              <>
                <b>Este perfil es un CONDOMINIO MATRIZ.</b> Los pagos de sus filiales ({codigosDelCobro(false).slice(0, 12).join(', ')}{codigosDelCobro(false).length > 12 ? '…' : ''}) se gestionan exclusivamente en la{' '}
                <Link href="/admin/condominios/caja" className="underline font-bold text-emerald-800">Caja de Condominios</Link>. Aquí no se pueden cobrar.
              </>
            ) : (
              <>
                <b>Inmuebles de condominio:</b> {codigosDelCobro(false).slice(0, 12).join(', ')}{codigosDelCobro(false).length > 12 ? '…' : ''} se cobran en{' '}
                <Link href="/admin/condominios/caja" className="underline font-bold text-emerald-800">Caja de Condominios</Link>. Aquí no se pueden cobrar.
              </>
            )}
          </div>
        </div>
      )}
      {/* Buscador */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-slate-700">Buscar Contribuyente</label>
          <Link
            href="/admin/recibo-demo"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors shadow-xs"
          >
            <Printer size={13} />
            <span>Ver Formato de Recibo</span>
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <select 
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full sm:w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="V">V -</option>
            <option value="J">J -</option>
            <option value="E">E -</option>
            <option value="G">G -</option>
            <option value="P">P -</option>
          </select>
          <input 
            type="text" 
            placeholder="Número de documento o Código Usuario (Ej. N-12345)..."
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button 
            onClick={handleSearch}
            disabled={isSearching || !docNumber}
            className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            <Search className="w-4 h-4" /> Buscar
          </button>
        </div>
      </div>

      {foundUser && (
        <div className="space-y-6">
          {/* Banner de Pagos / Abonos Por Conciliar */}
          {(pagosPorConciliar.length > 0 || montoPorConciliar > 0) && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 p-4 rounded-xl flex items-start gap-3 shadow-sm">
              <div className="p-2 bg-amber-200/80 rounded-lg text-amber-900 text-xl font-bold shrink-0">⚠️</div>
              <div className="flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-extrabold text-amber-950 uppercase tracking-wide">
                    Atención en Caja: Pagos / Abonos Por Conciliar
                  </h3>
                  <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300">
                    {pagosPorConciliar.length} {pagosPorConciliar.length === 1 ? 'operación pendiente' : 'operaciones pendientes'}
                  </span>
                </div>
                <p className="text-xs text-amber-900 mt-1">
                  Este contribuyente tiene un monto acumulado por conciliar de{' '}
                  <strong className="text-sm font-black text-amber-950">
                    Bs. {montoPorConciliar.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                  {' '}en el módulo de Conciliación bancaria.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pagosPorConciliar.map((p: any, idx: number) => (
                    <div key={idx} className="inline-flex items-center gap-1.5 text-[11px] bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded-md font-mono font-semibold shadow-2xs">
                      <span>Ref: {p.referencia || 'S/R'} — Bs. {parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({p.tipo || 'Transferencia'})</span>
                      {(p.comprobante_url || p.comprobante_b64 || p.comprobante_retencion_url || p.comprobante_retencion_b64 || (p.detalles && (p.detalles.comprobante_url || p.detalles.comprobante_b64 || p.detalles.comprobante_retencion_url || p.detalles.comprobante_retencion_b64))) && (
                        <button
                          type="button"
                          onClick={() => setModalPagoComp(p)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-400 rounded text-[10px] font-bold cursor-pointer transition-colors"
                          title="Ver comprobante adjunto"
                        >
                          <Eye className="w-3 h-3 inline" /> Ver Comprobante
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notificación flotante / destacada tras registrar pago por conciliar */}
          {notificacionConciliacion && notificacionConciliacion.visible && (
            <div className="bg-emerald-50 border-2 border-emerald-500 p-4 rounded-xl flex items-start justify-between gap-3 shadow-md">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-200 rounded-lg text-emerald-900 text-xl font-bold shrink-0">✅</div>
                <div>
                  <h3 className="text-sm font-extrabold text-emerald-950 uppercase tracking-wide">
                    Pago Registrado — Pendiente por Conciliar
                  </h3>
                  <p className="text-xs text-emerald-800 mt-1">
                    Monto pendiente por conciliar: <strong className="text-sm font-black text-emerald-950">Bs. {notificacionConciliacion.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    {notificacionConciliacion.referencia ? ` (Ref: ${notificacionConciliacion.referencia})` : ''}.
                    La operación se ha enviado a Conciliación.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setNotificacionConciliacion(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold text-xs px-2 py-1 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors cursor-pointer"
              >
                ✕ Cerrar
              </button>
            </div>
          )}

          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row items-start justify-between gap-4">
            <div className="flex-1 w-full overflow-hidden">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-xl font-bold text-slate-800">{foundUser.Contribuyente}</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => { 
                      setIsNotaModalOpen(true); 
                      setNotaTab('lista');
                      if (foundUser?.Identidad) fetchContribNotas(foundUser.Identidad); 
                    }} 
                    className="text-[10px] sm:text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-300 transition-colors flex items-center gap-1.5"
                  >
                    <span>📜</span>
                    <span>Notas de Crédito / Saldo a Favor</span>
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-full transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-3.5 h-3.5 accent-violet-600 rounded"
                      checked={foundUser.agente_retencion || foundUser.esAgenteRetencion || false}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        const ok = confirm(`¿${val ? 'Marcar' : 'Desmarcar'} a este contribuyente como Agente de Retención (75% IVA)?`);
                        if (!ok) return;
                        try {
                          await supabase.from('inmuebles').update({ agente_retencion: val }).eq('identidad', foundUser.Identidad);
                          if (foundUser.CodCont) {
                            await supabase.from('inmuebles').update({ agente_retencion: val }).eq('inmueble', foundUser.CodCont);
                            await supabase.from('inmuebles').update({ agente_retencion: val }).eq('condominio_padre_id', foundUser.CodCont);
                            await supabase.from('condominios').update({ agente_retencion: val }).eq('codigo', foundUser.CodCont);
                          }
                          if (foundUser.Identidad) {
                            await supabase.from('condominios').update({ agente_retencion: val }).eq('identidad', foundUser.Identidad);
                          }
                          await refreshUserData(foundUser.Identidad);
                          alert('Estado de Agente de Retención actualizado.');
                        } catch(err) {
                          alert('Error al actualizar: ' + err);
                        }
                      }}
                    />
                    <span className="text-[10px] sm:text-xs font-bold text-violet-800">Agente de Retención</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap mt-0.5">
                <span className="font-semibold text-slate-700">{foundUser.Identidad}</span>
                <span>•</span>
                {(() => {
                  const userInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);
                  const activeInms = userInms.filter((i: any) => i.estado !== 'Eliminado');
                  const distinctCodes = Array.from(new Set(activeInms.map((i: any) => i.inmueble).filter(Boolean)));
                  
                  if (foundUser.isSearchByCode && (foundUser.CodCont || foundUser.cod_cont)) {
                    return (
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono font-semibold text-xs border border-slate-200">
                        Cód: {foundUser.CodCont || foundUser.cod_cont}
                      </span>
                    );
                  }

                  if (distinctCodes.length <= 1) {
                    return <span>Cód: {distinctCodes[0] || foundUser.cod_cont || 'N/A'}</span>;
                  }

                  // Múltiples inmuebles registrados
                  return (
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-semibold text-xs" title={distinctCodes.join(', ')}>
                      🏢 {distinctCodes.length} Inmuebles ({distinctCodes.slice(0, 3).join(', ')}{distinctCodes.length > 3 ? '...' : ''})
                    </span>
                  );
                })()}
                {foundUser.Telefono && formatPhoneNumber(foundUser.Telefono) && (
                  <>
                    <span>•</span>
                    <span className="text-slate-700 font-medium">📞 {formatPhoneNumber(foundUser.Telefono)}</span>
                  </>
                )}
                {foundUser.Correo && !isFictitiousEmail(foundUser.Correo) ? (
                  <>
                    <span>•</span>
                    <span className="text-slate-700 font-medium inline-flex items-center gap-1.5">
                      ✉️ {foundUser.Correo}
                      <button
                        type="button"
                        onClick={() => {
                          setContactModalEmail(foundUser.Correo || '');
                          setContactModalPhone(foundUser.Telefono && foundUser.Telefono !== 'No registrado' ? foundUser.Telefono : '');
                          setShowUpdateContactModal(true);
                        }}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
                        title="Cambiar correo o teléfono"
                      >
                        ✏️ Cambiar
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setContactModalEmail('');
                        setContactModalPhone(foundUser.Telefono && foundUser.Telefono !== 'No registrado' ? foundUser.Telefono : '');
                        setShowUpdateContactModal(true);
                      }}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer animate-pulse"
                      title="Registrar correo del contribuyente"
                    >
                      ⚠️ Agregar Correo
                    </button>
                  </>
                )}
              </div>

              {foundUser.es_condominio ? (
                <div className="mt-3 p-3.5 rounded-xl border shadow-xs bg-emerald-50/90 border-emerald-300 text-emerald-950">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs flex items-center gap-1 bg-emerald-700 text-white">
                          🏢 CONDOMINIO MATRIZ
                        </span>
                        <span className="font-extrabold text-sm text-slate-900">
                          {foundUser.RazonSocial || foundUser.Razon_Social}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-90">
                        Este contribuyente es la matriz administradora del condominio. Todas las facturas de sus filiales se agrupan bajo su perfil.
                      </p>
                    </div>
                    <Link
                      href="/admin/condominios/caja"
                      className="shrink-0 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      Ir a Caja de Condominios →
                    </Link>
                  </div>
                </div>
              ) : foundUser.condominio_padre_id ? (
                <div className={`mt-3 p-3.5 rounded-xl border shadow-xs ${
                  isCondominioPagoIndividual(foundUser.condominio_padre_id)
                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                    : 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
                }`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-extrabold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs flex items-center gap-1 ${
                          isCondominioPagoIndividual(foundUser.condominio_padre_id)
                            ? 'bg-emerald-700 text-white'
                            : 'bg-indigo-700 text-white'
                        }`}>
                          🏢 Pertenece a Condominio
                        </span>
                        {foundUser.condominio_padre_nombre && (
                          <span className="font-extrabold text-sm text-slate-900">
                            {foundUser.condominio_padre_nombre}
                          </span>
                        )}
                        <span className="font-mono text-xs font-bold bg-white/95 text-slate-700 px-2 py-0.5 rounded border border-slate-300 shadow-2xs">
                          Código Padre: {foundUser.condominio_padre_id}
                        </span>
                        {isCondominioPagoIndividual(foundUser.condominio_padre_id) && (
                          <span className="bg-emerald-200 text-emerald-900 font-bold text-[10px] px-2 py-0.5 rounded-full uppercase">
                            Pago Individual Habilitado
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed opacity-90">
                        {isCondominioPagoIndividual(foundUser.condominio_padre_id) ? (
                          <>
                            Este inmueble es filial del condominio <strong>{foundUser.condominio_padre_nombre || foundUser.condominio_padre_id}</strong>. Está autorizado por la administración tributaria para <strong>pagar de forma individual tanto sus meses de aseo como sus multas</strong>.
                          </>
                        ) : (
                          <>
                            Este inmueble es filial del condominio <strong>{foundUser.condominio_padre_nombre || foundUser.condominio_padre_id}</strong>. La solvencia y facturación del servicio de aseo se administra de forma centralizada con el Condominio.
                          </>
                        )}
                      </p>
                    </div>
                    <a
                      href={`/admin/condominios/caja?codigo=${foundUser.condominio_padre_id}`}
                      className={`inline-flex items-center gap-1 font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 transition-colors shadow-xs text-white cursor-pointer ${
                        isCondominioPagoIndividual(foundUser.condominio_padre_id)
                          ? 'bg-emerald-700 hover:bg-emerald-800'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      Ir a Caja de Condominios ({foundUser.condominio_padre_id}) →
                    </a>
                  </div>
                </div>
              ) : null}

              {!foundUser.es_condominio && (
              <div className="mt-2 text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded border border-slate-200 w-full max-h-[400px] overflow-y-auto">
                <div className="flex items-center justify-between mb-2 sticky top-0 bg-slate-100 z-10 py-1">
                  <span className="font-bold">Fórmula Aplicada:</span>
                  <input 
                    type="text" 
                    placeholder="Filtrar inmueble..." 
                    value={filterInm}
                    onChange={(e) => setFilterInm(e.target.value)}
                    className="w-48 text-[10px] border border-slate-300 rounded px-2 py-1 outline-none focus:border-emerald-500"
                  />
                </div>
                {(() => {
                  const userInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);
                  if (userInms.length === 0) return 'No hay inmuebles registrados.';

                  // 1. Filtrar inmuebles contenedores "N/A" (no son actividades económicas facturables)
                  const billableInms = userInms.filter((inm: any) => {
                    const act = (inm.actividad_principal || '').trim().toUpperCase();
                    if (act === 'N/A' || act === '') return false;
                    return true;
                  });

                  if (billableInms.length === 0) return 'No hay actividades económicas facturables.';

                  // 2. Agrupar por Local Físico (misma dirección / condominio_padre)
                  const clustersMap = clusterInmueblesByLocal(billableInms);
                  const clustersList: Array<{ localId: string; label: string; direccion: string; inms: any[] }> = [];
                  const seenClusters = new Set<string>();

                  billableInms.forEach((inm: any) => {
                    const info = clustersMap.get(inm.inmueble);
                    const clusterId = info?.localId || inm.inmueble;
                    if (!seenClusters.has(clusterId)) {
                      seenClusters.add(clusterId);
                      const inmsInCluster = billableInms.filter((i: any) => {
                        const iInfo = clustersMap.get(i.inmueble);
                        return (iInfo?.localId || i.inmueble) === clusterId;
                      });
                      clustersList.push({
                        localId: clusterId,
                        label: info?.label || getShortAddress(inm.direccion),
                        direccion: inm.direccion || '',
                        inms: inmsInCluster
                      });
                    }
                  });

                  // Filtrar por texto de búsqueda si aplica
                  const filteredClusters = clustersList.filter(c => {
                    if (!filterInm) return true;
                    const q = filterInm.toLowerCase();
                    return c.localId.toLowerCase().includes(q) ||
                           c.direccion.toLowerCase().includes(q) ||
                           c.inms.some((i: any) => (i.inmueble || '').toLowerCase().includes(q) || (i.actividad_principal || '').toLowerCase().includes(q));
                  });

                  return (
                    <div className="space-y-3">
                      {filteredClusters.map((cluster, cIdx) => {
                        const hasMultiple = cluster.inms.length > 1;

                        // ¿Es un cluster residencial (condominio o conjunto) o un local comercial?
                        const isResCluster = isCondominio ||
                                             (foundUser?.Clasificacion || '').toLowerCase().includes('condominio') ||
                                             (foundUser?.Tipo || '').toUpperCase().includes('RESIDENCIAL') ||
                                             cluster.inms.filter((i: any) => (i.actividad_principal || '').toUpperCase() !== 'N/A').every((i: any) => isResidencialInm(i));

                        // Recibos y IDs de todo el cluster
                        const clusterInmCodes = cluster.inms.map((i: any) => i.inmueble);
                        const clusterInmIds = cluster.inms.map((i: any) => i.id).filter(Boolean);
                        const clusterRecibos = recibos.filter((r: any) => {
                          if (r.referencia?.startsWith('RECIB-HIST-')) return clusterInmCodes.includes(r.referencia.split('-')[2]);
                          if (r.referencia?.startsWith('CM-')) return clusterInmCodes.some((code: string) => r.referencia.includes(code));
                          return clusterInmCodes.some((code: string) => (r.referencia || '').includes(code));
                        });

                        const isAllClusterSelected = isCondominio
                          ? (clusterInmIds.length > 0 && clusterInmIds.every((id: string) => selectedHijos.includes(id)))
                          : (clusterRecibos.length > 0 && clusterRecibos.every((r: any) => selectedRecibos.includes(r.referencia)));

                        // Cálculo de tarifas de cada actividad dentro del cluster
                        let totalClusterUCD = 0;
                        let totalClusterBs = 0;
                        let selectedActivitiesCount = 0;

                        const activitiesCalc = cluster.inms.map((inm: any) => {
                          const esTerreno = isTerrenoInm(inm);
                          const esRes = isResidencialInm(inm);
                          const mmvRaw = parseFloat(inm.mmv_mes || '0');
                          const foOficial = getFO(inm.actividad_principal || '', esRes);
                          const mmv = esTerreno
                            ? 0
                            : (esRes
                              ? (mmvRaw >= 0.22 && mmvRaw <= 1.50 ? mmvRaw : foOficial)
                              : (foOficial && foOficial > 1.00 ? foOficial : (mmvRaw > 1.00 ? mmvRaw : 1.98)));
                          const cant = inm.es_condominio === true ? parseInt(inm.cant_inmuebles || 1) : 1;
                          const far = getFAR(inm.actividad_principal || '');
                          const formulaUCD = esTerreno ? 0 : (esRes ? (mmv * 57 * far) : (mmv * 57 * 0.1280));
                          const totalUCD = cant * formulaUCD;
                          const bsMensual = totalUCD * currentBcvRate;

                          totalClusterUCD += totalUCD;
                          totalClusterBs += bsMensual;

                          // Ver si esta actividad tiene sus recibos marcados
                          const inmRecibos = clusterRecibos.filter((r: any) => {
                            if (r.referencia?.startsWith('RECIB-HIST-')) return r.referencia.split('-')[2] === inm.inmueble;
                            if (r.referencia?.startsWith('CM-')) return r.referencia.includes(inm.inmueble);
                            return (r.referencia || '').includes(inm.inmueble);
                          });

                          const isActSelected = isCondominio
                            ? (inm.id ? selectedHijos.includes(inm.id) : false)
                            : (inmRecibos.length > 0 && inmRecibos.every((r: any) => selectedRecibos.includes(r.referencia)));

                          if (isActSelected) {
                            selectedActivitiesCount++;
                          }

                          return {
                            inm,
                            esRes,
                            mmv,
                            cant,
                            far,
                            totalUCD,
                            bsMensual,
                            inmRecibos,
                            isActSelected
                          };
                        });

                        // ¿Están las actividades de este local unificadas?
                        const isUnifiedSelected = hasMultiple && selectedActivitiesCount > 1;

                        if (hasMultiple) {
                          return (
                            <div key={cIdx} className="bg-slate-50 border-2 border-emerald-500/40 rounded-xl p-3 shadow-sm transition-all">
                              {/* Cabecera del Local o Condominio */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isResCluster ? (
                                      <Building2 className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                      <Store className="w-4 h-4 text-emerald-600" />
                                    )}
                                    <span className="font-bold text-xs text-slate-800">
                                      {isCondominio 
                                        ? `Condominio (${cluster.inms.length} Unidades):`
                                        : (isResCluster
                                            ? `Inmuebles Residenciales (${cluster.inms.length} Unidades):`
                                            : `Local Comercial (${cluster.inms.length} Actividades Económicas):`
                                          )
                                      }
                                    </span>
                                    {isResCluster ? (
                                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                                        RESIDENCIAL (Exento 0% IVA)
                                      </span>
                                    ) : (
                                      <span className="bg-blue-100 text-blue-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-300">
                                        COMERCIAL (16% IVA)
                                      </span>
                                    )}
                                    {isUnifiedSelected && (
                                      <span className="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                        ✓ UNIFICADO
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1" title={cluster.direccion}>
                                    📍 {cluster.direccion || cluster.label}
                                  </p>
                                </div>

                                {/* Botón Marcar Todo el Local / Condominio */}
                                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg shadow-sm transition-all shrink-0">
                                  <input 
                                    type="checkbox"
                                    checked={isAllClusterSelected}
                                    onChange={(e) => {
                                      if (isCondominio) {
                                        if (e.target.checked) {
                                          setSelectedHijos(Array.from(new Set([...selectedHijos, ...clusterInmIds])));
                                          setCondominioModo('Local');
                                        } else {
                                          setSelectedHijos(selectedHijos.filter(id => !clusterInmIds.includes(id)));
                                        }
                                      } else {
                                        const allClusterRefs = clusterRecibos.map((r: any) => r.referencia);
                                        const otherSelected = selectedRecibos.filter((ref: string) => !allClusterRefs.includes(ref));
                                        if (e.target.checked) {
                                          setSelectedRecibos([...otherSelected, ...allClusterRefs]);
                                        } else {
                                          setSelectedRecibos(otherSelected);
                                        }
                                      }
                                    }}
                                    className="w-3.5 h-3.5 text-emerald-600 rounded border-white focus:ring-emerald-500"
                                  />
                                  Seleccionar
                                </label>
                              </div>

                              {/* Listado de unidades / actividades */}
                              <div className="space-y-1.5 py-2 max-h-[300px] overflow-y-auto">
                                {activitiesCalc.map(({ inm, mmv, far, totalUCD, bsMensual, inmRecibos, isActSelected }, actIdx) => {
                                  const isChecked = isActSelected;
                                  return (
                                    <div 
                                      key={actIdx} 
                                      className={`flex items-center justify-between text-[11px] p-2 rounded-lg border transition-all ${isChecked ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/40' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                                    >
                                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                                        <input 
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            if (isCondominio) {
                                              if (e.target.checked) {
                                                if (inm.id) setSelectedHijos(prev => Array.from(new Set([...prev, inm.id])));
                                                setCondominioModo('Local');
                                              } else {
                                                if (inm.id) setSelectedHijos(prev => prev.filter(id => id !== inm.id));
                                              }
                                            } else {
                                              const actRefs = inmRecibos.map((r: any) => r.referencia);
                                              if (actRefs.length > 0) {
                                                if (e.target.checked) {
                                                  setSelectedRecibos(prev => Array.from(new Set([...prev, ...actRefs])));
                                                } else {
                                                  setSelectedRecibos(prev => prev.filter((ref: string) => !actRefs.includes(ref)));
                                                }
                                              }
                                            }
                                          }}
                                          className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                                        />
                                        <span className="font-bold text-slate-700">
                                          {isResCluster ? `Unidad ${actIdx + 1}:` : `Actividad ${actIdx + 1}:`} {cleanClasificacionActividad(inm.actividad_principal) || (isResCluster ? 'Apartamento' : 'Comercial')}
                                        </span>
                                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                                          Cód: {inm.inmueble}
                                        </span>
                                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                                          Unificada
                                        </span>
                                      </label>
                                      {isTerrenoInm(inm) ? (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono shrink-0 ml-2">
                                          Tarifa: 0.00 Bs/mes (Terreno)
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-medium text-slate-600 font-mono shrink-0 ml-2">
                                          FO: {mmv.toFixed(4)} {isResCluster ? `| FAR: ${far.toFixed(4)} ` : ''}| {totalUCD.toFixed(2)} UCD × {currentBcvRate.toFixed(2)} Bs = <strong className="text-slate-900">{formatBs(bsMensual)} Bs/mes</strong> {isResCluster ? '(Exento)' : <span className="text-blue-700 font-bold ml-1">(con IVA: Bs. {formatBs(bsMensual * 1.16)})</span>}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Panel de Tarifa Mensual Unificada */}
                              <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isUnifiedSelected ? 'bg-emerald-50/80 border-emerald-400 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-md ${isUnifiedSelected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                                      <Zap className="w-4 h-4" />
                                    </div>
                                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                                      {isResCluster ? 'Tarifa Mensual Total del Condominio' : 'Tarifa Mensual Unificada del Local'}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-black text-slate-900 text-lg">
                                      Bs. {formatBs(isResCluster ? totalClusterBs : totalClusterBs * 1.16)}
                                    </div>
                                    <div className="text-[10px] font-semibold text-slate-500">
                                      {isResCluster ? 'Exento de IVA' : 'IVA Incluido (16%)'}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-1 pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px]">
                                  <p className="text-slate-500 font-medium">
                                    {isResCluster 
                                      ? `${cluster.inms.length} Unidades Residenciales a Bs. ${formatBs(activitiesCalc[0]?.bsMensual || 0)} c/u`
                                      : activitiesCalc.map(a => `${a.inm.actividad_principal?.split(' ')[0] || 'Act.'}: Bs. ${formatBs(a.bsMensual * 1.16)}`).join(' + ')
                                    }
                                  </p>
                                  <p className="text-slate-400 font-mono">
                                    Base: {totalClusterUCD.toFixed(2)} UCD × {currentBcvRate.toFixed(2)} Bs
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // Local con una sola actividad independiente
                        const single = activitiesCalc[0];
                        if (!single) return null;
                        const { inm, esRes, mmv, cant, far, totalUCD, bsMensual, inmRecibos, isActSelected } = single;

                        return (
                          <div key={cIdx} className="border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-[10px] text-slate-700 flex items-center gap-2">
                                Inmueble {inm.inmueble || 'General'} ({cant} und) - {isTerrenoInm(inm) ? (
                                  <span className="text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-[9px]">TERRENO (Tarifa 0)</span>
                                ) : (
                                  <span className={esRes ? "text-emerald-700 font-bold" : "text-blue-700 font-bold"}>{esRes ? "RESIDENCIAL (Exento 0% IVA)" : "COMERCIAL (16% IVA)"}</span>
                                )}:
                                {clustersList.length > 1 && <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[9px] font-bold">Inmueble Independiente</span>}
                              </span>
                              {(inmRecibos.length > 0 || esRes) && (
                                <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-1.5 py-0.5 rounded transition-colors">
                                  <input 
                                    type="checkbox"
                                    checked={isActSelected}
                                    onChange={(e) => {
                                      if (esRes) {
                                        if (e.target.checked) {
                                          if (inm.id) setSelectedHijos(Array.from(new Set([...selectedHijos, inm.id])));
                                          setCondominioModo('Local');
                                        } else {
                                          setSelectedHijos(selectedHijos.filter(id => id !== inm.id));
                                        }
                                      } else {
                                        const selectableRefs = inmRecibos.map((r: any) => r.referencia);
                                        const otherSelected = selectedRecibos.filter((ref: string) => !selectableRefs.includes(ref));
                                        if (e.target.checked) setSelectedRecibos([...otherSelected, ...selectableRefs]);
                                        else setSelectedRecibos(otherSelected);
                                      }
                                    }}
                                    className="w-2.5 h-2.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                                  />
                                  Marcar Todo
                                </label>
                              )}
                            </div>
                            {isTerrenoInm(inm) ? (
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Tarifa: CERO (0.00 UCD / 0.00 Bs - Terreno)</span>
                            ) : (
                              <span className="text-[10px] text-slate-600">FO: {mmv.toFixed(4)} | Factor: {esRes ? far.toFixed(4) : '0.1280'} | {totalUCD.toFixed(2)} UCD × {currentBcvRate.toFixed(2)} Bs = {formatBs(bsMensual)} Bs/mes {esRes ? '(Exento)' : `+ IVA = Bs. ${formatBs(bsMensual * 1.16)}`}.</span>
                            )}
                          </div>
                        );
                      })}
                      <span className="block text-[9px] text-slate-400 mt-1">
                        * El sistema cobra la deuda utilizando el registro actualizado de cada inmueble. Las actividades económicas de un mismo local se unifican sumando una sola tarifa mensual.
                      </span>
                    </div>
                  );
                })()}
              </div>
              )}
            </div>
            {foundUser.SaldoFavor > 0 && (
              <div className="bg-emerald-100 border-2 border-emerald-500 p-4 rounded-xl flex flex-col items-center justify-center min-w-[200px]">
                <span className="text-emerald-700 font-bold text-sm uppercase">Saldo a Favor</span>
                <span className="text-2xl font-black text-emerald-600">Bs. {formatBs(foundUser.SaldoFavor)}</span>
                <label className="text-[10px] flex items-center gap-1 mt-2 text-emerald-800 cursor-pointer">
                  <input type="checkbox" checked={useSaldoFavor} onChange={e => setUseSaldoFavor(e.target.checked)} />
                  Aplicar en este pago
                </label>
              </div>
            )}
          </div>
          {!foundUser.es_condominio && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Listado de Deudas */}
            <div className="lg:col-span-2 space-y-6">
            
            {/* ── CENTRO DE GESTIÓN Y COBRANZA DE CONDOMINIO ── */}
            {isCondominio && (
              <div className="bg-white rounded-xl shadow-md border-2 border-emerald-500/40 overflow-hidden transition-all">
                {/* Encabezado Principal */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <div className="p-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-lg">
                        <Building2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <h2 className="text-xl font-bold tracking-tight">Centro de Cobranza de Condominio</h2>
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                        {condominioHijos.length} Locales Registrados
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Administre la facturación del condominio: seleccione pago consolidado de todo el centro, cobro por local individual o abono parcial.
                    </p>
                  </div>

                  <div className="text-left sm:text-right bg-white/10 px-4 py-2.5 rounded-xl border border-white/10 backdrop-blur-sm self-stretch sm:self-auto flex sm:flex-col justify-between items-center sm:items-end">
                    <span className="text-[11px] text-slate-300 uppercase font-bold tracking-wider">Deuda Total Condominio</span>
                    <span className="text-xl font-black text-emerald-400">
                      Bs. {formatBs(totalDeudaCondominio)}
                    </span>
                  </div>
                </div>

                {/* Selector de Modalidad (3 Pestañas / Tarjetas) */}
                <div className="bg-slate-100 p-2.5 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-2">
                  {/* Opción 1: Consolidado Total */}
                  <button
                    type="button"
                    onClick={() => {
                      setCondominioModo('Total');
                      setSelectedHijos(condominioHijos.map(h => h.id));
                      setMontoAbonoCondo('');
                    }}
                    className={`p-3.5 rounded-xl flex flex-col text-left transition-all ${
                      condominioModo === 'Total'
                        ? 'bg-white text-emerald-900 shadow-md border-2 border-emerald-600 ring-2 ring-emerald-500/20'
                        : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle className={`w-4 h-4 ${condominioModo === 'Total' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="font-bold text-sm">1. Cobro Total Consolidado</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {condominioHijos.length} Locales
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Factura las {condominioHijos.length} unidades juntas en un único cobro global.
                    </p>
                  </button>

                  {/* Opción 2: Local Específico */}
                  <button
                    type="button"
                    onClick={() => {
                      setCondominioModo('Local');
                      if (selectedHijos.length === condominioHijos.length) {
                        setSelectedHijos([]);
                      }
                      setMontoAbonoCondo('');
                    }}
                    className={`p-3.5 rounded-xl flex flex-col text-left transition-all ${
                      condominioModo === 'Local'
                        ? 'bg-white text-emerald-900 shadow-md border-2 border-emerald-600 ring-2 ring-emerald-500/20'
                        : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Store className={`w-4 h-4 ${condominioModo === 'Local' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="font-bold text-sm">2. Cobro por Local / Unidad</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedHijos.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                        {selectedHijos.length} selecc.
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Seleccione 1 o varios locales específicos (búsqueda rápida por local o tienda).
                    </p>
                  </button>

                  {/* Opción 3: Abono Parcial */}
                  <button
                    type="button"
                    onClick={() => {
                      setCondominioModo('Abono');
                      setSelectedHijos([]);
                    }}
                    className={`p-3.5 rounded-xl flex flex-col text-left transition-all ${
                      condominioModo === 'Abono'
                        ? 'bg-white text-emerald-900 shadow-md border-2 border-emerald-600 ring-2 ring-emerald-500/20'
                        : 'bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Receipt className={`w-4 h-4 ${condominioModo === 'Abono' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="font-bold text-sm">3. Pago por Abono Parcial</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        Monto Libre
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Abonar un monto específico a cuenta para amortizar la deuda total.
                    </p>
                  </button>
                </div>

                {/* VISTA MODO 1: CONSOLIDADO TOTAL */}
                {condominioModo === 'Total' && (
                  <div className="p-6 bg-slate-50/60">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-600 text-white rounded-lg">
                          <CheckCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-emerald-900 text-sm">Facturación de Todo el Condominio Activada</h4>
                          <p className="text-xs text-emerald-700">
                            Se han seleccionado automáticamente los {condominioHijos.length} locales comerciales de este condominio.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCondominioModo('Local')}
                        className="text-xs bg-white text-emerald-800 border border-emerald-300 font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap"
                      >
                        Ver o Cambiar a Locales Individuales →
                      </button>
                    </div>

                    {/* Resumen Disgregado del Condominio */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Locales</span>
                        <span className="text-lg font-black text-slate-800">{condominioHijos.length} und</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Base Imponible</span>
                        <span className="text-lg font-black text-slate-800">Bs. {formatBs(sumBase)}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">IVA (16% si aplica)</span>
                        <span className="text-lg font-black text-slate-800">Bs. {formatBs(sumIVA)}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-rose-500 uppercase block">Multa por Mora</span>
                        <span className="text-lg font-black text-rose-600">Bs. {formatBs(sumMulta)}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-emerald-300 bg-emerald-50/50 shadow-sm col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">Total Consolidado</span>
                        <span className="text-lg font-black text-emerald-700">Bs. {formatBs(totalBs)}</span>
                      </div>
                    </div>

                    {/* Tabla de Desglose Completo por Local / Inmueble */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm mb-4">
                      <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                            Desglose Detallado por Inmueble / Local ({condominioHijos.length} unidades)
                          </span>
                        </div>
                        <div className="relative w-full sm:w-64">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Buscar local, RIF, comercio..."
                            value={condominioSearch}
                            onChange={e => setCondominioSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                          />
                        </div>
                      </div>

                      <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0 z-10 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3 text-left">N° Local / Unidad</th>
                              <th className="py-2 px-3 text-left">Inmueble / RIF</th>
                              <th className="py-2 px-3 text-left">Contribuyente / Comercio</th>
                              <th className="py-2 px-3 text-center">Meses Deuda</th>
                              <th className="py-2 px-3 text-right">Base Imponible</th>
                              <th className="py-2 px-3 text-right">IVA</th>
                              <th className="py-2 px-3 text-right">Multa</th>
                              <th className="py-2 px-3 text-right">Total a Pagar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {condominioHijos.filter((h: any) => {
                              if (!condominioSearch) return true;
                              const q = condominioSearch.toLowerCase();
                              return (h.inmueble || '').toLowerCase().includes(q) ||
                                (h.identidad || '').toLowerCase().includes(q) ||
                                (h.contribuyente || '').toLowerCase().includes(q) ||
                                (h.direccion || '').toLowerCase().includes(q) ||
                                (h.actividad_principal || '').toLowerCase().includes(q);
                            }).map((hijo: any) => {
                              const infoDebt = getHijoDebt(hijo, Math.max(0, parseInt(hijo.meses_deuda ?? '0')));
                              const localLabel = getLocalLabel(hijo);

                              return (
                                <tr key={hijo.id} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-2 px-3 align-middle whitespace-nowrap">
                                    <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                                      <Store className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                      {localLabel}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 align-middle whitespace-nowrap">
                                    <div className="font-mono text-slate-600 text-[11px]">{hijo.inmueble || '---'}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{hijo.identidad || '---'}</div>
                                  </td>
                                  <td className="py-2 px-3 align-middle">
                                    <div className="font-semibold text-slate-700 truncate max-w-[190px]" title={hijo.contribuyente}>
                                      {hijo.contribuyente || 'No asignado'}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate max-w-[190px]">
                                      {hijo.actividad_principal ? hijo.actividad_principal.replace(/\[HIJO_DE:.*?\]\s*/g, '').replace('[CONDOMINIO]', '') : 'General'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 align-middle text-center whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      infoDebt.mesesTotales > 1 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {infoDebt.mesesTotales} {infoDebt.mesesTotales === 1 ? 'mes' : 'meses'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 align-middle text-right font-medium text-slate-700 whitespace-nowrap">
                                    Bs. {formatBs(infoDebt.base)}
                                  </td>
                                  <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                                    {infoDebt.esRes ? (
                                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                        Exento (Bs. 0)
                                      </span>
                                    ) : (
                                      <div className="flex flex-col items-end">
                                        <span className="font-bold text-blue-700 text-xs">
                                          Bs. {formatBs(infoDebt.iva)}
                                        </span>
                                        <span className="text-[9px] text-slate-400">16% IVA</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 align-middle text-right whitespace-nowrap">
                                    {infoDebt.multa > 0 ? (
                                      <span className="font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                        Bs. {formatBs(infoDebt.multa)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">Bs. 0,00</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 align-middle text-right font-black text-emerald-700 text-xs whitespace-nowrap">
                                    Bs. {formatBs(infoDebt.total)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 italic">
                      💡 Todos los locales anteriores están incluidos en el cobro global. Proceda al panel lateral derecho "Resumen de Pago" para seleccionar el método de pago (Punto de Venta o Transferencia) y emitir el cobro consolidado.
                    </p>
                  </div>
                )}

                {/* VISTA MODO 2: COBRO POR LOCAL INDIVIDUAL */}
                {condominioModo === 'Local' && (
                  <div className="p-6">
                    {/* Barra de Búsqueda y Filtros Rápidos */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Buscar por Local (ej. A-23), RIF, Nombre Comercial o Actividad..."
                          value={condominioSearch}
                          onChange={e => setCondominioSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm"
                        />
                        {condominioSearch && (
                          <button
                            type="button"
                            onClick={() => setCondominioSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            const filtered = condominioHijos.filter((h: any) => {
                              if (!condominioSearch) return true;
                              const q = condominioSearch.toLowerCase();
                              return (h.inmueble || '').toLowerCase().includes(q) ||
                                (h.identidad || '').toLowerCase().includes(q) ||
                                (h.contribuyente || '').toLowerCase().includes(q) ||
                                (h.direccion || '').toLowerCase().includes(q) ||
                                (h.actividad_principal || '').toLowerCase().includes(q);
                            });
                            const ids = filtered.map((h: any) => h.id);
                            setSelectedHijos(Array.from(new Set([...selectedHijos, ...ids])));
                          }}
                          className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <CheckSquare className="w-3.5 h-3.5" /> Seleccionar Filtrados
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedHijos([])}
                          className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" /> Limpiar
                        </button>
                      </div>
                    </div>

                    {/* Indicador de Selección */}
                    <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 mb-3 flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">
                        Mostrando <strong>{condominioHijos.filter((h: any) => {
                          if (!condominioSearch) return true;
                          const q = condominioSearch.toLowerCase();
                          return (h.inmueble || '').toLowerCase().includes(q) ||
                            (h.identidad || '').toLowerCase().includes(q) ||
                            (h.contribuyente || '').toLowerCase().includes(q) ||
                            (h.direccion || '').toLowerCase().includes(q) ||
                            (h.actividad_principal || '').toLowerCase().includes(q);
                        }).length}</strong> de <strong>{condominioHijos.length}</strong> locales
                      </span>
                      <span className="font-bold text-emerald-800">
                        {selectedHijos.length} seleccionados • Subtotal: Bs. {formatBs(totalBs)}
                      </span>
                    </div>

                    {/* Tabla Interactiva de Locales */}
                    <div className="overflow-y-auto max-h-[460px] border border-slate-200 rounded-xl shadow-inner">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 sticky top-0 shadow-sm z-10 text-xs uppercase text-slate-600 tracking-wider">
                          <tr className="border-b border-slate-200">
                            <th className="py-2.5 px-3 w-10 text-left">
                              <input
                                type="checkbox"
                                checked={selectedHijos.length === condominioHijos.length && condominioHijos.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedHijos(condominioHijos.map(h => h.id));
                                  } else {
                                    setSelectedHijos([]);
                                  }
                                }}
                                className="w-4 h-4 accent-emerald-600 cursor-pointer"
                              />
                            </th>
                            <th className="py-2.5 px-3 font-bold text-left">N° Local / Inmueble</th>
                            <th className="py-2.5 px-3 font-bold text-left">Comercio / RIF</th>
                            <th className="py-2.5 px-3 font-bold text-center">Meses / Mora</th>
                            <th className="py-2.5 px-3 font-bold text-right">Base Imponible</th>
                            <th className="py-2.5 px-3 font-bold text-right">IVA (16% / Exento)</th>
                            <th className="py-2.5 px-3 font-bold text-right">Multa</th>
                            <th className="py-2.5 px-3 font-bold text-right">Total a Cobrar</th>
                            <th className="py-2.5 px-3 font-bold text-center">Acción Rápida</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {condominioHijos.filter((h: any) => {
                            if (!condominioSearch) return true;
                            const q = condominioSearch.toLowerCase();
                            return (h.inmueble || '').toLowerCase().includes(q) ||
                              (h.identidad || '').toLowerCase().includes(q) ||
                              (h.contribuyente || '').toLowerCase().includes(q) ||
                              (h.direccion || '').toLowerCase().includes(q) ||
                              (h.actividad_principal || '').toLowerCase().includes(q);
                          }).map((hijo: any) => {
                            const infoDebt = getHijoDebt(hijo);
                            const localLabel = getLocalLabel(hijo);
                            const isChecked = selectedHijos.includes(hijo.id);

                            return (
                              <tr
                                key={hijo.id}
                                className={`transition-colors hover:bg-slate-50/80 ${
                                  isChecked ? 'bg-emerald-50/50' : ''
                                }`}
                              >
                                <td className="py-2.5 px-3 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedHijos([...selectedHijos, hijo.id]);
                                      } else {
                                        setSelectedHijos(selectedHijos.filter(id => id !== hijo.id));
                                      }
                                    }}
                                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-1.5">
                                      <Store className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                      {localLabel}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {hijo.inmueble}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 align-middle">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-700 text-xs truncate max-w-[170px]" title={hijo.contribuyente}>
                                      {hijo.contribuyente || 'Contribuyente No Registrado'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {hijo.identidad || 'N/A'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 align-middle text-center whitespace-nowrap">
                                  {infoDebt.mesesTotales > 1 ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                                        Debe {infoDebt.mesesTotales} meses
                                      </span>
                                      <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                                        <span className="text-[9px] text-slate-500 font-semibold">Pagar:</span>
                                        <select
                                          value={infoDebt.mesesAPagar}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setHijosMesesAPagar(prev => ({ ...prev, [hijo.id]: val }));
                                          }}
                                          className="text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5 font-bold text-emerald-800 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-xs"
                                        >
                                          {Array.from({ length: infoDebt.mesesTotales }, (_, idx) => idx + 1).map((m) => (
                                            <option key={m} value={m}>
                                              {m} {m === 1 ? 'mes' : 'meses'} {m === infoDebt.mesesTotales ? '(Todo)' : ''}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                      1 mes
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 align-middle text-right font-medium text-slate-700 text-xs whitespace-nowrap">
                                  Bs. {formatBs(infoDebt.base)}
                                </td>
                                <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                                  {infoDebt.esRes ? (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                      Exento (Bs. 0)
                                    </span>
                                  ) : (
                                    <div className="flex flex-col items-end">
                                      <span className="font-bold text-blue-700 text-xs">
                                        Bs. {formatBs(infoDebt.iva)}
                                      </span>
                                      <span className="text-[9px] text-slate-400">16% IVA</span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                                  {infoDebt.multa > 0 ? (
                                    <span className="font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-xs">
                                      Bs. {formatBs(infoDebt.multa)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">Bs. 0,00</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                                  <span className="font-black text-emerald-700 text-sm">
                                    Bs. {formatBs(infoDebt.total)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 align-middle text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedHijos([hijo.id])}
                                    className="text-[11px] font-bold bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 border border-slate-300 hover:border-emerald-600 px-2.5 py-1 rounded-lg transition-all"
                                    title="Seleccionar únicamente este local para cobrarlo ya"
                                  >
                                    Cobrar Solo Este
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* VISTA MODO 3: PAGO POR ABONO PARCIAL */}
                {condominioModo === 'Abono' && (
                  <div className="p-6 bg-slate-50/60">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                      <div className="p-2 bg-amber-600 text-white rounded-lg">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-900 text-sm">Modalidad de Abono Parcial</h4>
                        <p className="text-xs text-amber-800 mt-0.5">
                          Ingrese el monto en Bolívares que el condominio desea abonar a su saldo deudor. El pago amortizará la cuenta y generará un recibo oficial con el saldo restante.
                        </p>
                      </div>
                    </div>

                    {/* Calculadora Comparativa */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">1. Deuda Total Actual</span>
                        <span className="text-2xl font-black text-slate-800 my-2">Bs. {formatBs(totalDeudaCondominio)}</span>
                        <span className="text-[11px] text-slate-400">Total acumulado de los {condominioHijos.length} locales</span>
                      </div>

                      <div className="bg-white p-4 rounded-xl border-2 border-emerald-500 shadow-sm flex flex-col justify-between">
                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">2. Monto a Abonar Hoy (Bs) *</span>
                        <div className="relative my-2">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">Bs.</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={montoAbonoCondo}
                            onChange={e => setMontoAbonoCondo(formatLocalNumberInput(e.target.value))}
                            className="w-full pl-10 pr-3 py-2 text-xl font-black text-emerald-700 border border-emerald-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        {/* Botones de Porcentaje Rápido */}
                        <div className="flex gap-1.5 mt-1">
                          {[0.25, 0.50, 0.75, 1.0].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setMontoAbonoCondo(formatLocalNumberInput((totalDeudaCondominio * pct).toFixed(2).replace('.', ',')))}
                              className="flex-1 text-[10px] font-bold bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 py-1 rounded border border-slate-200 transition-colors"
                            >
                              {pct * 100}%
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">3. Deuda Restante Proyectada</span>
                        <span className="text-2xl font-black text-rose-600 my-2">
                          Bs. {formatBs(Math.max(0, totalDeudaCondominio - (parseLocalFloat(montoAbonoCondo) || 0)))}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {parseLocalFloat(montoAbonoCondo) >= totalDeudaCondominio ? '¡Deuda cancelada en su totalidad!' : 'Quedará pendiente en la cuenta'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recibos de Aseo Mensual */}
            {(!isCondominio || recibos.length > 0) && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <h3 className="font-bold text-slate-800">Recibos de Aseo Mensual</h3>
                  <span className="text-xs text-slate-500 font-medium">({recibos.length} pendiente{recibos.length !== 1 ? 's' : ''})</span>
                </div>

                {/* Botones de selección rápida para pagos múltiples */}
                {recibos.length > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const allRefs = recibos.map((r: any) => r.referencia).filter(Boolean);
                        setSelectedRecibos(allRefs);
                      }}
                      className="text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded transition-colors shadow-xs"
                    >
                      ✓ Marcar Todos ({recibos.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRecibos([])}
                      className="text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded transition-colors"
                    >
                      ✕ Desmarcar
                    </button>
                    {recibos.length > 3 && (
                      <button
                        type="button"
                        onClick={() => {
                          const last3 = recibos.slice(-3).map((r: any) => r.referencia).filter(Boolean);
                          setSelectedRecibos(last3);
                        }}
                        className="text-[11px] font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 px-2 py-1 rounded transition-colors"
                      >
                        Últimos 3
                      </button>
                    )}
                    {recibos.length > 6 && (
                      <button
                        type="button"
                        onClick={() => {
                          const last6 = recibos.slice(-6).map((r: any) => r.referencia).filter(Boolean);
                          setSelectedRecibos(last6);
                        }}
                        className="text-[11px] font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 px-2 py-1 rounded transition-colors"
                      >
                        Últimos 6
                      </button>
                    )}
                    {recibos.length > 12 && (
                      <button
                        type="button"
                        onClick={() => {
                          const last12 = recibos.slice(-12).map((r: any) => r.referencia).filter(Boolean);
                          setSelectedRecibos(last12);
                        }}
                        className="text-[11px] font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 px-2 py-1 rounded transition-colors"
                      >
                        Últimos 12
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-200 max-h-[700px] overflow-y-auto">
                {recibos.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-white p-4 rounded-lg border border-slate-200">No hay recibos pendientes.</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(
                      recibos.reduce((acc: any, r: any) => {
                        const userInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);
                        let inmId = 'Facturación General';
                        let tipo = '';
                        let act = '';
                        let dir = '';
                        if (r.inmueble) {
                          const match = userInms.find((i: any) => String(i.inmueble || '').trim().toUpperCase() === String(r.inmueble).trim().toUpperCase());
                          if (match) { inmId = String(match.inmueble || ''); tipo = String(match.tipo || match.clasificacion || ''); act = cleanClasificacionActividad(String(match.actividad_principal || '')); dir = String(match.direccion || ''); }
                          else inmId = String(r.inmueble);
                        } else if (r.referencia?.startsWith('RECIB-HIST-')) {
                          const mHist = r.referencia.match(/^RECIB-HIST-(.+)-M\d+$/i);
                          const cod = mHist ? mHist[1] : r.referencia.split('-')[2];
                          const match = userInms.find((i: any) => String(i.inmueble || '').trim().toUpperCase() === String(cod || '').trim().toUpperCase());
                          if (match) { inmId = String(match.inmueble || ''); tipo = String(match.tipo || match.clasificacion || ''); act = cleanClasificacionActividad(String(match.actividad_principal || '')); dir = String(match.direccion || ''); }
                          else inmId = cod || 'Facturación General';
                        } else if (r.referencia?.startsWith('MULTA-')) {
                          const mMulta = r.referencia.match(/^MULTA-(.+?)(?:-M\d+)?$/i);
                          const cod = mMulta ? mMulta[1] : '';
                          const match = userInms.find((i: any) => String(i.inmueble || '').trim().toUpperCase() === String(cod || '').trim().toUpperCase());
                          if (match) { inmId = String(match.inmueble || ''); tipo = String(match.tipo || match.clasificacion || ''); act = cleanClasificacionActividad(String(match.actividad_principal || '')); dir = String(match.direccion || ''); }
                          else inmId = cod || 'Multas';
                        } else if (r.referencia?.startsWith('CM-')) {
                          const match = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
                          if (match) { inmId = String(match.inmueble || ''); tipo = String(match.tipo || match.clasificacion || ''); act = cleanClasificacionActividad(String(match.actividad_principal || '')); dir = String(match.direccion || ''); }
                          else inmId = 'Acumulados';
                        } else {
                          const matchedInm = userInms.find((i: any) => (i.actividad_principal || '').toUpperCase() !== 'N/A') || userInms[0];
                          if (matchedInm) {
                            inmId = String(matchedInm.inmueble || 'General');
                            tipo = String(matchedInm.tipo || matchedInm.clasificacion || 'Comercial');
                            act = cleanClasificacionActividad(String(matchedInm.actividad_principal || 'Aseo Urbano'));
                            dir = String(matchedInm.direccion || '');
                          }
                        }
                        
                        // Extraer clave uniforme de mes YYYY-MM a partir de r.emision
                        let monthKey = '';
                        if (r.emision) {
                          const d = new Date(r.emision);
                          if (!isNaN(d.getTime())) {
                            monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                          } else {
                            monthKey = String(r.emision).slice(0, 7);
                          }
                        }

                        // Agrupar los inmuebles por local físico (misma cédula/RIF y misma dirección física)
                        const localClusters = clusterInmueblesByLocal(userInms);
                        const clusterInfo = localClusters.get(inmId);
                        const localId = clusterInfo?.localId || inmId;
                        const localLabel = clusterInfo?.label || getShortAddress(dir);
                        const activitiesInThisLocal = clusterInfo?.count ?? 1;
                        const hasMultipleActivitiesInThisLocal = activitiesInThisLocal > 1;

                        let groupId = `${inmId}|${tipo}|${act}`;
                        let isVirtualMonth = false;

                        const isMultaRec = String(r.referencia || '').startsWith('MULTA-');
                        // REGLA CLAVE: Las actividades económicas extras se unen a un local SOLO si tienen misma cédula/RIF Y misma dirección (las multas administrativas no son mensualidades)
                        if (hasMultipleActivitiesInThisLocal && monthKey && !isMultaRec) {
                          groupId = `LOCAL-${localId}-MES-${monthKey}`;
                          isVirtualMonth = true;
                        }

                        if (!acc[groupId]) {
                          acc[groupId] = { 
                            items: [], 
                            id: isVirtualMonth ? formatMonthYear(r.emision) : inmId, 
                            localLabel: isVirtualMonth ? localLabel : '',
                            tipo: isVirtualMonth ? 'Local Comercial' : tipo, 
                            act: isVirtualMonth ? `${activitiesInThisLocal} Actividades Económicas` : act, 
                            isVirtualMonth, 
                            emision: r.emision,
                            monthKey
                          };
                        }
                        acc[groupId].items.push({ ...r, _inmId: inmId, _act: act, _tipo: tipo, _dir: dir });
                        return acc;
                      }, {})
                    ).map(([key, group]: [string, any]) => {
                      const totalMontoGrupo = group.items.reduce((sum: number, r: any) => sum + parseFloat(getReciboMonto(r) || '0'), 0);
                      const allSelected = group.items.length > 0 && group.items.every((r: any) => selectedRecibos.includes(r.referencia));
                      const anyPending = group.items.some((r: any) => isItemPending(r.referencia));

                      return (
                        <div key={key} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                          <div className="bg-slate-100/50 px-3 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                {group.isVirtualMonth ? formatMonthYear(group.emision) : group.id}
                              </span>
                              {group.localLabel && (
                                <span className="bg-blue-50 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200/60 max-w-[280px] truncate" title={group.localLabel}>
                                  📍 {group.localLabel}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500 font-semibold">
                                {group.isVirtualMonth ? `${group.items.length} Actividades Consolidadas` : [group.tipo, group.act].filter(Boolean).join(' • ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {group.items.length > 1 && !group.isVirtualMonth && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const groupRefs = group.items.map((it: any) => it.referencia);
                                    const isEverySelected = groupRefs.every((ref: string) => selectedRecibos.includes(ref));
                                    if (isEverySelected) {
                                      setSelectedRecibos(selectedRecibos.filter((ref: string) => !groupRefs.includes(ref)));
                                    } else {
                                      setSelectedRecibos(Array.from(new Set([...selectedRecibos, ...groupRefs])));
                                    }
                                  }}
                                  className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors cursor-pointer"
                                >
                                  {group.items.every((it: any) => selectedRecibos.includes(it.referencia)) ? 'Desmarcar Inmueble' : 'Marcar Inmueble'}
                                </button>
                              )}
                              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                                {group.items.length} {group.isVirtualMonth ? 'actividades' : 'recibos'}
                              </span>
                            </div>
                          </div>
                          <div className="p-2 space-y-1.5 max-h-[460px] overflow-y-auto">
                            {group.isVirtualMonth ? (
                              <div className={`p-2.5 border rounded-lg transition-colors ${allSelected ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400' : anyPending ? 'bg-slate-50 border-slate-200 opacity-60' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                                    <input 
                                      type="checkbox" 
                                      checked={allSelected} 
                                      disabled={anyPending} 
                                      onChange={() => {
                                        if (allSelected) {
                                          group.items.forEach((r: any) => { if (selectedRecibos.includes(r.referencia)) toggleRecibo(r.referencia); });
                                        } else {
                                          group.items.forEach((r: any) => { if (!selectedRecibos.includes(r.referencia)) toggleRecibo(r.referencia); });
                                        }
                                      }}
                                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                    />
                                    <div>
                                      <p className="font-bold text-xs text-slate-800">
                                        Mes Completo: {formatMonthYear(group.emision)}
                                      </p>
                                      <p className="text-[10px] font-medium text-slate-500">
                                        {group.localLabel ? `Local: ${group.localLabel} • ` : ''}Suma unificada del mes por todas las actividades de esta dirección ({group.items.length} actividades)
                                      </p>
                                    </div>
                                  </label>
                                  <div className="text-right pl-4">
                                    <span className="font-extrabold text-emerald-700 text-sm">
                                      {anyPending ? 'En Verificación' : `Bs. ${formatBs(totalMontoGrupo)}`}
                                    </span>
                                  </div>
                                </div>

                                {/* Desglose detallado de cada actividad comercial para este mes */}
                                <div className="mt-2.5 pt-2 border-t border-slate-200/60 space-y-1.5 pl-7">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Detalle del mes por actividad económica:
                                  </div>
                                  {group.items.map((r: any) => {
                                    const montoAct = parseFloat(getReciboMonto(r) || '0');
                                    return (
                                      <div key={r.referencia} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded px-2.5 py-1.5">
                                        <div className="flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                          <span className="font-semibold text-slate-700">{r._act || 'Actividad Comercial'}</span>
                                          <span className="text-[10px] font-mono text-slate-400">({r._inmId})</span>
                                        </div>
                                        <span className="font-bold text-slate-800 shrink-0">
                                          Bs. {formatBs(montoAct)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              group.items.map((r: any) => (
                                <label key={r.referencia} className={`flex items-center justify-between py-1.5 px-2 border rounded transition-colors ${selectedRecibos.includes(r.referencia) ? 'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-400' : isItemPending(r.referencia) ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                                  <div className="flex items-center gap-3">
                                    <input type="checkbox" checked={selectedRecibos.includes(r.referencia)} disabled={isItemPending(r.referencia)} onChange={() => toggleRecibo(r.referencia)}
                                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                    />
                                    <div>
                                      <p className="font-bold text-xs text-slate-700 flex items-center gap-1.5 flex-wrap">
                                        {r.referencia?.startsWith('RECIB-HIST-') || r.referencia?.startsWith('CM-') ? (
                                          <>
                                            <span className="text-emerald-800">Recibo de Aseo</span>
                                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded">Ref: {r.referencia}</span>
                                          </>
                                        ) : r.referencia}
                                      </p>
                                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1 mt-0.5">
                                        {r.referencia?.startsWith('MULTA-')
                                          ? (r.descripcion_periodo || `MULTA POR MORA (HASTA ${formatMonthYear(r.emision)})`)
                                          : formatMonthYear(r.emision)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right flex items-center gap-2">
                                    {isItemPending(r.referencia) ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-amber-600 text-xs">En Verificación</span>
                                        {pendingPagoMap.get(r.referencia) && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setModalPagoComp(pendingPagoMap.get(r.referencia));
                                            }}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                                            title="Ver comprobante del pago en verificación"
                                          >
                                            <Eye className="w-3 h-3" /> Ver Comprobante
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="font-bold text-emerald-700 text-xs">
                                        Bs. {formatBs(parseFloat(getReciboMonto(r) || '0'))}
                                      </span>
                                    )}
                                  </div>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}

                  </div>
                )}
              </div>
            </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-orange-50 px-4 py-3 border-b border-orange-200 flex items-center gap-2">
                <Handshake className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-orange-800">Cuotas de Convenio de Pago</h3>
              </div>
              <div className="p-4">
                {cuotas.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay cuotas pendientes.</p>
                ) : (
                  <div className="space-y-2">
                    {cuotas.map((c, i) => (
                      <label key={i} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${selectedCuotas.find(sc => sc.convId === c.convId && sc.cuotaId === c.cuotaId) ? 'bg-orange-50 border-orange-200' : 'hover:bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={!!selectedCuotas.find(sc => sc.convId === c.convId && sc.cuotaId === c.cuotaId)}
                            onChange={() => toggleCuota(c.convId, c.cuotaId)}
                            className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                          />
                          <div>
                            <p className="font-semibold text-sm text-slate-800">{c.numeroConv} - Cuota {c.cuotaId + 1}</p>
                            <p className="text-xs text-slate-500">Fecha de Pago: {c.fecha}</p>
                          </div>
                        </div>
                        <span className="font-bold text-orange-700">{c.monto} Bs</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tala y Poda */}
            {talaPoda.length > 0 && (
              <div className={`bg-white rounded-lg shadow-sm border overflow-hidden ${selectedTalaPoda.length > 0 ? 'border-green-300' : 'border-slate-200'}`}>
                <div className="bg-green-50 px-4 py-3 border-b border-green-200 flex items-center gap-2">
                  <TreePine className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <h3 className="font-bold text-green-800">Servicio de Tala y Poda</h3>
                  <span className="text-xs text-green-600 font-medium">({talaPoda.length})</span>
                </div>
                <div className="p-4 space-y-2">
                  {talaPoda.map((s: any) => (
                    <label key={s.referencia} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${selectedTalaPoda.includes(s.referencia) ? 'bg-green-50 border-green-300' : 'hover:bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTalaPoda.includes(s.referencia)}
                          onChange={() => toggleTalaPoda(s.referencia)}
                          className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500"
                        />
                        <TreePine className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-sm text-slate-800">{s.descripcion || 'Servicio de Tala y Poda'}</p>
                          <p className="text-xs text-slate-500">{s.referencia} • {s.fecha || 'Sin fecha'}</p>
                        </div>
                      </div>
                      {(() => {
                        const baseMonto = parseFloat(s.monto || '0');
                        return (
                          <div className="text-right shrink-0">
                            <span className="font-bold text-green-700 block text-sm">Bs. {formatBs(baseMonto)}</span>
                            <span className="text-[10px] text-emerald-600 font-medium">Monto Total (Tasa / IVA Incluido)</span>
                          </div>
                        );
                      })()}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Servicios Especiales Pendientes */}
            {serviciosEsp.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-purple-50 px-4 py-3 border-b border-purple-200 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-purple-600" />
                  <h3 className="font-bold text-purple-800">Servicios Especiales / Extraordinarios Pendientes</h3>
                  <span className="text-xs text-purple-600 font-medium">({serviciosEsp.length})</span>
                </div>
                <div className="p-4 space-y-2">
                  {serviciosEsp.map((s) => {
                    const iconMap: Record<string, any> = { especial: Wrench, extraordinario: FlaskConical, inspeccion: ClipboardCheck, visto_bueno: ShieldCheck };
                    const Icon = iconMap[s.tipo] || Wrench;
                    return (
                      <label key={s.referencia} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${selectedServicios.includes(s.referencia) ? 'bg-purple-50 border-purple-200' : 'hover:bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox"
                            checked={selectedServicios.includes(s.referencia)}
                            onChange={() => toggleServicio(s.referencia)}
                            className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                          />
                          <Icon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-sm text-slate-800">{s.descripcion}</p>
                            <p className="text-xs text-slate-500">{s.referencia} • {s.fecha}</p>
                          </div>
                        </div>
                        {(() => {
                          const ucd = Number(s.valor_ucd || 0);
                          const fac = Number(s.factor || 1);
                          const nve = Number(s.nve || 1);
                          const currentTasa = customBcvRate && !isNaN(parseFloat(customBcvRate)) ? parseFloat(customBcvRate) : (tcmmv || 0);
                          const baseMonto = (ucd > 0 && currentTasa > 0) ? Math.round(ucd * fac * nve * currentTasa * 100) / 100 : parseFloat(s.monto || '0');
                          return (
                            <div className="text-right shrink-0">
                              <span className="font-bold text-purple-700 block text-sm">Bs. {formatBs(baseMonto)}</span>
                              {ucd > 0 ? (
                                <span className="text-[10px] text-slate-500 font-medium">{ucd * fac * nve} UCD · Tasa Bs {formatBs(currentTasa)}</span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 font-medium">Tasa Administrativa</span>
                              )}
                            </div>
                          );
                        })()}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

                    {/* Panel de Pago Disgregado */}
          <div className="bg-slate-50 rounded-lg shadow-sm border border-slate-200 p-6 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h3 className="font-bold text-slate-800 text-lg mb-4 border-b border-slate-200 pb-2">Resumen de Pago</h3>
            
            {/* Actividades Unificadas Badge en Resumen */}
            {(() => {
              const userInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);
              const billableInms = userInms.filter((i: any) => (i.actividad_principal || '').trim().toUpperCase() !== 'N/A');
              const clustersMap = clusterInmueblesByLocal(billableInms);
              const selectedRefsThisUser = selectedRecibos.filter(r => r.startsWith('RECIB-HIST-'));
              
              // Ver si hay actividades seleccionadas que pertenezcan al mismo cluster
              const selectedInmCodes = Array.from(new Set(selectedRefsThisUser.map(r => r.split('-')[2])));
              const clusterCounts = new Map<string, string[]>();
              selectedInmCodes.forEach(code => {
                const cInfo = clustersMap.get(code);
                const cid = cInfo?.localId || code;
                if (!clusterCounts.has(cid)) clusterCounts.set(cid, []);
                clusterCounts.get(cid)!.push(code);
              });

              const unifiedClusters = Array.from(clusterCounts.entries()).filter(([_, codes]) => codes.length > 1);
              if (unifiedClusters.length === 0) return null;

              return (
                <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-2.5 mb-3 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Actividades Unificadas ({unifiedClusters.reduce((sum, [_, c]) => sum + c.length, 0)}):</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                    {unifiedClusters.map(([_, codes]) => codes.join(' + ')).join(', ')} se cobran unificadas en un solo recibo mensual.
                  </p>
                </div>
              );
            })()}

            <div className="space-y-2 mb-6 text-sm border-b border-slate-200 pb-4">
              <div className="flex justify-between items-center text-slate-600">
                <span>Base Imponible Total:</span>
                <span className="font-semibold">Bs. {formatBs(sumBase)}</span>
              </div>
              
              <div className="flex justify-between items-center text-slate-600 mt-2">
                <span>IVA (16%) Total:</span>
                <span className="font-semibold">Bs. {formatBs(sumIVA)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600 mt-2">
                <span>Multa Total:</span>
                <span className="font-semibold text-rose-600">Bs. {formatBs(sumMulta)}</span>
              </div>
              {sumIVARetencionable > 0 && (
                <div className="mt-1 inline-flex items-center gap-1.5 bg-amber-100 text-amber-900 text-xs font-bold px-2.5 py-1 rounded-md border border-amber-300">
                  <span>⚠️ Agente de Retención — Aplica retención sobre comercios autorizados (Bs. {formatBs(sumIVARetencionable)} de IVA)</span>
                </div>
              )}

              {ivaPercent > 0 && sumIVA > 0 && (
                <div className="mt-3 bg-slate-100 p-3 rounded border border-slate-200">
                  {sumIVARetencionable > 0 ? (
                    <>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-slate-700 text-xs">Retención de IVA (Comercios Autorizados):</span>
                        <select 
                          value={retencionIVA} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setRetencionIVA(val);
                            if (val === 0) setComprobanteRetencion('');
                          }}
                          className="border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-emerald-500 bg-white"
                        >
                          <option value={75}>75% (Providencia SENIAT)</option>
                          <option value={100}>100% (Exención Total)</option>
                          <option value={0}>0% (Sin Retención)</option>
                        </select>
                      </div>
                      {retencionIVA > 0 && (
                        <div className="flex justify-between items-center mt-1 text-xs">
                          <span className="font-semibold text-slate-700">Monto Retenido:</span>
                          <span className="text-red-600 font-bold">- Bs. {formatBs(sumIVARetencionable * (retencionIVA / 100))}</span>
                        </div>
                      )}
                      {retencionIVA > 0 && (
                        <div className="mt-2 space-y-2">
                          <input 
                            type="text" 
                            placeholder="N° Comprobante de Retención IVA (ej. 20261000001)" 
                            value={comprobanteRetencion}
                            onChange={e => setComprobanteRetencion(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-emerald-500 font-mono bg-white"
                          />
                          <div>
                            <label className="text-[11px] font-semibold text-slate-700 mb-1 block">
                              Adjuntar Comprobante Retención SENIAT (PDF o Imagen):
                            </label>
                            <div className="border border-dashed border-slate-300 bg-white rounded p-2 flex items-center justify-between text-xs relative hover:bg-slate-50 transition-colors">
                              <input 
                                type="file" 
                                accept="image/*,.pdf"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    setComprobanteRetencionFile(e.target.files[0]);
                                  }
                                }}
                              />
                              {comprobanteRetencionFile ? (
                                <span className="font-semibold text-emerald-700 truncate max-w-[220px]">
                                  📎 {comprobanteRetencionFile.name}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">
                                  📁 Clic para adjuntar comprobante SENIAT (.pdf, .jpg, .png)
                                </span>
                              )}
                              {comprobanteRetencionFile && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setComprobanteRetencionFile(null);
                                  }}
                                  className="text-[10px] text-red-600 hover:text-red-800 font-bold ml-2 relative z-10"
                                >
                                  Quitar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-slate-500 text-xs flex items-center gap-1.5">
                      <span className="font-medium">
                        Retención de IVA no aplicable (Solo habilitada para comercios calificados como Agente de Retención).
                      </span>
                    </div>
                  )}
                </div>
              )}

              {useSaldoFavor && foundUser?.SaldoFavor > 0 && (
                <div className="flex justify-between items-center text-emerald-600 font-medium mt-2">
                  <span>Saldo a Favor Aplicado:</span>
                  <span>- Bs. {formatBs(Math.min((sumBase + sumIVA + sumMulta) - (sumIVARetencionable * (retencionIVA / 100)), foundUser.SaldoFavor))}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-200">
                <span className="text-slate-800 font-bold text-base">Total Neto a Pagar:</span>
                <span className="text-2xl font-black text-emerald-700">Bs. {formatBs(totalNetoAPagar)}</span>
              </div>

              {/* Si se está realizando un Abono (monto ingresado menor al total o abono de condominio) */}
              {(() => {
                const montoIngresado = ['Transferencia', 'Deposito'].includes(paymentMethod)
                  ? parseLocalFloat(montoTransferido)
                  : parseLocalFloat(montoDebito);
                
                const isAbonoActivo = (montoIngresado > 0 && montoIngresado < totalNetoAPagar - 0.02) || 
                                     (isCondominio && condominioModo === 'Abono');
                
                if (!isAbonoActivo) return null;

                const montoAbonando = isCondominio && condominioModo === 'Abono' 
                  ? (parseLocalFloat(montoAbonoCondo) || 0)
                  : montoIngresado;
                
                const baseTotal = isCondominio && condominioModo === 'Abono'
                  ? totalDeudaCondominio
                  : totalNetoAPagar;

                const faltaPorPagar = Math.max(0, baseTotal - montoAbonando);

                return (
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-orange-300 rounded-xl p-3 shadow-xs space-y-1.5 mt-2">
                    <div className="flex justify-between items-center text-xs text-amber-900 font-bold">
                      <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                        Modo Abono Parcial
                      </span>
                      <span className="bg-orange-200 text-orange-950 px-2 py-0.5 rounded text-[11px] font-black">
                        Abona: Bs. {formatBs(montoAbonando)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-black text-rose-700 pt-1.5 border-t border-orange-200">
                      <span className="uppercase tracking-wide">🔴 FALTA POR PAGAR:</span>
                      <span className="text-base font-black text-rose-600">Bs. {formatBs(faltaPorPagar)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-slate-700">Método de Pago</span>
                <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors">
                  <input type="checkbox" checked={isPagoMultiple} onChange={e => setIsPagoMultiple(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  <span className="text-xs font-bold text-slate-700 uppercase">Pago Múltiple</span>
                </label>
              </div>
              
              {isPagoMultiple && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800 font-medium">
                    <strong>Pago Múltiple activado:</strong> Registre la transferencia primero. 
                    El recibo quedará bloqueado hasta que la transferencia sea conciliada (verificada). 
                    Una vez aprobada, el contribuyente podrá cancelar el monto restante con Débito u otro método.
                  </p>
                </div>
              )}
              <label className="block">
                <select 
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                >
                  <option value="Debito">Punto de Venta (Tarjeta de Débito)</option>
                  <option value="Credito">Punto de Venta (Tarjeta de Crédito)</option>
                  <option value="TMD">TMD (Tarjeta de Crédito Master)</option>
                  <option value="TVD">TVD (Tarjeta de Crédito Visa)</option>
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Deposito">Depósito Bancario</option>
                  {(foundUser?.SaldoFavor || 0) > 0 && (
                    <option value="Saldo a Favor">💳 Saldo a Favor (Bs. {formatBs(foundUser?.SaldoFavor || 0)})</option>
                  )}
                  </select>
              </label>

                  {['Debito', 'Credito', 'TMD', 'TVD'].includes(paymentMethod) && (
                    <div className="mt-4 space-y-3">
                      <label className="block mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-600 block">
                            {paymentMethod === 'TMD' ? 'Monto Tarjeta Master (Bs)' : paymentMethod === 'TVD' ? 'Monto Tarjeta Visa (Bs)' : paymentMethod === 'Credito' ? 'Monto Tarjeta de Crédito (Bs)' : 'Monto a Cobrar por Punto (Bs)'}
                          </span>
                          {totalNetoAPagar > 0 && (
                            <button
                              type="button"
                              onClick={() => setMontoDebito(totalNetoAPagar.toFixed(2).replace('.', ','))}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                            >
                              Cobrar Total (Bs. {formatBs(totalNetoAPagar)})
                            </button>
                          )}
                        </div>
                        <input 
                          type="text" 
                          value={montoDebito} 
                          onChange={e => setMontoDebito(formatLocalNumberInput(e.target.value))} 
                          onBlur={e => { const p = parseLocalFloat(e.target.value); if (p > 0) setMontoDebito(formatLocalNumberInput(p.toFixed(2).replace('.', ','))); }}
                          placeholder={`Bs. ${formatBs(totalNetoAPagar)}`} 
                          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
                        />
                        {(() => {
                          const dVal = parseLocalFloat(montoDebito);
                          if (!dVal || dVal <= 0) return null;
                          const diff = Math.round((dVal - totalNetoAPagar) * 100) / 100;
                          if (diff < -0.02) {
                            return (
                              <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 mt-2">
                                <div className="flex justify-between items-center text-xs font-bold text-amber-900">
                                  <span>⚠️ Abono por Punto de Venta:</span>
                                  <span>Bs. {formatBs(dVal)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-black text-rose-700 mt-1 pt-1 border-t border-amber-200">
                                  <span>🔴 FALTA POR PAGAR:</span>
                                  <span>Bs. {formatBs(Math.abs(diff))}</span>
                                </div>
                              </div>
                            );
                          }
                          if (diff > 0.02) {
                            return (
                              <p className="text-[10px] text-emerald-600 mt-1 font-bold">
                                * Se generará un saldo a favor de Bs. {formatBs(diff)}
                              </p>
                            );
                          }
                          return (
                            <p className="text-[10px] text-emerald-700 mt-1 font-bold">
                              ✓ Pago exacto del Total Neto a Pagar (Bs. {formatBs(totalNetoAPagar)}).
                            </p>
                          );
                        })()}
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Fecha de Transacción <span className="text-red-500">*</span></span>
                        <input
                          type="date"
                          value={fechaTransaccion}
                          onChange={(e) => {
                            setFechaTransaccion(e.target.value);
                          }}
                          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Fecha de Ingreso a Caja (Corte) <span className="text-red-500">*</span></span>
                        <input
                          type="date"
                          value={fechaCorteCaja}
                          onChange={(e) => setFechaCorteCaja(e.target.value)}
                          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
                          {paymentMethod === 'TMD' ? 'Número de Aprobación / Referencia TMD (Master)' : paymentMethod === 'TVD' ? 'Número de Aprobación / Referencia TVD (Visa)' : paymentMethod === 'Credito' ? 'Número de Aprobación / Referencia Tarjeta Crédito' : 'Número de Comprobante / Referencia POS'} <span className="text-red-500">*</span> (máx. 8 dígitos)
                        </span>
                        <input 
                          type="text" 
                          value={referenciaDebito} 
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                            setReferenciaDebito(val);
                          }}
                          maxLength={8}
                          placeholder="Ej. 00012345" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium text-slate-700"
                        />
                        <span className="text-[10px] text-slate-400">{referenciaDebito.length}/8 dígitos</span>
                      </label>
                    </div>
                  )}

                  {['Transferencia', 'Deposito'].includes(paymentMethod) && (
                <div className="space-y-3 bg-white p-3 rounded border border-slate-200">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Cuenta Bancaria Receptora / Destino (Alcaldía / IAMEC)</span>
                    <select
                      value={bancoDestino}
                      onChange={(e) => setBancoDestino(e.target.value)}
                      className="w-full border border-blue-300 bg-blue-50/40 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                    >
                      <option value="BANCAMIGA - 0172 - 0717">Bancamiga (0172) - 01720110711101340717 (IAMEC BANCAMIGA)</option>
                      <option value="BANESCO - 0134 - 8636">Banesco (0134) - 01341089590001008636 (IAMEC)</option>
                      <option value="BANCO DE VENEZUELA - 0102">Banco de Venezuela (0102)</option>
                      <option value="BANCO MERCANTIL - 0105">Banco Mercantil (0105)</option>
                      <option value="BANCO PROVINCIAL - 0108">Banco Provincial (0108)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Fecha de Transacción</span>
                    <input
                      type="date"
                      value={fechaTransaccion}
                      onChange={(e) => {
                        setFechaTransaccion(e.target.value);
                      }}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Fecha de Ingreso a Caja (Corte) <span className="text-red-500">*</span></span>
                    <input
                      type="date"
                      value={fechaCorteCaja}
                      onChange={(e) => setFechaCorteCaja(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Banco Emisor (del Contribuyente)</span>
                    <select
                      value={banco}
                      onChange={(e) => setBanco(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="" disabled>Seleccione un Banco...</option>
                      {BANCOS_VENEZUELA.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Referencia de Transferencia (máx. 8 dígitos)</span>
                    <input 
                      type="text" 
                      placeholder="12345678"
                      value={referencia}
                      onChange={async (e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                        setReferencia(val);
                        setDupRefWarning('');
                        if (val.length >= 4) {
                          const { data } = await supabase.from('pagos_reportados').select('id').eq('referencia', val).not('estado', 'in', '(Rechazado,Anulado,Reversado)').limit(1);
                          if (data && data.length > 0) setDupRefWarning(`âš ï¸ Esta referencia "${val}" ya fue registrada antes.`);
                        }
                      }}
                      maxLength={8}
                      className={`w-full border rounded px-3 py-2 text-sm focus:ring-2 outline-none ${dupRefWarning ? 'border-red-400 focus:ring-red-400 bg-red-50' : 'border-slate-300 focus:ring-emerald-500'}`}
                    />
                    {dupRefWarning && <p className="text-[10px] text-red-600 font-bold mt-1">{dupRefWarning}</p>}
                    <span className="text-[10px] text-slate-400">{referencia.length}/8 dígitos</span>
                  </label>
                  <label className="block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600 block">Monto Total Pagado (Bs)</span>
                      {totalNetoAPagar > 0 && (
                        <button
                          type="button"
                          onClick={() => setMontoTransferido(totalNetoAPagar.toFixed(2).replace('.', ','))}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                        >
                          Usar Total Neto (Bs. {formatBs(totalNetoAPagar)})
                        </button>
                      )}
                    </div>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      placeholder="Ej: 500,00"
                      value={montoTransferido}
                      onChange={(e) => {
                        setMontoTransferido(formatLocalNumberInput(e.target.value));
                      }}
                      onBlur={(e) => {
                         const p = parseLocalFloat(e.target.value);
                         if (p > 0) setMontoTransferido(formatLocalNumberInput(p.toFixed(2).replace('.', ',')));
                      }}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {(() => {
                      const tVal = parseLocalFloat(montoTransferido);
                      if (tVal <= 0) return null;
                      const diff = Math.round((tVal - totalNetoAPagar) * 100) / 100;
                      if (diff > 0.02) {
                        return (
                          <p className="text-[10px] text-emerald-600 mt-1 font-bold">
                            * Se generará un saldo a favor de Bs. {formatBs(diff)}
                          </p>
                        );
                      }
                      if (diff < -0.02) {
                        return (
                          <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 mt-2">
                            <div className="flex justify-between items-center text-xs font-bold text-amber-900">
                              <span>⚠️ Abono por Transferencia:</span>
                              <span>Bs. {formatBs(tVal)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs font-black text-rose-700 mt-1 pt-1 border-t border-amber-200">
                              <span>🔴 FALTA POR PAGAR:</span>
                              <span>Bs. {formatBs(Math.abs(diff))}</span>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <p className="text-[10px] text-emerald-700 mt-1 font-bold">
                          ✓ Pago exacto del Total Neto a Pagar (Bs. {formatBs(totalNetoAPagar)}).
                        </p>
                      );
                    })()}
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Comprobante de Pago <span className="text-red-500">*</span></span>
                    <div className="border-2 border-dashed border-slate-300 bg-slate-50 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative">
                      <input 
                        type="file" 
                        accept="image/*,.pdf"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setComprobante(e.target.files[0]);
                          }
                        }}
                      />
                      {comprobante ? (
                        <div className="text-center">
                          <span className="text-sm font-semibold text-emerald-600 truncate max-w-full block px-2">{comprobante.name}</span>
                          <span className="text-[10px] text-slate-500 mt-1 block">Haz clic para cambiar el archivo</span>
                        </div>
                      ) : (
                        <div className="text-center">
                          <span className="text-sm font-medium text-slate-700 block">Haz clic para adjuntar comprobante</span>
                          <span className="text-[10px] text-slate-500 mt-1 block">Formatos: JPG, PNG, PDF</span>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              )}
            </div>

            <button 
              onClick={handlePayment}
              disabled={isProcessing || (!isCondominio && totalBs <= 0) || (isCondominio && condominioModo === 'Local' && selectedHijos.length === 0) || (isCondominio && condominioModo === 'Abono' && (!montoAbonoCondo || parseLocalFloat(montoAbonoCondo) <= 0))}
              className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <CreditCard className="w-5 h-5" /> 
              {isProcessing ? 'Procesando...' : 'Verificar y Pagar'}
            </button>

            {/* Historial de pagos de la sesión */}
            {sessionPagos.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Pagos de esta sesión ({sessionPagos.length})</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {sessionPagos.map((p, i) => (
                    <div key={i} className="flex justify-between items-start text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <div>
                        <div className="font-bold text-slate-700 truncate max-w-[180px]">{p.contribuyente}</div>
                        {p.inmueble && <div className="text-slate-500 font-medium">{p.inmueble}</div>}
                        <div className="text-slate-500">{p.metodo} · {p.hora}</div>
                        {p.referencia && <div className="text-slate-400">Ref: {p.referencia}</div>}
                        {p.esAbono && <span className="text-orange-600 font-semibold">Abono</span>}
                        {p.saldoFavor > 0 && <div className="text-blue-600">+Saldo favor: Bs. {formatBs(p.saldoFavor)}</div>}
                      </div>
                      <div className="font-black text-emerald-700 text-sm">Bs. {formatBs(p.monto)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-xs font-bold text-slate-700">
                  Total sesión: <span className="text-emerald-700">Bs. {formatBs(sessionPagos.reduce((s, p) => s + p.monto, 0))}</span>
                </div>
              </div>
            )}
        </div>
        </div>
        )}
      </div>
      )}
      </div>
      )}

      {/* ── Modal de Confirmación de Pago ── */}
      {isConfirmModalOpen && confirmPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden my-auto border border-slate-200">
            {/* Cabecera Fija */}
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-white font-black text-lg">Confirmar Pago</h3>
                <p className="text-slate-400 text-xs mt-0.5">Verifique los datos antes de procesar</p>
              </div>
              <button 
                onClick={() => { setIsConfirmModalOpen(false); setConfirmPayload(null); }} 
                className="text-slate-400 hover:text-white text-2xl font-bold leading-none p-1 transition-colors"
                title="Cerrar"
              >
                &times;
              </button>
            </div>

            {/* Cuerpo con barra de desplazamiento (Scroll) */}
            <div 
              className="p-6 space-y-4 overflow-y-auto flex-1"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#94a3b8 #f1f5f9'
              }}
            >
              {/* Contribuyente */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Contribuyente</p>
                <p className="font-black text-slate-800 text-sm">{foundUser?.Contribuyente}</p>
                <p className="text-slate-500 text-xs">{foundUser?.Identidad}</p>
              </div>

              {/* Recibos seleccionados con scroll interno */}
              {confirmPayload.recibosSeleccionados?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                      Recibos / Meses a saldar ({confirmPayload.recibosSeleccionados.length})
                    </p>
                    {confirmPayload.recibosSeleccionados.length > 4 && (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        ↕ Deslice para revisar todos
                      </span>
                    )}
                  </div>
                  <div 
                    className="space-y-1.5 max-h-48 overflow-y-auto pr-1.5 border border-slate-200 rounded-xl p-2.5 bg-slate-50/70"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#cbd5e1 #f8fafc'
                    }}
                  >
                    {confirmPayload.recibosSeleccionados.map((ref: string) => {
                      const f = recibos.find((r: any) => r.referencia === ref);
                      return (
                        <div key={ref} className="flex justify-between items-center text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-2xs">
                          <span className="text-slate-700 font-semibold flex items-center gap-1.5 flex-wrap">
                            {ref?.startsWith('RECIB-HIST-') || ref?.startsWith('CM-') ? (
                              <>
                                <span className="text-emerald-800">Recibo de Aseo</span>
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded">Ref: {ref}</span>
                              </>
                            ) : ref}
                          </span>
                          <span className="font-bold text-slate-900">Bs. {formatBs(getReciboMonto(f))}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cuotas de Convenio */}
              {confirmPayload.cuotasSeleccionadas?.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Cuotas de Convenio ({confirmPayload.cuotasSeleccionadas.length})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1.5 border border-slate-200 rounded-xl p-2.5 bg-slate-50/70">
                    {confirmPayload.cuotasSeleccionadas.map((c: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                        <span className="text-slate-700 font-medium">Convenio #{c.convId} - Cuota {c.cuotaId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Servicios Especiales */}
              {confirmPayload.serviciosSeleccionados?.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Servicios Especiales ({confirmPayload.serviciosSeleccionados.length})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1.5 border border-slate-200 rounded-xl p-2.5 bg-slate-50/70">
                    {confirmPayload.serviciosSeleccionados.map((sId: string) => {
                      const s = serviciosEsp.find((item: any) => item.id === sId || item.referencia === sId);
                      return (
                        <div key={sId} className="flex justify-between items-center text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                          <span className="text-slate-700 font-medium">{s?.descripcion || sId}</span>
                          <span className="font-bold text-slate-900">Bs. {formatBs(parseFloat(s?.monto || 0))}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tala y Poda */}
              {confirmPayload.talaPodaSeleccionada?.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Tala y Poda ({confirmPayload.talaPodaSeleccionada.length})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1.5 border border-slate-200 rounded-xl p-2.5 bg-slate-50/70">
                    {confirmPayload.talaPodaSeleccionada.map((tId: string) => {
                      const t = talaPoda.find((item: any) => item.id === tId || item.referencia === tId);
                      return (
                        <div key={tId} className="flex justify-between items-center text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                          <span className="text-slate-700 font-medium">{t?.descripcion || tId}</span>
                          <span className="font-bold text-slate-900">Bs. {formatBs(parseFloat(t?.monto || 0))}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Método y referencia */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Método</p>
                  <p className="font-bold text-blue-900 text-sm mt-0.5">{paymentMethod}</p>
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Fecha</p>
                  <p className="font-bold text-blue-900 text-sm mt-0.5">{fechaTransaccion}</p>
                </div>
              </div>

              {(referenciaDebito || referencia) && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">N° Referencia / Comprobante</p>
                  <p className="font-black text-amber-900 text-base tracking-widest">{referenciaDebito || referencia}</p>
                </div>
              )}

              {confirmPayload.descuentoSaldoFavor > 0 && (
                <div className="flex justify-between text-xs text-slate-600 px-1 py-0.5">
                  <span>Descuento saldo a favor:</span>
                  <span className="font-bold text-emerald-600">- Bs. {formatBs(confirmPayload.descuentoSaldoFavor)}</span>
                </div>
              )}

              {confirmPayload.esAbono ? (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-orange-300 rounded-xl p-3.5 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span className="flex items-center gap-1.5 uppercase tracking-wide">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      Pago Parcial (Abono a Cuenta)
                    </span>
                    <span className="bg-orange-200 text-orange-900 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                      Abono
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-orange-200 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Liquidado</span>
                      <span className="font-bold text-slate-800 text-sm">Bs. {formatBs(confirmPayload.finalTotal)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-emerald-700 uppercase block">Monto que Abona</span>
                      <span className="font-bold text-emerald-700 text-sm">Bs. {formatBs(confirmPayload.montoReal)}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-orange-300 flex justify-between items-center bg-white/80 -mx-3.5 -mb-3.5 p-3 rounded-b-xl">
                    <span className="font-black text-xs text-rose-800 uppercase tracking-wide">🔴 FALTA POR PAGAR:</span>
                    <span className="font-black text-base text-rose-700">Bs. {formatBs(Math.max(0, confirmPayload.finalTotal - confirmPayload.montoReal))}</span>
                  </div>
                </div>
              ) : null}

              {confirmPayload.saldoAFavorNuevo > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 font-semibold">
                  💳 Se generará Saldo a Favor de Bs. {formatBs(confirmPayload.saldoAFavorNuevo)}
                </div>
              )}

              {/* Total */}
              <div className="bg-emerald-600 rounded-xl p-4 flex justify-between items-center shadow-sm">
                <span className="text-white font-bold text-sm tracking-wide">
                  {confirmPayload.esAbono ? 'TOTAL A COBRAR HOY (ABONO)' : 'TOTAL A PAGAR'}
                </span>
                <span className="text-white font-black text-2xl">Bs. {formatBs(confirmPayload.montoReal)}</span>
              </div>
            </div>

            {/* Pie de modal fijo con botones de acción siempre visibles */}
            <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex gap-3 flex-shrink-0">
              <button
                onClick={() => { setIsConfirmModalOpen(false); setConfirmPayload(null); }}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAndPay}
                disabled={isProcessing}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow-md shadow-emerald-600/30"
              >
                <CreditCard className="w-4 h-4" />
                {isProcessing ? 'Procesando...' : 'Procesar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ACTUALIZACIÓN DE DATOS DE CONTACTO (EMAIL / TELÉFONO) ── */}
      {showUpdateContactModal && foundUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-5 text-white flex items-start gap-4">
              <div className="p-2.5 bg-white/20 rounded-xl flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black tracking-tight">Actualizar Datos de Contacto</h3>
                <p className="text-xs text-amber-100 mt-0.5">
                  El contribuyente no posee un correo electrónico registrado en el sistema.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed">
                <strong>{foundUser.Contribuyente}</strong> ({foundUser.Identidad})
                <br />
                Para emitir la <strong>factura digital SENIAT</strong> y enviar comprobantes de pago por correo, ingrese los datos de contacto actuales del contribuyente.
              </div>

              {contactSaveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{contactSaveError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <span>Correo Electrónico</span>
                  <span className="text-red-500 font-black">*</span>
                </label>
                <input
                  type="email"
                  value={contactModalEmail}
                  onChange={e => setContactModalEmail(e.target.value)}
                  placeholder="ejemplo@gmail.com"
                  className="w-full border-2 border-slate-200 focus:border-emerald-500 focus:ring-0 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Número Telefónico (Opcional)
                </label>
                <input
                  type="tel"
                  value={contactModalPhone}
                  onChange={e => setContactModalPhone(e.target.value)}
                  placeholder="0412-1234567"
                  className="w-full border-2 border-slate-200 focus:border-emerald-500 focus:ring-0 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowUpdateContactModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Omitir por ahora
              </button>
              <button
                type="button"
                disabled={isSavingContact}
                onClick={handleSaveContactModal}
                className="px-5 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                {isSavingContact ? 'Guardando...' : 'Guardar y Actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Saldo a Favor / Notas de Crédito */}
      {isNotaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Notas de Crédito y Saldo a Favor</h3>
                <p className="text-xs text-slate-500 font-medium">{foundUser?.Contribuyente} ({foundUser?.Identidad})</p>
              </div>
              <button onClick={() => setIsNotaModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none font-bold">&times;</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-100/70 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setNotaTab('lista')}
                className={`flex-1 py-2.5 px-4 text-center transition-colors border-b-2 ${
                  notaTab === 'lista'
                    ? 'border-emerald-600 text-emerald-700 bg-white font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                📜 Notas Registradas ({contribNotas.length})
              </button>
              <button
                type="button"
                onClick={() => setNotaTab('crear')}
                className={`flex-1 py-2.5 px-4 text-center transition-colors border-b-2 ${
                  notaTab === 'crear'
                    ? 'border-emerald-600 text-emerald-700 bg-white font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                ➕ Generar Nueva Nota
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {notaTab === 'lista' ? (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <span className="text-[11px] uppercase font-bold text-emerald-700 tracking-wider block">Saldo a Favor Actual</span>
                      <span className="text-xl font-extrabold text-emerald-800">
                        Bs. {(foundUser?.SaldoFavor || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotaTab('crear')}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                    >
                      + Nueva Nota
                    </button>
                  </div>

                  {loadingNotas ? (
                    <div className="py-8 text-center text-slate-400 text-xs animate-pulse">Cargando notas de crédito...</div>
                  ) : contribNotas.length === 0 ? (
                    <div className="py-8 text-center">
                      <div className="text-3xl mb-2">📄</div>
                      <p className="text-sm font-semibold text-slate-700">No hay notas de crédito registradas</p>
                      <p className="text-xs text-slate-500 mt-1">Este contribuyente no posee notas de crédito vigentes en el sistema.</p>
                      <button
                        type="button"
                        onClick={() => setNotaTab('crear')}
                        className="mt-3 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-300"
                      >
                        Crear la primera nota
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {contribNotas.map((n: any) => {
                        const det = parseNotaDetalles(n.detalles);
                        const monto = parseLocalFloat(det.monto_bs ?? det.monto ?? 0);
                        const fecha = det.fecha_emision ? new Date(det.fecha_emision).toLocaleDateString('es-VE') : (n.created_at ? new Date(n.created_at).toLocaleDateString('es-VE') : 'N/A');
                        const ref = det.origen_referencia || 'Manual';

                        return (
                          <div key={n.id} className="p-3 bg-white hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">Bs. {monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${n.estado === 'Vigente' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                                  {n.estado || 'Vigente'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                <span className="font-semibold text-slate-700">Origen:</span> {ref} &bull; <span className="text-slate-400">{fecha}</span>
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono truncate">ID: {n.id}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAbrirEditarNota(n)}
                                title="Editar monto y referencia de la Nota de Crédito"
                                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors flex items-center gap-1"
                              >
                                <span>✏️</span>
                                <span>Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEliminarNota(n)}
                                title="Eliminar Nota de Crédito y descontar saldo"
                                className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-1.5 rounded-lg border border-red-200 transition-colors flex items-center gap-1"
                              >
                                <span>🗑️</span>
                                <span>Eliminar</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    💡 Al generar una nota de crédito manual, se aumentará inmediatamente el <strong>saldo a favor</strong> del contribuyente para ser usado en sus próximos pagos en Caja.
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Monto de la Nota (Bs)</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      value={notaManualMonto} 
                      onChange={e => setNotaManualMonto(formatLocalNumberInput(e.target.value))}
                      onBlur={e => {
                        const p = parseLocalFloat(e.target.value);
                        if (p > 0) setNotaManualMonto(formatLocalNumberInput(p.toFixed(2).replace('.', ',')));
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                      placeholder="Ej. 1.000,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Referencia Origen (8 caracteres)</label>
                    <input 
                      type="text" 
                      maxLength={8}
                      value={notaManualRef} onChange={e => setNotaManualRef(e.target.value.slice(0, 8))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono"
                      placeholder="Ej. 12345678"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">{notaManualRef.length}/8 caracteres</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setIsNotaModalOpen(false)} 
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              {notaTab === 'crear' && (
                <button 
                  type="button"
                  onClick={handleCrearNotaManual} 
                  className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                >
                  Generar Nota
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Nota de Crédito */}
      {notaEditando && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="text-base">✏️</span>
                <h3 className="font-bold text-slate-800 text-sm">Editar Nota de Crédito Manual</h3>
              </div>
              <button 
                type="button"
                onClick={() => setNotaEditando(null)} 
                disabled={guardandoEditNota}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                Al modificar el monto, el <strong>saldo a favor</strong> del contribuyente se ajustará automáticamente por la diferencia.
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monto de la Nota (Bs)</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={notaEditMonto} 
                  onChange={e => setNotaEditMonto(formatLocalNumberInput(e.target.value))}
                  onBlur={e => {
                    const p = parseLocalFloat(e.target.value);
                    if (p > 0) setNotaEditMonto(formatLocalNumberInput(p.toFixed(2).replace('.', ',')));
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800" 
                  placeholder="Ej. 1.000,00" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Referencia / Comprobante Origen</label>
                <input 
                  type="text" 
                  value={notaEditRef} 
                  onChange={e => setNotaEditRef(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono" 
                  placeholder="Ej. REF-12345678" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Concepto</label>
                <input 
                  type="text" 
                  value={notaEditMotivo} 
                  onChange={e => setNotaEditMotivo(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Ej. Ajuste de saldo por pago excedente" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setNotaEditando(null)} 
                disabled={guardandoEditNota}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleGuardarEditarNota} 
                disabled={guardandoEditNota}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                {guardandoEditNota ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cambio Tasa BCV */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Modificar Tasa BCV (Autorización)</h3>
              <button onClick={() => setShowRateModal(false)} className="text-slate-500 hover:text-slate-700 font-bold">&times;</button>
            </div>
            <form onSubmit={handleAuthorizeRateChange} className="p-6 space-y-4">
              <p className="text-sm text-slate-600 mb-2">Por favor ingresa tu contraseña de administrador, agrega una nota. Si no posees contraseña comunícate con el administrador.</p>
              {rateAuthError && (
                <div className="p-2 bg-red-50 text-red-600 text-xs font-semibold rounded border border-red-200 text-center">
                  {rateAuthError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nueva Tasa BCV</label>
                <input 
                  type="number" step="0.01" 
                  value={tempBcvRate} 
                  onChange={e => setTempBcvRate(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contraseña de Administrador</label>
                <input 
                  type="password" 
                  value={adminPassword} 
                  onChange={e => setAdminPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="********"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nota / Motivo del Cambio</label>
                <textarea 
                  maxLength={250}
                  value={rateNote} 
                  onChange={e => setRateNote(e.target.value.slice(0, 250))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  rows={3}
                  placeholder="Justifique el cambio de tasa..."
                  required
                />
                <div className="text-[10px] text-slate-500 text-right">{rateNote.length}/250 caracteres</div>
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowRateModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded">Cancelar</button>
                <button type="submit" disabled={isAuthorizing} className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-sm disabled:opacity-70">
                  {isAuthorizing ? 'Validando...' : 'Autorizar y Aplicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL RECIBO AUTOMÁTICO POST-PAGO ── */}
      {reciboData && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-6 px-2 print:bg-white print:items-start print:py-0">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full print:shadow-none print:rounded-none">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl print:hidden">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
                <span className="text-slate-800 font-bold text-lg">¡Pago Procesado! — Recibo</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button
                  onClick={() => setReciboData(null)}
                  className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  <X className="w-4 h-4" /> Cerrar
                </button>
              </div>
            </div>
            <div className="p-4">
              {Array.isArray(reciboData)
                ? reciboData.map((rd: any, idx: number) => (
                    <div
                      key={idx}
                      className={idx > 0 ? 'mt-6 pt-6 border-t border-slate-200 print:mt-0 print:pt-0 print:border-none print:break-before-page' : 'print:break-inside-avoid'}
                      style={{ breakBefore: idx > 0 ? 'page' : 'auto', pageBreakBefore: idx > 0 ? 'always' : 'auto' }}
                    >
                      {reciboData.length > 1 && (
                        <div className="text-xs font-bold text-slate-500 uppercase mb-2 print:hidden">Recibo {idx + 1} de {reciboData.length} — Inmueble: {rd.codContribuyente}</div>
                      )}
                      <ReciboImprimible data={rd} />
                    </div>
                  ))
                : <ReciboImprimible data={reciboData} />
              }
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VISOR DE COMPROBANTE ── */}
      {modalPagoComp && (
        <ModalComprobante
          pago={modalPagoComp}
          onClose={() => setModalPagoComp(null)}
        />
      )}
    </div>
  );
}
