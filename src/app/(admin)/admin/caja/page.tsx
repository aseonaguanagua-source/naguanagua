'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { exportToExcelWithLogos } from '@/lib/excelExport';
import { TreePine, Search, CreditCard, Landmark, CheckCircle, XCircle, FileText, Handshake, Calendar as CalendarIcon, Wrench, ShieldCheck, ClipboardCheck, FlaskConical, Printer, X, Building2, Store, Receipt, CheckSquare, Square, Filter, ChevronRight, DollarSign, Sparkles, AlertCircle, Coins } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs, formatPhoneNumber, isFictitiousEmail, formatMonthYear } from '@/lib/formatCurrency';
import { ReciboImprimible } from '@/components/ReciboImprimible';
import { logAudit } from '@/lib/audit';
import { calcularMensualidad, getFO, getFAR, isResidencialInm } from '@/lib/calculos';
import { getUserInmuebles, getCajeroId, isSameLocal } from '@/lib/cajaHelpers';
import { acreditarSaldoFavor, descontarSaldoFavor } from '@/lib/saldoFavor';
import { useCajaCalculations } from './hooks/useCajaCalculations';
import { useCajaSelection } from './hooks/useCajaSelection';

// ─ Constante de módulo: evita re-ordenar en cada render (fix A-4) ─
const BANCOS_VENEZUELA = [
  '100% Banco', 'Bancamiga', 'Bancaribe', 'Banco Activo', 'Banco Agrícola de Venezuela',
  'Banco Bicentenario', 'Banco Caroní', 'Banco de Venezuela', 'Banco del Tesoro',
  'Banco Exterior', 'Banco Mercantil', 'Banco Nacional de Crédito (BNC)', 'Banco Plaza',
  'Banco Provincial', 'Banco Sofitasa', 'Banesco', 'Banplus', 'Bancrecer',
  'Mi Banco', 'Banco Internacional (BIB)', 'Banco Venezolano de Crédito (BVC)',
  'BanFanb', 'Bancovi', 'Instituto Municipal de Crédito Popular (IMCP)',
  'Fondemi', 'Microfinanzas', 'Pagomovil BDV'
].sort();


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
  const [condominioModo, setCondominioModo] = useState<'Total' | 'Local' | 'Abono'>('Total');
  const [condominioSearch, setCondominioSearch] = useState("");
  const [montoAbonoCondo, setMontoAbonoCondo] = useState("");
  const [selectedHijos, setSelectedHijos] = useState<string[]>([]);
  const [hijosMesesAPagar, setHijosMesesAPagar] = useState<Record<string, number>>({});
  
  // Impuestos y Retenciones
  const [ivaPercent, setIvaPercent] = useState<number>(0); // 0 o 0.16
  const [retencionIVA, setRetencionIVA] = useState<number>(0); // 0, 75 o 100
  const [comprobanteRetencion, setComprobanteRetencion] = useState<string>('');
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
  const [sumMulta, setSumMulta] = useState(0);
  // Computed — always derived from totalBs × ivaPercent × retencionIVA%
  const montoRetencionIVA = (totalBs * ivaPercent) * (retencionIVA / 100);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'Debito' | 'Transferencia' | 'Deposito' | 'Saldo a Favor'>('Debito');
  const [referenciaDebito, setReferenciaDebito] = useState('');
  const [montoDebito, setMontoDebito] = useState<string>(''); // Monto manual punto de venta
  const [banco, setBanco] = useState('Banco de Venezuela');
  const [referencia, setReferencia] = useState('');
  const [montoTransferido, setMontoTransferido] = useState<string>('');
  const [fechaTransaccion, setFechaTransaccion] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dupRefWarning, setDupRefWarning] = useState<string>('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [customBcvRate, setCustomBcvRate] = useState<string>('');
  const [justificacionBcv, setJustificacionBcv] = useState<string>('');
  const [selectedUcdDate, setSelectedUcdDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [useSaldoFavor, setUseSaldoFavor] = useState<boolean>(true);
  
  const [isNotaModalOpen, setIsNotaModalOpen] = useState(false);
  const [isPagoMultiple, setIsPagoMultiple] = useState(false);

  // Modal de Confirmación de Pago
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<any>(null);

  // Historial de pagos de la sesión actual
  const [sessionPagos, setSessionPagos] = useState<any[]>([]);
  const [filterInm, setFilterInm] = useState<string>('');

  // Recibo imprimible post-pago
  const [reciboData, setReciboData] = React.useState<any>(null);
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
    return () => { fetchNotasCreditoAbortRef.current?.abort(); };
  }, [activeTab, fetchNotasCredito]);

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
    const dir = inm?.direccion || '';
    const startMatch = dir.match(/^\s*(?:[0-9]+\s+)+([A-Za-z0-9\-]+)/);
    if (startMatch && startMatch[1].length <= 12) return `Local ${startMatch[1].toUpperCase()}`;
    const match = dir.match(/(?:LOCAL\s*(?:COMERCIAL\s*)?(?:NRO\.?\s*)?([A-Za-z0-9\-]+)|([A-Z]\-[0-9]+))/i);
    if (match) return `Local ${(match[1] || match[2]).toUpperCase()}`;
    return inm?.inmueble ? `Inmueble ${inm.inmueble}` : (inm?.identidad || 'Local');
  }, []);

  const getHijoDebt = useCallback((hijo: any, customMeses?: number) => {
    const currentTasa = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);
    const esRes = isResidencialInm(hijo);
    const baseMensual = parseFloat(calcularMensualidad(hijo, currentTasa).toFixed(2));
    const ivaMensual = esRes ? 0 : parseFloat((baseMensual * 0.16).toFixed(2));
    const mesesTotales = Math.max(1, parseInt(hijo?.meses_deuda || '1'));
    const mesesAPagar = customMeses !== undefined ? customMeses : (hijosMesesAPagar[hijo?.id] ?? mesesTotales);

    const base = parseFloat((baseMensual * mesesAPagar).toFixed(2));
    const iva = esRes ? 0 : parseFloat((ivaMensual * mesesAPagar).toFixed(2));
    // Multa mensual por mora: 10% residencial, 12% comercial sobre los meses adeudados vencidos
    const porcentajeMulta = esRes ? 0.10 : 0.12;
    const mesesConMora = Math.max(0, mesesAPagar - 1);
    const multa = parseFloat((baseMensual * porcentajeMulta * (mesesTotales > 1 ? mesesConMora : 0)).toFixed(2));
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
  }, [customBcvRate, tcmmv, hijosMesesAPagar]);

  const totalDeudaCondominio = useMemo(() => {
    return condominioHijos.reduce((acc: number, h: any) => acc + getHijoDebt(h, Math.max(1, parseInt(h.meses_deuda || '1'))).total, 0);
  }, [condominioHijos, getHijoDebt]);

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
    return blocked;
  }, [recibos, reciboMontoMap]);

  // isItemPending: O(1) — solo consulta el Set precalculado
  const isItemPending = useCallback(
    (ref: string) => pendingRefsSet.has(ref),
    [pendingRefsSet]
  );

  // bancosVenezuela movido a BANCOS_VENEZUELA (constante de módulo, fix A-4)


  const handleAuthorizeRateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateAuthError('');
    setIsAuthorizing(true);
    
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
    setTotalBs(0);

    const idLimpioSearch = docNumber.replace(/-/g, '').toUpperCase();
    const cleanFullDoc = `${docType}${idLimpioSearch}`;

    let user = contribuyentes.find((c: any) => {
      if (!c.Identidad) return false;
      const idClean = String(c.Identidad).replace(/-/g, '').toUpperCase();
      const codMatch = c.CodCont && c.CodCont.toUpperCase() === docNumber.toUpperCase();
      const codContMatch = c.cod_cont && c.cod_cont.toUpperCase() === docNumber.toUpperCase();
      const nombreMatch = c.Contribuyente && c.Contribuyente.toUpperCase().includes(docNumber.toUpperCase());
      return idClean === cleanFullDoc || idClean === idLimpioSearch || codMatch || codContMatch || nombreMatch;
    });

    // Fallback: usuario nuevo aprobado recientemente que aún no está en el contexto React
    if (!user) {
      const { data: inmFallback } = await supabase
        .from('inmuebles')
        .select('*')
        .or(`identidad.eq.${cleanFullDoc},identidad.eq.${idLimpioSearch},inmueble.ilike.%${docNumber}%,contribuyente.ilike.%${docNumber}%`)
        .limit(1)
        .maybeSingle();

      if (inmFallback) {
        user = {
          Identidad: inmFallback.identidad,
          Contribuyente: inmFallback.contribuyente,
          Telefono: inmFallback.telefono || 'No registrado',
          Correo: inmFallback.correo_electronico || 'No registrado',
          CodCont: inmFallback.inmueble || inmFallback.cod_cont,
          cod_cont: inmFallback.inmueble || inmFallback.cod_cont,
          Direccion: inmFallback.direccion,
          Clasificacion: inmFallback.clasificacion || 'Residencial',
          Actividad: inmFallback.actividad_principal || inmFallback.actividad || '',
          SaldoFavor: parseFloat(inmFallback.saldo_favor_bs || '0'),
          Estado: inmFallback.estado || 'Activo'
        };
      }
    }
    
    if (user) {
      // Obtener TODOS los datos frescos del inmueble desde Supabase
      // Esto es crucial para que getReciboMonto calcule la deuda correctamente
      const nakedId = cleanFullDoc.replace(/^[VEJPG]-?/i, '');
      const { data: inmFresh } = await supabase
        .from('inmuebles')
        .select('*')
        .or(`identidad.eq.${user.Identidad},identidad.eq.${cleanFullDoc},identidad.eq.${nakedId},identidad.eq.${user.Identidad.replace(/-/g,'')},condominio_padre_id.eq.${user.CodCont}`);
      
      // Filtrar los inmuebles eliminados
      const activeInmFresh = (inmFresh || []).filter((i: any) => i.estado !== 'Eliminado');
      
      // Guardar inmuebles frescos para que getReciboMonto los use
      setFreshInmuebles(activeInmFresh);
      
      const saldoFavorFresh = activeInmFresh.reduce(
        (sum: number, i: any) => sum + (parseFloat(i.saldo_favor_bs || '0') || 0), 0
      );
      
      // Calcular deuda total fresca
      const deudaTotalFresh = activeInmFresh.reduce(
        (sum: number, i: any) => {
          const currentBcvRate = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : tcmmv;
          const meses = Math.max(0, parseInt(i.meses_deuda || '0'));
          if (meses > 0) {
            const esRes = isResidencialInm(i);
            const baseMes = calcularMensualidad(i, currentBcvRate);
            const ivaMes = esRes ? 0 : baseMes * 0.16;
            const multaMes = baseMes * (esRes ? 0.10 : 0.12);
            const mesesConMulta = Math.max(0, meses - 1);
            return sum + ((baseMes + ivaMes) * meses) + (multaMes * mesesConMulta);
          }
          return sum + (parseFloat(i.deuda_mmv || '0') * currentBcvRate) + parseFloat(i.deuda_congelada_bs || '0');
        }, 0
      );
      
      setFoundUser({ ...user, SaldoFavor: saldoFavorFresh, DeudaTotal: deudaTotalFresh });
      
      // Consulta directa a Supabase: siempre fresca, incluye todas las CM- mensuales
      // Incluye variantes de identidad (con/sin guión) + búsqueda por nombre (recibos antiguas sin identidad)
      const identidadClean = (user.Identidad || '').replace(/-/g, '').toUpperCase();
      const { data: allUserFacturas } = await supabase
        .from('facturas')
        .select('*')
        .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
        .or(`identidad.eq.${user.Identidad},identidad.eq.${cleanFullDoc},identidad.eq.${identidadClean}`)
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
      const combined = [...(allUserFacturas || []), ...fallbackFacturas];
      
      // Si no hay recibos, pero tiene inmuebles con deuda_mmv, inyectamos un recibo acumulado dinámico
      // Usar inmuebles frescos para evaluar si hay deuda
      const misInmuebles = activeInmFresh.length > 0 
        ? activeInmFresh
        : inmuebles.filter((i: any) => {
            const ui = (user.Identidad || '').replace(/-/g,'').toUpperCase();
            const ii = (i.identidad || '').replace(/-/g,'').toUpperCase();
            const nakedUi = ui.replace(/^[VEJPG]/i, '');
            const nakedIi = ii.replace(/^[VEJPG]/i, '');
            return ui === ii || nakedUi === nakedIi;
          });
      if (combined.length === 0 && misInmuebles && misInmuebles.length > 0) {
        // Identificar si existen contenedores "N/A" que solo envuelven actividades nietos/hijos
        const naParentCodes = misInmuebles
          .filter((i: any) => 
            (i.actividad_principal || '').trim().toUpperCase() === 'N/A' && 
            (parseInt(i.cant_inmuebles || '0') > 0 || misInmuebles.some((c: any) => c.condominio_padre_id === i.inmueble))
          )
          .map((i: any) => i.inmueble);

        // Los inmuebles cobrables son las actividades reales (excluyendo contenedores N/A)
        const billableInms = misInmuebles.filter((i: any) => !naParentCodes.includes(i.inmueble));

        const hasDeuda = billableInms.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
        if (hasDeuda && !isCondominio) {
          const now = new Date();
          billableInms.forEach((inm: any) => {
            const deudaMMV = parseFloat(inm.deuda_mmv || '0');
            const congelada = parseFloat(inm.deuda_congelada_bs || '0');
            const multa = parseFloat(inm.multa_bs || '0');
            const meses = parseInt(inm.meses_deuda || 1);
            if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {
              const numMeses = Math.max(1, meses);
              // Generar un recibo dummy por cada mes de mora con fecha uniforme de calendario
              for (let i = 1; i <= numMeses; i++) {
                const targetDate = new Date(now.getFullYear(), now.getMonth() - numMeses + i - 1, 1, 12, 0, 0);
                const dateIso = targetDate.toISOString();
                combined.push({
                  id: `dummy-hist-${inm.inmueble}-${i}`,
                  referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
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
      const userConvenios = convenios.filter((c: any) => {
        const idCleanConv = (c.identidad || '').replace(/-/g, '').toUpperCase();
        return idCleanConv === cleanFullDoc && c.estado === 'Al Día';
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

      // Cargar servicios especiales pendientes
      const { data: servEsp } = await supabase
        .from('servicios_especiales')
        .select('*')
        .or(`identidad.eq.${user.Identidad},identidad.eq.${cleanFullDoc}`)
        .eq('estado', 'Pendiente');
      setServiciosEsp((servEsp || []).filter((s: any) => s.tipo !== 'tala_poda'));

      // Cargar servicios de tala y poda pendientes
      const { data: talaData } = await supabase
        .from('servicios_especiales')
        .select('*')
        .or(`identidad.eq.${user.Identidad},identidad.eq.${cleanFullDoc}`)
        .eq('tipo', 'tala_poda')
        .eq('estado', 'Pendiente');
      setTalaPoda(talaData || []);

      // Cargar pagos pendientes de verificar para bloquear seleccion
      // Solo 'Por Verificar' bloquea — significa que ya hay una transferencia enviada esperando conciliación
      const { data: pagosPendData } = await supabase
        .from('pagos_reportados')
        .select('*')
        .or('identidad.eq.' + user.Identidad + ',identidad.eq.' + cleanFullDoc)
        .eq('estado', 'Por Verificar');
      setPagosPendientes(pagosPendData || []);

      // Buscar si es un Condominio (Padre)
      const parentCodes = activeInmFresh.map((i: any) => i.inmueble).filter(Boolean);
      const isCondoByFlag = activeInmFresh.some((i: any) => i.es_condominio === true);
      const isCondoByName = (user.Contribuyente || user.contribuyente || '').toLowerCase().includes('condominio') || (user.Actividad || user.actividad || '').toLowerCase().includes('condominio');
      const codCont = user.cod_cont || user.CodCont || user.Identidad || user.identidad;

      if (isCondoByFlag || isCondoByName || parentCodes.length > 0) {
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
            .select('id, identidad, inmueble, tipo, deuda_mmv, deuda_congelada_bs, actividad_principal, contribuyente, direccion, meses_deuda, cant_inmuebles')
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

        if (hijosData && hijosData.length > 0 && !esMultiplesActividades) {
          setIsCondominio(true);
          setCondominioHijos(hijosData);
          setSelectedHijos(hijosData.map(h => h.id));
          setCondominioModo('Total');
        } else {
          setIsCondominio(false);
          setCondominioHijos([]);
          setSelectedHijos([]);
        }
      }
      
      // Calcular IVA inicial
      if ((user.Clasificacion || '').toLowerCase().includes('residencial')) {
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
        setRetencionIVA(esAgente ? 75 : 0);
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
      if (s) total += parseFloat(s.monto || '0');
    });

    selectedTalaPoda.forEach(ref => {
      const s = talaPodaMap.get(ref);
      if (s) total += parseFloat(s.monto || '0');
    });
    
    let sb = 0, siva = 0, smulta = 0;
    const tasaActualUse = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);

    if (isCondominio) {
      if (condominioModo === 'Abono') {
        const abonoVal = parseFloat(montoAbonoCondo) || 0;
        total += abonoVal;
        sb += abonoVal;
      } else {
        const hijosToSum = condominioModo === 'Local'
          ? condominioHijos.filter(h => selectedHijos.includes(h.id))
          : (condominioModo === 'Total' ? condominioHijos : []);

        hijosToSum.forEach(h => {
          const debtInfo = getHijoDebt(h, condominioModo === 'Total' ? Math.max(1, parseInt(h.meses_deuda || '1')) : undefined);
          total += debtInfo.total;
          sb += debtInfo.base;
          siva += debtInfo.iva;
          smulta += debtInfo.multa;
        });
      }
    }

    setTotalBs(total);

    selectedRecibos.forEach(ref => {
      if (ref.startsWith('RECIB-HIST-')) {
        const parts = ref.split('-');
        const inm = inmueblesMap.get(parts[2]);
        if (inm) {
          const esRes = isResidencialInm(inm);
          // Tarifa mensual fija según Ordenanza (coincide exactamente con Tarifas / Ordenanzas)
          const bm = parseFloat(calcularMensualidad(inm, tasaActualUse).toFixed(2));

          sb += bm;
          // RESIDENCIAL ESTRICTAMENTE EXENTO DE IVA (0%)
          siva += esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));

          const f = recibosMap.get(ref);
          const emision = f?.emision ? new Date(f.emision) : new Date();
          const today = new Date();
          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());

          // Multa mensual por mora: 10% para residencial, 12% para comercial sobre la base
          if (monthsDiff > 0) {
            smulta += parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2));
          }
        }
      } else if (ref.startsWith('CM-')) {
        const allUserInms = getUserInmuebles(freshInmuebles, condominioHijos, inmuebles, foundUser);
        const userInmsLocal = allUserInms.filter((inm: any) => inm.inmueble && ref.includes(inm.inmueble));
        const targetInms = userInmsLocal.length > 0
          ? userInmsLocal
          : allUserInms.filter((i: any) => i.identidad === foundUser?.Identidad);
        targetInms.forEach((inm: any) => {
          const esRes = isResidencialInm(inm);
          const bm = parseFloat(calcularMensualidad(inm, tasaActualUse).toFixed(2));
          sb += bm;
          siva += esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
          const f = recibosMap.get(ref);
          const emision = f?.emision ? new Date(f.emision) : new Date();
          const today = new Date();
          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
          if (monthsDiff > 0) smulta += parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2));
        });
      } else {
        const f = recibosMap.get(ref);
        if (f) sb += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      }
    });

    selectedCuotas.forEach(sc => {
      const c = cuotasMap.get(`${sc.convId}:${sc.cuotaId}`);
      if (c) sb += parseFloat(c.monto || '0');
    });
    selectedServicios.forEach(ref => {
      const s = serviciosMap.get(ref);
      if (s) { sb += parseFloat(s.monto || '0'); siva += parseFloat(s.monto || '0') * ivaPercent; }
    });
    selectedTalaPoda.forEach(ref => {
      const s = talaPodaMap.get(ref);
      if (s) { sb += parseFloat(s.monto || '0'); siva += parseFloat(s.monto || '0') * ivaPercent; }
    });
    setSumBase(sb);
    setSumIVA(siva);
    setSumMulta(smulta);

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

  const fetchTasaHistorica = async () => {
    if (!selectedUcdDate) return;
    // Lógica para obtener tasa de días anteriores (simulada por ahora)
    alert(`Se buscará la tasa BCV del día ${selectedUcdDate}`);
  };

  const handlePayment = async () => {
    const isAbonoCondo = isCondominio && condominioModo === 'Abono';
    if (!isAbonoCondo && totalBs <= 0) {
      if (isCondominio && condominioModo === 'Local') {
        return alert("Debe seleccionar al menos un local comercial para realizar el cobro.");
      }
      return alert("Debe seleccionar al menos una deuda a pagar.");
    }
    if (isAbonoCondo && (parseFloat(montoAbonoCondo) <= 0 || isNaN(parseFloat(montoAbonoCondo)))) {
      return alert("Debe ingresar un monto válido a abonar para el condominio.");
    }
    
    if (retencionIVA > 0 && !comprobanteRetencion.trim()) return alert("Debe ingresar el número de comprobante de retención de IVA.");
    const calculatedTotalBs = sumBase + sumIVA + sumMulta;
    const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);
    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;
    const maxSaldoUsable = foundUser?.SaldoFavor || 0;
    // Cuando el método de pago ES Saldo a Favor, el checkbox no aplica
    // (evita doble deducción: una por descuento + otra por el método)
    const descuentoSaldoFavor = (paymentMethod !== 'Saldo a Favor' && useSaldoFavor)
      ? Math.min(totalConImpuestos, maxSaldoUsable)
      : 0;
    const finalTotal = Math.max(0, totalConImpuestos - descuentoSaldoFavor);
    
    let saldoAFavorNuevo = 0;
    let esAbono = isAbonoCondo;
    let montoReal = isAbonoCondo ? parseFloat(montoAbonoCondo) : finalTotal;
    
    const reqRef = ['Transferencia', 'Deposito'].includes(paymentMethod);

    if (reqRef) {
      if (!banco) return alert("Debe seleccionar el banco emisor.");
      if (referencia.length < 4) return alert("Debe ingresar la referencia de la transacción.");
      if (!fechaTransaccion) return alert("La fecha de transacción es obligatoria.");
      
      // Verificar referencia duplicada
      const { data: dupCheck } = await supabase
        .from('pagos_reportados')
        .select('id')
        .eq('referencia', referencia)
        .limit(1);
      if (dupCheck && dupCheck.length > 0) {
        return alert(`⚠️ ADVERTENCIA: El número de referencia "${referencia}" ya fue registrado previamente en el sistema. Verifique antes de continuar.`);
      }

      const transferido = parseFloat(montoTransferido);
      if (isNaN(transferido) || transferido <= 0) return alert("Debe ingresar un monto transferido válido.");
      
      if (transferido < finalTotal || isPagoMultiple) {
        esAbono = true;
        montoReal = transferido;
      } else if (transferido > finalTotal) {
        saldoAFavorNuevo = transferido - finalTotal;
        montoReal = transferido;
      } else {
        montoReal = transferido;
      }
    } else if (paymentMethod === 'Debito') {
      if (!referenciaDebito.trim()) return alert("Debe ingresar el número de comprobante o referencia del pago por punto.");
      if (referenciaDebito.trim().length > 8) return alert("El número de referencia para Punto de Venta no puede superar los 8 dígitos.");
      if (montoDebito && (parseFloat(montoDebito) <= 0 || isNaN(parseFloat(montoDebito)))) {
        return alert("Si ingresa un monto manual, debe ser un valor válido mayor a 0.");
      }
      // Use manual debit amount if provided
      if (montoDebito && parseFloat(montoDebito) > 0) {
        montoReal = parseFloat(montoDebito);
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
      montoReal, finalTotal, saldoAFavorNuevo, esAbono, descuentoSaldoFavor,
      reqRef,
      recibosSeleccionados: selectedRecibos,
      cuotasSeleccionadas: selectedCuotas,
      serviciosSeleccionados: selectedServicios,
      talaPodaSeleccionada: selectedTalaPoda,
    });
    setIsConfirmModalOpen(true);
  };

  const handleConfirmAndPay = async () => {
    if (!confirmPayload) return;
    const { montoReal, finalTotal, saldoAFavorNuevo, esAbono, descuentoSaldoFavor, reqRef } = confirmPayload;
    setIsConfirmModalOpen(false);
    setIsProcessing(true);
    
    try {
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
        // ─ Acreditar nuevo Saldo a Favor (fix I-6: usa inmueble principal, no inmuebles[0]) ─
        if (paymentMethod === 'Debito') {
          const result = await acreditarSaldoFavor(foundUser.Identidad, saldoAFavorNuevo);
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

      const isAutoAprobado = ['Debito', 'Saldo a Favor'].includes(paymentMethod);
      // Detect abono: montoDebito provided and < totalBs
      const esAbonoDebito = !!(montoDebito && parseFloat(montoDebito) > 0 && parseFloat(montoDebito) < confirmPayload.finalTotal + confirmPayload.descuentoSaldoFavor - 0.01);

      if (isAutoAprobado) {
        if (!esAbonoDebito) {
          // === PAGO COMPLETO: marcar todas las recibos como Pagado ===
          if (selectedRecibos.length > 0) {
            const { error: fErr } = await supabase
              .from('facturas')
              .update({ estado: 'Pagado' })
              .in('referencia', selectedRecibos);
            if (fErr) throw fErr;
          }
        } else {
          // === ABONO DÉBITO PARCIAL: descontar monto de las recibos ===
          let dineroDisponible = parseFloat(montoDebito);
          for (const ref of selectedRecibos) {
            const f = recibos.find(r => r.referencia === ref);
            if (!f) continue;
            const montoFac = parseFloat(getReciboMonto(f) || '0');
            if (dineroDisponible >= montoFac - 0.01) {
              // Recibo cubierta completamente
              dineroDisponible = Math.max(0, dineroDisponible - montoFac);
              const { error: fErr } = await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', ref);
              if (fErr) throw fErr;
            } else if (dineroDisponible > 0.01) {
              // Abono parcial: actualizar monto restante (mantener Pendiente)
              const montoRestante = (montoFac - dineroDisponible).toFixed(2);
              const { error: fErr } = await supabase.from('facturas').update({ monto: montoRestante, estado: 'Abonado' }).eq('referencia', ref);
              if (fErr) throw fErr;
              dineroDisponible = 0;
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
          await supabase.from('servicios_especiales').update({ estado: 'Pagado' }).in('referencia', selectedTalaPoda);
        }
        // Servicios especiales: solo se pagan completos (no hay abono parcial)
        if (selectedServicios.length > 0) {
          if (!esAbonoDebito) {
            // Pago completo - marcar todos como Pagado
            await supabase.from('servicios_especiales').update({ estado: 'Pagado' }).in('referencia', selectedServicios);
          } else {
            // Abono: calcular dinero restante despues de cubrir recibos
            let dineroPagado = 0;
            for (const ref of selectedRecibos) {
              const f = recibos.find(r => r.referencia === ref);
              if (f) dineroPagado += parseFloat(getReciboMonto(f) || '0');
            }
            let dineroRestanteParaServicios = Math.max(0, parseFloat(montoDebito) - dineroPagado);
            
            for (const ref of selectedServicios) {
              const s = serviciosEsp.find(sv => sv.referencia === ref);
              if (!s) continue;
              const montoS = parseFloat(s.monto || '0');
              if (dineroRestanteParaServicios >= montoS - 0.01) {
                // Alcanza para cubrir el servicio completo
                dineroRestanteParaServicios = Math.max(0, dineroRestanteParaServicios - montoS);
                await supabase.from('servicios_especiales').update({ estado: 'Pagado' }).eq('referencia', ref);
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
        const { error: insertErr } = await supabase.from('pagos_reportados').insert({
          id: pagoId,
          identidad: foundUser.Identidad,
          monto: montoReal,
          banco: paymentMethod,
          referencia: reqRef ? referencia : referenciaDebito,
          tipo: paymentMethod,
          estado: 'Aprobado',
          detalles: JSON.stringify({
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
            monto_retencion_iva: montoRetencionIVA,
            iva_percent: ivaPercent,
            es_condominio: isCondominio,
            condominio_modo: condominioModo,
            condominio_hijos_pagados: condominioModo === 'Local' ? selectedHijos : (condominioModo === 'Total' ? condominioHijos.map(h => h.id) : [])
          })
        });
        if (insertErr) {
          console.error('Error insertando pago:', insertErr);
          throw new Error('No se pudo registrar el pago: ' + insertErr.message);
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

            const tfhkaRes = await fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: pagoId,
                recibos: digitalRecibos,
                montos: digitalMontos,
                contribuyente: foundUser.Contribuyente,
                identidad: foundUser.Identidad,
                montoTotal: montoReal,
                isCondominio: isCondominio,
                formasPago: [
                  { descripcion: paymentMethod, fecha: new Date().toISOString(), forma: paymentMethod === 'Debito' ? '03' : paymentMethod === 'Deposito' ? '05' : '05', banco: banco || undefined, referencia: reqRef ? referencia : referenciaDebito || undefined, monto: montoReal }
                ]
              })
            });
            const tfhkaData = await tfhkaRes.json();
            if (tfhkaData.url) {
              window.open(tfhkaData.url, '_blank');
            }
          } catch(err) {
            console.error('Error enviando a factura digital TFHKA', err);
          }
        }

        // ── LIMPIAR DEUDA: RECIB-DEUDA o RECIB-HIST-* (después de emitir factura) ──
        const histRefs = selectedRecibos.filter(r => r.startsWith('RECIB-HIST-'));
        if ((selectedRecibos.includes('RECIB-DEUDA') || histRefs.length > 0) && !esAbonoDebito) {
          const sourceInms = freshInmuebles.length > 0 ? freshInmuebles : inmuebles;
          const userInmsClean = sourceInms.filter((i: any) =>
            (i.identidad || '').replace(/-/g,'').toUpperCase() === 
            (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
          );
          for (const inm of userInmsClean) {
            // Si hay RECIB-HIST de este inmueble específico o RECIB-DEUDA, actualizar o limpiar deuda
            const histRefsThisInm = histRefs.filter(r => r.includes(`-${inm.inmueble || inm.codigo}-`));
            const numMesesInm = parseInt(String(inm.meses_deuda || 1));
            if (selectedRecibos.includes('RECIB-DEUDA') || (histRefsThisInm.length >= numMesesInm)) {
              await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', inm.id);
            } else if (histRefsThisInm.length > 0) {
              const currentMeses = Math.max(0, numMesesInm - histRefsThisInm.length);
              await supabase.from('inmuebles').update({ meses_deuda: currentMeses }).eq('id', inm.id);
            }
          }
        }

        // ── LIMPIAR DEUDA CONDOMINIO ──
        if (isCondominio && !esAbonoDebito) {
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
            const allHijoIds = condominioHijos.map((h: any) => h.id);
            await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).in('id', allHijoIds);
            const parentClean = (freshInmuebles.length > 0 ? freshInmuebles : inmuebles).filter((i: any) =>
              (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
            );
            for (const pi of parentClean) {
              await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', pi.id);
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
            const cajero_id_recibo = getCajeroId();
            const refNum = (referenciaDebito || Date.now().toString()).slice(-7).padStart(7, '0');
            setReciboData({
              reciboNo: refNum,
              controlWeb: `WEB-${refNum}`,
              fechaEmision: new Date().toISOString().split('T')[0],
              codContribuyente: foundUser.Identidad || foundUser.cod_cont || '',
              razonSocial: foundUser.Contribuyente || '',
              domicilioFiscal: (foundUser.Direccion || 'NAGUANAGUA, CARABOBO').toUpperCase(),
              rifCi: foundUser.Identidad,
              caja: cajero_id_recibo,
              conceptos: [{
                descripcion: `Abono Parcial a Deuda ${isCondominio ? 'Condominio' : ''}`,
                precioUnit: montoReal,
                total: montoReal
              }],
              subTotal: montoReal,
              exento: montoReal,
              iva: 0,
              total: montoReal,
              formaPago: 'PUNTO DE VENTA',
              banco: 'Debito',
              referencia: reqRef ? referencia : referenciaDebito,
              tasaBcv: currentBcvRate || tcmmv || undefined,
              esAbono: true,
              montoCancelado: montoReal,
              montoPendiente: Math.max(0, (isCondominio ? totalDeudaCondominio : (foundUser.DeudaTotal || finalTotal)) - montoReal),
            });
          } catch(e) {}
        } else {
          (window as any).__lastPaymentAbono = { esAbono: false, tasaBcv: currentBcvRate };
        }
        setSuccessMsg(esAbonoDebito
          ? `Abono de Bs. ${formatBs(montoReal)} procesado. La deuda restante quedó actualizada.`
          : `Pago procesado exitosamente por ${paymentMethod}. La deuda ha sido conciliada automáticamente.`
        );
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
            if (isCondominio) {
              const hijosPagados = condominioModo === 'Local'
                ? condominioHijos.filter((h: any) => selectedHijos.includes(h.id))
                : condominioHijos;

              const conceptosCondo = hijosPagados.map((hijo: any) => {
                const infoDebt = getHijoDebt(hijo);
                const localDesc = getLocalLabel(hijo);
                const nombreLocal = hijo.contribuyente ? ` - ${hijo.contribuyente}` : '';
                const descMeses = infoDebt.mesesTotales > 1
                  ? ` [${infoDebt.mesesAPagar} mes${infoDebt.mesesAPagar !== 1 ? 'es' : ''} cancelado${infoDebt.mesesAPagar !== 1 ? 's' : ''}${infoDebt.mesesTotales > infoDebt.mesesAPagar ? ` • Restan ${infoDebt.mesesTotales - infoDebt.mesesAPagar}` : ' • Al día'}]`
                  : '';
                return {
                  descripcion: `Aseo Urbano - ${localDesc}${nombreLocal}${descMeses} (${hijo.inmueble || ''})`,
                  precioUnit: infoDebt.total,
                  total: infoDebt.total
                };
              });

              const refNum = (referenciaDebito || Date.now().toString()).slice(-7).padStart(7, '0');
              setReciboData({
                reciboNo: refNum,
                controlWeb: `WEB-${refNum}`,
                fechaEmision: new Date().toISOString().split('T')[0],
                codContribuyente: foundUser.Identidad || foundUser.cod_cont || '',
                razonSocial: foundUser.Contribuyente || '',
                domicilioFiscal: (foundUser.Direccion || 'NAGUANAGUA, CARABOBO').toUpperCase(),
                rifCi: foundUser.Identidad,
                caja: cajero_id_recibo,
                conceptos: conceptosCondo.length > 0 ? conceptosCondo : [{
                  descripcion: `Cobro Consolidado Condominio (${condominioHijos.length} Unidades)`,
                  precioUnit: montoReal,
                  total: montoReal
                }],
                subTotal: sumBase || montoReal,
                exento: 0,
                iva: sumIVA,
                total: montoReal,
                formaPago: 'PUNTO DE VENTA',
                banco: 'Debito',
                referencia: reqRef ? referencia : referenciaDebito,
                tasaBcv: currentBcvRate || tcmmv || undefined,
                esAbono: false,
              });
            } else {
            const userInmsRec = (inmuebles as any[]).filter((i: any) =>
              (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
            );
            const primerInm = userInmsRec[0];
            const MESES_REC = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
            const getMesRec = (emision: string) => {
              if (!emision) return '---';
              const p = emision.split('-');
              return p.length >= 2 ? `${MESES_REC[parseInt(p[1])-1]} ${p[0]}` : emision;
            };

            // Agrupar facturas seleccionadas por inmueble
            const facturasPorInmueble: Record<string, { inm: any; refs: string[] }> = {};
            selectedRecibos.forEach((ref: string) => {
              // Extraer código de inmueble de la referencia CM-I-000080-09-2026
              const matchedInm = userInmsRec.find((i: any) => i.inmueble && ref.includes(i.inmueble));
              const inmKey = matchedInm?.inmueble || '__general__';
              if (!facturasPorInmueble[inmKey]) {
                facturasPorInmueble[inmKey] = { inm: matchedInm || primerInm, refs: [] };
              }
              facturasPorInmueble[inmKey].refs.push(ref);
            });

            const grupos = Object.values(facturasPorInmueble);
            const recibosArray = grupos.map((grupo, idx) => {
              const inmGrupo = grupo.inm || primerInm;
              const conceptosGrupo: any[] = [];
              grupo.refs.forEach((ref: string) => {
                if (ref.startsWith('RECIB-HIST-')) {
                  const pDet = pagosPendientes.find((p: any) => p.facturas && p.facturas[0]?.referencia === ref);
                  if (pDet && pDet.facturas && pDet.facturas[0]) {
                    const f = pDet.facturas[0];
                    conceptosGrupo.push({ descripcion: `Mes Histórico (M${f.mesNum}) - Base Imponible`, precioUnit: parseFloat(f.base), total: parseFloat(f.base) });
                    if (parseFloat(f.iva) > 0) {
                      conceptosGrupo.push({ descripcion: `Mes Histórico (M${f.mesNum}) - IVA (16%)`, precioUnit: parseFloat(f.iva), total: parseFloat(f.iva) });
                    }
                    const porcentajeMulta = f.clasificacion.toLowerCase().includes('residencial') ? '10%' : '12%';
                    if (parseFloat(f.multa) > 0) {
                      conceptosGrupo.push({ descripcion: `Mes Histórico (M${f.mesNum}) - Multa (${porcentajeMulta})`, precioUnit: parseFloat(f.multa), total: parseFloat(f.multa) });
                    }
                  } else {
                    const parts = ref.split('-');
                    const inmId = parts[2];
                    const inm = userInmsRec.find((i: any) => i.inmueble === inmId) || inmuebles.find((i: any) => i.inmueble === inmId) || primerInm;
                    const esRes = isResidencialInm(inm);
                    const bm = parseFloat(calcularMensualidad(inm, currentBcvRate).toFixed(2));
                    const f = recibos.find((r: any) => r.referencia === ref);
                    const emision = f?.emision ? new Date(f.emision) : new Date();
                    const today = new Date();
                    const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
                    const multa = monthsDiff > 0 ? parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2)) : 0;
                    const iva = esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
                    const mesNum = parts[3]?.replace('M', '') || '1';
                    conceptosGrupo.push({ descripcion: `Mes Histórico (M${mesNum}) - Base Imponible`, precioUnit: bm, total: bm });
                    if (iva > 0) {
                      conceptosGrupo.push({ descripcion: `Mes Histórico (M${mesNum}) - IVA (16%)`, precioUnit: iva, total: iva });
                    }
                    if (multa > 0) {
                      conceptosGrupo.push({ descripcion: `Mes Histórico (M${mesNum}) - Multa (${esRes ? '10%' : '12%'})`, precioUnit: multa, total: multa });
                    }
                  }
                } else {
                  const f = recibos.find((r: any) => r.referencia === ref);
                  const montoF = f ? parseFloat(getReciboMonto(f) || '0') : 0;
                  conceptosGrupo.push({
                    descripcion: `Servicio Aseo Residencial/Comercial. Correspondiente al mes de: ${getMesRec(f?.emision || '')}`,
                    precioUnit: montoF,
                    total: montoF
                  });
                }
              });
              const totalGrupo = conceptosGrupo.reduce((s: number, c: any) => s + c.total, 0);
              const refNum = (grupo.refs[0] || '').split('-').pop()?.padStart(7, '0') || String(idx + 1).padStart(7, '0');
              return {
                reciboNo: refNum,
                controlWeb: `WEB-${refNum}`,
                fechaEmision: new Date().toISOString().split('T')[0],
                codContribuyente: inmGrupo?.cod_cont || foundUser.Identidad,
                razonSocial: inmGrupo?.contribuyente || foundUser.Contribuyente || '',
                domicilioFiscal: ((inmGrupo?.direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
                rifCi: foundUser.Identidad,
                caja: cajero_id_recibo,
                conceptos: conceptosGrupo,
                subTotal: totalGrupo,
                exento: totalGrupo,
                iva: 0,
                total: totalGrupo,
                formaPago: 'PUNTO DE VENTA',
                banco: 'Debito',
                referencia: reqRef ? referencia : referenciaDebito,
                tasaBcv: currentBcvRate || tcmmv || undefined,
              };
            });

            // Si hay un solo grupo, mantener objeto simple para compatibilidad
            setReciboData(recibosArray.length === 1 ? recibosArray[0] : recibosArray);
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
          // Try Storage first
          try {
            const ext = comprobante.name.split('.').pop() || 'jpg';
            const filePath = `comprobantes/${(foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}.${ext}`;
            const { data: upData, error: upErr } = await supabase.storage
              .from('comprobantes')
              .upload(filePath, comprobante, { upsert: true, contentType: comprobante.type });
            if (!upErr && upData) {
              const { data: pubData } = supabase.storage.from('comprobantes').getPublicUrl(filePath);
              comprobanteUrl = pubData?.publicUrl || '';
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

        const { error: pErr } = await supabase.from('pagos_reportados').insert({
          identidad: foundUser.Identidad,
          monto: montoReal,
          banco: banco,
          referencia: referencia,
          tipo: paymentMethod,
          estado: 'Por Verificar',
          detalles: JSON.stringify({ 
            recibos: selectedRecibos, 
            cuotas: selectedCuotas,
            servicios: selectedServicios,
            tala_poda: selectedTalaPoda,
            cajero: cajero_id,
            saldo_favor: saldoAFavorNuevo,
            es_abono: esAbono,
            monto_abonado: esAbono ? montoReal : undefined,
            total_seleccionado: totalBs,
            saldo_usado: descuentoSaldoFavor,
            tasa_bcv: currentBcvRate,
            deuda_total_sistema: foundUser.DeudaTotal,
            comprobante_nombre: comprobante?.name || '',
            comprobante_url: comprobanteUrl,
            comprobante_b64: comprobanteB64 || undefined,
            fecha_transaccion: fechaTransaccion,
            tasa_bcv_aplicada: customBcvRate ? customBcvRate : undefined,
            nota_cambio_tasa: justificacionBcv ? justificacionBcv : undefined
          })
        });
        
        if (pErr) throw pErr;
        
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
          await supabase.from('servicios_especiales').update({ estado: 'Por Verificar' }).in('referencia', selectedTalaPoda);
        }
        // Servicios especiales Transferencia â†’ Por Verificar (incluir en detalles)
        if (selectedServicios.length > 0) {
          await supabase.from('servicios_especiales').update({ estado: 'Por Verificar' }).in('referencia', selectedServicios);
        }

        setSuccessMsg(`${paymentMethod} registrado(a). Ha sido enviado(a) al módulo de Emisión de recibos para su conciliación automática o manual.`);
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
      setTimeout(async () => {
        setSuccessMsg('');
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
      }, 2500);
      
    } catch (err: any) {
      console.error(err);
      alert('Error: ' + err.message);
    }
    setIsProcessing(false);
  };

  const handleCrearNotaManual = async () => {
    if (!notaManualMonto || parseFloat(notaManualMonto) <= 0) return alert('Ingrese un monto válido');
    if (!notaManualRef) return alert('Ingrese la referencia origen');
    if (!foundUser) return;
    
    try {
      await supabase.from('documentos').insert([{
        identidad: foundUser.Identidad,
        contribuyente: foundUser.Contribuyente,
        tipo: 'Nota de Credito',
        estado: 'Vigente',
        detalles: JSON.stringify({
          monto: formatBs(notaManualMonto),
          origen_referencia: `Manual: ${notaManualRef}`,
          fecha_emision: new Date().toISOString()
        })
      }]);
      // ─ Acreditar saldo a favor (fix I-6: usa inmueble principal) ─
      const montoNota = parseFloat(notaManualMonto);
      const result = await acreditarSaldoFavor(foundUser.Identidad, montoNota);
      if (!result.ok) console.error('Error acreditando saldo en nota manual:', result.error);
      
      setSuccessMsg('Nota de crédito manual generada exitosamente.');
      setIsNotaModalOpen(false);
      setNotaManualMonto('');
      setNotaManualRef('');
      setTimeout(() => setSuccessMsg(''), 4000);
      handleSearch(); // Refresh user data
    } catch (e: any) {
      alert('Error creando nota: ' + e.message);
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
                value={customBcvRate || tcmmv.toFixed(2)}
                onClick={() => {
                  setTempBcvRate(customBcvRate || tcmmv.toFixed(2));
                  setShowRateModal(true);
                }}
                className="w-24 px-2 py-0.5 rounded border border-emerald-300 bg-white text-emerald-900 font-bold outline-none cursor-pointer hover:bg-emerald-100 transition-colors"
                title="Tasa BCV Manual (Requiere Autorización)"
              />
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
                onChange={e => setSelectedUcdDate(e.target.value)}
                className="bg-transparent border-none text-[10px] outline-none text-emerald-700 font-bold"
              />
              <button onClick={fetchTasaHistorica} className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded ml-auto">Fijar Día</button>
            </div>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1">
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
                </tr>
              </thead>
              <tbody>
                {isLoadingNotas ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500"><div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>Cargando notas de crédito...</div></td></tr>
                ) : notasCredito.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No hay notas de crédito registradas en el sistema.</td></tr>
                ) : notasCredito.map(n => {
                  let details: any = {};
                  try { details = JSON.parse(n.detalles); } catch(e){}
                  return (
                    <tr key={n.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3">{new Date(n.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium">{n.identidad}</td>
                      <td className="px-4 py-3">{n.contribuyente}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">Bs. {details.monto}</td>
                      <td className="px-4 py-3 text-center">{details.origen_referencia}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-1 rounded text-xs font-semibold">{n.estado}</span>
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

      {/* Buscador */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Buscar Contribuyente</label>
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
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row items-start justify-between gap-4">
            <div className="flex-1 w-full overflow-hidden">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-xl font-bold text-slate-800">{foundUser.Contribuyente}</h2>
                <button onClick={() => setIsNotaModalOpen(true)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-300 transition-colors">
                  + Agregar Saldo a Favor / Nota Manual
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap mt-0.5">
                <span className="font-semibold text-slate-700">{foundUser.Identidad}</span>
                <span>•</span>
                <span>Cód: {foundUser.cod_cont}</span>
                {foundUser.Telefono && formatPhoneNumber(foundUser.Telefono) && (
                  <>
                    <span>•</span>
                    <span className="text-slate-700 font-medium">📞 {formatPhoneNumber(foundUser.Telefono)}</span>
                  </>
                )}
                {foundUser.Correo && !isFictitiousEmail(foundUser.Correo) && (
                  <>
                    <span>•</span>
                    <span className="text-slate-700 font-medium">✉️ {foundUser.Correo}</span>
                  </>
                )}
              </div>
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
                  
                  return (
                    <div className="space-y-2">
                      {userInms.filter((i: any) => (i.inmueble || '').toLowerCase().includes((filterInm || '').toLowerCase())).map((inm: any, idx: number) => {
                        const esRes = isResidencialInm(inm);
                        const mmv = (inm.mmv_mes && parseFloat(inm.mmv_mes) > 0) ? parseFloat(inm.mmv_mes) : getFO(inm.actividad_principal || '', esRes);
                        const cant = parseInt(inm.cant_inmuebles || 1);
                        if (mmv <= 0) return null;
                        
                        const far = getFAR(inm.actividad_principal || '');
                        const formulaUCD = (esRes ? (mmv * 57 * far) : (mmv * 57 * 0.1280));
                        const totalUCD = cant * formulaUCD;
                        const bsMensual = totalUCD * currentBcvRate;
                        
                        return (
                          <div key={idx} className="border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-[10px] text-slate-700 flex items-center gap-2">
                                Inmueble {inm.inmueble || 'General'} ({cant} und) - <span className={esRes ? "text-emerald-700 font-bold" : "text-blue-700 font-bold"}>{esRes ? "RESIDENCIAL (Exento 0% IVA)" : "COMERCIAL (16% IVA)"}</span>:
                                {(userInms.length > 1 && !inm.condominio_padre_id) && <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[9px] font-bold">Múltiples Inmuebles</span>}
                              </span>
                              {(() => {
                                const propRecibos = recibos.filter((r: any) => {
                                  if (r.referencia?.startsWith('RECIB-HIST-')) return r.referencia.split('-')[2] === inm.inmueble;
                                  if (r.referencia?.startsWith('CM-')) return r.referencia.includes(inm.inmueble);
                                  return true;
                                });
                                if (propRecibos.length === 0) return null;
                                const maxSelectable = propRecibos.length;
                                const isAllSelected = maxSelectable > 0 && propRecibos.every((r: any) => selectedRecibos.includes(r.referencia));
                                return (
                                  <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-1.5 py-0.5 rounded transition-colors">
                                    <input 
                                      type="checkbox"
                                      checked={isAllSelected}
                                      onChange={(e) => {
                                        const selectableRefs = propRecibos.map((r: any) => r.referencia);
                                        const otherSelected = selectedRecibos.filter((ref: string) => !selectableRefs.includes(ref));
                                        if (e.target.checked) setSelectedRecibos([...otherSelected, ...selectableRefs]);
                                        else setSelectedRecibos(otherSelected);
                                      }}
                                      className="w-2.5 h-2.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                                    />
                                    Marcar Todo
                                  </label>
                                );
                              })()}
                            </div>
                            <span>FO: {mmv.toFixed(4)} | Factor: {esRes ? far.toFixed(4) : '0.1280'} | {totalUCD.toFixed(2)} UCD × {currentBcvRate.toFixed(2)} Bs = {bsMensual.toFixed(2)} Bs/mes.</span>
                          </div>
                        );
                      })}
                      <span className="block text-[9px] text-slate-400 mt-1">
                        * El sistema cobra la deuda utilizando el registro actualizado de cada inmueble.
                      </span>
                    </div>
                  );
                })()}
              </div>
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Locales</span>
                        <span className="text-lg font-black text-slate-800">{condominioHijos.length} und</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Base Imponible</span>
                        <span className="text-lg font-black text-slate-800">Bs. {formatBs(sumBase)}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">IVA Comercial (16%)</span>
                        <span className="text-lg font-black text-slate-800">Bs. {formatBs(sumIVA)}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-emerald-300 bg-emerald-50/50 shadow-sm">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">Total Consolidado</span>
                        <span className="text-lg font-black text-emerald-700">Bs. {formatBs(totalBs)}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 italic">
                      💡 Proceda al panel lateral derecho "Resumen de Pago" para seleccionar el método de pago (Punto de Venta o Transferencia) y emitir el cobro consolidado.
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
                            <th className="py-2.5 px-3 font-bold text-left">Local / Inmueble</th>
                            <th className="py-2.5 px-3 font-bold text-left">Comercio / RIF</th>
                            <th className="py-2.5 px-3 font-bold text-left hidden md:table-cell">Actividad Comercial</th>
                            <th className="py-2.5 px-3 font-bold text-center">Mora</th>
                            <th className="py-2.5 px-3 font-bold text-right">Monto a Cobrar</th>
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
                                <td className="py-3 px-3 align-middle">
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
                                <td className="py-3 px-3 align-middle">
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
                                <td className="py-3 px-3 align-middle">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-700 text-xs truncate max-w-[200px]" title={hijo.contribuyente}>
                                      {hijo.contribuyente || 'Contribuyente No Registrado'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {hijo.identidad || 'N/A'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-middle hidden md:table-cell text-xs text-slate-600 max-w-[220px]">
                                  <span className="line-clamp-2" title={hijo.actividad_principal}>
                                    {hijo.actividad_principal ? hijo.actividad_principal.replace(/\[HIJO_DE:.*?\]\s*/g, '').replace('[CONDOMINIO]', '') : 'N/A'}
                                  </span>
                                </td>
                                <td className="py-3 px-3 align-middle text-center">
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
                                <td className="py-3 px-3 align-middle text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-black text-emerald-700 text-sm">
                                      Bs. {formatBs(infoDebt.total)}
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      {infoDebt.mesesAPagar > 1 
                                        ? `${infoDebt.mesesAPagar} meses • Base: ${formatBs(infoDebt.base)} + IVA: ${formatBs(infoDebt.iva)}`
                                        : `Base: ${formatBs(infoDebt.base)} + IVA: ${formatBs(infoDebt.iva)}`}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 align-middle text-center">
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
                            onChange={e => setMontoAbonoCondo(e.target.value)}
                            className="w-full pl-10 pr-3 py-2 text-xl font-black text-emerald-700 border border-emerald-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        {/* Botones de Porcentaje Rápido */}
                        <div className="flex gap-1.5 mt-1">
                          {[0.25, 0.50, 0.75, 1.0].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setMontoAbonoCondo((totalDeudaCondominio * pct).toFixed(2))}
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
                          Bs. {formatBs(Math.max(0, totalDeudaCondominio - (parseFloat(montoAbonoCondo) || 0)))}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {parseFloat(montoAbonoCondo) >= totalDeudaCondominio ? '¡Deuda cancelada en su totalidad!' : 'Quedará pendiente en la cuenta'}
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
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  <h3 className="font-bold text-slate-800">Recibos de Aseo Mensual</h3>
                  <span className="text-xs text-slate-500 font-medium">({recibos.length} pendiente{recibos.length !== 1 ? 's' : ''})</span>
                </div>

              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-200">
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
                        if (r.referencia?.startsWith('RECIB-HIST-')) {
                          const parts = r.referencia.split('-');
                          if (parts.length > 2) {
                            const match = userInms.find((i: any) => i.inmueble === parts[2]);
                            if (match) { inmId = String(match.inmueble || ''); tipo = String(match.tipo || match.clasificacion || ''); act = String(match.actividad_principal || ''); dir = String(match.direccion || ''); }
                            else inmId = parts[2];
                          }
                        } else if (r.referencia?.startsWith('CM-')) {
                          const match = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
                          if (match) { inmId = String(match.inmueble || ''); tipo = String(match.tipo || match.clasificacion || ''); act = String(match.actividad_principal || ''); dir = String(match.direccion || ''); }
                          else inmId = 'Acumulados';
                        } else {
                          if (userInms.length === 1) { inmId = String(userInms[0].inmueble || ''); tipo = String(userInms[0].tipo || userInms[0].clasificacion || ''); act = String(userInms[0].actividad_principal || ''); dir = String(userInms[0].direccion || ''); }
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

                        // Contar actividades económicas válidas (distintas a 'N/A')
                        const billableUserInms = userInms.filter((i: any) => (i.actividad_principal || '').toUpperCase() !== 'N/A');
                        const isMultiAct = billableUserInms.length > 1;

                        let groupId = `${inmId}|${tipo}|${act}`;
                        let isVirtualMonth = false;
                        if (isMultiAct && monthKey) {
                          groupId = `MES-${monthKey}`;
                          isVirtualMonth = true;
                        }

                        if (!acc[groupId]) {
                          acc[groupId] = { 
                            items: [], 
                            id: isVirtualMonth ? formatMonthYear(r.emision) : inmId, 
                            tipo: isVirtualMonth ? 'Local Comercial' : tipo, 
                            act: isVirtualMonth ? `${billableUserInms.length} Actividades Económicas` : act, 
                            isVirtualMonth, 
                            emision: r.emision,
                            monthKey
                          };
                        }
                        acc[groupId].items.push({ ...r, _inmId: inmId, _act: act, _tipo: tipo });
                        return acc;
                      }, {})
                    ).map(([key, group]: [string, any]) => {
                      const totalMontoGrupo = group.items.reduce((sum: number, r: any) => sum + parseFloat(getReciboMonto(r) || '0'), 0);
                      const allSelected = group.items.length > 0 && group.items.every((r: any) => selectedRecibos.includes(r.referencia));
                      const anyPending = group.items.some((r: any) => isItemPending(r.referencia));

                      return (
                        <div key={key} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                          <div className="bg-slate-100/50 px-3 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                {group.isVirtualMonth ? formatMonthYear(group.emision) : group.id}
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold">
                                {group.isVirtualMonth ? `${group.items.length} Actividades Consolidadas` : [group.tipo, group.act].filter(Boolean).join(' • ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                                {group.items.length} {group.isVirtualMonth ? 'actividades' : 'recibos'}
                              </span>
                            </div>
                          </div>
                          <div className="p-2 space-y-1.5">
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
                                        Suma unificada del mes por todas las actividades del local ({group.items.length} actividades)
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
                                      <p className="font-bold text-xs text-slate-700">{r.referencia}</p>
                                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1 mt-0.5">
                                        {formatMonthYear(r.emision)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-bold text-emerald-700 text-xs">
                                      {isItemPending(r.referencia) ? 'En Verificación' : `Bs. ${formatBs(parseFloat(getReciboMonto(r) || '0'))}`}
                                    </span>
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
                      <span className="font-bold text-green-700">Bs. {formatBs(parseFloat(s.monto || '0'))}</span>
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
                        <span className="font-bold text-purple-700">Bs. {formatBs(parseFloat(s.monto || '0'))}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

                    {/* Panel de Pago Disgregado */}
          <div className="bg-slate-50 rounded-lg shadow-sm border border-slate-200 p-6 h-fit sticky top-6">
            <h3 className="font-bold text-slate-800 text-lg mb-4 border-b border-slate-200 pb-2">Resumen de Pago</h3>
            
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
              {esAgenteRetencion && ivaPercent > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full border border-amber-300">
                  ⚠️ Agente de Retención — retiene 75% del IVA
                </div>
              )}

              {ivaPercent > 0 && (
                <div className="mt-3 bg-slate-100 p-3 rounded border border-slate-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-slate-700">Retención de IVA:</span>
                    <select 
                      value={retencionIVA} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setRetencionIVA(val);
                        if (val === 0) setComprobanteRetencion('');
                      }}
                      className="border border-slate-300 rounded px-2 py-1 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value={0}>0% (Sin Retención)</option>
                      <option value={75}>75%</option>
                      <option value={100}>100%</option>
                    </select>
                  </div>
                  {retencionIVA > 0 && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="font-semibold text-slate-700">Monto Retenido:</span>
                      <span className="text-red-600 font-bold">- Bs. {formatBs(sumIVA * (retencionIVA / 100))}</span>
                    </div>
                  )}
                  {retencionIVA > 0 && (
                    <div className="mt-2">
                      <input 
                        type="text" 
                        placeholder="N° Comprobante de Retención *" 
                        value={comprobanteRetencion}
                        onChange={e => setComprobanteRetencion(e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-sm outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {useSaldoFavor && foundUser?.SaldoFavor > 0 && (
                <div className="flex justify-between items-center text-emerald-600 font-medium mt-2">
                  <span>Saldo a Favor Aplicado:</span>
                  <span>- Bs. {formatBs(Math.min((sumBase + sumIVA + sumMulta) - (sumIVA * (retencionIVA / 100)), foundUser.SaldoFavor))}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-200">
                <span className="text-slate-800 font-bold text-base">Total Neto a Pagar:</span>
                <span className="text-2xl font-black text-emerald-700">Bs. {formatBs(Math.max(0, ((sumBase + sumIVA + sumMulta) - (sumIVA * (retencionIVA / 100))) - (useSaldoFavor ? (foundUser?.SaldoFavor || 0) : 0)))}</span>
              </div>
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
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="Debito">Punto de Venta (Débito / Crédito)</option>
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Deposito">Depósito Bancario</option>
                  {(foundUser?.SaldoFavor || 0) > 0 && (
                    <option value="Saldo a Favor">💳 Saldo a Favor (Bs. {formatBs(foundUser?.SaldoFavor || 0)})</option>
                  )}
                  </select>
              </label>

                  {['Debito'].includes(paymentMethod) && (
                    <div className="mt-4 space-y-3">
                      {isPagoMultiple && (
                        <label className="block mt-2">
                          <span className="text-xs font-semibold text-slate-600 mb-1 block">Monto a Pagar por Punto (Bs)</span>
                          <input type="text" value={montoDebito} onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            setMontoDebito(val);
                          }} placeholder="Ej. 1500.00" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </label>
                      )}
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Fecha de Transacción <span className="text-red-500">*</span></span>
                        <input
                          type="date"
                          value={fechaTransaccion}
                          onChange={(e) => setFechaTransaccion(e.target.value)}
                          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Número de Comprobante / Referencia <span className="text-red-500">*</span> (máx. 8 dígitos)</span>
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
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Fecha de Transacción</span>
                    <input
                      type="date"
                      value={fechaTransaccion}
                      onChange={(e) => setFechaTransaccion(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Banco Emisor</span>
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
                          const { data } = await supabase.from('pagos_reportados').select('id').eq('referencia', val).limit(1);
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
                    <span className="text-xs font-semibold text-slate-600 mb-1 block">Monto Total Pagado (Bs)</span>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="Ej: 500.00"
                      value={montoTransferido}
                      onChange={(e) => setMontoTransferido(e.target.value)}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {parseFloat(montoTransferido) > Math.max(0, totalBs - (useSaldoFavor ? foundUser?.SaldoFavor || 0 : 0)) && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-bold">
                        * Se generará un saldo a favor de Bs. {formatBs(parseFloat(montoTransferido) - Math.max(0, totalBs - (useSaldoFavor ? foundUser?.SaldoFavor || 0 : 0)))}
                      </p>
                    )}
                    {(parseFloat(montoTransferido) > 0 && parseFloat(montoTransferido) < Math.max(0, totalBs - (useSaldoFavor ? foundUser?.SaldoFavor || 0 : 0))) && (
                      <p className="text-[10px] text-orange-600 mt-1 font-bold">
                        * Es un ABONO. Quedará un saldo pendiente de Bs. {formatBs(Math.max(0, totalBs - (useSaldoFavor ? foundUser?.SaldoFavor || 0 : 0)) - parseFloat(montoTransferido))}
                      </p>
                    )}
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
              disabled={isProcessing || (!isCondominio && totalBs <= 0) || (isCondominio && condominioModo === 'Local' && selectedHijos.length === 0) || (isCondominio && condominioModo === 'Abono' && (!montoAbonoCondo || parseFloat(montoAbonoCondo) <= 0))}
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
        </div>
      )}
      </div>
      )}

      {/* ── Modal de Confirmación de Pago ── */}
      {isConfirmModalOpen && confirmPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-black text-lg">Confirmar Pago</h3>
                <p className="text-slate-400 text-xs mt-0.5">Verifique los datos antes de procesar</p>
              </div>
              <button onClick={() => { setIsConfirmModalOpen(false); setConfirmPayload(null); }} className="text-slate-400 hover:text-white text-2xl font-bold leading-none">&times;</button>
            </div>

            <div className="p-6 space-y-3">
              {/* Contribuyente */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Contribuyente</p>
                <p className="font-black text-slate-800 text-sm">{foundUser?.Contribuyente}</p>
                <p className="text-slate-500 text-xs">{foundUser?.Identidad}</p>
              </div>

              {/* Recibos seleccionados */}
              {confirmPayload.recibosSeleccionados?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Recibos a saldar</p>
                  <div className="space-y-1">
                    {confirmPayload.recibosSeleccionados.map((ref: string) => {
                      const f = recibos.find((r: any) => r.referencia === ref);
                      return (
                        <div key={ref} className="flex justify-between text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                          <span className="text-slate-600 font-medium">{ref}</span>
                          <span className="font-bold text-slate-800">Bs. {formatBs(getReciboMonto(f))}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Método y referencia */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-blue-400 uppercase">Método</p>
                  <p className="font-bold text-blue-800 text-sm mt-0.5">{paymentMethod}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-blue-400 uppercase">Fecha</p>
                  <p className="font-bold text-blue-800 text-sm mt-0.5">{fechaTransaccion}</p>
                </div>
              </div>

              {(referenciaDebito || referencia) && (
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-amber-500 uppercase">N° Referencia / Comprobante</p>
                  <p className="font-black text-amber-800 text-base tracking-widest">{referenciaDebito || referencia}</p>
                </div>
              )}

              {confirmPayload.descuentoSaldoFavor > 0 && (
                <div className="flex justify-between text-xs text-slate-600 px-1">
                  <span>Descuento saldo a favor:</span>
                  <span className="font-bold text-green-600">- Bs. {formatBs(confirmPayload.descuentoSaldoFavor)}</span>
                </div>
              )}

              {confirmPayload.esAbono && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 font-semibold">
                  ⚠️ Pago parcial (abono). Quedará saldo pendiente de Bs. {formatBs(Math.max(0, confirmPayload.finalTotal - confirmPayload.montoReal))}
                </div>
              )}

              {confirmPayload.saldoAFavorNuevo > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 font-semibold">
                  💳 Se generará Saldo a Favor de Bs. {formatBs(confirmPayload.saldoAFavorNuevo)}
                </div>
              )}

              {/* Total */}
              <div className="bg-emerald-600 rounded-xl p-4 flex justify-between items-center">
                <span className="text-white font-bold text-sm">TOTAL A PAGAR</span>
                <span className="text-white font-black text-2xl">Bs. {formatBs(confirmPayload.montoReal)}</span>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => { setIsConfirmModalOpen(false); setConfirmPayload(null); }}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >Cancelar</button>
              <button
                onClick={handleConfirmAndPay}
                disabled={isProcessing}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {isProcessing ? 'Procesando...' : 'Procesar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nota Manual */}
      {isNotaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
              <h3 className="font-bold text-slate-800">Generar Nota de Crédito Manual</h3>
              <button onClick={() => setIsNotaModalOpen(false)} className="text-slate-500 hover:text-slate-700 font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monto (Bs)</label>
                <input 
                  type="number" step="0.01" 
                  value={notaManualMonto} onChange={e => setNotaManualMonto(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Ej. 1000.00"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Referencia Origen</label>
                <input 
                  type="text" 
                  value={notaManualRef} onChange={e => setNotaManualRef(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Ej. Transferencia no facturada #12345678"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end gap-3">
              <button onClick={() => setIsNotaModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded">Cancelar</button>
              <button onClick={handleCrearNotaManual} className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-sm">Generar Nota</button>
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
                  value={rateNote} 
                  onChange={e => setRateNote(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  rows={2}
                  placeholder="Justifique el cambio de tasa..."
                  required
                />
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
                    <div key={idx} className={idx > 0 ? 'mt-6 pt-6 border-t border-slate-200' : ''}>
                      {reciboData.length > 1 && (
                        <div className="text-xs font-bold text-slate-500 uppercase mb-2">Recibo {idx + 1} de {reciboData.length} — Inmueble: {rd.codContribuyente}</div>
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
    </div>
  );
}
