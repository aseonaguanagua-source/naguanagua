'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  CreditCard, CheckCircle2, AlertCircle, ChevronLeft, ArrowRight, 
  Landmark, MapPin, User2, Building2, TriangleAlert, ChevronDown, ChevronUp,
  CheckSquare2, Square, Store, Sparkles, LogOut, Receipt, DollarSign,
  Activity, RefreshCw, Clock, ShieldCheck, HelpCircle, Phone, Search
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { performLogout } from '@/lib/logout';
import { isResidencialInm, calcularMensualidad, isCondominioPagoIndividual } from '@/lib/calculos';
import { calcularDeudaInmueble, esUltimoMesHist, reglaCobroInmueble, r2, PORCENTAJE_RETENCION_AGENTE } from '@/lib/deudaMensual';
import { construirRecibosContribuyente, desgloseReciboCM } from '@/lib/recibosContribuyente';
import { getIdentidadVariants } from '@/lib/formatters';
import { clusterInmueblesByLocal } from '@/lib/cajaHelpers';

type Step = 'search' | 'account' | 'pay' | 'success';
type PayMethod = 'Punto de Venta' | 'Bancamiga';

interface Recibo { referencia: string; emision: string; estado: string; monto: string; identidad?: string; }
interface Inmueble {
  id: string;
  inmueble: string;
  cant_inmuebles?: string | number;
  mmv_mes?: string | number;
  deuda_mmv?: string | number;
  deuda_congelada_bs?: string | number;
  multa_bs?: string | number;
  meses_deuda?: string | number;
  clasificacion?: string;
  direccion?: string;
  actividad_principal?: string;
  agente_retencion?: boolean;
}
interface Contribuyente { Contribuyente: string; Identidad: string; Direccion?: string; Clasificacion?: string; Actividad?: string; EsAgente?: boolean; }

interface UnifiedMonthlyItem {
  referencia: string;
  inmId: string;
  act: string;
  montoBs: number;
}

interface UnifiedMonthlyGroup {
  monthKey: string;
  monthIndex: number;
  emision?: string;
  totalBs: number;
  receiptRefs: string[];
  receipts: UnifiedMonthlyItem[];
}

interface LocalGroup {
  localId: string;
  isUnified: boolean;
  label: string;
  direccion: string;
  tipo: string;
  inms: Inmueble[];
  allReceiptRefs: string[];
  totalBs: number;
  monthlyGroups: UnifiedMonthlyGroup[];
  singleItems: Recibo[];
}

const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tarifa mensual según Ordenanza
const calcMontoMes = (inm: Inmueble, tcmmv: number): number => {
  return parseFloat(calcularMensualidad(inm, tcmmv).toFixed(2));
};

export default function KioskPage() {
  const router = useRouter();
  const [operatorUser, setOperatorUser] = useState<string | null>(null);

  useEffect(() => {
    const auth = localStorage.getItem('operador_censo_auth') || localStorage.getItem('adminUser');
    if (!auth) {
      router.replace('/operador/login?modulo=cobromovil');
      return;
    }
    setOperatorUser(auth);
  }, [router]);

  const [tcmmv, setTcmmv] = useState<number>(0);
  const [bcvDate, setBcvDate] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    fetch('/api/bcv').then(r => r.json()).then(d => { 
      if (d?.tcmmv) setTcmmv(d.tcmmv); 
      if (d?.fecha) setBcvDate(d.fecha);
    }).catch(() => {});

    // Reloj digital en vivo
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, []);

  const [step, setStep] = useState<Step>('search');
  const [docType, setDocType] = useState('V');
  const [docNumber, setDocNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [foundUser, setFoundUser] = useState<Contribuyente | null>(null);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [userInms, setUserInms] = useState<Inmueble[]>([]);
  const [monthsToPay, setMonthsToPay] = useState<number>(1);
  const [totalSel, setTotalSel] = useState(0);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [payMethod, setPayMethod] = useState<PayMethod>('Punto de Venta');
  const [referencia, setReferencia] = useState('');
  const [posAprobacion, setPosAprobacion] = useState('');
  const [posLote, setPosLote] = useState('001');
  const [posMode, setPosMode] = useState<'usb' | 'wifi' | 'manual'>('usb');
  const [posIp, setPosIp] = useState<string>('192.168.1.50:8080');
  const [usbPort, setUsbPort] = useState<any>(null);
  const [posStatusMsg, setPosStatusMsg] = useState<string>('');
  const [isWaitingPos, setIsWaitingPos] = useState<boolean>(false);
  const [usaTarjetaTercero, setUsaTarjetaTercero] = useState<boolean>(false);
  const [terceroTipoDoc, setTerceroTipoDoc] = useState<'V' | 'E'>('V');
  const [terceroCedula, setTerceroCedula] = useState<string>('');
  const [terceroNombre, setTerceroNombre] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [payError, setPayError] = useState('');
  const [showBancamigaSim, setShowBancamigaSim] = useState(false);
  const [expandedInms, setExpandedInms] = useState<Record<string, boolean>>({});
  const [fechaCaja, setFechaCaja] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const savedIp = localStorage.getItem('bancamiga_pos_ip');
    if (savedIp) setPosIp(savedIp);
  }, []);

  const isResidencialGlobal = isResidencialInm(foundUser) || (userInms.length > 0 && userInms.every((i: any) => isResidencialInm(i)));
  const esAgenteGlobal = foundUser?.EsAgente ?? false;

  const getReciboDesglose = (r: Recibo): { base: number; multa: number; iva: number; total: number } => {
    if (r.estado === 'Abonado') {
      const m = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
      return { base: m, multa: 0, iva: 0, total: m };
    }
    if (!tcmmv || tcmmv <= 0) {
      const m = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
      return { base: m, multa: 0, iva: 0, total: m };
    }

    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inmId = parts[2];
      const inm = userInms.find((i: any) => i.inmueble === inmId);
      if (inm) {
        // Cálculo único (igual a Caja): todos los meses del inmueble y se toma el de este recibo
        const histRefs = recibos.filter(x => x.referencia?.startsWith(`RECIB-HIST-${inmId}-M`));
        const meses = histRefs.map(x => ({ emision: x.emision || new Date().toISOString(), esUltimo: esUltimoMesHist(x.referencia, inm) }));
        const d = calcularDeudaInmueble(inm, tcmmv, meses);
        const idx = histRefs.findIndex(x => x.referencia === r.referencia);
        const pm = d.porMes[idx];
        if (pm) return { base: pm.base, multa: pm.multa, iva: pm.iva, total: pm.total };
      }
      return { base: 0, multa: 0, iva: 0, total: 0 };
    } else if (r.referencia?.startsWith('MULTA-')) {
      // Multa de local en condominio comercial (igual a Caja): monto fijo, exento de IVA
      const m = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
      return { base: 0, multa: m, iva: 0, total: m };
    } else if (r.referencia?.startsWith('CM-')) {
      // Igual a Caja: base + IVA + multa si el mes tiene más de 1 mes vencido
      const d = desgloseReciboCM(r, userInms, tcmmv);
      return { base: d.base, multa: d.multa, iva: d.iva, total: d.total };
    }
    const m = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    return { base: m, multa: 0, iva: 0, total: m };
  };

  const getReciboMonto = (r: Recibo): number => {
    const d = getReciboDesglose(r);
    // Para recibos en la lista individual, se muestra el valor base + multa (el IVA se desglosa en el total)
    return parseFloat((d.base + d.multa).toFixed(2));
  };

  // Desglose consolidado de los recibos seleccionados
  // Los meses RECIB-HIST se agrupan por inmueble y se calculan con la fórmula única de Caja
  // (así el total coincide al céntimo con Caja y el Portal aunque se seleccione solo una parte).
  const desgloseSel = useMemo(() => {
    let base = 0, multa = 0, iva = 0, ivaRetenible = 0;
    const histPorInm = new Map<string, { inm: any; meses: { emision: string; esUltimo: boolean }[] }>();
    selectedRefs.forEach(ref => {
      const r = recibos.find(x => x.referencia === ref);
      if (r) {
        if (r.referencia?.startsWith('RECIB-HIST-')) {
          const inmId = r.referencia.split('-')[2];
          const inm = userInms.find((i: any) => i.inmueble === inmId);
          if (inm) {
            if (!histPorInm.has(inmId)) histPorInm.set(inmId, { inm, meses: [] });
            histPorInm.get(inmId)!.meses.push({ emision: r.emision || new Date().toISOString(), esUltimo: esUltimoMesHist(r.referencia, inm) });
          }
          return;
        }
        const d = getReciboDesglose(r);
        base += d.base;
        multa += d.multa;
        iva += d.iva;

        // Identificar si el recibo pertenece a un inmueble que sea agente de retención
        let matchedInm: any = null;
        if (r.referencia?.startsWith('CM-')) {
          matchedInm = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
        }
        if (matchedInm && matchedInm.agente_retencion === true && !isResidencialInm(matchedInm)) {
          ivaRetenible += d.iva;
        }
      }
    });
    histPorInm.forEach(({ inm, meses }) => {
      const d = calcularDeudaInmueble(inm, tcmmv, meses);
      base += d.base;
      multa += d.multa;
      iva += d.iva;
      ivaRetenible += d.ivaRetenible;
    });
    return {
      base: r2(base),
      multa: r2(multa),
      iva: isResidencialGlobal ? 0 : r2(iva),
      ivaRetenible: isResidencialGlobal ? 0 : r2(ivaRetenible)
    };
  }, [selectedRefs, recibos, userInms, tcmmv, isResidencialGlobal]);

  // IVA total (16% EXCLUSIVAMENTE sobre la base imponible comercial; multas y residencial 0%)
  const ivaTotalCalculado = desgloseSel.iva;
  // Retención: SOLO sobre el IVA de recibos de comercios formalmente calificados como agentes de retención
  const ivaRetenidoCalculado = r2(desgloseSel.ivaRetenible * PORCENTAJE_RETENCION_AGENTE);
  // Lo que realmente paga de IVA = resto del IVA a 100% y comercios de retención al 25%
  const ivaCalculado = parseFloat((ivaTotalCalculado - ivaRetenidoCalculado).toFixed(2));
  // Total a cancelar = Subtotal base + Multa (sin intereses) + IVA neto a pagar
  const pagoTotalCalculado = parseFloat((desgloseSel.base + desgloseSel.multa + ivaCalculado).toFixed(2));
  const hasAgenteEnSeleccion = desgloseSel.ivaRetenible > 0;

  const groupedLocals = useMemo((): LocalGroup[] => {
    const getReceiptInmId = (r: Recibo): string => {
      if (r.referencia?.startsWith('RECIB-HIST-')) {
        const parts = r.referencia.split('-');
        if (parts.length > 2) {
          const match = userInms.find((i: any) => i.inmueble === parts[2]);
          return match ? match.inmueble : parts[2];
        }
      } else if (r.referencia?.startsWith('CM-')) {
        const match = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
        if (match) return match.inmueble;
      } else if (userInms.length === 1) {
        return userInms[0].inmueble;
      }
      return 'GENERAL';
    };

    const clustersMap = clusterInmueblesByLocal(userInms as any);
    const clusterOrder: string[] = [];
    const clusterMapData: Record<string, {
      localId: string;
      label: string;
      direccion: string;
      tipo: string;
      inms: Inmueble[];
      receipts: Recibo[];
    }> = {};

    userInms.forEach((inm) => {
      const cInfo = clustersMap.get(inm.inmueble);
      const clusterId = cInfo?.localId || inm.inmueble;
      if (!clusterMapData[clusterId]) {
        clusterOrder.push(clusterId);
        clusterMapData[clusterId] = {
          localId: clusterId,
          label: cInfo?.label || inm.inmueble,
          direccion: cInfo?.direccion || inm.direccion || '',
          tipo: inm.clasificacion || 'Comercial',
          inms: [],
          receipts: []
        };
      }
      if (!clusterMapData[clusterId].inms.some((i) => i.inmueble === inm.inmueble)) {
        clusterMapData[clusterId].inms.push(inm);
      }
      if (inm.direccion && (!clusterMapData[clusterId].direccion || clusterMapData[clusterId].direccion === '0 0')) {
        clusterMapData[clusterId].direccion = inm.direccion;
      }
    });

    recibos.forEach((r) => {
      const inmId = getReceiptInmId(r);
      const cInfo = clustersMap.get(inmId);
      const clusterId = cInfo?.localId || inmId;

      if (!clusterMapData[clusterId]) {
        clusterOrder.push(clusterId);
        const matchInm = userInms.find((i) => i.inmueble === inmId);
        clusterMapData[clusterId] = {
          localId: clusterId,
          label: clusterId,
          direccion: matchInm?.direccion || '',
          tipo: matchInm?.clasificacion || 'Comercial',
          inms: matchInm ? [matchInm] : [],
          receipts: []
        };
      }
      clusterMapData[clusterId].receipts.push(r);
    });

    return clusterOrder.map((clusterId) => {
      const c = clusterMapData[clusterId];
      const isUnified = c.inms.length > 1;
      const allReceiptRefs = c.receipts.map((r) => r.referencia);
      const totalBs = c.receipts.reduce((s, r) => s + getReciboMonto(r), 0);

      if (!isUnified) {
        return {
          localId: c.localId,
          isUnified: false,
          label: c.label,
          direccion: c.direccion,
          tipo: c.tipo,
          inms: c.inms,
          allReceiptRefs,
          totalBs: parseFloat(totalBs.toFixed(2)),
          monthlyGroups: [],
          singleItems: c.receipts
        };
      }

      const monthMap: Record<string, {
        monthKey: string;
        emision?: string;
        totalBs: number;
        receiptRefs: string[];
        receipts: UnifiedMonthlyItem[];
      }> = {};
      const monthKeysOrder: string[] = [];

      c.receipts.forEach((r) => {
        let mKey = '';
        if (r.emision) {
          const d = new Date(r.emision);
          if (!isNaN(d.getTime())) {
            mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          } else {
            mKey = String(r.emision).slice(0, 7);
          }
        }
        const mMatch = r.referencia?.match(/-M(\d+)$/);
        if (!mKey && mMatch) {
          mKey = `M-${mMatch[1]}`;
        }
        if (!mKey) {
          mKey = r.referencia;
        }

        if (!monthMap[mKey]) {
          monthKeysOrder.push(mKey);
          monthMap[mKey] = {
            monthKey: mKey,
            emision: r.emision,
            totalBs: 0,
            receiptRefs: [],
            receipts: []
          };
        }

        const inmId = getReceiptInmId(r);
        const inmMatch = c.inms.find((i) => i.inmueble === inmId);
        const monto = getReciboMonto(r);

        monthMap[mKey].totalBs += monto;
        monthMap[mKey].receiptRefs.push(r.referencia);
        monthMap[mKey].receipts.push({
          referencia: r.referencia,
          inmId,
          act: inmMatch?.actividad_principal || 'Comercial',
          montoBs: monto
        });
      });

      const monthlyGroups: UnifiedMonthlyGroup[] = monthKeysOrder.map((key, idx) => ({
        monthKey: key,
        monthIndex: idx + 1,
        emision: monthMap[key].emision,
        totalBs: parseFloat(monthMap[key].totalBs.toFixed(2)),
        receiptRefs: monthMap[key].receiptRefs,
        receipts: monthMap[key].receipts
      }));

      return {
        localId: c.localId,
        isUnified: true,
        label: c.label,
        direccion: c.direccion,
        tipo: 'Comercial',
        inms: c.inms,
        allReceiptRefs,
        totalBs: parseFloat(totalBs.toFixed(2)),
        monthlyGroups,
        singleItems: []
      };
    });
  }, [recibos, userInms, getReciboMonto]);

  const totalMonthsSelected = useMemo(() => {
    let count = 0;
    groupedLocals.forEach((local) => {
      if (local.isUnified) {
        local.monthlyGroups.forEach((mg) => {
          if (mg.receiptRefs.length > 0 && mg.receiptRefs.every((ref) => selectedRefs.includes(ref))) {
            count++;
          }
        });
      } else {
        local.singleItems.forEach((r) => {
          if (selectedRefs.includes(r.referencia)) {
            count++;
          }
        });
      }
    });
    return count;
  }, [groupedLocals, selectedRefs]);

  const totalPeriodsInDeuda = useMemo(() => {
    return groupedLocals.reduce((sum, loc) => {
      return sum + (loc.isUnified ? loc.monthlyGroups.length : loc.singleItems.length);
    }, 0);
  }, [groupedLocals]);

  useEffect(() => {
    const t = selectedRefs.reduce((s, ref) => {
      const f = recibos.find(r => r.referencia === ref);
      return s + (f ? getReciboMonto(f) : 0);
    }, 0);
    setTotalSel(parseFloat(t.toFixed(2)));
    setMonthsToPay(totalMonthsSelected);
  }, [selectedRefs, recibos, userInms, tcmmv, totalMonthsSelected]);

  const toggleExpand = (localId: string) => {
    setExpandedInms(prev => ({ ...prev, [localId]: !prev[localId] }));
  };

  const toggleAllLocal = (allRefs: string[]) => {
    const isAllSelected = allRefs.length > 0 && allRefs.every(ref => selectedRefs.includes(ref));
    if (isAllSelected) {
      setSelectedRefs(prev => prev.filter(ref => !allRefs.includes(ref)));
    } else {
      setSelectedRefs(prev => Array.from(new Set([...prev, ...allRefs])));
    }
  };

  const toggleMonthlyGroup = (
    mg: UnifiedMonthlyGroup,
    monthlyGroups: UnifiedMonthlyGroup[]
  ) => {
    const isMgSelected = mg.receiptRefs.length > 0 && mg.receiptRefs.every(ref => selectedRefs.includes(ref));
    const mgIndex = monthlyGroups.findIndex(g => g.monthKey === mg.monthKey);
    if (mgIndex === -1) return;

    if (isMgSelected) {
      const toRemove = monthlyGroups.slice(mgIndex).flatMap(g => g.receiptRefs);
      setSelectedRefs(prev => prev.filter(r => !toRemove.includes(r)));
    } else {
      const toAdd = monthlyGroups.slice(0, mgIndex + 1).flatMap(g => g.receiptRefs);
      setSelectedRefs(prev => Array.from(new Set([...prev, ...toAdd])));
    }
  };

  const selectAllReceipts = () => {
    setSelectedRefs(recibos.map(r => r.referencia));
  };

  const deselectAllReceipts = () => {
    setSelectedRefs([]);
  };

  const toggleIndividualReceipt = (ref: string, inmItems: Recibo[]) => {
    const isSelected = selectedRefs.includes(ref);
    const refIndex = inmItems.findIndex(r => r.referencia === ref);
    if (refIndex === -1) return;

    if (isSelected) {
      const toRemove = inmItems.slice(refIndex).map(r => r.referencia);
      setSelectedRefs(prev => prev.filter(r => !toRemove.includes(r)));
    } else {
      const toAdd = inmItems.slice(0, refIndex + 1).map(r => r.referencia);
      setSelectedRefs(prev => Array.from(new Set([...prev, ...toAdd])));
    }
  };

  const formatPeriodo = (emision?: string) => {
    const M = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    if (!emision) return 'Sin fecha';
    const p = emision.split('-');
    return p.length >= 2 ? `${M[parseInt(p[1])-1] || p[1]} ${p[0]}` : emision;
  };


  const handleSearch = async () => {
    if (!docNumber.trim()) return;
    setIsSearching(true); setSearchError('');

    // Extraer prefijo si fue escrito en el input (ej: J-075477308 o V075477308)
    let activePrefix = docType;
    let inputClean = docNumber.trim();
    const prefixMatch = inputClean.match(/^([VEJPGvejpg])[-_\s]?(.*)$/);
    if (prefixMatch) {
      activePrefix = prefixMatch[1].toUpperCase();
      inputClean = prefixMatch[2].trim();
      setDocType(activePrefix);
      setDocNumber(inputClean);
    }

        try {
      // Con el prefijo (V/E/J/G/P) para no mezclar cédulas distintas con el mismo número (igual que Caja)
      const qBusqueda = /^\d+$/.test(inputClean) ? `${activePrefix}-${inputClean}` : inputClean;
      const res = await fetch(`/api/cobro-movil/buscar?q=${encodeURIComponent(qBusqueda)}`);
      const data = await res.json();
      
      if (!res.ok) {
        setSearchError(data.error || 'Error al buscar el contribuyente.');
        setIsSearching(false);
        return;
      }

      const inmsDB = data.inmuebles;
      const user = data.foundUser as Contribuyente;

      if (user.Identidad && /^[A-Z]-/i.test(user.Identidad)) {
        const detectedPrefix = user.Identidad.charAt(0).toUpperCase();
        if (detectedPrefix !== docType) setDocType(detectedPrefix);
      }

      setFoundUser(user);

      // Si el contribuyente es persona jurídica (J/G), la tarjeta física que se pasa en el POS siempre pertenece a una persona natural (V/E)
      const esJuridico = /^[JG]/i.test(String(user.Identidad || '').trim());
      setUsaTarjetaTercero(esJuridico);
      setTerceroCedula('');
      setTerceroNombre('');

      // FUENTE ÚNICA (idéntica a Caja y a Soy Contribuyente): inmuebles cobrables + facturas + meses históricos
      const rc = construirRecibosContribuyente({ inmuebles: inmsDB, facturas: data.facturas || [], identidad: user.Identidad, contribuyente: user.Contribuyente });
      const finalInmsToUse = rc.billables;
      setUserInms(finalInmsToUse as Inmueble[]);
      const combined = rc.recibos as Recibo[];
      setRecibos(combined);
      setSelectedRefs(combined.map(r => r.referencia));
      setMonthsToPay(combined.length);
      setExpandedInms({});
      setStep('account');
      setIsSearching(false);
    } catch (e: any) {
      console.error(e);
      setSearchError('Hubo un error al buscar el usuario.');
      setIsSearching(false);
    }
  };

  // Obtener la cédula que se enviará al Punto de Venta Bancamiga para validar el PIN del tarjetahabiente
  const getCedulaTarjetahabiente = (): { ok: boolean; cedulaCompleta: string; soloNumeros: string; nombre: string; error?: string } => {
    if (usaTarjetaTercero) {
      const nums = terceroCedula.replace(/\D/g, '');
      if (nums.length < 5) {
        return {
          ok: false,
          cedulaCompleta: '',
          soloNumeros: '',
          nombre: '',
          error: 'Debe ingresar la Cédula del titular de la tarjeta que realizará el pago.',
        };
      }
      return {
        ok: true,
        cedulaCompleta: `${terceroTipoDoc}-${nums}`,
        soloNumeros: nums,
        nombre: terceroNombre.trim() || `Tarjetahabiente (${terceroTipoDoc}-${nums})`,
      };
    }
    const idUser = String(foundUser?.Identidad || '').trim();
    const nums = idUser.replace(/\D/g, '');
    return {
      ok: true,
      cedulaCompleta: idUser,
      soloNumeros: nums,
      nombre: foundUser?.Contribuyente || idUser,
    };
  };

  // MODO 1: Conexión directa por Cable USB al Punto Bancamiga (Web Serial API)
  const handleConectarCobrarUsbPos = async () => {
    setPayError('');
    const cardHolder = getCedulaTarjetahabiente();
    if (!cardHolder.ok) {
      setPayError(cardHolder.error || 'Ingrese la cédula del titular de la tarjeta.');
      return;
    }

    const nav: any = typeof window !== 'undefined' ? window.navigator : null;
    if (!nav || !nav.serial) {
      setPayError('Su navegador no soporta conexión USB directa (Web Serial). Use Google Chrome / Microsoft Edge o cambie al modo Wi-Fi / Manual.');
      return;
    }

    setIsWaitingPos(true);
    setPosStatusMsg('Solicitando puerto USB del Punto de Venta Bancamiga...');

    let port = usbPort;
    try {
      if (!port) {
        port = await nav.serial.requestPort({});
        await port.open({ baudRate: 115200 });
        setUsbPort(port);
      } else if (!port.readable || !port.writable) {
        try {
          await port.open({ baudRate: 115200 });
        } catch {
          // Ya estaba abierto
        }
      }

      const montoCentimos = String(Math.round(pagoTotalCalculado * 100)).padStart(12, '0');
      const cedulaClean = cardHolder.soloNumeros.padStart(10, '0');
      const codInm = userInms[0]?.inmueble || 'ASEO';

      setPosStatusMsg(
        `Enviando Bs. ${fmtBs(pagoTotalCalculado)} (C.I. Tarjetahabiente: ${cardHolder.cedulaCompleta}) al Punto Bancamiga... Pase la tarjeta en el POS.`
      );

      // Enviar trama compatible con POS Bancamiga (JSON + protocolo ECR STX/ETX)
      const writer = port.writable.getWriter();
      const payloadEcr = JSON.stringify({
        cmd: 'SALE',
        comando: 'COMPRA',
        monto: pagoTotalCalculado.toFixed(2),
        montoCentimos,
        cedula: cardHolder.soloNumeros,
        identificacion: cardHolder.cedulaCompleta,
        referenciaInterna: codInm,
      });
      const stxFrame = `\x020200|${montoCentimos}|${cedulaClean}|${codInm}\x03\r\n${payloadEcr}\r\n`;
      await writer.write(new TextEncoder().encode(stxFrame));
      writer.releaseLock();

      // Leer respuesta del POS (hasta 60 segundos mientras el cliente ingresa su clave/huella)
      const reader = port.readable.getReader();
      let bufferTxt = '';
      const startTime = Date.now();

      while (Date.now() - startTime < 60000) {
        const readPromise = reader.read();
        const timeoutPromise = new Promise<{ value?: Uint8Array; done: boolean }>((resolve) =>
          setTimeout(() => resolve({ done: true }), 2500)
        );
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (value) {
          bufferTxt += new TextDecoder().decode(value);
          // Verificar si llegó un JSON o trama con referencia/aprobación
          const refMatch =
            bufferTxt.match(/"(?:referencia|numReferencia|secuencia|voucher)"\s*:\s*"?(\d{4,12})"?/i) ||
            bufferTxt.match(/(?:REF|REFERENCIA|SEQ)[:=\s|]*(\d{4,12})/i) ||
            bufferTxt.match(/00\|(\d{6,12})\|(\d{4,8})/);

          if (/rechazad|cancelad|error|declined/i.test(bufferTxt)) {
            reader.releaseLock();
            setIsWaitingPos(false);
            setPosStatusMsg('');
            setPayError('La transacción fue rechazada o cancelada en el Punto de Venta Bancamiga.');
            return;
          }

          if (refMatch && refMatch[1]) {
            const refObtenida = refMatch[1];
            const aprobMatch = bufferTxt.match(/"(?:aprobacion|autorizacion)"\s*:\s*"?([A-Z0-9]{4,10})"?/i);
            const loteMatch = bufferTxt.match(/"(?:lote|numLote)"\s*:\s*"?(\d{1,6})"?/i);
            const aprobObtenida = aprobMatch?.[1] || refMatch[2] || refObtenida.slice(-6);
            const loteObtenido = loteMatch?.[1] || posLote || '001';

            reader.releaseLock();
            setReferencia(refObtenida);
            setPosAprobacion(aprobObtenida);
            setPosLote(loteObtenido);
            setIsWaitingPos(false);
            setPosStatusMsg(`¡Transacción Aprobada en POS Bancamiga! Ref: ${refObtenida}`);
            await processPayment(refObtenida, 'Punto de Venta', aprobObtenida, loteObtenido);
            return;
          }
        }
        if (done && bufferTxt.length > 0) break;
      }

      reader.releaseLock();
      setIsWaitingPos(false);
      setPosStatusMsg(
        'Monto enviado al Punto Bancamiga. Si el punto ya imprimió el voucher, verifique o escriba el Nro. de Referencia abajo y presione Confirmar.'
      );
    } catch (err: any) {
      setIsWaitingPos(false);
      setPosStatusMsg('');
      setPayError(
        `No se pudo comunicar con el puerto USB del POS (${err?.message || 'Puerto no seleccionado'}). Verifique el cable USB o ingrese la referencia del voucher.`
      );
    }
  };

  // MODO 2: Conexión por Red Local Wi-Fi (IP del POS Bancamiga)
  const handleCobrarWifiPos = async () => {
    setPayError('');
    const cardHolder = getCedulaTarjetahabiente();
    if (!cardHolder.ok) {
      setPayError(cardHolder.error || 'Ingrese la cédula del titular de la tarjeta.');
      return;
    }
    if (!posIp.trim()) {
      setPayError('Ingrese la dirección IP:Puerto del Punto de Venta Bancamiga.');
      return;
    }

    localStorage.setItem('bancamiga_pos_ip', posIp.trim());
    setIsWaitingPos(true);
    setPosStatusMsg(
      `Conectando con POS Bancamiga (${posIp})... Pase la tarjeta del titular (${cardHolder.cedulaCompleta}) por Bs. ${fmtBs(pagoTotalCalculado)}.`
    );

    try {
      const res = await fetch('/api/cobro-movil/pos-bancamiga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posIp: posIp.trim(),
          monto: pagoTotalCalculado,
          cedulaTarjetahabiente: cardHolder.cedulaCompleta,
          identidadContribuyente: foundUser?.Identidad,
          referenciaInterna: userInms[0]?.inmueble || 'ASEO',
        }),
      });
      const data = await res.json();
      setIsWaitingPos(false);

      if (!res.ok || data.error) {
        setPosStatusMsg('');
        setPayError(data.error || 'No se recibió aprobación del POS Bancamiga.');
        return;
      }

      const refObtenida = String(data.referencia || `POS-${Date.now().toString().slice(-6)}`).trim();
      const aprobObtenida = String(data.aprobacion || refObtenida.slice(-6)).trim();
      const loteObtenido = String(data.lote || posLote || '001').trim();

      setReferencia(refObtenida);
      setPosAprobacion(aprobObtenida);
      setPosLote(loteObtenido);
      setPosStatusMsg(`¡Transacción Aprobada! Ref: ${refObtenida}`);
      await processPayment(refObtenida, 'Punto de Venta', aprobObtenida, loteObtenido);
    } catch (err: any) {
      setIsWaitingPos(false);
      setPosStatusMsg('');
      setPayError(err?.message || 'Error al conectar con el Punto de Venta por Wi-Fi.');
    }
  };

  const processPayment = async (ref: string, method: PayMethod, aprobacionOverride?: string, loteOverride?: string) => {
    setIsProcessing(true);
    setPayError('');
    try {
      const cardHolder = getCedulaTarjetahabiente();
      if (!cardHolder.ok) {
        setPayError(cardHolder.error || 'Ingrese la cédula del titular de la tarjeta.');
        setIsProcessing(false);
        return;
      }

      const refFinal = (ref || `POS-${Date.now()}`).trim();
      const digits7 = refFinal.replace(/\D/g, '').slice(-7).padStart(7, '0') || String(Date.now()).slice(-7);
      const aprobFinal = aprobacionOverride ?? posAprobacion ?? refFinal.slice(-6);
      const loteFinal = loteOverride ?? posLote ?? '001';
      const codPrincipal = userInms[0]?.inmueble || '';
      const cajeroTag = operatorUser
        ? operatorUser.includes('-')
          ? operatorUser
          : `C-${operatorUser}`
        : 'C-TAQUILLA MOVIL';

      // Foto de la deuda ANTES del pago (permite revertir el pago en Conciliación y restablecer la deuda exacta)
      const deudaPrevia = userInms.map((i: any) => ({
        id: i.id,
        inmueble: i.inmueble,
        meses_deuda: i.meses_deuda ?? null,
        deuda_mmv: i.deuda_mmv ?? null,
        multa_bs: i.multa_bs ?? null,
        deuda_congelada_bs: i.deuda_congelada_bs ?? null,
      }));

      const reciboCajaObj = {
        reciboNo: digits7,
        controlWeb: `WEB-${digits7}`,
        fechaEmision: fechaCaja,
        codContribuyente: codPrincipal || foundUser?.Identidad || '',
        inmueble: codPrincipal,
        razonSocial: foundUser?.Contribuyente || '',
        domicilioFiscal: String(foundUser?.Direccion || userInms[0]?.direccion || 'NAGUANAGUA, CARABOBO').toUpperCase(),
        rifCi: foundUser?.Identidad || '',
        caja: cajeroTag,
        subTotal: desgloseSel.base,
        exento: isResidencialGlobal ? r2(desgloseSel.base + desgloseSel.multa) : desgloseSel.multa,
        iva: ivaTotalCalculado,
        total: pagoTotalCalculado,
        formaPago: method === 'Bancamiga' ? 'TRANSFERENCIA BANCAMIGA' : 'PUNTO DE VENTA (DÉBITO)',
        banco: 'Bancamiga',
        referencia: refFinal,
        tasaBcv: tcmmv,
        tipoContribuyente: isResidencialGlobal ? 'Residencial' : 'Comercial',
        pagadorTarjeta: {
          mismoTitular: !usaTarjetaTercero,
          cedula: cardHolder.cedulaCompleta,
          nombre: cardHolder.nombre,
        },
        conceptos: [
          {
            descripcion: `Servicio de Aseo Urbano (${monthsToPay} ${monthsToPay === 1 ? 'mes' : 'meses'})`,
            precioUnit: desgloseSel.base,
            total: desgloseSel.base,
          },
          ...(desgloseSel.multa > 0
            ? [
                {
                  descripcion: 'Multa por Mora - Aseo Urbano',
                  precioUnit: desgloseSel.multa,
                  total: desgloseSel.multa,
                },
              ]
            : []),
        ],
      };

      const fechaUTC = new Date(`${fechaCaja}T12:00:00-04:00`).toISOString();
      const detallesObj: Record<string, any> = {
        recibos: selectedRefs,
        origen: 'cobro_movil',
        cajero: cajeroTag,
        analista: operatorUser || 'Taquilla Móvil',
        contribuyente: foundUser?.Contribuyente || '',
        contribuyente_nombre: foundUser?.Contribuyente || '',
        cod_inmueble: codPrincipal,
        codigo_inmueble: codPrincipal,
        inmueble: codPrincipal,
        tasa_bcv: tcmmv,
        tasa_bcv_conciliacion: tcmmv,
        fecha_transaccion: fechaCaja,
        fecha_banco: fechaCaja,
        fecha_conciliado: new Date().toISOString(),
        monto_conciliado: pagoTotalCalculado,
        monto_retencion_iva: ivaRetenidoCalculado,
        deuda_previa: deudaPrevia,
        banco_destino: 'BANCAMIGA - 0172 - 0717',
        banco_receptor: 'BANCAMIGA - 0172 - 0717',
        cuenta_destino: '01720110711101340717',
        titular_destino: 'IAMEC BANCAMIGA',
        rif_destino: 'G-200086149',
        referencia: refFinal,
        referencia_origen: refFinal,
        aprobacion: aprobFinal,
        lote: loteFinal,
        pagador_tarjeta: {
          mismo_titular: !usaTarjetaTercero,
          cedula: cardHolder.cedulaCompleta,
          nombre: cardHolder.nombre,
        },
        formasPago: [
          {
            metodo: method === 'Bancamiga' ? 'Transferencia' : 'Punto de Venta',
            descripcion: method === 'Bancamiga' ? 'Bancamiga Oficial' : 'Punto de Venta Bancamiga',
            banco: 'Bancamiga',
            banco_destino: 'BANCAMIGA - 0172 - 0717',
            referencia: refFinal,
            aprobacion: aprobFinal,
            lote: loteFinal,
            fecha: fechaCaja,
            monto: pagoTotalCalculado,
            titular_tarjeta_ci: cardHolder.cedulaCompleta,
            titular_tarjeta_nombre: cardHolder.nombre,
          },
        ],
        recibo_caja: [reciboCajaObj],
        recibo_digital: {
          numero: `WEB-${digits7}`,
          emitido_at: new Date().toISOString(),
        },
        ...(!isResidencialGlobal
          ? {
              factura_digital: {
                emitida: false,
                pendiente: true,
                preparada_at: new Date().toISOString(),
              },
            }
          : {}),
      };

      await supabase.from('pagos_reportados').insert({
        identidad: foundUser?.Identidad,
        monto: pagoTotalCalculado,
        banco: 'Bancamiga',
        referencia: refFinal,
        tipo: method === 'Bancamiga' ? 'Transferencia' : 'Punto de Venta',
        estado: 'Aprobado',
        created_at: fechaUTC,
        detalles: detallesObj,
      });

      let dinero = totalSel;
      // Meses RECIB-HIST pagados por inmueble (se descuentan todos de una vez)
      const mesesPagadosPorInm = new Map<string, number>();
      for (const r of selectedRefs) {
        if (r === 'RECIB-DEUDA') {
          for (const inm of userInms) {
            await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', inm.id);
            if (inm.inmueble) {
              await supabase.from('condominio_unidades').update({ aseo_pendiente_desde: null, multa_meses: 0 }).ilike('inmueble', inm.inmueble);
            }
          }
          break;
        }
        if (r.startsWith('RECIB-HIST-')) {
          const inmId = r.split('-')[2];
          mesesPagadosPorInm.set(inmId, (mesesPagadosPorInm.get(inmId) || 0) + 1);
          continue;
        }
        if (r.startsWith('MULTA-')) {
          const inm = userInms.find((i: any) => `MULTA-${i.inmueble}` === r);
          if (inm) {
            await supabase.from('inmuebles').update({ multa_bs: 0, deuda_congelada_bs: 0 }).eq('id', inm.id);
            if (inm.inmueble) {
              await supabase.from('condominio_unidades').update({ multa_meses: 0 }).ilike('inmueble', inm.inmueble);
            }
          }
          continue;
        }
        if (r.startsWith('SRV-')) {
          await supabase.from('servicios_especiales').update({ estado: 'Pagado' }).eq('referencia', r);
          continue;
        }
        const fac = recibos.find(x => x.referencia === r);
        if (!fac) continue;
        const mFac = getReciboMonto(fac);
        if (dinero >= mFac) {
          await supabase.from('facturas').update({ estado: 'Pagado', fecha_pago: fechaCaja }).eq('referencia', r);
          dinero -= mFac;
        } else if (dinero > 0) {
          await supabase.from('facturas').update({ monto: (mFac - dinero).toFixed(2), estado: 'Abonado' }).eq('referencia', r);
          dinero = 0;
        }
      }
      for (const [inmId, pagados] of mesesPagadosPorInm) {
        const inm = userInms.find((i: any) => i.inmueble === inmId);
        if (!inm) continue;
        const meses = Math.max(1, parseInt(String(inm.meses_deuda || 1)));
        const nuevoMeses = Math.max(0, meses - pagados);
        const d = parseFloat(String(inm.deuda_mmv || 0));
        const m = parseFloat(String(inm.multa_bs || 0));
        const nuevaDeuda = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / meses).toFixed(6));
        const nuevaMulta = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / meses).toFixed(2));
        await supabase.from('inmuebles').update({ deuda_mmv: nuevaDeuda, deuda_congelada_bs: 0, multa_bs: nuevaMulta, meses_deuda: nuevoMeses }).eq('id', inm.id);
        if (inm.inmueble) {
          if (nuevoMeses === 0) {
            await supabase.from('condominio_unidades').update({ aseo_pendiente_desde: null, multa_meses: 0 }).ilike('inmueble', inm.inmueble);
          } else {
            const now = new Date();
            const dPend = new Date(now.getFullYear(), now.getMonth() - nuevoMeses, 1);
            const nuevoDesde = `${dPend.getFullYear()}-${String(dPend.getMonth() + 1).padStart(2, '0')}`;
            await supabase.from('condominio_unidades').update({ aseo_pendiente_desde: nuevoDesde }).ilike('inmueble', inm.inmueble);
          }
        }
      }
      logAudit(
        'Cobro por Taquilla Móvil / Kiosco',
        {
          identidad: foundUser?.Identidad,
          contribuyente: foundUser?.Contribuyente,
          monto: pagoTotalCalculado,
          metodo: method,
          referencia: refFinal,
          pagador_tarjeta: cardHolder.cedulaCompleta,
        },
        'COBRO'
      );
      setShowBancamigaSim(false);
      setStep('success');
    } catch (err: any) {
      setPayError(err.message || 'Error al procesar el pago.');
    }
    setIsProcessing(false);
  };

  const handlePayPos = () => {
    const cardHolder = getCedulaTarjetahabiente();
    if (!cardHolder.ok) {
      setPayError(cardHolder.error || 'Debe ingresar la Cédula del titular de la tarjeta.');
      return;
    }
    if (!referencia.trim()) {
      setPayError('Debe ingresar el Nro. de Referencia del comprobante del Punto de Venta o usar el botón de conexión directa al POS.');
      return;
    }
    processPayment(referencia, 'Punto de Venta');
  };

  const reset = () => {
    setStep('search');
    setDocNumber('');
    setRecibos([]);
    setFoundUser(null);
    setUserInms([]);
    setSelectedRefs([]);
    setReferencia('');
    setPosAprobacion('');
    setPosStatusMsg('');
    setIsWaitingPos(false);
    setUsaTarjetaTercero(false);
    setTerceroCedula('');
    setTerceroNombre('');
    setMonthsToPay(1);
    setPayMethod('Punto de Venta');
    setPayError('');
    setShowBancamigaSim(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white font-sans select-none" style={{ WebkitTapHighlightColor: 'transparent' }}>

      {/* Barra superior Institucional con todos los Logos Oficiales (Lacava, Naguanagua, Elizabeth, Instituto, IAMEC) */}
      <header className="bg-slate-900/95 border-b border-slate-800/90 px-4 py-3 sticky top-0 z-40 backdrop-blur-xl shadow-lg">
        <div className="max-w-3xl mx-auto flex flex-col gap-2.5">
          {/* Cintillo Institucional de Logos */}
          <div className="flex items-center justify-between gap-2 bg-white/95 px-3 sm:px-5 py-2 rounded-2xl shadow-md border border-slate-200 overflow-x-auto">
            <div className="relative h-9 sm:h-11 w-20 sm:w-24 shrink-0">
              <Image src="/logos/LACAVA.png" alt="Lacava" fill className="object-contain" priority />
            </div>
            <div className="h-6 w-[1px] bg-slate-300 shrink-0" />
            <div className="relative h-9 sm:h-11 w-24 sm:w-28 shrink-0">
              <Image src="/logos/NAGUANAGUATEQUIERO.png" alt="Naguanagua Te Quiero" fill className="object-contain" priority />
            </div>
            <div className="h-6 w-[1px] bg-slate-300 shrink-0" />
            <div className="relative h-9 sm:h-11 w-20 sm:w-24 shrink-0">
              <Image src="/logos/ELIZABETH.png" alt="Alcaldía Naguanagua" fill className="object-contain" priority />
            </div>
            <div className="h-6 w-[1px] bg-slate-300 shrink-0" />
            <div className="relative h-9 sm:h-11 w-24 sm:w-28 shrink-0">
              <Image src="/logos/INSTITUTO.png" alt="Instituto de Ecosocialismo" fill className="object-contain" priority />
            </div>
            <div className="h-6 w-[1px] bg-slate-300 shrink-0" />
            <div className="relative h-9 sm:h-11 w-20 sm:w-24 shrink-0">
              <Image src="/logos/IAMEC.png" alt="IAMEC Naguanagua" fill className="object-contain" priority />
            </div>
          </div>

          {/* Sub-barra de Estado, Tasa BCV y Operador */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">Taquilla Móvil & Kiosco</span>
              <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                POS Bancamiga Activo
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {tcmmv > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl text-xs font-bold">
                  <span className="text-slate-400">BCV:</span>
                  <span className="text-emerald-400 font-mono">Bs. {fmtBs(tcmmv)}</span>
                </div>
              )}

              {currentTime && (
                <div className="hidden sm:flex items-center gap-1 bg-slate-800/60 border border-slate-700/50 px-2.5 py-1 rounded-xl text-xs font-mono text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{currentTime}</span>
                </div>
              )}

              {operatorUser && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/90 rounded-xl border border-slate-700 text-xs font-semibold text-slate-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <User2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-[110px]">{operatorUser}</span>
                </div>
              )}

              <button
                onClick={async () => {
                  await performLogout('/');
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-xs font-bold text-red-300 transition-all cursor-pointer active:scale-95"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {step === 'search' && (
        <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-2xl mx-auto w-full justify-center">
          {/* Header Visual Principal optimizado para Pantalla Vertical (Portrait Kiosk) */}
          <div className="text-center mb-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-2.5 tracking-wide uppercase">
              <ShieldCheck className="w-4 h-4" />
              Alcaldía de Naguanagua · IAMEC
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              Taquilla Móvil Digital
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mt-1.5">
              Consulte su estado de cuenta y pague directo en el Punto de Venta Bancamiga con actualización inmediata en Conciliación.
            </p>
          </div>

          {/* Flujo Vertical Apilado para Tótem / Kiosco Vertical */}
          <div className="flex flex-col gap-5">
            {/* Tarjeta Principal de Búsqueda */}
            <div className="bg-slate-800/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700/80">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/70">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">Consulta de Contribuyente</h2>
                    <p className="text-xs text-slate-400">Ingrese documento de identidad o RIF fiscal</p>
                  </div>
                </div>
                <div className="hidden sm:block text-right">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Verificación</span>
                  <span className="text-xs text-emerald-400 font-semibold font-mono">EN LÍNEA</span>
                </div>
              </div>

              <label className="block text-slate-300 text-xs font-black uppercase tracking-wider mb-2.5">
                Tipo y Número de Identidad / RIF
              </label>

              <div className="flex gap-2.5 sm:gap-3 mb-4">
                <select 
                  value={docType} 
                  onChange={e => setDocType(e.target.value)} 
                  className="bg-slate-900/90 text-white rounded-2xl px-3 sm:px-4 py-4 sm:py-5 text-xl sm:text-2xl font-black focus:outline-none focus:ring-2 ring-emerald-500 border border-slate-700 shrink-0 shadow-inner cursor-pointer"
                >
                  {['V','J','E','G','P'].map(t => (
                    <option key={t} value={t} className="bg-slate-900 text-white">
                      {t}-
                    </option>
                  ))}
                </select>

                <div className="relative flex-1">
                  <input 
                    type="tel" 
                    value={docNumber} 
                    onChange={e => setDocNumber(e.target.value.replace(/\D/g,''))}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Ej: 12345678"
                    className="w-full h-full bg-slate-900/90 text-white rounded-2xl px-4 sm:px-6 py-4 sm:py-5 text-xl sm:text-2xl font-bold font-mono tracking-wider focus:outline-none focus:ring-2 ring-emerald-500 border border-slate-700 placeholder-slate-600 shadow-inner"
                    autoComplete="off" 
                    autoFocus
                  />
                  {docNumber && (
                    <button
                      type="button"
                      onClick={() => setDocNumber('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Botones de sugerencia rápida o prefijos */}
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <span className="text-[11px] text-slate-400 font-semibold mr-1">Rápido:</span>
                {[
                  { label: 'Venezolano (V)', val: 'V' },
                  { label: 'Comercio / RIF (J)', val: 'J' },
                  { label: 'Gubernamental (G)', val: 'G' },
                  { label: 'Extranjero (E)', val: 'E' },
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setDocType(p.val)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                      docType === p.val 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                        : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {searchError && (
                <div className="mb-6 flex items-start gap-3 text-red-300 bg-red-950/40 rounded-2xl p-4 border border-red-800/60 animate-shake">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                  <div>
                    <strong className="block text-sm font-bold text-red-200">No se pudo consultar</strong>
                    <span className="text-xs text-red-300/90">{searchError}</span>
                  </div>
                </div>
              )}

              <button 
                onClick={handleSearch} 
                disabled={isSearching || !docNumber.trim()}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black py-5 sm:py-6 rounded-2xl text-xl sm:text-2xl active:scale-[0.99] transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 cursor-pointer"
              >
                {isSearching ? (
                  <>
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Consultando Sistema Central...</span>
                  </>
                ) : (
                  <>
                    <span>Consultar Deuda y Recibos</span>
                    <ArrowRight className="w-6 h-6" />
                  </>
                )}
              </button>

              <div className="mt-5 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Liquidación oficial y recibos digitales
                </span>
                <span className="font-mono text-slate-500">IAMEC v2.5</span>
              </div>
            </div>

            {/* Tarjetas Inferiores Compactas para Pantalla Vertical */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">POS Bancamiga Directo</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Conexión directa por Cable USB o Wi-Fi con tarjeta propia o de tercero.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Conciliación en Línea</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Actualiza automáticamente Conciliación Bancaria y Puntos de Venta.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Solvencia Inmediata</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Descuenta meses en Contribuyentes y Condominios al instante.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'account' && foundUser && (
        <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-2xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={reset}
              className="flex items-center gap-2 text-slate-300 font-bold bg-slate-800/80 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 transition-colors active:scale-95 text-sm"
            >
              <ChevronLeft className="w-5 h-5 text-emerald-400" />
              <span>Volver a la Consulta</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">Tasa BCV:</span>
              <span className="text-xs font-mono font-bold text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 rounded-lg">
                Bs. {tcmmv.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/90 rounded-3xl p-5 sm:p-7 border border-slate-700/80 shadow-xl mb-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <User2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-emerald-400 font-mono font-black text-sm tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                      {foundUser.Identidad}
                    </span>
                    {foundUser.Clasificacion && (
                      <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        foundUser.Clasificacion.toLowerCase().includes('residencial')
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-blue-500/20 text-blue-300'
                      }`}>
                        {foundUser.Clasificacion}
                      </span>
                    )}
                    {foundUser.EsAgente && (
                      <span className="inline-block text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Agente Retención IVA
                      </span>
                    )}
                  </div>
                  <h1 className="text-white text-xl sm:text-2xl font-black leading-tight">
                    {foundUser.Contribuyente}
                  </h1>
                  {foundUser.Actividad && foundUser.Actividad !== 'No aplica' && (
                    <p className="text-slate-400 text-xs mt-1">
                      Actividad: <span className="text-slate-300 font-medium">{foundUser.Actividad}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {foundUser.Direccion && (
              <div className="flex items-start gap-2 mt-4 pt-4 border-t border-slate-700/60 text-slate-400 text-xs sm:text-sm">
                <MapPin className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                <span>{foundUser.Direccion}</span>
              </div>
            )}
          </div>

          {recibos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
              <CheckCircle2 className="w-28 h-28 text-emerald-500 mb-6 drop-shadow-lg" />
              <h2 className="text-4xl font-black text-white mb-3">¡Estás al día!</h2>
              <p className="text-slate-400 text-xl">No tienes deuda pendiente por pagar.</p>
              <button onClick={reset} className="mt-10 bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-10 rounded-2xl text-lg transition-all">Nueva Consulta</button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* TARJETA DEUDA TOTAL */}
              <div className="bg-gradient-to-r from-red-900/40 to-orange-900/30 rounded-3xl p-6 border border-red-500/30 text-center shadow-lg">
                <div className="text-red-300 font-bold uppercase text-xs sm:text-sm tracking-widest mb-1">
                  Deuda Total — {totalPeriodsInDeuda} {totalPeriodsInDeuda === 1 ? 'período mensual' : 'períodos mensuales'}
                </div>
                <div className="text-3xl sm:text-5xl font-black text-white">
                  Bs. {fmtBs(recibos.reduce((s, r) => s + getReciboMonto(r), 0))}
                </div>
              </div>

              {/* BARRA DE ACCIÓN RÁPIDA */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/90 p-3.5 sm:p-4 rounded-2xl border border-slate-700/80 shadow-md">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-300 font-bold text-xs sm:text-sm">Locales / Inmuebles:</span>
                  <span className="bg-emerald-500/20 text-emerald-400 text-xs font-black px-2.5 py-0.5 rounded-full">
                    {groupedLocals.length} {groupedLocals.length === 1 ? 'local' : 'locales'}
                  </span>
                  <span className="text-slate-400 text-xs font-medium">
                    ({totalMonthsSelected} de {totalPeriodsInDeuda} meses seleccionados)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllReceipts}
                    className="text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 px-3 py-1.5 rounded-xl transition-all active:scale-95"
                  >
                    ✓ Elegir Todo
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllReceipts}
                    className="text-xs font-bold bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-600 px-3 py-1.5 rounded-xl transition-all active:scale-95"
                  >
                    ✕ Limpiar
                  </button>
                </div>
              </div>

              {/* AGRUPACIÓN POR LOCAL / INMUEBLE CON ACORDEÓN DESPLEGABLE */}
              <div className="space-y-3">
                {groupedLocals.map((local) => {
                  const isExpanded = !!expandedInms[local.localId];

                  if (local.isUnified) {
                    // LOCAL COMERCIAL UNIFICADO (Múltiples actividades económicas en el mismo local)
                    const selectedMonthsCount = local.monthlyGroups.filter((mg) =>
                      mg.receiptRefs.length > 0 && mg.receiptRefs.every((ref) => selectedRefs.includes(ref))
                    ).length;
                    const isAllSelected =
                      local.allReceiptRefs.length > 0 &&
                      local.allReceiptRefs.every((ref) => selectedRefs.includes(ref));
                    const isPartiallySelected = selectedMonthsCount > 0 && !isAllSelected;

                    return (
                      <div
                        key={local.localId}
                        className="bg-slate-800 rounded-2xl border-2 border-emerald-500/40 overflow-hidden shadow-lg transition-all hover:border-emerald-500/60"
                      >
                        {/* Cabecera del Local Unificado */}
                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-800/95">
                          <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                            {/* Botón para elegir todo el local unificado */}
                            <button
                              type="button"
                              onClick={() => toggleAllLocal(local.allReceiptRefs)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95 shrink-0 ${
                                isAllSelected
                                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400'
                                  : isPartiallySelected
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                  : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300 border border-slate-600'
                              }`}
                              title="Seleccionar o deseleccionar todos los meses de este local"
                            >
                              {isAllSelected ? (
                                <CheckSquare2 className="w-4 h-4 text-white shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span>
                                {isAllSelected
                                  ? `Elegido (${local.monthlyGroups.length})`
                                  : isPartiallySelected
                                  ? `${selectedMonthsCount}/${local.monthlyGroups.length}`
                                  : `Elegir Todo (${local.monthlyGroups.length})`}
                              </span>
                            </button>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-black">
                                  <Store className="w-3.5 h-3.5" />
                                  <span>Local Comercial Unificado</span>
                                </div>
                                <span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  COMERCIAL (16% IVA)
                                </span>
                                <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-emerald-400" />
                                  {local.inms.length} Actividades Unificadas
                                </span>
                              </div>

                              {/* Desglose de actividades económicas del local */}
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {local.inms.map((inm) => (
                                  <span
                                    key={inm.inmueble}
                                    className="text-[11px] bg-slate-900/80 text-slate-300 px-2.5 py-0.5 rounded-lg border border-slate-700 flex items-center gap-1.5"
                                  >
                                    <strong className="text-emerald-400 font-mono">{inm.inmueble}</strong>
                                    <span className="text-slate-600">•</span>
                                    <span className="truncate max-w-[220px]" title={inm.actividad_principal}>
                                      {inm.actividad_principal || 'Comercial'}
                                    </span>
                                  </span>
                                ))}
                              </div>

                              {local.direccion && (
                                <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-1 flex items-center gap-1" title={local.direccion}>
                                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                  {local.direccion}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Monto del Local y Botón para desplegar recibos */}
                          <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/60 shrink-0">
                            <div className="text-left md:text-right">
                              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                Deuda Inmueble
                              </div>
                              <div className="text-white font-black text-base sm:text-lg">
                                Bs. {fmtBs(local.totalBs)}
                              </div>
                              <div className="text-[10px] text-emerald-400 font-semibold">
                                {local.monthlyGroups.length} meses consolidados
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleExpand(local.localId)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-600"
                            >
                              <span>{isExpanded ? 'Ocultar' : `Ver Recibos (${local.monthlyGroups.length})`}</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Recibos mensuales desplegables para el local unificado */}
                        {isExpanded && (
                          <div className="p-3.5 bg-slate-900/70 border-t border-slate-700/80 space-y-2 max-h-[380px] overflow-y-auto">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                Desglose Mensual — Las {local.inms.length} actividades se pagan juntas por mes
                              </span>
                              <span className="text-emerald-400">
                                {selectedMonthsCount} de {local.monthlyGroups.length} meses elegidos
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {local.monthlyGroups.map((mg) => {
                                const isMgSelected =
                                  mg.receiptRefs.length > 0 &&
                                  mg.receiptRefs.every((ref) => selectedRefs.includes(ref));
                                return (
                                  <div
                                    key={mg.monthKey}
                                    onClick={() => toggleMonthlyGroup(mg, local.monthlyGroups)}
                                    className={`flex flex-col justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                                      isMgSelected
                                        ? 'bg-emerald-500/15 border-emerald-500/60 ring-1 ring-emerald-500/30'
                                        : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-400'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isMgSelected}
                                          onChange={() => {}}
                                          className="w-4 h-4 text-emerald-500 rounded cursor-pointer pointer-events-none shrink-0 mt-0.5"
                                        />
                                        <div className="min-w-0">
                                          <div className={`font-bold text-xs truncate ${isMgSelected ? 'text-emerald-300' : 'text-slate-300'}`}>
                                            Mes {mg.monthIndex} — {formatPeriodo(mg.emision)}
                                          </div>
                                          <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                                            {mg.receipts.map((sub) => (
                                              <div key={sub.referencia} className="flex items-center gap-1.5 truncate">
                                                <span className="font-mono text-emerald-400/90 font-bold">{sub.inmId}:</span>
                                                <span className="text-slate-300 truncate max-w-[120px]">{sub.act}</span>
                                                <span className="text-slate-400 font-medium ml-1">Bs. {fmtBs(sub.montoBs)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                      <div className={`font-extrabold text-xs shrink-0 pl-2 text-right ${isMgSelected ? 'text-white' : 'text-slate-400'}`}>
                                        <div>Bs. {fmtBs(mg.totalBs)}</div>
                                        <div className="text-[9px] text-emerald-400 font-semibold mt-0.5">Total Mes</div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // INMUEBLE INDIVIDUAL (Sin otras actividades en el mismo local)
                  const inmRefs = local.singleItems.map((r) => r.referencia);
                  const selectedCount = inmRefs.filter((ref) => selectedRefs.includes(ref)).length;
                  const isAllSelected = inmRefs.length > 0 && selectedCount === inmRefs.length;
                  const isPartiallySelected = selectedCount > 0 && !isAllSelected;
                  const singleInm = local.inms[0];

                  return (
                    <div
                      key={local.localId}
                      className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md transition-all hover:border-slate-600"
                    >
                      {/* Cabecera del Inmueble Individual */}
                      <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-800">
                        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleAllLocal(inmRefs)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95 shrink-0 ${
                              isAllSelected
                                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400'
                                : isPartiallySelected
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300 border border-slate-600'
                            }`}
                            title="Seleccionar o deseleccionar todos los recibos de este inmueble"
                          >
                            {isAllSelected ? (
                              <CheckSquare2 className="w-4 h-4 text-white shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span>
                              {isAllSelected
                                ? `Elegido (${inmRefs.length})`
                                : isPartiallySelected
                                ? `${selectedCount}/${inmRefs.length}`
                                : `Elegir Todo (${inmRefs.length})`}
                            </span>
                          </button>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-emerald-400 font-black text-base tracking-wide">
                                {local.localId}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                local.tipo.toLowerCase().includes('residencial')
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {local.tipo || 'COMERCIAL'}
                              </span>
                              {singleInm?.actividad_principal && (
                                <span className="text-[10px] font-medium text-slate-300 bg-slate-700/80 px-2 py-0.5 rounded-full truncate max-w-[180px]" title={singleInm.actividad_principal}>
                                  {singleInm.actividad_principal}
                                </span>
                              )}
                            </div>
                            {local.direccion && (
                              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 flex items-center gap-1" title={local.direccion}>
                                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                {local.direccion}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/60 shrink-0">
                          <div className="text-left md:text-right">
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                              Deuda Inmueble
                            </div>
                            <div className="text-white font-black text-base sm:text-lg">
                              Bs. {fmtBs(local.totalBs)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleExpand(local.localId)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-600"
                          >
                            <span>{isExpanded ? 'Ocultar' : `Ver Recibos (${local.singleItems.length})`}</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Recibos desplegables para inmueble individual */}
                      {isExpanded && (
                        <div className="p-3.5 bg-slate-900/70 border-t border-slate-700/80 space-y-2 max-h-[360px] overflow-y-auto">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>Desglose Mensual — Seleccione períodos específicos</span>
                            <span className="text-emerald-400">{selectedCount} de {local.singleItems.length} elegidos</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {local.singleItems.map((r, rIdx) => {
                              const isItemSel = selectedRefs.includes(r.referencia);
                              return (
                                <div
                                  key={r.referencia}
                                  onClick={() => toggleIndividualReceipt(r.referencia, local.singleItems)}
                                  className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    isItemSel
                                      ? 'bg-emerald-500/15 border-emerald-500/60 ring-1 ring-emerald-500/30'
                                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-400'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isItemSel}
                                      onChange={() => {}}
                                      className="w-4 h-4 text-emerald-500 rounded cursor-pointer pointer-events-none shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <div className={`font-bold text-xs truncate ${isItemSel ? 'text-emerald-300' : 'text-slate-300'}`}>
                                        Mes {rIdx + 1} — {formatPeriodo(r.emision)}
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-mono truncate">
                                        {r.referencia}
                                      </div>
                                    </div>
                                  </div>
                                  <div className={`font-extrabold text-xs shrink-0 pl-2 ${isItemSel ? 'text-white' : 'text-slate-400'}`}>
                                    Bs. {fmtBs(getReciboMonto(r))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DETALLE A PAGAR */}
              <div className="bg-slate-800 rounded-3xl p-5 sm:p-6 border border-slate-700 shadow-md">
                <div className="flex items-center justify-between mb-4 border-b border-slate-700/80 pb-3">
                  <h4 className="font-bold text-slate-300 uppercase tracking-widest text-xs">
                    Detalle a Pagar
                  </h4>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    {totalMonthsSelected} {totalMonthsSelected === 1 ? 'mes seleccionado' : 'meses seleccionados'}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Subtotal Aseo ({totalMonthsSelected} {totalMonthsSelected === 1 ? 'mes' : 'meses'})</span>
                    <span className="text-white font-bold text-base">Bs. {fmtBs(desgloseSel.base)}</span>
                  </div>
                  {desgloseSel.multa > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400">Multa por Mora (Exenta de IVA)</span>
                      <span className="text-amber-400 font-bold">Bs. {fmtBs(desgloseSel.multa)}</span>
                    </div>
                  )}
                  {!isResidencialGlobal && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">IVA (16%) Base Imponible</span>
                        <span className="text-white font-bold">Bs. {fmtBs(ivaTotalCalculado)}</span>
                      </div>
                      {hasAgenteEnSeleccion ? (
                        <>
                          <div className="flex justify-between items-center text-amber-400 text-xs sm:text-sm">
                            <span>↳ IVA Retenido (75% solo comercios autorizados)</span>
                            <span className="font-bold">- Bs. {fmtBs(ivaRetenidoCalculado)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">IVA a Pagar (Neto)</span>
                            <span className="text-white font-bold text-base">Bs. {fmtBs(ivaCalculado)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">IVA a Pagar (16%)</span>
                          <span className="text-white font-bold text-base">Bs. {fmtBs(ivaCalculado)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex justify-between items-center pt-4 mt-4 border-t border-slate-700/80">
                  <span className="text-emerald-400 font-black text-xl">Pago Total</span>
                  <span className="text-emerald-400 font-black text-2xl sm:text-3xl">
                    Bs. {fmtBs(pagoTotalCalculado)}
                  </span>
                </div>
              </div>

              {/* AVISO AGENTE DE RETENCIÓN — Solo si los recibos seleccionados incluyen comercios con agente_retencion === true */}
              {hasAgenteEnSeleccion && (
                <div className="flex items-start gap-4 bg-amber-400/20 border-2 border-amber-400 rounded-2xl px-5 py-4">
                  <TriangleAlert className="w-8 h-8 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-amber-300 font-black text-lg leading-tight mb-1">
                      Comercio Calificado como Agente de Retención
                    </div>
                    <div className="text-amber-200 text-sm leading-relaxed">
                      Este cobro incluye comercios autorizados donde se retuvo el <strong>75% del IVA</strong> por providencia del SENIAT. Recuerde cargar el comprobante correspondiente a través del portal web en <em>Soy Contribuyente → Retenciones IVA</em>.
                    </div>
                  </div>
                </div>
              )}

              {/* BOTÓN PAGAR */}
              <button
                onClick={() => setStep('pay')}
                disabled={selectedRefs.length === 0}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black py-5 sm:py-6 rounded-2xl text-xl sm:text-2xl mt-1 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
              >
                {selectedRefs.length === 0 ? (
                  'Seleccione al menos un período'
                ) : (
                  <>
                    Pagar Bs. {fmtBs(pagoTotalCalculado)} <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'pay' && foundUser && (
        <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-2xl mx-auto w-full">
          <button
            onClick={() => setStep('account')}
            className="flex items-center gap-2 text-slate-300 font-bold bg-slate-800/80 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 transition-colors active:scale-95 text-sm w-fit mb-4"
          >
            <ChevronLeft className="w-5 h-5 text-emerald-400" />
            <span>Volver a la Selección de Períodos</span>
          </button>

          {/* Resumen del Contribuyente para Pago */}
          <div className="bg-slate-800/90 rounded-3xl p-5 sm:p-6 border border-slate-700/80 shadow-xl mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/70">
              <div>
                <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/30">
                  Deuda de: {foundUser.Identidad}
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                  {foundUser.Contribuyente}
                </h2>
                <p className="text-slate-400 text-xs">
                  Cancelando {monthsToPay} {monthsToPay === 1 ? 'período mensual' : 'períodos mensuales'}
                </p>
              </div>

              <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-2xl p-4 text-left sm:text-right shrink-0">
                <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider">
                  Monto Total a Cobrar
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                  Bs. {fmtBs(pagoTotalCalculado)}
                </div>
              </div>
            </div>

            <div className="pt-4">
              <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                Fecha de Ingreso a Caja / Conciliación:
              </label>
              <input
                type="date"
                value={fechaCaja}
                onChange={(e) => setFechaCaja(e.target.value)}
                className="w-full bg-slate-900 border-2 border-slate-700 text-white rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:border-emerald-500 transition-colors text-sm"
              />
            </div>
          </div>

          <h3 className="text-white font-bold text-xs uppercase tracking-wider mb-2.5">
            1. Seleccione Canal Bancamiga:
          </h3>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              type="button"
              onClick={() => setPayMethod('Punto de Venta')}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 font-bold transition-all text-left active:scale-98 ${
                payMethod === 'Punto de Venta'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/30'
                  : 'bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300'
              }`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                payMethod === 'Punto de Venta' ? 'bg-emerald-500 text-white' : 'bg-slate-700/60 text-slate-400'
              }`}>
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-black">Punto de Venta Bancamiga</div>
                <div className="text-[11px] text-slate-400 font-normal">
                  Conexión directa USB / Wi-Fi
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPayMethod('Bancamiga')}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 font-bold transition-all text-left active:scale-98 ${
                payMethod === 'Bancamiga'
                  ? 'bg-blue-500/15 border-blue-500 text-white shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/30'
                  : 'bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300'
              }`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                payMethod === 'Bancamiga' ? 'bg-blue-600 text-white' : 'bg-slate-700/60 text-slate-400'
              }`}>
                <Landmark className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-black">Bancamiga Oficial</div>
                <div className="text-[11px] text-slate-400 font-normal">
                  Cuenta N° 0172-0717
                </div>
              </div>
            </button>
          </div>

          {payMethod === 'Punto de Venta' && (
            <div className="bg-slate-800/90 rounded-3xl p-5 sm:p-7 border border-slate-700/80 shadow-xl space-y-5">
              {/* PASO 2: ¿QUIÉN ES EL TITULAR DE LA TARJETA? (MISMA PERSONA VS OTRA PERSONA / TERCERO) */}
              <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-700/80">
                <label className="block text-slate-200 text-xs font-black uppercase tracking-wider mb-2.5">
                  2. ¿Con la tarjeta de quién se realizará el pago en el Punto de Venta?
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setUsaTarjetaTercero(false)}
                    disabled={/^[JG]/i.test(String(foundUser.Identidad || '').trim())}
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-center gap-3 ${
                      !usaTarjetaTercero
                        ? 'bg-emerald-500/20 border-emerald-500 text-white font-bold'
                        : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    <User2 className={`w-5 h-5 shrink-0 ${!usaTarjetaTercero ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-black">Mismo Contribuyente</div>
                      <div className="text-[11px] font-mono truncate text-emerald-300">{foundUser.Identidad}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUsaTarjetaTercero(true)}
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-center gap-3 ${
                      usaTarjetaTercero
                        ? 'bg-amber-500/20 border-amber-400 text-white font-bold'
                        : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CreditCard className={`w-5 h-5 shrink-0 ${usaTarjetaTercero ? 'text-amber-400' : 'text-slate-500'}`} />
                    <div>
                      <div className="text-xs font-black">Tarjeta de Otra Persona</div>
                      <div className="text-[11px] text-amber-300/90">Familiar, representante o tercero</div>
                    </div>
                  </button>
                </div>

                {usaTarjetaTercero && (
                  <div className="mt-3.5 pt-3.5 border-t border-slate-800 space-y-3">
                    <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
                      El Punto Bancamiga validará la <strong>Cédula del dueño de la tarjeta</strong> al pasarla, pero el Recibo/Factura y la Solvencia saldrán a nombre de <strong>{foundUser.Contribuyente} ({foundUser.Identidad})</strong>.
                    </div>

                    <div>
                      <label className="block text-slate-300 text-[11px] font-bold uppercase mb-1.5">
                        Cédula del Titular de la Tarjeta (Obligatorio para el POS):
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={terceroTipoDoc}
                          onChange={(e) => setTerceroTipoDoc(e.target.value as 'V' | 'E')}
                          className="bg-slate-800 text-white rounded-xl px-3 py-3 text-base font-black border border-slate-600 focus:border-amber-400 outline-none"
                        >
                          <option value="V">V-</option>
                          <option value="E">E-</option>
                        </select>
                        <input
                          type="tel"
                          value={terceroCedula}
                          onChange={(e) => setTerceroCedula(e.target.value.replace(/\D/g, ''))}
                          placeholder="Ej: 18456789"
                          className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-3 text-lg font-mono font-bold border border-slate-600 focus:border-amber-400 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] font-bold uppercase mb-1">
                        Nombre del Titular de la Tarjeta (Opcional - para respaldo en Conciliación):
                      </label>
                      <input
                        type="text"
                        value={terceroNombre}
                        onChange={(e) => setTerceroNombre(e.target.value)}
                        placeholder="Ej: María Pérez"
                        className="w-full bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm font-semibold border border-slate-700 focus:border-amber-400 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* PASO 3: MODALIDAD DE CONEXIÓN AL PUNTO DE VENTA BANCAMIGA (AMBAS INTEGRADAS) */}
              <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-700/80">
                <label className="block text-slate-200 text-xs font-black uppercase tracking-wider mb-2.5">
                  3. Conexión Directa con Punto de Venta Bancamiga:
                </label>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setPosMode('usb')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all ${
                      posMode === 'usb'
                        ? 'bg-emerald-500 text-white border-emerald-400 shadow'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    🔌 1. Cable USB Directo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosMode('wifi')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all ${
                      posMode === 'wifi'
                        ? 'bg-blue-600 text-white border-blue-400 shadow'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    📡 2. Wi-Fi / IP POS
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosMode('manual')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all ${
                      posMode === 'manual'
                        ? 'bg-slate-700 text-white border-slate-500 shadow'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    🧾 Voucher Manual
                  </button>
                </div>

                {posMode === 'usb' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Conecte el Punto de Venta Bancamiga por cable USB al equipo. Al pulsar el botón, se enviará automáticamente el monto de <strong className="text-emerald-400">Bs. {fmtBs(pagoTotalCalculado)}</strong> y la cédula <strong className="text-emerald-400">{usaTarjetaTercero ? `${terceroTipoDoc}-${terceroCedula || '...'}` : foundUser.Identidad}</strong> al POS.
                    </p>
                    <button
                      type="button"
                      onClick={handleConectarCobrarUsbPos}
                      disabled={isWaitingPos || isProcessing}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black py-4 rounded-2xl text-base sm:text-lg active:scale-95 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                    >
                      {isWaitingPos ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>Esperando Tarjeta y Clave en el POS Bancamiga...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5" />
                          <span>{usbPort ? 'Enviar Cobro al POS Bancamiga (USB Conectado)' : 'Conectar USB y Enviar Cobro al POS Bancamiga'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {posMode === 'wifi' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-slate-400 text-[11px] font-bold uppercase mb-1">
                        Dirección IP:Puerto del Punto Bancamiga en Red Local:
                      </label>
                      <input
                        type="text"
                        value={posIp}
                        onChange={(e) => setPosIp(e.target.value)}
                        placeholder="Ej: 192.168.1.50:8080"
                        className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-white focus:border-blue-400 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCobrarWifiPos}
                      disabled={isWaitingPos || isProcessing}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl text-base sm:text-lg active:scale-95 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                    >
                      {isWaitingPos ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>Esperando Aprobación del POS por Red...</span>
                        </>
                      ) : (
                        <>
                          <Activity className="w-5 h-5" />
                          <span>Enviar Cobro por Wi-Fi al POS Bancamiga</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {posStatusMsg && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold text-center">
                    {posStatusMsg}
                  </div>
                )}
              </div>

              {/* DATOS DEL VOUCHER / CONFIRMACIÓN Y ENVÍO A CONCILIACIÓN */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5">
                      Nro. de Referencia / Secuencia POS:
                    </label>
                    <input
                      type="tel"
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                      placeholder="Se llena solo o escriba ej: 00482910"
                      className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-4 py-3.5 text-lg sm:text-xl text-center text-white font-mono font-bold focus:border-emerald-500 outline-none tracking-widest transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                      Lote POS:
                    </label>
                    <input
                      type="text"
                      value={posLote}
                      onChange={(e) => setPosLote(e.target.value)}
                      placeholder="001"
                      className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-3 py-3.5 text-lg text-center text-slate-200 font-mono font-bold focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {payError && (
                  <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-3 text-red-300 text-center font-bold text-xs sm:text-sm">
                    {payError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePayPos}
                  disabled={isProcessing || isWaitingPos}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 sm:py-5 rounded-2xl text-lg sm:text-xl active:scale-95 disabled:bg-slate-700 disabled:text-slate-500 transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Actualizando Conciliación y Generando Recibo...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-6 h-6" />
                      <span>Confirmar Pago y Actualizar Conciliación</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {payMethod === 'Bancamiga' && (
            <div className="bg-slate-800/90 rounded-3xl p-6 sm:p-8 border border-slate-700/80 shadow-xl text-center">
              <div className="w-16 h-16 bg-blue-500/20 border border-blue-500/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Landmark className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-2xl font-black mb-1 text-white">Canal Recaudador Oficial Bancamiga</h3>
              <p className="text-slate-400 mb-6 text-xs sm:text-sm max-w-md mx-auto">
                Cuenta oficial del Instituto Autónomo Municipal de Ecosocialismo (IAMEC) de Naguanagua.
              </p>

              <div className="bg-slate-900/90 rounded-2xl p-4 border border-blue-500/30 text-left mb-6 text-xs space-y-2.5 max-w-md mx-auto">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Banco:</span>
                  <span className="font-bold text-white">Bancamiga (0172)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Tipo de Cuenta:</span>
                  <span className="font-semibold text-slate-200">Cuenta Corriente</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Número de Cuenta:</span>
                  <span className="font-mono font-bold text-blue-300">01720110711101340717</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Titular:</span>
                  <span className="font-bold text-white">IAMEC BANCAMIGA</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">R.I.F.:</span>
                  <span className="font-mono font-bold text-emerald-400">G-20008614-9</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBancamigaSim(true)}
                className="w-full max-w-md mx-auto bg-blue-600 hover:bg-blue-500 text-white font-black py-4 sm:py-5 rounded-2xl text-lg active:scale-95 transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-5 h-5" />
                <span>Continuar con Bancamiga</span>
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'success' && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto w-full">
          {/* Tarjeta de Recibo Oficial Imprimible / Digital */}
          <div className="bg-slate-800/95 rounded-3xl border-2 border-emerald-500/40 p-6 sm:p-8 w-full shadow-2xl relative overflow-hidden backdrop-blur-md">
            {/* Header del Recibo con todos los logos institucionales */}
            <div className="flex flex-col gap-3 pb-4 border-b border-slate-700/80">
              <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-2xl shadow">
                <div className="relative h-8 w-16 shrink-0">
                  <Image src="/logos/LACAVA.png" alt="Lacava" fill className="object-contain" />
                </div>
                <div className="relative h-8 w-20 shrink-0">
                  <Image src="/logos/NAGUANAGUATEQUIERO.png" alt="Naguanagua" fill className="object-contain" />
                </div>
                <div className="relative h-8 w-16 shrink-0">
                  <Image src="/logos/ELIZABETH.png" alt="Alcaldía" fill className="object-contain" />
                </div>
                <div className="relative h-8 w-20 shrink-0">
                  <Image src="/logos/INSTITUTO.png" alt="Instituto" fill className="object-contain" />
                </div>
                <div className="relative h-8 w-16 shrink-0">
                  <Image src="/logos/IAMEC.png" alt="IAMEC" fill className="object-contain" />
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs font-black text-white uppercase tracking-wider">Instituto Autónomo Municipal de Ecosocialismo (IAMEC)</div>
                <div className="text-[11px] text-emerald-400 font-semibold">Comprobante Oficial de Cobro · Taquilla Móvil</div>
              </div>
            </div>

            {/* Checkmark y estado */}
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-400">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">¡Operación Exitosa!</h1>
              <p className="text-emerald-300 text-xs sm:text-sm mt-1">
                Cobro registrado con éxito en el sistema municipal.
              </p>
            </div>

            {/* Detalle del recibo */}
            <div className="bg-slate-900/80 rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-3 text-xs sm:text-sm mb-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <span className="text-slate-400">Contribuyente:</span>
                <span className="text-white font-bold text-right max-w-[65%] truncate">
                  {foundUser?.Contribuyente}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <span className="text-slate-400">Identificación / RIF:</span>
                <span className="font-mono font-bold text-emerald-400">{foundUser?.Identidad}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <span className="text-slate-400">Monto Cobrado:</span>
                <span className="text-xl font-mono font-black text-white">
                  Bs. {fmtBs(pagoTotalCalculado)}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <span className="text-slate-400">Períodos Mensuales:</span>
                <span className="text-slate-200 font-bold">{monthsToPay} cancelados</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <span className="text-slate-400">Método de Cobro:</span>
                <span className="text-slate-200 font-bold">{payMethod} (Bancamiga)</span>
              </div>
              {referencia && (
                <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                  <span className="text-slate-400">Referencia / Secuencia POS:</span>
                  <span className="font-mono font-bold text-emerald-400">{referencia}</span>
                </div>
              )}
              {usaTarjetaTercero && terceroCedula && (
                <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                  <span className="text-slate-400">Titular de la Tarjeta (Pagador):</span>
                  <span className="font-mono font-semibold text-amber-300">
                    {terceroTipoDoc}-{terceroCedula} {terceroNombre ? `(${terceroNombre})` : ''}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Fecha y Hora de Operación:</span>
                <span className="text-slate-300 font-mono text-[11px]">
                  {new Date().toLocaleString('es-VE')}
                </span>
              </div>
            </div>

            {/* Botones de acción final */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={reset}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-2xl text-lg active:scale-95 transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
              >
                <span>Nueva Consulta o Cobro</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showBancamigaSim && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-blue-600 p-6 text-center text-white relative">
              <div className="flex justify-center items-center gap-3 mb-2">
                <div className="h-8 w-8 bg-white rounded-lg p-1 flex items-center justify-center">
                  <Image src="/logos/IAMEC.png" alt="IAMEC" width={24} height={24} className="object-contain" />
                </div>
                <h2 className="text-xl font-black tracking-wide">BANCAMIGA OFICIAL</h2>
              </div>
              <p className="text-blue-100 text-xs">Cuenta Recaudadora Oficial IAMEC · Pasarela de Pago</p>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 rounded-2xl p-4 text-center mb-4 border border-blue-100">
                <div className="text-xs text-slate-500 font-bold uppercase">Monto a Cobrar</div>
                <div className="text-3xl font-black text-slate-800 mt-1">Bs. {fmtBs(pagoTotalCalculado)}</div>
                <div className="text-slate-600 font-semibold text-xs mt-1 truncate">{foundUser?.Contribuyente}</div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-[11px] space-y-1.5 mb-5 border border-slate-200 text-slate-600">
                <div className="flex justify-between"><span className="text-slate-400">Banco:</span><span className="font-bold text-slate-800">Bancamiga (0172)</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Tipo:</span><span className="font-semibold text-slate-800">Cuenta Corriente</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Cta Corriente:</span><span className="font-mono font-bold text-slate-900">01720110711101340717</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Beneficiario:</span><span className="font-bold text-slate-800">IAMEC BANCAMIGA</span></div>
                <div className="flex justify-between"><span className="text-slate-400">R.I.F.:</span><span className="font-mono font-bold text-slate-800">G-20008614-9</span></div>
              </div>

              <button
                type="button"
                onClick={() => processPayment(`BCA-${Math.floor(Math.random() * 1000000)}`, 'Bancamiga')}
                disabled={isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl text-lg mb-2.5 active:scale-95 disabled:bg-slate-300 transition-all flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Procesando con Bancamiga...</span>
                  </>
                ) : (
                  <span>Confirmar Cobro Bancamiga</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowBancamigaSim(false)}
                disabled={isProcessing}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-2xl active:scale-95 transition-all text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
