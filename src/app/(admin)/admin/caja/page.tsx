'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { exportToExcelWithLogos } from '@/lib/excelExport';
import { TreePine, Search, CreditCard, Landmark, CheckCircle, XCircle, FileText, Handshake, Calendar as CalendarIcon, Wrench, ShieldCheck, ClipboardCheck, FlaskConical, Printer, X, Building2, Store, Receipt, CheckSquare, Square, Filter, ChevronRight, DollarSign, Sparkles, AlertCircle, Coins } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs, formatPhoneNumber, isFictitiousEmail, formatMonthYear, getIdentidadVariants } from '@/lib/formatCurrency';
import { ReciboImprimible } from '@/components/ReciboImprimible';
import { logAudit } from '@/lib/audit';
import { calcularMensualidad, getFO, getFAR, isResidencialInm, isCondominioPagoIndividual, isMesExoneradoMulta } from '@/lib/calculos';
import { getUserInmuebles, getCajeroId, isSameLocal, clusterInmueblesByLocal, getShortAddress } from '@/lib/cajaHelpers';
import { acreditarSaldoFavor, descontarSaldoFavor } from '@/lib/saldoFavor';
import { useCajaCalculations } from './hooks/useCajaCalculations';
import { useCajaSelection } from './hooks/useCajaSelection';
import { LISTA_BANCOS } from '@/lib/bancos';

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
  const [sumIVARetencionable, setSumIVARetencionable] = useState(0);
  const [sumMulta, setSumMulta] = useState(0);
  // Computed — estrictamente derivado del IVA de los comercios agentes de retención
  const montoRetencionIVA = sumIVARetencionable * (retencionIVA / 100);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'Debito' | 'TMD' | 'TVD' | 'Transferencia' | 'Deposito' | 'Saldo a Favor'>('Debito');
  const [referenciaDebito, setReferenciaDebito] = useState('');
  const [montoDebito, setMontoDebito] = useState<string>(''); // Monto manual punto de venta
  const [banco, setBanco] = useState('Banco de Venezuela');
  const [bancoDestino, setBancoDestino] = useState('BANCAMIGA - 0172 - 0717');
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

    if (mesesAPagar <= 0 || mesesTotales <= 0) {
      return {
        baseMensual,
        ivaMensual,
        base: 0,
        iva: 0,
        mesesTotales: 0,
        mesesAPagar: 0,
        multa: 0,
        total: 0,
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
      return cod === rawSearch || cod === inputClean.toUpperCase();
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
    }

    // Si tiene formato de código y no estaba en memoria, buscar en Supabase por coincidencia exacta
    if (!user && isCodeFormat) {
      const { data: inmDirect } = await supabase
        .from('inmuebles')
        .select('*')
        .ilike('inmueble', rawSearch)
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
      }
    }

    // 2. Si no es búsqueda por código de inmueble, buscar por Cédula / RIF
    if (!user) {
      const searchVariants = getIdentidadVariants(inputClean, activePrefix);
      const searchVariantsSet = new Set(searchVariants.map(v => v.replace(/-/g, '').toUpperCase()));

      user = contribuyentes.find((c: any) => {
        if (!c.Identidad) return false;
        const idClean = String(c.Identidad).replace(/-/g, '').toUpperCase();
        return searchVariantsSet.has(idClean);
      });

      // 3. Si no encontró por cédula, y se ingresó un nombre de más de 2 letras (no dígitos), buscar por nombre
      if (!user && !/^\d+$/.test(inputClean) && inputClean.length >= 3) {
        const searchWords = rawSearch.split(/\s+/).filter((w: string) => w.length >= 2);
        user = contribuyentes.find((c: any) => {
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
          let qInm = supabase.from('inmuebles').select('*');
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
    }
    
    if (user) {
      // Sincronizar el prefijo visual en el dropdown si es distinto
      if (user.Identidad && /^[A-Z]-/i.test(user.Identidad)) {
        const detectedPrefix = user.Identidad.charAt(0).toUpperCase();
        if (detectedPrefix !== docType) setDocType(detectedPrefix);
      }

      // Obtener TODOS los datos frescos del inmueble desde Supabase
      const userIdentVariants = getIdentidadVariants(user.Identidad);
      let orFilterInms = '';
      if (isCodeFormat && (user.CodCont || user.cod_cont)) {
        const specificCode = user.CodCont || user.cod_cont;
        orFilterInms = `inmueble.eq.${specificCode},condominio_padre_id.eq.${specificCode}`;
      } else {
        orFilterInms = [
          ...userIdentVariants.map(v => `identidad.eq.${v}`),
          `condominio_padre_id.eq.${user.CodCont || user.cod_cont}`,
          `condominio_padre_id.eq.${user.Identidad}`
        ].filter(Boolean).join(',');
      }

      const { data: inmFresh } = await supabase
        .from('inmuebles')
        .select('*')
        .or(orFilterInms);
      
      // Filtrar los inmuebles eliminados
      const activeInmFresh = (inmFresh || []).filter((i: any) => i.estado !== 'Eliminado');

      // Adoptar la Identidad real y actualizada desde los inmuebles frescos en base de datos
      if (activeInmFresh.length > 0 && activeInmFresh[0].identidad) {
        user.Identidad = activeInmFresh[0].identidad;
        if (!isCodeFormat && activeInmFresh[0].contribuyente) user.Contribuyente = activeInmFresh[0].contribuyente;
      }

      // También consultar en contribuyentes para tener los datos oficiales más recientes
      const { data: freshContrib } = await supabase
        .from('contribuyentes')
        .select('*')
        .or(userIdentVariants.map(v => `identidad.eq.${v}`).join(','))
        .limit(1)
        .maybeSingle();

      if (freshContrib) {
        user.Identidad = freshContrib.identidad || user.Identidad;
        user.Contribuyente = freshContrib.nombre || user.Contribuyente;
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
      
      // Guardar inmuebles frescos para que getReciboMonto los use
      setFreshInmuebles(activeInmFresh);
      
      const saldoFavorFresh = activeInmFresh.reduce(
        (sum: number, i: any) => sum + (parseFloat(i.saldo_favor_bs || '0') || 0), 0
      );
      
      // Calcular deuda total fresca (excluyendo contenedores N/A para evitar duplicar montos con sus actividades hijas)
      const billableActiveInms = activeInmFresh.filter(
        (i: any) => (i.actividad_principal || '').trim().toUpperCase() !== 'N/A'
      );
      const deudaTotalFresh = billableActiveInms.reduce(
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
      const facturasOrFilter = userIdentVariants.map(v => `identidad.eq.${v}`).join(',');
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
          const fInm = String(f.inmueble || '').toUpperCase();
          if (fInm && allowedCodes.has(fInm)) return true;
          const ref = String(f.referencia || '').toUpperCase();
          return Array.from(allowedCodes).some(code => ref.includes(code));
        });
      }
      
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
            const esCondoPagoInd = isCondominioPagoIndividual(inm);

            // Si el inmueble es hijo/filial de un condominio comercial ORDINARIO:
            // El aseo lo paga el condominio padre, pero las multas se pagan por la oficina individual.
            // EXCEPCIÓN: Condominios URB014903, URB030783, URB029866 y URB015503 permiten pagar aparte como individual tanto multa como sus meses.
            if (inm.condominio_padre_id && !isResidencialInm(inm) && !esCondoPagoInd) {
              const multa = parseFloat(inm.multa_bs || '0');
              const congelada = parseFloat(inm.deuda_congelada_bs || '0');
              if (multa > 0 || congelada > 0) {
                const totalMulta = (multa + congelada).toFixed(2);
                // Las multas solo aplican a períodos vencidos (hasta agosto).
                // Septiembre se paga en octubre sin multa, y octubre aún no vence.
                const fechaMora = new Date(now.getFullYear(), now.getMonth() - 2, 1, 12, 0, 0);
                combined.push({
                  id: `multa-${inm.inmueble}`,
                  referencia: `MULTA-${inm.inmueble}`,
                  identidad: user.Identidad,
                  contribuyente: user.Contribuyente,
                  emision: fechaMora.toISOString(),
                  vencimiento: fechaMora.toISOString(),
                  estado: 'Pendiente',
                  monto: totalMulta,
                  descripcion: `Multa Municipal - Local/Oficina (${inm.inmueble})`,
                  descripcion_periodo: `MULTA POR MORA (HASTA ${formatMonthYear(fechaMora.toISOString())})`
                });
              }
              return;
            }

            // Para condominios de pago individual o inmuebles directos:
            // 1. Si tienen multa acumulada, generar recibo de multa separado para que puedan pagarlo aparte
            const multa = parseFloat(inm.multa_bs || '0');
            const congelada = parseFloat(inm.deuda_congelada_bs || '0');
            if (esCondoPagoInd && (multa > 0 || congelada > 0)) {
              const totalMulta = (multa + congelada).toFixed(2);
              const fechaMora = new Date(now.getFullYear(), now.getMonth() - 2, 1, 12, 0, 0);
              combined.push({
                id: `multa-${inm.inmueble}`,
                referencia: `MULTA-${inm.inmueble}`,
                identidad: user.Identidad,
                contribuyente: user.Contribuyente,
                emision: fechaMora.toISOString(),
                vencimiento: fechaMora.toISOString(),
                estado: 'Pendiente',
                monto: totalMulta,
                descripcion: `Multa Municipal - Local/Oficina (${inm.inmueble})`,
                descripcion_periodo: `MULTA POR MORA (HASTA ${formatMonthYear(fechaMora.toISOString())})`
              });
            }

            // 2. Generar sus meses de aseo (RECIB-HIST-)
            const deudaMMV = parseFloat(inm.deuda_mmv || '0');
            const meses = parseInt(inm.meses_deuda || 0);
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
      const userConvenioVariants = new Set(userIdentVariants.map(v => v.replace(/-/g, '').toUpperCase()));
      const userConvenios = convenios.filter((c: any) => {
        const idCleanConv = (c.identidad || '').replace(/-/g, '').toUpperCase();
        const matchesUser = userConvenioVariants.has(idCleanConv) && c.estado === 'Al Día';
        if (!matchesUser) return false;
        if (isCodeFormat && (user.CodCont || user.cod_cont)) {
          const specificCode = String(user.CodCont || user.cod_cont).toUpperCase();
          if (c.inmueble && c.inmueble.toUpperCase() !== specificCode) return false;
        }
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

      // Cargar pagos pendientes de verificar para bloquear seleccion
      // Solo 'Por Verificar' bloquea — significa que ya hay una transferencia enviada esperando conciliación
      const { data: pagosPendData } = await supabase
        .from('pagos_reportados')
        .select('*')
        .or(facturasOrFilter)
        .eq('estado', 'Por Verificar');
      setPagosPendientes(pagosPendData || []);

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
      const isCondoByFlag = activeInmFresh.some((i: any) => i.es_condominio === true || parseInt(i.cant_inmuebles || '0') > 1);
      const isResidencialUser = isResidencialInm(user) || (user.Tipo || '').toUpperCase().includes('RESIDENCIAL') || activeInmFresh.some((i: any) => isResidencialInm(i));

      // Un contribuyente comercial ordinario (ej. AGROAPA C A) NO es un condominio aunque sus inmuebles tengan código padre
      const isTrueCondoUser = isCondoByName || isCondoByClasif || (isCondoByFlag && isResidencialUser) || user.es_condominio === true;
      const codCont = user.cod_cont || user.CodCont || user.Identidad || user.identidad;

      if (isTrueCondoUser && parentCodes.length > 0) {
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
            .select('id, identidad, inmueble, tipo, clasificacion, mmv_mes, deuda_mmv, deuda_congelada_bs, actividad_principal, contribuyente, direccion, meses_deuda, cant_inmuebles')
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
      } else {
        setIsCondominio(false);
        setCondominioHijos([]);
        setSelectedHijos([]);
      }
      
      // Calcular IVA inicial (RESIDENCIAL Y CONDOMINIOS RESIDENCIALES 100% EXENTOS DE IVA)
      if (isResidencialUser || (user.Clasificacion || '').toLowerCase().includes('residencial')) {
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
    
    let sb = 0, siva = 0, smulta = 0, sivaRetencionable = 0;
    const tasaActualUse = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);

    if (isCondominio && selectedRecibos.length === 0) {
      if (condominioModo === 'Abono') {
        const abonoVal = parseFloat(montoAbonoCondo) || 0;
        total += abonoVal;
        sb += abonoVal;
      } else {
        const hijosToSum = condominioModo === 'Local'
          ? condominioHijos.filter(h => selectedHijos.includes(h.id))
          : (condominioModo === 'Total' ? condominioHijos : []);

        hijosToSum.forEach(h => {
          const debtInfo = getHijoDebt(h, condominioModo === 'Total' ? Math.max(0, parseInt(h.meses_deuda ?? '0')) : undefined);
          total += debtInfo.total;
          sb += debtInfo.base;
          siva += debtInfo.iva;
          smulta += debtInfo.multa;
          if (h.agente_retencion === true) {
            sivaRetencionable += debtInfo.iva;
          }
        });
      }
    }

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
          const ivaRecibo = esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
          siva += ivaRecibo;

          // SOLO aplicar retención a recibos de comercios que sean formalmente Agentes de Retención
          if (!esRes && inm.agente_retencion === true) {
            sivaRetencionable += ivaRecibo;
          }

          const f = recibosMap.get(ref);
          const emision = f?.emision ? new Date(f.emision) : new Date();
          const today = new Date();
          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());

          // REGLA OFICIAL: El último mes de la factura es SIN multa. Septiembre se paga en octubre (monthsDiff <= 1 sin multa).
          const mNum = parseInt(parts[3]?.replace('M', '') || '0');
          const totalMeses = Math.max(1, parseInt(inm.meses_deuda || '1'));
          const isUltimoMes = mNum > 0 ? (mNum >= totalMeses) : false;

          const esMesExon = isMesExoneradoMulta(inm.notas, emision);
          // Multa mensual por mora: 10% para residencial, 12% para comercial sobre la base (solo meses anteriores a septiembre: monthsDiff > 1)
          if (!isUltimoMes && monthsDiff > 1 && !esMesExon) {
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
          const ivaRecibo = esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
          siva += ivaRecibo;
          if (!esRes && inm.agente_retencion === true) {
            sivaRetencionable += ivaRecibo;
          }
          const f = recibosMap.get(ref);
          const emision = f?.emision ? new Date(f.emision) : new Date();
          const today = new Date();
          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
          const allCmForInm = (recibos || []).filter((rc: any) =>
            rc.referencia?.startsWith('CM-') && (rc.referencia || '').includes(inm.inmueble || '')
          );
          const isUltimoMes = allCmForInm.length <= 1 || allCmForInm[allCmForInm.length - 1]?.referencia === ref || monthsDiff <= 1;
          const esMesExon = isMesExoneradoMulta(inm.notas, emision);
          if (!isUltimoMes && monthsDiff > 1 && !esMesExon) smulta += parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2));
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
    
    if (sumIVARetencionable > 0 && retencionIVA > 0 && !comprobanteRetencion.trim()) return alert("Debe ingresar el número de comprobante de retención de IVA para los comercios autorizados.");
    const calculatedTotalBs = sumBase + sumIVA + sumMulta;
    const realMontoRetencionIVA = sumIVARetencionable * (retencionIVA / 100);
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
    } else if (['Debito', 'TMD', 'TVD'].includes(paymentMethod)) {
      const cardLabel = paymentMethod === 'TMD' ? 'Tarjeta Master (TMD)' : paymentMethod === 'TVD' ? 'Tarjeta Visa (TVD)' : 'Punto de Venta';
      if (!referenciaDebito.trim()) return alert(`Debe ingresar el número de comprobante o referencia del pago por ${cardLabel}.`);
      if (referenciaDebito.trim().length > 8) return alert(`El número de referencia para ${cardLabel} no puede superar los 8 dígitos.`);
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
        // ─ Acreditar nuevo Saldo a Favor (fix I-6: usa inmueble principal, no inmuebles[0]) ─
        if (['Debito', 'TMD', 'TVD'].includes(paymentMethod)) {
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

      const isAutoAprobado = ['Debito', 'Saldo a Favor', 'TMD', 'TVD'].includes(paymentMethod);
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
            let dineroRestanteParaServicios = Math.max(0, parseFloat(montoDebito) - dineroPagado);
            
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
        const { error: insertErr } = await supabase.from('pagos_reportados').insert({
          id: pagoId,
          identidad: foundUser.Identidad,
          monto: montoReal,
          banco: paymentMethod === 'TMD' ? 'PUNTO TMD (MASTER)' : paymentMethod === 'TVD' ? 'PUNTO TVD (VISA)' : paymentMethod,
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

            // Guardar detalles preparados para emisión manual controlada en el módulo de Facturación Electrónica
            const { data: currentPago } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoId).single();
            let currentDetalles: any = currentPago?.detalles || {};
            if (typeof currentDetalles === 'string') {
              try { currentDetalles = JSON.parse(currentDetalles); } catch(e) { currentDetalles = {}; }
            }
            currentDetalles.factura_digital = currentDetalles.factura_digital || {
              emitida: false,
              pendiente: true,
              preparada_at: new Date().toISOString()
            };
            currentDetalles.recibos = digitalRecibos;
            currentDetalles.montos = digitalMontos;
            currentDetalles.contribuyente = foundUser.Contribuyente;
            currentDetalles.identidad = foundUser.Identidad;
            currentDetalles.montoTotal = montoReal;
            currentDetalles.isCondominio = isCondominio;
            currentDetalles.formasPago = [
              {
                descripcion: paymentMethod === 'TMD' ? 'TARJETA DE CRÉDITO MASTER (TMD)' : paymentMethod === 'TVD' ? 'TARJETA DE CRÉDITO VISA (TVD)' : paymentMethod === 'Debito' ? 'TARJETA DE DÉBITO' : paymentMethod,
                fecha: new Date().toISOString(),
                forma: paymentMethod === 'Debito' ? '03' : ['TMD', 'TVD'].includes(paymentMethod) ? '02' : '05',
                banco: banco || undefined,
                referencia: reqRef ? referencia : referenciaDebito || undefined,
                monto: montoReal
              }
            ];
            await supabase.from('pagos_reportados').update({ detalles: currentDetalles }).eq('id', pagoId);
          } catch(err) {
            console.error('Error guardando datos para factura digital', err);
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

          // Si algún inmueble pertenecía a un contenedor padre N/A (ej: URB033481), limpiar también el contenedor padre si sus hijos ya no tienen deuda
          const parentCodesToSync = Array.from(new Set(userInmsClean.map((i: any) => i.condominio_padre_id).filter(Boolean)));
          for (const pCode of parentCodesToSync) {
            const parentInm = userInmsClean.find((i: any) => i.inmueble === pCode);
            if (parentInm) {
              const children = userInmsClean.filter((i: any) => i.condominio_padre_id === pCode);
              const maxChildMonths = Math.max(0, ...children.map((c: any) => {
                const childHistRefs = histRefs.filter(r => r.includes(`-${c.inmueble || c.codigo}-`));
                const childMonths = parseInt(String(c.meses_deuda || 1));
                return Math.max(0, childMonths - childHistRefs.length);
              }));
              if (maxChildMonths === 0 || selectedRecibos.includes('RECIB-DEUDA')) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', parentInm.id);
              } else {
                await supabase.from('inmuebles').update({ meses_deuda: maxChildMonths }).eq('id', parentInm.id);
              }
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
              formaPago: paymentMethod === 'TMD' ? 'TMD (TARJETA CRÉDITO MASTER)' : paymentMethod === 'TVD' ? 'TVD (TARJETA CRÉDITO VISA)' : paymentMethod === 'Debito' ? 'PUNTO DE VENTA (DÉBITO)' : paymentMethod,
              banco: ['Debito', 'TMD', 'TVD'].includes(paymentMethod) ? paymentMethod : (banco || 'Debito'),
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
          : `Pago procesado exitosamente por ${paymentMethod === 'TMD' ? 'TMD (Tarjeta Crédito Master)' : paymentMethod === 'TVD' ? 'TVD (Tarjeta Crédito Visa)' : paymentMethod}. La deuda ha sido conciliada automáticamente.`
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
                    const mesNum = parseInt(parts[3]?.replace('M', '') || '1');
                    const totalMeses = Math.max(1, parseInt(inm?.meses_deuda || '1'));
                    const isUltimoMes = mesNum >= totalMeses || monthsDiff <= 1;
                    const esMesExon = isMesExoneradoMulta(inm?.notas, emision);
                    const multa = (!isUltimoMes && monthsDiff > 1 && !esMesExon) ? parseFloat((bm * (esRes ? 0.10 : 0.12)).toFixed(2)) : 0;
                    const iva = esRes ? 0 : parseFloat((bm * 0.16).toFixed(2));
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
                tipoContribuyente: 'Residencial',
              };
            });

            if (recibosArray.length === 0) {
              const refNum = (referenciaDebito || Date.now().toString()).slice(-7).padStart(7, '0');
              setReciboData({
                reciboNo: refNum,
                controlWeb: `WEB-${refNum}`,
                fechaEmision: new Date().toISOString().split('T')[0],
                codContribuyente: foundUser.Identidad || foundUser.cod_cont || '',
                razonSocial: foundUser.Contribuyente || '',
                domicilioFiscal: ((foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
                rifCi: foundUser.Identidad,
                caja: cajero_id_recibo,
                conceptos: [{
                  descripcion: `Servicio de Aseo Urbano y Domiciliario`,
                  precioUnit: montoReal,
                  total: montoReal
                }],
                subTotal: montoReal,
                exento: montoReal,
                iva: 0,
                total: montoReal,
                formaPago: paymentMethod === 'TMD' ? 'TMD (TARJETA CRÉDITO MASTER)' : paymentMethod === 'TVD' ? 'TVD (TARJETA CRÉDITO VISA)' : paymentMethod === 'Debito' ? 'PUNTO DE VENTA (DÉBITO)' : paymentMethod,
                banco: ['Debito', 'TMD', 'TVD'].includes(paymentMethod) ? paymentMethod : (banco || 'Debito'),
                referencia: reqRef ? referencia : referenciaDebito,
                tasaBcv: currentBcvRate || tcmmv || undefined,
                tipoContribuyente: isResidencialInm(foundUser) ? 'Residencial' : 'Comercial',
              });
            } else {
              setReciboData(recibosArray.length === 1 ? recibosArray[0] : recibosArray);
            }
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
            banco_destino: bancoDestino,
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
          await updateServiciosEspecialesEstado(selectedTalaPoda, 'Por Verificar');
        }
        // Servicios especiales Transferencia → Por Verificar (incluir en detalles)
        if (selectedServicios.length > 0) {
          await updateServiciosEspecialesEstado(selectedServicios, 'Por Verificar');
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

        // Generar recibo de constancia de pago para transferencia
        try {
          const cajero_id_recibo = getCajeroId();
          const refNum = (referencia || Date.now().toString()).slice(-7).padStart(7, '0');
          setReciboData({
            reciboNo: refNum,
            controlWeb: `WEB-${refNum}`,
            fechaEmision: new Date().toISOString().split('T')[0],
            codContribuyente: foundUser.Identidad || foundUser.cod_cont || '',
            razonSocial: foundUser.Contribuyente || '',
            domicilioFiscal: ((foundUser.Direccion || 'NAGUANAGUA, CARABOBO') as string).toUpperCase(),
            rifCi: foundUser.Identidad,
            caja: cajero_id_recibo,
            conceptos: [{
              descripcion: `Pago en Verificación (${paymentMethod}) - Servicio de Aseo Urbano`,
              precioUnit: montoReal,
              total: montoReal
            }],
            subTotal: montoReal,
            exento: montoReal,
            iva: 0,
            total: montoReal,
            formaPago: 'TRANSFERENCIA',
            banco: banco || 'Transferencia',
            referencia: referencia || 'N/A',
            tasaBcv: currentBcvRate || tcmmv || undefined,
            tipoContribuyente: isResidencialInm(foundUser) ? 'Residencial' : 'Comercial',
          });
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
      
      // Auditoría: Registro de Nota Manual de Crédito
      await logAudit('Nota de Crédito / Saldo Manual Creado', {
        identidad: foundUser.Identidad,
        contribuyente: foundUser.Contribuyente,
        monto_bs: montoNota,
        referencia_origen: notaManualRef
      }, 'CAJA', 'CRITICA');

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

              {foundUser.isSearchByCode && foundUser.condominio_padre_id && (
                <div className={`mt-2.5 p-3 rounded-lg text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm border ${
                  isCondominioPagoIndividual(foundUser.condominio_padre_id)
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-sky-50 border-sky-300 text-sky-900'
                }`}>
                  <div>
                    <span className={`font-bold flex items-center gap-1.5 ${
                      isCondominioPagoIndividual(foundUser.condominio_padre_id) ? 'text-emerald-800' : 'text-sky-800'
                    }`}>
                      🏢 Inmueble Filial de Condominio:
                      {isCondominioPagoIndividual(foundUser.condominio_padre_id) && (
                        <span className="bg-emerald-200 text-emerald-900 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase">
                          Habilitado para Pago Individual
                        </span>
                      )}
                    </span>
                    <p className={`text-[11px] mt-0.5 ${
                      isCondominioPagoIndividual(foundUser.condominio_padre_id) ? 'text-emerald-700 font-medium' : 'text-sky-700'
                    }`}>
                      {isCondominioPagoIndividual(foundUser.condominio_padre_id) ? (
                        <>
                          Este inmueble pertenece al Condominio Padre <strong className="font-mono bg-emerald-100 px-1 py-0.5 rounded">{foundUser.condominio_padre_id}</strong>. Está autorizado por la administración tributaria para <strong>pagar de forma individual tanto sus meses de aseo como sus multas</strong>.
                        </>
                      ) : (
                        <>
                          Este inmueble pertenece al Condominio Padre <strong className="font-mono bg-sky-100 px-1 py-0.5 rounded">{foundUser.condominio_padre_id}</strong>. La solvencia y facturación del servicio de aseo se administra de forma centralizada con el Condominio.
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDocNumber(foundUser.condominio_padre_id);
                      setDocType('J');
                      setTimeout(() => {
                        const btn = document.querySelector('button[data-testid="search-btn"]') as HTMLButtonElement;
                        if (btn) btn.click();
                      }, 50);
                    }}
                    className={`font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 transition-colors shadow-sm text-white ${
                      isCondominioPagoIndividual(foundUser.condominio_padre_id)
                        ? 'bg-emerald-700 hover:bg-emerald-800'
                        : 'bg-sky-600 hover:bg-sky-700'
                    }`}
                  >
                    Ver Condominio ({foundUser.condominio_padre_id})
                  </button>
                </div>
              )}

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
                          const esRes = isResidencialInm(inm);
                          const mmvRaw = parseFloat(inm.mmv_mes || '0');
                          const foOficial = getFO(inm.actividad_principal || '', esRes);
                          const mmv = esRes
                            ? (mmvRaw >= 0.22 && mmvRaw <= 1.50 ? mmvRaw : foOficial)
                            : (foOficial && foOficial > 1.00 ? foOficial : (mmvRaw > 1.00 ? mmvRaw : 1.98));
                          const cant = parseInt(inm.cant_inmuebles || 1);
                          const far = getFAR(inm.actividad_principal || '');
                          const formulaUCD = (esRes ? (mmv * 57 * far) : (mmv * 57 * 0.1280));
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
                                  {isCondominio ? 'Marcar Todo el Condominio' : 'Marcar Todo'}
                                </label>
                              </div>

                              {/* Listado de unidades / actividades */}
                              <div className="space-y-1.5 py-2 max-h-[300px] overflow-y-auto">
                                {activitiesCalc.map(({ inm, mmv, far, totalUCD, bsMensual, inmRecibos, isActSelected }, actIdx) => (
                                  <div key={actIdx} className={`flex items-center justify-between text-[11px] p-2 rounded-lg border transition-all ${isAllClusterSelected || isActSelected ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/40' : 'bg-white border-slate-200'}`}>
                                    <div className="flex items-center gap-2">
                                      <input 
                                        type="checkbox"
                                        checked={isAllClusterSelected || isActSelected}
                                        onChange={(e) => {
                                          if (isCondominio) {
                                            if (e.target.checked) {
                                              if (inm.id) setSelectedHijos(Array.from(new Set([...selectedHijos, inm.id])));
                                              setCondominioModo('Local');
                                            } else {
                                              setSelectedHijos(selectedHijos.filter(id => id !== inm.id));
                                            }
                                          } else {
                                            const thisInmRefs = inmRecibos.map((r: any) => r.referencia);
                                            const otherSelected = selectedRecibos.filter((ref: string) => !thisInmRefs.includes(ref));
                                            if (e.target.checked) {
                                              setSelectedRecibos([...otherSelected, ...thisInmRefs]);
                                            } else {
                                              setSelectedRecibos(otherSelected);
                                            }
                                          }
                                        }}
                                        className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                                      />
                                      <span className="font-bold text-slate-700">
                                        {isResCluster ? `Unidad ${actIdx + 1}:` : `Actividad ${actIdx + 1}:`} {inm.actividad_principal || (isResCluster ? 'Apartamento' : 'Comercial')}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                                        Cód: {inm.inmueble}
                                      </span>
                                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                                        Unificada
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-medium text-slate-600 font-mono">
                                      FO: {mmv.toFixed(4)} {isResCluster ? `| FAR: ${far.toFixed(4)} ` : ''}| {totalUCD.toFixed(2)} UCD × {currentBcvRate.toFixed(2)} Bs = <strong className="text-slate-900">{formatBs(bsMensual)} Bs/mes</strong> {isResCluster ? '(Exento)' : <span className="text-blue-700 font-bold ml-1">(con IVA: Bs. {formatBs(bsMensual * 1.16)})</span>}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* Panel de Tarifa Mensual Unificada */}
                              <div className={`p-2.5 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${isUnifiedSelected ? 'bg-gradient-to-r from-emerald-100 via-emerald-50 to-teal-100 border-emerald-400 shadow-sm' : 'bg-slate-100 border-slate-200'}`}>
                                <div className="text-xs">
                                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                    ⚡ {isResCluster ? 'Tarifa Mensual Total del Condominio:' : 'Tarifa Mensual Unificada del Local:'}
                                  </span>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    {isResCluster 
                                      ? `${cluster.inms.length} Unidades Residenciales a ${formatBs(activitiesCalc[0]?.bsMensual || 0)} Bs c/u (Exento de IVA)`
                                      : activitiesCalc.map(a => `${a.inm.actividad_principal?.split(' ')[0] || 'Actividad'}: ${formatBs(a.bsMensual * 1.16)} Bs`).join(' + ')
                                    }
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="font-black text-emerald-800 text-sm">
                                    {totalClusterUCD.toFixed(2)} UCD × {currentBcvRate.toFixed(2)} Bs = Bs. {formatBs(totalClusterBs)} / mes {isResCluster ? '(Exento)' : `| con IVA: Bs. ${formatBs(totalClusterBs * 1.16)}`}
                                  </span>
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
                                Inmueble {inm.inmueble || 'General'} ({cant} und) - <span className={esRes ? "text-emerald-700 font-bold" : "text-blue-700 font-bold"}>{esRes ? "RESIDENCIAL (Exento 0% IVA)" : "COMERCIAL (16% IVA)"}</span>:
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
                            <span className="text-[10px] text-slate-600">FO: {mmv.toFixed(4)} | Factor: {esRes ? far.toFixed(4) : '0.1280'} | {totalUCD.toFixed(2)} UCD × {currentBcvRate.toFixed(2)} Bs = {formatBs(bsMensual)} Bs/mes {esRes ? '(Exento)' : `+ IVA = Bs. ${formatBs(bsMensual * 1.16)}`}.</span>
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

                        // Agrupar los inmuebles por local físico (misma cédula/RIF y misma dirección física)
                        const localClusters = clusterInmueblesByLocal(userInms);
                        const clusterInfo = localClusters.get(inmId);
                        const localId = clusterInfo?.localId || inmId;
                        const localLabel = clusterInfo?.label || getShortAddress(dir);
                        const activitiesInThisLocal = clusterInfo?.count ?? 1;
                        const hasMultipleActivitiesInThisLocal = activitiesInThisLocal > 1;

                        let groupId = `${inmId}|${tipo}|${act}`;
                        let isVirtualMonth = false;

                        // REGLA CLAVE: Las actividades económicas extras se unen a un local SOLO si tienen misma cédula/RIF Y misma dirección
                        if (hasMultipleActivitiesInThisLocal && monthKey) {
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
                                      <p className="font-bold text-xs text-slate-700">{r.referencia}</p>
                                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1 mt-0.5">
                                        {r.referencia?.startsWith('MULTA-')
                                          ? (r.descripcion_periodo || `MULTA POR MORA (HASTA ${formatMonthYear(r.emision)})`)
                                          : formatMonthYear(r.emision)}
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

              {ivaPercent > 0 && (
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
                        <div className="mt-2">
                          <input 
                            type="text" 
                            placeholder="N° Comprobante de Retención IVA SENIAT *" 
                            value={comprobanteRetencion}
                            onChange={e => setComprobanteRetencion(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-emerald-500 font-mono"
                            required
                          />
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
                <span className="text-2xl font-black text-emerald-700">Bs. {formatBs(Math.max(0, ((sumBase + sumIVA + sumMulta) - (sumIVARetencionable * (retencionIVA / 100))) - (useSaldoFavor ? (foundUser?.SaldoFavor || 0) : 0)))}</span>
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
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                >
                  <option value="Debito">Punto de Venta (Tarjeta de Débito)</option>
                  <option value="TMD">TMD (Tarjeta de Crédito Master)</option>
                  <option value="TVD">TVD (Tarjeta de Crédito Visa)</option>
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Deposito">Depósito Bancario</option>
                  {(foundUser?.SaldoFavor || 0) > 0 && (
                    <option value="Saldo a Favor">💳 Saldo a Favor (Bs. {formatBs(foundUser?.SaldoFavor || 0)})</option>
                  )}
                  </select>
              </label>

                  {['Debito', 'TMD', 'TVD'].includes(paymentMethod) && (
                    <div className="mt-4 space-y-3">
                      {isPagoMultiple && (
                        <label className="block mt-2">
                          <span className="text-xs font-semibold text-slate-600 mb-1 block">
                            {paymentMethod === 'TMD' ? 'Monto Tarjeta Master (Bs)' : paymentMethod === 'TVD' ? 'Monto Tarjeta Visa (Bs)' : 'Monto a Pagar por Punto (Bs)'}
                          </span>
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
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
                          {paymentMethod === 'TMD' ? 'Número de Aprobación / Referencia TMD (Master)' : paymentMethod === 'TVD' ? 'Número de Aprobación / Referencia TVD (Visa)' : 'Número de Comprobante / Referencia POS'} <span className="text-red-500">*</span> (máx. 8 dígitos)
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
                      <option value="BANESCO - 0134 - 1715">Banesco (0134) - 01340415144151031715 (IAMEC)</option>
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
                      onChange={(e) => setFechaTransaccion(e.target.value)}
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
