'use client';
import { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, CheckCircle2, AlertCircle, ChevronLeft, ArrowRight, 
  Landmark, MapPin, User2, Building2, TriangleAlert, ChevronDown, ChevronUp,
  CheckSquare2, Square
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { isResidencialInm, calcularMensualidad } from '@/lib/calculos';
import { getIdentidadVariants } from '@/lib/formatters';

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

const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getFAR = (actividad: string) => {
  const act = (actividad || '').toLowerCase();
  if (act.includes('quinta (a)')) return 0.020366;
  if (act.includes('apartamento (a)')) return 0.023723;
  if (act.includes('quinta (b)')) return 0.016298;
  if (act.includes('apartamento (b)')) return 0.018985;
  if (act.includes('casa (c)')) return 0.014;
  if (act.includes('apartamento (c)')) return 0.028839;
  if (act.includes('casa (d)')) return 0.02673;
  return 0.02673; // default
};

// Tarifa mensual según Ordenanza
const calcMontoMes = (inm: Inmueble, tcmmv: number): number => {
  return parseFloat(calcularMensualidad(inm, tcmmv).toFixed(2));
};

export default function KioskPage() {
  const [tcmmv, setTcmmv] = useState<number>(0);
  useEffect(() => {
    fetch('/api/bcv').then(r => r.json()).then(d => { if (d?.tcmmv) setTcmmv(d.tcmmv); }).catch(() => {});
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [payError, setPayError] = useState('');
  const [showBancamigaSim, setShowBancamigaSim] = useState(false);
  const [expandedInms, setExpandedInms] = useState<Record<string, boolean>>({});

  const isResidencialGlobal = isResidencialInm(foundUser);
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
        const esRes = isResidencialInm(inm);
        // Tarifa mensual según Ordenanza:
        const baseMes = parseFloat(calcularMensualidad(inm, tcmmv).toFixed(2));
        const emision = r.emision ? new Date(r.emision) : new Date();
        const today = new Date();
        const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
        // Multa mensual por mora: 10% para residencial, 12% para comercial sobre la base
        const multaMes = monthsDiff > 0 ? parseFloat((baseMes * (esRes ? 0.10 : 0.12)).toFixed(2)) : 0;
        // IVA solo sobre la base del servicio comercial; residencial exento 0%
        const ivaMes = esRes ? 0 : parseFloat((baseMes * 0.16).toFixed(2));
        return {
          base: baseMes,
          multa: multaMes,
          iva: ivaMes,
          total: parseFloat((baseMes + multaMes + ivaMes).toFixed(2))
        };
      }
      return { base: 0, multa: 0, iva: 0, total: 0 };
    } else if (r.referencia?.startsWith('RECIB-') || r.referencia === 'RECIB-DEUDA') {
      let totalBase = 0, totalMulta = 0, totalIva = 0;
      userInms.forEach(i => {
        const meses = Math.max(1, parseInt(String(i.meses_deuda || 1)));
        const esRes = isResidencialInm(i);
        const baseMes = parseFloat(calcularMensualidad(i, tcmmv).toFixed(2));
        const baseInm = baseMes * meses;
        const multaInm = baseMes * (esRes ? 0.10 : 0.12) * Math.max(0, meses - 1);
        totalBase += baseInm;
        totalMulta += multaInm;
        if (!esRes) {
          totalIva += baseInm * 0.16;
        }
      });
      return {
        base: parseFloat(totalBase.toFixed(2)),
        multa: parseFloat(totalMulta.toFixed(2)),
        iva: parseFloat(totalIva.toFixed(2)),
        total: parseFloat((totalBase + totalMulta + totalIva).toFixed(2))
      };
    } else if (r.referencia?.startsWith('CM-')) {
      let tInms = userInms.filter(i => i.inmueble && r.referencia.includes(i.inmueble));
      if (tInms.length === 0) tInms = userInms;
      let totalBase = 0, totalIva = 0;
      tInms.forEach(i => {
        const bm = calcMontoMes(i, tcmmv);
        const esRes = isResidencialInm(i);
        totalBase += bm;
        if (!esRes) totalIva += bm * 0.16;
      });
      return {
        base: parseFloat(totalBase.toFixed(2)),
        multa: 0,
        iva: parseFloat(totalIva.toFixed(2)),
        total: parseFloat((totalBase + totalIva).toFixed(2))
      };
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
  const desgloseSel = useMemo(() => {
    let base = 0, multa = 0, iva = 0;
    selectedRefs.forEach(ref => {
      const r = recibos.find(x => x.referencia === ref);
      if (r) {
        const d = getReciboDesglose(r);
        base += d.base;
        multa += d.multa;
        iva += d.iva;
      }
    });
    return {
      base: parseFloat(base.toFixed(2)),
      multa: parseFloat(multa.toFixed(2)),
      iva: isResidencialGlobal ? 0 : parseFloat(iva.toFixed(2))
    };
  }, [selectedRefs, recibos, userInms, tcmmv, isResidencialGlobal]);

  // IVA total (16% EXCLUSIVAMENTE sobre la base imponible comercial; multas y residencial 0%)
  const ivaTotalCalculado = desgloseSel.iva;
  // Retención: si es agente de retención, retiene 75% del IVA (no lo paga al municipio, lo declara por planilla)
  const ivaRetenidoCalculado = esAgenteGlobal ? parseFloat((ivaTotalCalculado * 0.75).toFixed(2)) : 0;
  // Lo que realmente paga de IVA = 25% del IVA si es agente, o 100% si no lo es
  const ivaCalculado = parseFloat((ivaTotalCalculado - ivaRetenidoCalculado).toFixed(2));
  // Total a cancelar = Subtotal base + Multa (sin intereses) + IVA neto a pagar
  const pagoTotalCalculado = parseFloat((desgloseSel.base + desgloseSel.multa + ivaCalculado).toFixed(2));

  useEffect(() => {
    const t = selectedRefs.reduce((s, ref) => {
      const f = recibos.find(r => r.referencia === ref);
      return s + (f ? getReciboMonto(f) : 0);
    }, 0);
    setTotalSel(parseFloat(t.toFixed(2)));
    setMonthsToPay(selectedRefs.length);
  }, [selectedRefs, recibos, userInms, tcmmv]);

  const toggleExpand = (inmId: string) => {
    setExpandedInms(prev => ({ ...prev, [inmId]: !prev[inmId] }));
  };

  const toggleAllInmueble = (inmRefs: string[]) => {
    const isAllSelected = inmRefs.length > 0 && inmRefs.every(ref => selectedRefs.includes(ref));
    if (isAllSelected) {
      setSelectedRefs(prev => prev.filter(ref => !inmRefs.includes(ref)));
    } else {
      setSelectedRefs(prev => Array.from(new Set([...prev, ...inmRefs])));
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

  const groupedInmuebles = useMemo(() => {
    const map: Record<string, {
      inmId: string;
      tipo: string;
      act: string;
      direccion: string;
      items: Recibo[];
      totalBs: number;
    }> = {};

    recibos.forEach((r) => {
      let inmId = 'Facturación General';
      let tipo = '';
      let act = '';
      let direccion = '';

      if (r.referencia?.startsWith('RECIB-HIST-')) {
        const parts = r.referencia.split('-');
        if (parts.length > 2) {
          const match = userInms.find((i: any) => i.inmueble === parts[2]);
          if (match) {
            inmId = match.inmueble;
            tipo = match.clasificacion || '';
            act = match.actividad_principal || '';
            direccion = match.direccion || '';
          } else {
            inmId = parts[2];
          }
        }
      } else if (r.referencia?.startsWith('CM-')) {
        const match = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
        if (match) {
          inmId = match.inmueble;
          tipo = match.clasificacion || '';
          act = match.actividad_principal || '';
          direccion = match.direccion || '';
        } else {
          inmId = 'Acumulados';
        }
      } else {
        if (userInms.length === 1) {
          inmId = userInms[0].inmueble;
          tipo = userInms[0].clasificacion || '';
          act = userInms[0].actividad_principal || '';
          direccion = userInms[0].direccion || '';
        }
      }

      if (!map[inmId]) {
        map[inmId] = { inmId, tipo, act, direccion, items: [], totalBs: 0 };
      }
      map[inmId].items.push(r);
      map[inmId].totalBs += getReciboMonto(r);
    });

    return Object.values(map);
  }, [recibos, userInms, getReciboMonto]);

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

    const variants = getIdentidadVariants(inputClean, activePrefix);
    const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

    // 1. Buscar en inmuebles con todas las variantes
    let { data: inmsDB } = await supabase.from('inmuebles')
      .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
      .or(orFilter);

    // 2. Si no se encontró por identidad directa, buscar por código de inmueble (ej: URB002290)
    if (!inmsDB || inmsDB.length === 0) {
      const { data: byInmCode } = await supabase.from('inmuebles')
        .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
        .ilike('inmueble', `%${inputClean}%`)
        .limit(10);
      if (byInmCode && byInmCode.length > 0) inmsDB = byInmCode;
    }

    // 3. Si aún no se encontró, resolver identidad oficial en la tabla contribuyentes
    if (!inmsDB || inmsDB.length === 0) {
      const { data: cMatches } = await supabase.from('contribuyentes')
        .select('*')
        .or(orFilter)
        .limit(1);

      if (cMatches && cMatches.length > 0) {
        const officialId = cMatches[0].identidad;
        const cVariants = getIdentidadVariants(officialId);
        const { data: inmsByContrib } = await supabase.from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
          .or(cVariants.map(v => `identidad.eq.${v}`).join(','));
        if (inmsByContrib && inmsByContrib.length > 0) {
          inmsDB = inmsByContrib;
        }
      }
    }

    if (!inmsDB || inmsDB.length === 0) {
      setSearchError('No encontrado. Verifique su Cédula o RIF.');
      setIsSearching(false);
      return;
    }

    const p = inmsDB[0];

    // Sincronizar el prefijo visual en el dropdown si es distinto
    if (p.identidad && /^[A-Z]-/i.test(p.identidad)) {
      const detectedPrefix = p.identidad.charAt(0).toUpperCase();
      if (detectedPrefix !== docType) setDocType(detectedPrefix);
    }

    let nombreCont = p.contribuyente;
    
    // Si no tiene contribuyente en el inmueble, intentar buscar en facturas
    if (!nombreCont) {
      const { data: fNombre } = await supabase.from('facturas')
        .select('contribuyente').eq('identidad', p.identidad)
        .not('contribuyente', 'is', null).limit(1);
      if (fNombre && fNombre.length > 0 && fNombre[0].contribuyente) {
        nombreCont = fNombre[0].contribuyente;
      }
    }

    // Si aún no tiene nombre, buscar en la tabla oficial de contribuyentes
    if (!nombreCont) {
      const { data: cNombre } = await supabase.from('contribuyentes')
        .select('nombre')
        .or(orFilter)
        .not('nombre', 'is', null)
        .limit(1);
      if (cNombre && cNombre.length > 0 && cNombre[0].nombre) {
        nombreCont = cNombre[0].nombre;
      }
    }

    const user: Contribuyente = {
      Identidad: p.identidad,
      Contribuyente: nombreCont || 'Cont. No Registrado',
      Direccion: p.direccion || '',
      Clasificacion: p.clasificacion || 'Residencial',
      Actividad: p.actividad_principal || '',
      EsAgente: (inmsDB as any[]).some(i => i.agente_retencion === true),
    };
    setFoundUser(user);

    let inmsFinal = [...inmsDB];
    const isCondoByFlag = inmsDB.some((i: any) => i.es_condominio === true);
    const isCondoByName = (user.Contribuyente || '').toLowerCase().includes('condominio') || (user.Actividad || '').toLowerCase().includes('condominio');

    if (isCondoByFlag || isCondoByName) {
      const condoCodes = inmsDB.map((i: any) => i.inmueble).filter(Boolean);
      if (condoCodes.length > 0) {
        const { data: hijos } = await supabase
          .from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
          .in('condominio_padre_id', condoCodes);
        if (hijos && hijos.length > 0) {
          const ids = new Set(inmsFinal.map(x => x.id));
          hijos.forEach(h => {
            if (!ids.has(h.id)) inmsFinal.push(h);
          });
        }
      }
    }
    // Filtrar contenedores N/A que solo envuelven otras actividades (ej: URB033481)
    const naParentCodes = inmsFinal
      .filter((i: any) => 
        (i.actividad_principal || '').trim().toUpperCase() === 'N/A' && 
        (parseInt(i.cant_inmuebles || '0') > 0 || inmsFinal.some((c: any) => c.condominio_padre_id === i.inmueble))
      )
      .map((i: any) => i.inmueble);

    const billableInms = inmsFinal.filter((i: any) => !naParentCodes.includes(i.inmueble));
    const finalInmsToUse = billableInms.length > 0 ? billableInms : inmsFinal;
    setUserInms(finalInmsToUse as Inmueble[]);

    const totalDeudaMMV = finalInmsToUse.reduce((s: number, i: any) => s + parseFloat(i.deuda_mmv || 0), 0);
    const totalCongelada = inmsDB.reduce((s: number, i: any) => s + parseFloat(i.deuda_congelada_bs || 0), 0);

    const userVariants = getIdentidadVariants(p.identidad || user.Identidad);
    const facturasOrFilter = userVariants.map(v => `identidad.eq.${v}`).join(',');
    const { data: allUserFacturas } = await supabase
      .from('facturas').select('referencia, emision, estado, monto, identidad')
      .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
      .or(facturasOrFilter)
      .order('emision', { ascending: true });

    let fallbackFacturas: Recibo[] = [];
    if ((allUserFacturas || []).length === 0 && user.Contribuyente) {
      const { data: fByName } = await supabase.from('facturas')
        .select('referencia, emision, estado, monto, identidad').in('estado', ['Pendiente', 'Por Verificar'])
        .eq('contribuyente', user.Contribuyente).order('emision', { ascending: true });
      if (fByName && fByName.length > 0) fallbackFacturas = fByName as Recibo[];
    }

    const combined = [...(allUserFacturas || []), ...fallbackFacturas] as Recibo[];
    
    // Inyectar recibos dummy divididos por mes si no hay facturas reales
    if (combined.length === 0 && finalInmsToUse && finalInmsToUse.length > 0) {
      const hasDeuda = finalInmsToUse.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
      if (hasDeuda) {
        const now = new Date();
        finalInmsToUse.forEach((inm: any) => {
          const deudaMMV = parseFloat(inm.deuda_mmv || '0');
          const congelada = parseFloat(inm.deuda_congelada_bs || '0');
          const multa = parseFloat(inm.multa_bs || '0');
          const meses = parseInt(inm.meses_deuda || 1);
          if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {
            const numMeses = Math.max(1, meses);
            for (let i = 1; i <= numMeses; i++) {
              const targetDate = new Date(now.getFullYear(), now.getMonth() - numMeses + i - 1, 1, 12, 0, 0);
              combined.push({
                id: `dummy-hist-${inm.inmueble}-${i}`,
                referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
                identidad: user.Identidad,
                contribuyente: user.Contribuyente,
                emision: targetDate.toISOString(),
                vencimiento: targetDate.toISOString(),
                estado: 'Pendiente',
                monto: '0'
              } as Recibo);
            }
          }
        });
      }
    }
    combined.sort((a, b) => {
      const aC = a.referencia?.startsWith('CM-'), bC = b.referencia?.startsWith('CM-');
      if (!aC && bC) return -1; if (aC && !bC) return 1;
      return (a.emision || '').localeCompare(b.emision || '');
    });
    setRecibos(combined);
    setSelectedRefs(combined.map(r => r.referencia));
    setMonthsToPay(combined.length);
    setExpandedInms({});
    setStep('account');
    setIsSearching(false);
  };

  const processPayment = async (ref: string, method: PayMethod) => {
    setIsProcessing(true); setPayError('');
    try {
      await supabase.from('pagos_reportados').insert({
        identidad: foundUser?.Identidad, monto: pagoTotalCalculado,
        banco: method === 'Bancamiga' ? 'Bancamiga' : 'Punto de Venta',
        referencia: ref || `POS-${Date.now()}`, tipo: method, estado: 'Aprobado',
        detalles: JSON.stringify({ recibos: selectedRefs, origen: 'kiosco' })
      });
      let dinero = totalSel;
      for (const r of selectedRefs) {
        if (r === 'RECIB-DEUDA') {
          for (const inm of userInms) {
            await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', inm.id);
          }
          break;
        }
        if (r.startsWith('RECIB-HIST-')) {
          const parts = r.split('-');
          const inmId = parts[2];
          const inm = userInms.find((i: any) => i.inmueble === inmId);
          if (inm) {
            const meses = Math.max(1, parseInt(String(inm.meses_deuda || 1)));
            const nuevoMeses = Math.max(0, meses - 1);
            const d = parseFloat(String(inm.deuda_mmv || 0));
            const m = parseFloat(String(inm.multa_bs || 0));
            const nuevaDeuda = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / meses).toFixed(6));
            const nuevaMulta = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / meses).toFixed(2));
            await supabase.from('inmuebles').update({ deuda_mmv: nuevaDeuda, deuda_congelada_bs: 0, multa_bs: nuevaMulta, meses_deuda: nuevoMeses }).eq('id', inm.id);
          }
          continue;
        }
        const fac = recibos.find(x => x.referencia === r); if (!fac) continue;
        const mFac = getReciboMonto(fac);
        if (dinero >= mFac) { await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', r); dinero -= mFac; }
        else if (dinero > 0) { await supabase.from('facturas').update({ monto: (mFac - dinero).toFixed(2), estado: 'Abonado' }).eq('referencia', r); dinero = 0; }
      }
      logAudit('Cobro por Kiosco', { identidad: foundUser?.Identidad, contribuyente: foundUser?.Contribuyente, monto: pagoTotalCalculado, metodo: method }, 'COBRO');
      setShowBancamigaSim(false); setStep('success');
    } catch (err: any) { setPayError(err.message || 'Error al procesar el pago.'); }
    setIsProcessing(false);
  };

  const handlePayPos = () => {
    if (!referencia.trim()) { setPayError('Debe ingresar el Nro de Referencia del comprobante del Punto de Venta.'); return; }
    processPayment(referencia, 'Punto de Venta');
  };

  const reset = () => {
    setStep('search'); setDocNumber(''); setRecibos([]); setFoundUser(null);
    setUserInms([]); setSelectedRefs([]); setReferencia(''); setMonthsToPay(1);
    setPayMethod('Punto de Venta'); setPayError(''); setShowBancamigaSim(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white font-sans select-none" style={{ WebkitTapHighlightColor: 'transparent' }}>

      {step === 'search' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full">
            <div className="text-center mb-10">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-5">
                <Building2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h1 className="text-4xl font-black mb-2">Autogestión de Cobro</h1>
              <p className="text-slate-400 text-lg">Consulte y cancele su deuda de Aseo Urbano</p>
            </div>
            <div className="bg-slate-800/80 backdrop-blur rounded-3xl p-8 shadow-2xl border border-slate-700/50">
              <label className="block text-slate-400 text-sm font-bold uppercase tracking-widest mb-3">Cédula o RIF del Contribuyente</label>
              <div className="flex gap-3 mb-6">
                <select value={docType} onChange={e => setDocType(e.target.value)} className="bg-slate-700 text-white rounded-2xl px-4 py-5 text-2xl font-black focus:outline-none focus:ring-2 ring-emerald-500 border border-slate-600">
                  {['V','J','E','G','P'].map(t => <option key={t}>{t}</option>)}
                </select>
                <input type="tel" value={docNumber} onChange={e => setDocNumber(e.target.value.replace(/\D/g,''))}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Ej: 12345678"
                  className="flex-1 bg-slate-700 text-white rounded-2xl px-5 py-5 text-2xl font-bold focus:outline-none focus:ring-2 ring-emerald-500 text-center border border-slate-600 placeholder-slate-500"
                  autoComplete="off" />
              </div>
              {searchError && (
                <div className="mb-5 flex items-center gap-3 text-red-400 bg-red-400/10 rounded-2xl px-5 py-4 border border-red-400/20">
                  <AlertCircle className="w-6 h-6 shrink-0" /><span className="font-bold">{searchError}</span>
                </div>
              )}
              <button onClick={handleSearch} disabled={isSearching || !docNumber.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black py-6 rounded-2xl text-2xl active:scale-95 transition-all flex items-center justify-center gap-3">
                {isSearching ? <><div className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin" />Buscando...</> : 'Consultar Deuda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'account' && foundUser && (
        <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full">
          <button onClick={reset} className="flex items-center gap-2 text-slate-400 font-bold mb-6 hover:text-white w-fit transition-colors">
            <ChevronLeft className="w-6 h-6" />Volver
          </button>
          <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 mb-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <User2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">{foundUser.Identidad}</div>
                <div className="text-white text-2xl font-black leading-tight mb-2">{foundUser.Contribuyente}</div>
                {foundUser.Clasificacion && (
                  <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${foundUser.Clasificacion.toLowerCase().includes('residencial') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {foundUser.Clasificacion}
                  </span>
                )}
                {foundUser.Actividad && foundUser.Actividad !== 'No aplica' && (
                  <span className="ml-2 inline-block text-xs font-bold px-3 py-1 rounded-full bg-slate-700 text-slate-300">{foundUser.Actividad}</span>
                )}
              </div>
            </div>
            {foundUser.Direccion && (
              <div className="flex items-start gap-2 mt-4 pt-4 border-t border-slate-700 text-slate-400 text-sm">
                <MapPin className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" /><span>{foundUser.Direccion}</span>
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
                  Deuda Total — {recibos.length} {recibos.length === 1 ? 'período' : 'períodos'}
                </div>
                <div className="text-3xl sm:text-5xl font-black text-white">
                  Bs. {fmtBs(recibos.reduce((s, r) => s + getReciboMonto(r), 0))}
                </div>
              </div>

              {/* BARRA DE ACCIÓN RÁPIDA */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/90 p-3.5 sm:p-4 rounded-2xl border border-slate-700/80 shadow-md">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-300 font-bold text-xs sm:text-sm">Inmuebles:</span>
                  <span className="bg-emerald-500/20 text-emerald-400 text-xs font-black px-2.5 py-0.5 rounded-full">
                    {groupedInmuebles.length} {groupedInmuebles.length === 1 ? 'inmueble' : 'inmuebles'}
                  </span>
                  <span className="text-slate-400 text-xs font-medium">
                    ({selectedRefs.length} de {recibos.length} seleccionados)
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

              {/* AGRUPACIÓN POR INMUEBLE CON ACORDEÓN DESPLEGABLE */}
              <div className="space-y-3">
                {groupedInmuebles.map((group) => {
                  const inmRefs = group.items.map((r) => r.referencia);
                  const selectedCount = inmRefs.filter((ref) => selectedRefs.includes(ref)).length;
                  const isAllSelected = inmRefs.length > 0 && selectedCount === inmRefs.length;
                  const isPartiallySelected = selectedCount > 0 && !isAllSelected;
                  const isExpanded = !!expandedInms[group.inmId];

                  return (
                    <div
                      key={group.inmId}
                      className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-md transition-all hover:border-slate-600"
                    >
                      {/* Cabecera del Inmueble */}
                      <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-800">
                        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                          {/* Opción para elegir todos los recibos de este inmueble */}
                          <button
                            type="button"
                            onClick={() => toggleAllInmueble(inmRefs)}
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
                                {group.inmId}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                group.tipo.toLowerCase().includes('residencial')
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {group.tipo || 'COMERCIAL'}
                              </span>
                              {group.act && (
                                <span className="text-[10px] font-medium text-slate-300 bg-slate-700/80 px-2 py-0.5 rounded-full truncate max-w-[180px]" title={group.act}>
                                  {group.act}
                                </span>
                              )}
                            </div>
                            {group.direccion && (
                              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 flex items-center gap-1" title={group.direccion}>
                                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                {group.direccion}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Monto del Inmueble y Botón para desplegar recibos */}
                        <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/60 shrink-0">
                          <div className="text-left md:text-right">
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                              Deuda Inmueble
                            </div>
                            <div className="text-white font-black text-base sm:text-lg">
                              Bs. {fmtBs(group.totalBs)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleExpand(group.inmId)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-600"
                          >
                            <span>{isExpanded ? 'Ocultar' : `Ver Recibos (${group.items.length})`}</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Recibos desplegables (Solo se muestran al escoger/desplegar) */}
                      {isExpanded && (
                        <div className="p-3.5 bg-slate-900/70 border-t border-slate-700/80 space-y-2 max-h-[360px] overflow-y-auto">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>Desglose Mensual — Seleccione períodos específicos</span>
                            <span className="text-emerald-400">{selectedCount} de {group.items.length} elegidos</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {group.items.map((r, rIdx) => {
                              const isItemSel = selectedRefs.includes(r.referencia);
                              return (
                                <div
                                  key={r.referencia}
                                  onClick={() => toggleIndividualReceipt(r.referencia, group.items)}
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
                    {selectedRefs.length} {selectedRefs.length === 1 ? 'período seleccionado' : 'períodos seleccionados'}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Subtotal Aseo ({selectedRefs.length} {selectedRefs.length === 1 ? 'mes' : 'meses'})</span>
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
                      {esAgenteGlobal && (
                        <>
                          <div className="flex justify-between items-center text-amber-400 text-xs sm:text-sm">
                            <span>↳ IVA Retenido (75%) — sube planilla</span>
                            <span className="font-bold">- Bs. {fmtBs(ivaRetenidoCalculado)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">IVA a Pagar (25%)</span>
                            <span className="text-white font-bold text-base">Bs. {fmtBs(ivaCalculado)}</span>
                          </div>
                        </>
                      )}
                      {!esAgenteGlobal && (
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

              {/* AVISO AGENTE DE RETENCIÓN */}
              {foundUser?.EsAgente && (
                <div className="flex items-start gap-4 bg-amber-400/20 border-2 border-amber-400 rounded-2xl px-5 py-4">
                  <TriangleAlert className="w-8 h-8 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-amber-300 font-black text-lg leading-tight mb-1">
                      Usted es Agente de Retención
                    </div>
                    <div className="text-amber-200 text-sm leading-relaxed">
                      Recuerde que como Agente de Retención debe <strong>cargar su planilla de retención de IVA</strong> a través del portal web en <em>Soy Contribuyente → Retenciones IVA</em>, indicando el monto retenido correspondiente al <strong>75% del IVA</strong> de esta factura.
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
        <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto w-full">
          <button onClick={() => setStep('account')} className="flex items-center gap-2 text-slate-400 font-bold mb-6 hover:text-white w-fit transition-colors">
            <ChevronLeft className="w-6 h-6" />Volver
          </button>
          <h2 className="text-3xl font-black text-white mb-1">Método de Pago</h2>
          <p className="text-slate-400 mb-7">
            <strong className="text-white">{foundUser.Contribuyente}</strong> — cancelar{' '}
            <strong className="text-emerald-400 text-xl">Bs. {fmtBs(pagoTotalCalculado)}</strong>{' '}
            ({monthsToPay} {monthsToPay===1?'mes':'meses'})
          </p>
          <div className="grid grid-cols-2 gap-4 mb-7">
            <button onClick={() => setPayMethod('Punto de Venta')}
              className={`flex flex-col items-center gap-4 py-8 rounded-3xl border-2 font-bold transition-all active:scale-95 ${payMethod==='Punto de Venta' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <CreditCard className="w-12 h-12" /><span className="text-xl">Punto de Venta</span>
            </button>
            <button onClick={() => setPayMethod('Bancamiga')}
              className={`flex flex-col items-center gap-4 py-8 rounded-3xl border-2 font-bold transition-all active:scale-95 ${payMethod==='Bancamiga' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <Landmark className="w-12 h-12" /><span className="text-xl">Bancamiga</span>
            </button>
          </div>
          {payMethod === 'Punto de Venta' && (
            <div className="bg-slate-800 rounded-3xl p-7 border border-slate-700">
              <h3 className="text-xl font-black mb-4 text-white text-center">Instrucciones</h3>
              <ol className="list-decimal list-inside text-slate-300 space-y-3 mb-6 text-lg">
                <li>Presente su tarjeta de débito en el Punto de Venta.</li>
                <li>Cancele el monto exacto: <strong className="text-emerald-400">Bs. {fmtBs(pagoTotalCalculado)}</strong>.</li>
                <li>Una vez aprobado, ingrese el Nro. de Referencia del voucher:</li>
              </ol>
              <input type="tel" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Nro. Referencia del Voucher"
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-5 py-5 text-2xl text-center text-white font-bold focus:border-emerald-500 outline-none mb-4 tracking-widest" />
              {payError && <p className="text-red-400 text-center font-bold mb-4">{payError}</p>}
              
              {foundUser?.EsAgente && (
                <div className="mb-4 bg-amber-400/10 border border-amber-400/50 rounded-xl p-3 flex gap-3 items-center">
                  <TriangleAlert className="w-6 h-6 text-amber-400 shrink-0" />
                  <p className="text-amber-200 text-sm leading-tight">
                    <strong>Aviso:</strong> Usted es agente de retención. Recuerde de cargar su planilla de retención de IVA (75%) después de pagar.
                  </p>
                </div>
              )}

              <button onClick={handlePayPos} disabled={isProcessing}
                className="w-full bg-emerald-500 text-white font-black py-6 rounded-2xl text-2xl active:scale-95 disabled:bg-slate-700 disabled:text-slate-500">
                {isProcessing ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          )}
          {payMethod === 'Bancamiga' && (
            <div className="bg-slate-800 rounded-3xl p-7 border border-slate-700 text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Landmark className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-2xl font-black mb-3">Pago con Bancamiga</h3>
              <p className="text-slate-400 mb-6 text-lg">Será dirigido a la pasarela de pagos seguros de Bancamiga para completar el pago con su tarjeta de débito.</p>
              <button onClick={() => setShowBancamigaSim(true)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-6 rounded-2xl text-2xl active:scale-95 transition-all">
                Ir a Pagar → Bancamiga
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'success' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.12) 0%, transparent 70%)' }}>
          <CheckCircle2 className="w-32 h-32 text-emerald-500 mb-6 drop-shadow-lg" />
          <h1 className="text-5xl font-black text-white mb-3 text-center">¡Pago Exitoso!</h1>
          <p className="text-xl text-emerald-200 text-center mb-8">Su pago ha sido registrado correctamente.</p>
          <div className="bg-slate-800/80 backdrop-blur rounded-3xl p-8 border border-emerald-500/20 w-full max-w-md mb-8">
            <div className="text-center mb-5 pb-5 border-b border-slate-700">
              <div className="text-slate-400 text-sm font-bold uppercase">Contribuyente</div>
              <div className="text-white text-xl font-black mt-1">{foundUser?.Contribuyente}</div>
              <div className="text-emerald-400 text-sm">{foundUser?.Identidad}</div>
            </div>
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
              <span className="text-slate-400 text-lg">Monto Pagado</span>
              <span className="text-white text-2xl font-black">Bs. {fmtBs(pagoTotalCalculado)}</span>
            </div>
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700">
              <span className="text-slate-400 text-lg">Períodos Saldados</span>
              <span className="text-white text-xl font-bold">{monthsToPay}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-lg">Método</span>
              <span className="text-white text-xl font-bold">{payMethod}</span>
            </div>
          </div>
          <button onClick={reset} className="bg-white text-emerald-900 font-black py-5 px-14 rounded-full text-xl hover:scale-105 active:scale-95 transition-all shadow-2xl">
            Finalizar y Salir
          </button>
        </div>
      )}

      {showBancamigaSim && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-md overflow-hidden">
            <div className="bg-blue-600 p-6 text-center text-white">
              <h2 className="text-2xl font-black tracking-wide">BANCAMIGA</h2>
              <p className="text-blue-200 text-sm">Pasarela de Pago Seguro</p>
            </div>
            <div className="p-8">
              <div className="bg-blue-50 rounded-2xl p-5 text-center mb-6 border border-blue-100">
                <div className="text-sm text-slate-500 font-bold uppercase">Monto a Cobrar</div>
                <div className="text-4xl font-black text-slate-800 mt-1">Bs. {fmtBs(pagoTotalCalculado)}</div>
                <div className="text-slate-500 text-sm mt-1">{foundUser?.Contribuyente}</div>
              </div>
              <p className="text-center text-slate-400 text-sm mb-6">Esta pantalla simula la pasarela oficial de Bancamiga. La integración real requiere credenciales del banco.</p>
              <button onClick={() => processPayment(`BCA-${Math.floor(Math.random()*1000000)}`, 'Bancamiga')} disabled={isProcessing}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-xl mb-3 active:scale-95 disabled:bg-slate-300">
                {isProcessing ? 'Procesando...' : 'Simular Pago Exitoso'}
              </button>
              <button onClick={() => setShowBancamigaSim(false)} disabled={isProcessing}
                className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl active:scale-95">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
