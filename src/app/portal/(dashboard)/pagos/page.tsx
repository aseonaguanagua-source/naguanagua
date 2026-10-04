'use client';
import { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, FileText, Upload, Send, Building, CheckSquare, 
  AlertCircle, CheckCircle2, MapPin, ArrowRightLeft, Store, 
  ChevronDown, ChevronUp, CheckSquare2, Square, Sparkles
} from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';
import { isResidencialInm, calcularMensualidad } from '@/lib/calculos';
import { getIdentidadVariants } from '@/lib/formatters';
import { clusterInmueblesByLocal } from '@/lib/cajaHelpers';

type Metodo = 'transferencia' | '';

interface ReciboItem {
  id: string;
  dbId: any;
  referencia: string;
  concepto: string;
  inmId: string;
  actividad: string;
  tipoInm: string;
  monto: number;
  emision?: string;
  monthKey: string;
  bloqueadoCondominio?: boolean;
}

interface ConvenioItem {
  id: string;
  dbId: any;
  concepto: string;
  monto: number;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const getMonthLabel = (dStr?: string) => {
  if (!dStr) return 'Período';
  const d = new Date(dStr);
  if (!isNaN(d.getTime())) {
    return `${MESES[d.getMonth()]} ${d.getFullYear()}`.toUpperCase();
  }
  return dStr;
};

export default function DondePagarPage() {
  const [metodo, setMetodo] = useState<Metodo>('');
  const [bloqueadoPorCondominio, setBloqueadoPorCondominio] = useState(false);
  const [formData, setFormData] = useState({
    bancoOrigen: '',
    referencia: '',
    monto: '',
    fecha: '',
    comprobante: null as File | null
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{type: 'success' | 'approved' | 'error', msg: string} | null>(null);

  const { tcmmv: contextTcmmv } = useAppContext();
  const [tcmmv, setTcmmv] = useState<number>(0);

  // Datos reales sincronizados
  const [userInms, setUserInms] = useState<any[]>([]);
  const [rawRecibos, setRawRecibos] = useState<any[]>([]);
  const [conveniosData, setConveniosData] = useState<ConvenioItem[]>([]);
  const [pagosPorVerificar, setPagosPorVerificar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Selección de pagos
  const [selectedReceiptRefs, setSelectedReceiptRefs] = useState<string[]>([]);
  const [selectedConvenioIds, setSelectedConvenioIds] = useState<string[]>([]);
  const [expandedLocals, setExpandedLocals] = useState<Record<string, boolean>>({});

  // 1. Obtener tasa BCV oficial
  useEffect(() => {
    fetch('/api/bcv')
      .then(r => r.json())
      .then(d => { if (d?.tcmmv) setTcmmv(d.tcmmv); })
      .catch(() => { if (contextTcmmv) setTcmmv(contextTcmmv); });
  }, [contextTcmmv]);

  // 2. Cargar pagos por verificar (para bloquear recibos en verificación)
  const fetchPagos = async () => {
    const portalDoc = localStorage.getItem('portal_doc') || '';
    if (!portalDoc) return;
    const variants = getIdentidadVariants(portalDoc);
    const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');
    const { data } = await supabase.from('pagos_reportados')
      .select('referencia, monto, detalles')
      .or(orFilter)
      .eq('estado', 'Por Verificar');
    setPagosPorVerificar(data || []);
  };

  useEffect(() => {
    fetchPagos();
  }, []);

  // 3. Cargar inmuebles, facturas y convenios directamente desde Supabase
  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const portalDoc = localStorage.getItem('portal_doc') || '';
        if (!portalDoc) {
          setLoading(false);
          return;
        }

        const variants = getIdentidadVariants(portalDoc);
        const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

        // A. Cargar Inmuebles
        const { data: inmsDB } = await supabase
          .from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
          .or(orFilter);

        let inmsFinal = inmsDB ? [...inmsDB] : [];

        // Si es condominio, traer filiales
        const isCondo = inmsFinal.some(i => i.es_condominio === true || (i.actividad_principal || '').toLowerCase().includes('condominio'));
        if (isCondo) {
          const condoCodes = inmsFinal.map(i => i.inmueble).filter(Boolean);
          if (condoCodes.length > 0) {
            const { data: hijos } = await supabase
              .from('inmuebles')
              .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
              .in('condominio_padre_id', condoCodes);
            if (hijos && hijos.length > 0) {
              const ids = new Set(inmsFinal.map(x => x.id));
              hijos.forEach(h => { if (!ids.has(h.id)) inmsFinal.push(h); });
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
        setUserInms(billableInms);

        // Bloqueo total por condominio si todos son de condominio sin pago individual
        if (billableInms.length > 0) {
          const todosCondoBloqueados = billableInms.every((inm: any) => {
            const isCondoUnit = !!inm.condominio_padre_id || (inm.actividad_principal || '').includes('HIJO_DE:');
            const isInd = (inm.actividad_principal || '').includes('PAGOS INDIVIDUALES');
            return isCondoUnit && !isInd;
          });
          setBloqueadoPorCondominio(todosCondoBloqueados);
        }

        // B. Cargar Facturas existentes
        const { data: dbFacturas } = await supabase
          .from('facturas')
          .select('*')
          .or(orFilter)
          .in('estado', ['Pendiente', 'Abonado', 'Por Verificar'])
          .order('emision', { ascending: true });

        let combinedFacturas: any[] = dbFacturas ? [...dbFacturas] : [];

        // C. Generar recibos dinámicos RECIB-HIST- si no hay facturas estáticas
        const hasDeuda = billableInms.some((i: any) =>
          parseFloat(i.deuda_mmv || '0') > 0 ||
          parseFloat(i.deuda_congelada_bs || '0') > 0 ||
          parseInt(i.meses_deuda || '0') > 0
        );

        if (hasDeuda && combinedFacturas.length === 0) {
          const now = new Date();
          billableInms.forEach((inm: any) => {
            const meses = Math.max(1, parseInt(inm.meses_deuda || '1'));
            for (let i = 1; i <= meses; i++) {
              const targetDate = new Date(now.getFullYear(), now.getMonth() - meses + i - 1, 1, 12, 0, 0);
              const dateIso = targetDate.toISOString();
              combinedFacturas.push({
                id: `dummy-hist-${inm.inmueble}-${i}`,
                referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
                identidad: inm.identidad,
                contribuyente: inm.contribuyente,
                emision: dateIso,
                vencimiento: dateIso,
                estado: 'Pendiente',
                monto: '0'
              });
            }
          });
        }

        // Ordenar recibos por fecha
        combinedFacturas.sort((a, b) => (a.emision || '').localeCompare(b.emision || ''));
        setRawRecibos(combinedFacturas);

        // D. Cargar Convenios de Pago activos
        const { data: dbConvenios } = await supabase
          .from('convenios_pago')
          .select('*')
          .or(orFilter)
          .eq('estado', 'Activo');

        if (dbConvenios && dbConvenios.length > 0) {
          const convItems: ConvenioItem[] = dbConvenios.map((c: any) => ({
            id: `conv_${c.id}`,
            dbId: c.id,
            concepto: `Convenio de Pago ${c.numero || c.id} (${c.cuotas || 'Cuotas'})`,
            monto: parseFloat((c.monto_total || '0').toString().replace(/[^\d.,]/g, '').replace(',', '.')) || 0
          }));
          setConveniosData(convItems);
        } else {
          setConveniosData([]);
        }

      } catch (err) {
        console.error('Error cargando datos de pago portal:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [tcmmv]);

  // Función para determinar si una referencia está en pagos en verificación
  const isItemPending = (ref: string): boolean => {
    return pagosPorVerificar.some((p: any) => {
      let det: any = {};
      try {
        det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {});
      } catch (_) {}
      const refs: string[] = det.recibos || [];
      return refs.includes(ref);
    });
  };

  // Cálculo canónico del monto de un recibo según la Ordenanza oficial
  const effectiveTcmmv = tcmmv > 0 ? tcmmv : (contextTcmmv || 0);

  const getReciboMonto = (r: any): number => {
    if (r.estado === 'Abonado') return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    const currentRate = effectiveTcmmv > 0 ? effectiveTcmmv : 1;

    let baseMonto = 0;
    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inm = userInms.find((i: any) => i.inmueble === parts[2]);
      if (inm) {
        const esRes = isResidencialInm(inm);
        // Base mensual oficial
        const baseMes = parseFloat(calcularMensualidad(inm, currentRate).toFixed(2));
        const emision = r.emision ? new Date(r.emision) : new Date();
        const today = new Date();
        const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
        // Multa: 10% residencial, 12% comercial
        const multaMes = monthsDiff > 0 ? parseFloat((baseMes * (esRes ? 0.10 : 0.12)).toFixed(2)) : 0;
        // IVA: 0% residencial, 16% comercial
        const rawIva = esRes ? 0 : parseFloat((baseMes * 0.16).toFixed(2));
        const ivaPagar = inm.agente_retencion ? parseFloat((rawIva * 0.25).toFixed(2)) : rawIva;
        baseMonto = baseMes + multaMes + ivaPagar;
      }
    } else if (r.referencia?.startsWith('CM-')) {
      const matched = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
      const inm = matched || userInms[0];
      if (inm) {
        const esRes = isResidencialInm(inm);
        const baseMes = parseFloat(calcularMensualidad(inm, currentRate).toFixed(2));
        const rawIva = esRes ? 0 : parseFloat((baseMes * 0.16).toFixed(2));
        const ivaPagar = inm.agente_retencion ? parseFloat((rawIva * 0.25).toFixed(2)) : rawIva;
        baseMonto = baseMes + ivaPagar;
      }
    } else {
      baseMonto = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    }

    // Descontar abonos o pagos en vuelo parciales
    let montoPendiente = 0;
    pagosPorVerificar.forEach((p) => {
      let det: any = {};
      try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch (_) {}
      const refs: string[] = det.recibos || [];
      if (refs.includes(r.referencia)) {
        const montoPago = parseFloat(String(p.monto || '0').replace(/[^0-9.]/g, '')) || 0;
        if (refs.length > 0) montoPendiente += (montoPago / refs.length);
      }
    });

    return Math.max(0, parseFloat((baseMonto - montoPendiente).toFixed(2)));
  };

  // 4. Agrupar inmuebles por Local Físico (clustering idéntico a Cobro Móvil y Caja)
  const localClustersMap = useMemo(() => {
    return clusterInmueblesByLocal(userInms);
  }, [userInms]);

  // 5. Construir grupos estructurados por Local / Inmueble con períodos unificados
  const localGroups = useMemo(() => {
    const clusterOrder: string[] = [];
    const clusterMapData: Record<string, {
      localId: string;
      label: string;
      direccion: string;
      tipo: string;
      inms: any[];
      receipts: any[];
    }> = {};

    userInms.forEach((inm) => {
      const cInfo = localClustersMap.get(inm.inmueble);
      const clusterId = cInfo?.localId || inm.inmueble;
      if (!clusterMapData[clusterId]) {
        clusterOrder.push(clusterId);
        clusterMapData[clusterId] = {
          localId: clusterId,
          label: cInfo?.label || inm.inmueble,
          direccion: cInfo?.direccion || inm.direccion || '',
          tipo: inm.clasificacion || (isResidencialInm(inm) ? 'Residencial' : 'Comercial'),
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

    const getReceiptInmId = (r: any): string => {
      if (r.referencia?.startsWith('RECIB-HIST-')) {
        return r.referencia.split('-')[2] || '';
      }
      if (r.referencia?.startsWith('CM-')) {
        const match = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
        if (match) return match.inmueble;
      }
      return userInms[0]?.inmueble || '';
    };

    rawRecibos.forEach((r) => {
      const inmId = getReceiptInmId(r);
      const cInfo = localClustersMap.get(inmId);
      const clusterId = cInfo?.localId || inmId;

      if (!clusterMapData[clusterId]) {
        clusterOrder.push(clusterId);
        const matchInm = userInms.find((i) => i.inmueble === inmId);
        clusterMapData[clusterId] = {
          localId: clusterId,
          label: clusterId,
          direccion: matchInm?.direccion || '',
          tipo: matchInm?.clasificacion || (isResidencialInm(matchInm) ? 'Residencial' : 'Comercial'),
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

      // Si no es unificado, estructurar lista directa de recibos
      if (!isUnified) {
        const singleItems: ReciboItem[] = c.receipts.map((r) => {
          const inmId = getReceiptInmId(r);
          const inmMatch = c.inms.find((i) => i.inmueble === inmId) || userInms[0];
          const isCondoUnit = inmMatch && (!!inmMatch.condominio_padre_id || (inmMatch.actividad_principal || '').includes('HIJO_DE:'));
          const esPagoIndividual = inmMatch && (inmMatch.actividad_principal || '').includes('PAGOS INDIVIDUALES');
          const bloqueadoCondo = isCondoUnit && !esPagoIndividual;

          return {
            id: r.id || r.referencia,
            dbId: r.id,
            referencia: r.referencia,
            concepto: `${r.referencia} • ${getMonthLabel(r.emision)}`,
            inmId,
            actividad: inmMatch?.actividad_principal || 'Aseo Urbano',
            tipoInm: inmMatch?.clasificacion || 'Residencial',
            monto: getReciboMonto(r),
            emision: r.emision,
            monthKey: r.emision ? r.emision.slice(0, 7) : r.referencia,
            bloqueadoCondominio: bloqueadoCondo
          };
        });

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
          singleItems
        };
      }

      // Si es unificado (mismo local físico con múltiples actividades), agrupar por mes
      const monthMap: Record<string, {
        monthKey: string;
        emision?: string;
        totalBs: number;
        receiptRefs: string[];
        items: ReciboItem[];
        anyPending: boolean;
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
        if (!mKey && mMatch) mKey = `M-${mMatch[1]}`;
        if (!mKey) mKey = r.referencia;

        if (!monthMap[mKey]) {
          monthKeysOrder.push(mKey);
          monthMap[mKey] = {
            monthKey: mKey,
            emision: r.emision,
            totalBs: 0,
            receiptRefs: [],
            items: [],
            anyPending: false
          };
        }

        const inmId = getReceiptInmId(r);
        const inmMatch = c.inms.find((i) => i.inmueble === inmId);
        const monto = getReciboMonto(r);

        if (isItemPending(r.referencia)) {
          monthMap[mKey].anyPending = true;
        }

        monthMap[mKey].totalBs += monto;
        monthMap[mKey].receiptRefs.push(r.referencia);
        monthMap[mKey].items.push({
          id: r.id || r.referencia,
          dbId: r.id,
          referencia: r.referencia,
          concepto: r.referencia,
          inmId,
          actividad: inmMatch?.actividad_principal || 'Actividad Comercial',
          tipoInm: 'Comercial',
          monto,
          emision: r.emision,
          monthKey: mKey
        });
      });

      const monthlyGroups = monthKeysOrder.map((key) => ({
        monthKey: key,
        monthLabel: getMonthLabel(monthMap[key].emision),
        emision: monthMap[key].emision,
        totalBs: parseFloat(monthMap[key].totalBs.toFixed(2)),
        receiptRefs: monthMap[key].receiptRefs,
        items: monthMap[key].items,
        anyPending: monthMap[key].anyPending
      }));

      return {
        localId: c.localId,
        isUnified: true,
        label: c.label,
        direccion: c.direccion,
        tipo: 'Local Comercial',
        inms: c.inms,
        allReceiptRefs,
        totalBs: parseFloat(totalBs.toFixed(2)),
        monthlyGroups,
        singleItems: []
      };
    });
  }, [userInms, rawRecibos, localClustersMap, pagosPorVerificar, effectiveTcmmv]);

  // Por defecto expandir el primer local
  useEffect(() => {
    if (localGroups.length > 0 && Object.keys(expandedLocals).length === 0) {
      const initial: Record<string, boolean> = {};
      localGroups.forEach((g, idx) => {
        initial[g.localId] = idx === 0;
      });
      setExpandedLocals(initial);
    }
  }, [localGroups]);

  const toggleExpandLocal = (localId: string) => {
    setExpandedLocals(prev => ({ ...prev, [localId]: !prev[localId] }));
  };

  // Manejo de selecciones
  const toggleSingleReceipt = (ref: string) => {
    if (isItemPending(ref)) return;
    setSelectedReceiptRefs(prev => 
      prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]
    );
  };

  const toggleMonthGroup = (refs: string[]) => {
    const selectableRefs = refs.filter(r => !isItemPending(r));
    if (selectableRefs.length === 0) return;
    const allSelected = selectableRefs.every(r => selectedReceiptRefs.includes(r));
    if (allSelected) {
      setSelectedReceiptRefs(prev => prev.filter(r => !selectableRefs.includes(r)));
    } else {
      setSelectedReceiptRefs(prev => Array.from(new Set([...prev, ...selectableRefs])));
    }
  };

  const toggleLocalAll = (allRefs: string[]) => {
    const selectable = allRefs.filter(r => !isItemPending(r));
    if (selectable.length === 0) return;
    const allSelected = selectable.every(r => selectedReceiptRefs.includes(r));
    if (allSelected) {
      setSelectedReceiptRefs(prev => prev.filter(r => !selectable.includes(r)));
    } else {
      setSelectedReceiptRefs(prev => Array.from(new Set([...prev, ...selectable])));
    }
  };

  const toggleConvenio = (id: string) => {
    setSelectedConvenioIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Seleccionar Todo / Deseleccionar Todo
  const handleSelectAllGlobal = () => {
    const allSelectableReceipts: string[] = [];
    localGroups.forEach(g => {
      g.allReceiptRefs.forEach(ref => {
        if (!isItemPending(ref)) allSelectableReceipts.push(ref);
      });
    });
    const allConvenios = conveniosData.map(c => c.id);
    setSelectedReceiptRefs(allSelectableReceipts);
    setSelectedConvenioIds(allConvenios);
  };

  const handleDeselectAllGlobal = () => {
    setSelectedReceiptRefs([]);
    setSelectedConvenioIds([]);
  };

  // Calcular montos totales seleccionados
  const totalMontoRecibos = useMemo(() => {
    let sum = 0;
    const refSet = new Set(selectedReceiptRefs);
    rawRecibos.forEach(r => {
      if (refSet.has(r.referencia)) {
        sum += getReciboMonto(r);
      }
    });
    return parseFloat(sum.toFixed(2));
  }, [selectedReceiptRefs, rawRecibos, effectiveTcmmv]);

  const totalMontoConvenios = useMemo(() => {
    return conveniosData
      .filter(c => selectedConvenioIds.includes(c.id))
      .reduce((sum, c) => sum + c.monto, 0);
  }, [selectedConvenioIds, conveniosData]);

  const montoTotal = parseFloat((totalMontoRecibos + totalMontoConvenios).toFixed(2));
  const totalConceptosSeleccionados = selectedReceiptRefs.length + selectedConvenioIds.length;

  useEffect(() => {
    setFormData(prev => ({ ...prev, monto: montoTotal > 0 ? formatBs(montoTotal) : '' }));
  }, [montoTotal]);

  const bancos = [
    '100% Banco', 'Bancamiga', 'Bancaribe', 'Banco Activo', 'Banco Bicentenario',
    'Banco Caroní', 'Banco de Venezuela', 'Banco del Tesoro', 'Banco Exterior',
    'Banco Mercantil', 'Banco Nacional de Crédito (BNC)', 'Banco Plaza',
    'Banco Provincial', 'Banco Sofitasa', 'Banesco', 'Banplus', 'Bancrecer',
    'Mi Banco', 'Banco Internacional (BIB)', 'Banco Venezolano de Crédito (BVC)',
    'BanFanb', 'Bancovi', 'Instituto Municipal de Crédito Popular (IMCP)',
    'Fondemi', 'Microfinanzas', 'Pagomovil BDV'
  ].sort();

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) { resolve(file); return; }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let [w, h] = [img.width, img.height];
          const MAX = 1000;
          if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
          else { if (h > MAX) { w *= MAX / h; h = MAX; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (blob) resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
            else resolve(file);
          }, 'image/jpeg', 0.6);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (montoTotal === 0) { alert('Debe seleccionar al menos una deuda.'); return; }
    if (!metodo) { alert('Debe seleccionar el método de pago.'); return; }
    if (metodo === 'transferencia' && !formData.bancoOrigen) { alert('Seleccione el banco origen.'); return; }
    if (metodo === 'transferencia' && !formData.referencia) { alert('Ingrese el número de referencia.'); return; }
    if (metodo === 'transferencia' && !formData.comprobante) { alert('Adjunte el comprobante de pago.'); return; }

    setIsSubmitting(true);
    setResult(null);

    // Identificar recibos seleccionados
    const facturaDbIds = rawRecibos
      .filter(r => selectedReceiptRefs.includes(r.referencia) && r.id && !String(r.id).startsWith('dummy-'))
      .map(r => r.id);

    const convenioDbIds = conveniosData
      .filter(c => selectedConvenioIds.includes(c.id))
      .map(c => c.dbId);

    const identidad = localStorage.getItem('portal_doc') || '';

    try {
      const res = await fetch('/api/contribuyente/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo,
          facturaIds: facturaDbIds,
          reciboRefs: selectedReceiptRefs,
          convenioIds: convenioDbIds,
          monto: montoTotal,
          referencia: formData.referencia,
          banco: formData.bancoOrigen,
          fecha: formData.fecha,
          identidad
        })
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          type: 'success',
          msg: '¡Pago reportado exitosamente! Su comprobante fue enviado para validación por el equipo de Recaudación y Caja.'
        });
        
        // Bloquear inmediatamente las referencias reportadas
        const justPaidRefs = [...selectedReceiptRefs];
        setPagosPorVerificar(prev => [
          ...prev,
          {
            referencia: formData.referencia,
            monto: montoTotal,
            detalles: JSON.stringify({ recibos: justPaidRefs })
          }
        ]);

        // Limpiar selecciones y formulario
        setSelectedReceiptRefs([]);
        setSelectedConvenioIds([]);
        setFormData({ bancoOrigen: '', referencia: '', monto: '', fecha: '', comprobante: null });
        setMetodo('');
      } else {
        setResult({ type: 'error', msg: data.error || 'Error al procesar el pago.' });
      }
    } catch {
      setResult({ type: 'error', msg: 'Error de conexión. Intente de nuevo.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (bloqueadoPorCondominio) {
    return (
      <div className="flex flex-col items-center justify-center p-8 mt-10 bg-white rounded-lg shadow-sm border border-red-200 max-w-2xl mx-auto text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-red-700 mb-2">Pago Gestionado por Condominio</h2>
        <p className="text-slate-600 text-lg">
          Su inmueble pertenece a un condominio registrado con esquema de <strong>pagos centralizados (Completos o por Abono)</strong>.
          <br /><br />
          Por favor, contacte al administrador del condominio para gestionar su solvencia y reportar pagos. Solo el administrador tiene habilitada esta función en la plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto mt-4 pb-16">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-xl font-black flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-400" />
            Reporte y Cancelación de Pagos
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Seleccione sus períodos pendientes y reporte su comprobante de transferencia bancaria oficial.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 text-right">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Tasa Vigente BCV</span>
            <span className="text-sm font-black text-emerald-400">Bs. {formatBs(effectiveTcmmv)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Columna Izquierda: Selección de Deudas Agrupadas (7 cols) */}
        <div className="lg:col-span-7 space-y-5">

          {/* Tarjeta de Cuentas Recaudadoras */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-indigo-50/80 px-4 py-3 border-b border-indigo-100 flex items-center justify-between">
              <h2 className="font-bold text-indigo-900 uppercase flex items-center gap-2 text-xs tracking-wide">
                <Building className="w-4 h-4 text-indigo-600" />
                Cuenta Recaudadora Oficial
              </h2>
              <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                BANESCO (0134)
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 font-medium block">Cta Corriente Nro.:</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono bg-slate-50 px-2 py-1.5 rounded text-slate-800 font-bold border border-slate-200 text-xs tracking-wider">
                    01340415144151031715
                  </span>
                  <button 
                    type="button"
                    className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200" 
                    title="Copiar número"
                    onClick={() => navigator.clipboard?.writeText('01340415144151031715')}
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Beneficiario / Titular:</span>
                <strong className="text-slate-800 block mt-1 leading-snug">Inst. Socialista Municipal para el Ambiente</strong>
                <span className="text-slate-500 text-[11px] block mt-0.5">R.I.F.: G-200076739</span>
              </div>
            </div>
          </div>

          {/* Panel Principal: Selector de Deudas */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            
            {/* Header del Selector con Toolbar */}
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                  Seleccionar Recibos a Cancelar
                </h2>
                <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                  {rawRecibos.length} recibos
                </span>
              </div>
              
              {/* Acciones Rápidas */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllGlobal}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded border border-emerald-200 transition-colors flex items-center gap-1"
                >
                  <CheckSquare2 className="w-3.5 h-3.5" />
                  Seleccionar Todo
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllGlobal}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-200 transition-colors flex items-center gap-1"
                >
                  <Square className="w-3.5 h-3.5" />
                  Limpiar
                </button>
              </div>
            </div>

            {/* Lista de Inmuebles Agrupados */}
            <div className="p-4 space-y-4">
              {loading ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Cargando recibos y propiedades sincronizadas...
                </div>
              ) : localGroups.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No posee recibos ni deudas pendientes registradas.
                </div>
              ) : (
                localGroups.map((group) => {
                  const isExpanded = expandedLocals[group.localId] ?? true;
                  const allGroupSelected = group.allReceiptRefs.length > 0 &&
                    group.allReceiptRefs.filter(r => !isItemPending(r)).every(r => selectedReceiptRefs.includes(r));
                  const anyGroupSelected = group.allReceiptRefs.some(r => selectedReceiptRefs.includes(r));

                  return (
                    <div 
                      key={group.localId} 
                      className={`border rounded-xl overflow-hidden transition-all shadow-sm ${
                        anyGroupSelected ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200 bg-white'
                      }`}
                    >
                      {/* Cabecera del Inmueble / Local */}
                      <div className="bg-slate-50/90 px-3.5 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleExpandLocal(group.localId)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
                            title={isExpanded ? 'Contraer' : 'Desplegar'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-slate-800 text-xs tracking-wide">
                                {group.localId}
                              </span>
                              {group.isUnified ? (
                                <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 border border-purple-200">
                                  <Store className="w-3 h-3 text-purple-600" />
                                  {group.inms.length} Actividades Consolidadas
                                </span>
                              ) : (
                                <span className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                                  {group.tipo}
                                </span>
                              )}
                            </div>
                            {group.direccion && group.direccion !== '0 0' && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1" title={group.direccion}>
                                <MapPin className="w-3 h-3 flex-shrink-0 text-slate-400" />
                                {group.direccion}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Monto del Grupo y Botón Seleccionar Inmueble */}
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <span className="text-xs font-black text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 whitespace-nowrap">
                            Bs. {formatBs(group.totalBs)}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleLocalAll(group.allReceiptRefs)}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded transition-colors whitespace-nowrap border ${
                              allGroupSelected 
                                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' 
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {allGroupSelected ? 'Deseleccionar' : 'Elegir Todo'}
                          </button>
                        </div>
                      </div>

                      {/* Contenido Desplegable */}
                      {isExpanded && (
                        <div className="p-2.5 space-y-2 bg-slate-50/40">
                          {/* CASO 1: Local Unificado (Múltiples Actividades en el mismo local agrupadas por MES) */}
                          {group.isUnified ? (
                            group.monthlyGroups.map((month) => {
                              const isMonthSelected = month.receiptRefs.every(r => selectedReceiptRefs.includes(r));
                              const isPending = month.anyPending;

                              return (
                                <div 
                                  key={month.monthKey}
                                  className={`p-2.5 rounded-lg border transition-colors ${
                                    isPending
                                      ? 'bg-amber-50/50 border-amber-200 opacity-80'
                                      : isMonthSelected
                                        ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300'
                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {/* Encabezado del Período Mensual Unificado */}
                                  <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                                      <input 
                                        type="checkbox"
                                        disabled={isPending}
                                        checked={isMonthSelected && !isPending}
                                        onChange={() => toggleMonthGroup(month.receiptRefs)}
                                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 disabled:opacity-40"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                                            {month.monthLabel}
                                          </span>
                                          <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                            {month.items.length} Actividades
                                          </span>
                                          {isPending && (
                                            <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded uppercase">
                                              En Verificación
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </label>

                                    <span className="font-black text-xs text-slate-800 whitespace-nowrap">
                                      Bs. {formatBs(month.totalBs)}
                                    </span>
                                  </div>

                                  {/* Desglose de actividades compañeras incluidas en este mes */}
                                  <div className="mt-2 pl-6 pt-1.5 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
                                    {month.items.map((it) => (
                                      <div key={it.referencia} className="flex justify-between items-center text-[10px]">
                                        <span className="truncate pr-2">
                                          • <strong className="text-slate-700">{it.inmId}</strong>: {it.actividad}
                                        </span>
                                        <span className="font-mono text-slate-600 whitespace-nowrap">
                                          Bs. {formatBs(it.monto)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            /* CASO 2: Inmueble Único (Lista mes a mes directa) */
                            group.singleItems.map((item) => {
                              const isItemSel = selectedReceiptRefs.includes(item.referencia);
                              const isPending = isItemPending(item.referencia);
                              const isCondoBlocked = item.bloqueadoCondominio === true;
                              const isDisabled = isPending || isCondoBlocked;

                              return (
                                <label 
                                  key={item.referencia}
                                  className={`flex items-start gap-2.5 p-2 rounded-lg border transition-colors ${
                                    isCondoBlocked 
                                      ? 'border-slate-200 bg-slate-100/70 opacity-70 cursor-not-allowed'
                                      : isPending
                                        ? 'border-amber-200 bg-amber-50/50 opacity-80 cursor-not-allowed'
                                        : isItemSel 
                                          ? 'border-emerald-400 bg-emerald-50/70 ring-1 ring-emerald-300 cursor-pointer' 
                                          : 'border-slate-200 hover:bg-slate-50 bg-white cursor-pointer'
                                  }`}
                                >
                                  <div className="pt-0.5">
                                    <input 
                                      type="checkbox"
                                      disabled={isDisabled}
                                      checked={isItemSel && !isDisabled}
                                      onChange={() => toggleSingleReceipt(item.referencia)}
                                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 disabled:opacity-40"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="min-w-0">
                                        <span className="font-bold text-xs text-slate-800 block truncate">
                                          {item.concepto}
                                        </span>
                                        <span className="text-[10px] text-slate-500 block truncate">
                                          {item.actividad}
                                        </span>
                                      </div>
                                      <span className="font-bold text-xs text-slate-800 whitespace-nowrap">
                                        Bs. {formatBs(item.monto)}
                                      </span>
                                    </div>
                                    {isPending && (
                                      <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded uppercase inline-block mt-1">
                                        En Verificación
                                      </span>
                                    )}
                                    {isCondoBlocked && (
                                      <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded uppercase inline-block mt-1">
                                        Condominio Centralizado
                                      </span>
                                    )}
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Convenios Activos si existen */}
              {conveniosData.length > 0 && (
                <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-3 space-y-2 mt-4">
                  <span className="text-xs font-bold text-blue-900 uppercase block">
                    Convenios de Pago Activos
                  </span>
                  {conveniosData.map(c => {
                    const isSel = selectedConvenioIds.includes(c.id);
                    return (
                      <label 
                        key={c.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isSel ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleConvenio(c.id)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <span className="text-xs font-bold text-slate-800">{c.concepto}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-800">Bs. {formatBs(c.monto)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer de Selección */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-600 block">Total Conceptos Seleccionados:</span>
                <span className="text-[11px] text-slate-500">
                  {totalConceptosSeleccionados} período{totalConceptosSeleccionados !== 1 ? 's' : ''} a pagar
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Total a Pagar</span>
                <span className="font-black text-xl text-emerald-600">
                  Bs. {formatBs(montoTotal)}
                </span>
              </div>
            </div>

          </div>

        </div>

        {/* Columna Derecha: Formulario de Reporte de Pago (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-4">
            
            <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-bold text-slate-800 uppercase flex items-center gap-2 text-xs tracking-wide">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                Reportar Comprobante
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Ingrese los detalles de la transferencia realizada.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              
              {/* Alerta de Resultado */}
              {result && (
                <div className={`p-3 rounded-lg flex items-start gap-2 text-xs border ${
                  result.type === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  result.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {result.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                  )}
                  <span className="font-medium">{result.msg}</span>
                </div>
              )}

              {/* Aviso si no ha seleccionado conceptos */}
              {montoTotal === 0 && !result && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <span className="font-bold block">Seleccione los períodos</span>
                    Elija los recibos que desea cancelar en la columna de la izquierda para continuar.
                  </div>
                </div>
              )}

              {/* Selector de Método */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-2">
                  Método de Pago <span className="text-red-500">*</span>
                </label>

                {/* Aviso: Punto de Venta solo en oficina */}
                <div className="flex items-start gap-2.5 bg-blue-50/60 border border-blue-200 rounded-lg p-2.5 mb-2.5 text-xs text-blue-900">
                  <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[11px]">¿Desea pagar con Tarjeta de Débito?</p>
                    <p className="text-[10px] text-blue-800 mt-0.5">El Punto de Venta se encuentra disponible de forma presencial en las taquillas de Recaudación.</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={montoTotal === 0}
                  onClick={() => setMetodo('transferencia')}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-start gap-3 disabled:opacity-40 disabled:cursor-not-allowed ${
                    metodo === 'transferencia'
                      ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <ArrowRightLeft className={`w-4 h-4 mt-0.5 flex-shrink-0 ${metodo === 'transferencia' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div>
                    <p className="font-bold text-xs text-slate-800">Transferencia Bancaria</p>
                    <p className="text-[10px] text-slate-500">Conciliación automática y validación por taquilla</p>
                  </div>
                </button>
              </div>

              {/* Campos del Formulario de Transferencia */}
              {metodo === 'transferencia' && (
                <div className="space-y-3 pt-2">
                  
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Monto a Transferir (Bs) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Bs.</span>
                      <input 
                        type="text"
                        value={formData.monto}
                        readOnly
                        className="w-full border border-slate-200 bg-slate-50 rounded-lg pl-9 pr-3 py-2 text-xs font-mono font-bold text-slate-800 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Banco Emisor Origen <span className="text-red-500">*</span>
                    </label>
                    <select 
                      value={formData.bancoOrigen}
                      onChange={(e) => setFormData({...formData, bancoOrigen: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 bg-white"
                      required
                    >
                      <option value="">-- Seleccione su banco --</option>
                      {bancos.map(b => <option key={b} value={b}>{b}</option>)}
                      <option value="OTRO">OTRO BANCO</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Nro. de Referencia <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text"
                        placeholder="Ej. 12345678"
                        value={formData.referencia}
                        onChange={(e) => setFormData({...formData, referencia: e.target.value.replace(/\D/g, '')})}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Fecha de Pago <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="date"
                        value={formData.fecha}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Comprobante de Transferencia <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center relative border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                      <input 
                        type="file"
                        accept="image/*,.pdf"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={async (e) => {
                          if (e.target.files?.[0]) {
                            const file = e.target.files[0];
                            try { setFormData({...formData, comprobante: await compressImage(file)}); }
                            catch { setFormData({...formData, comprobante: file}); }
                          }
                        }}
                        required={!formData.comprobante}
                      />
                      <Upload className={`w-6 h-6 mb-1.5 ${formData.comprobante ? 'text-emerald-500' : 'text-slate-400'}`} />
                      {formData.comprobante ? (
                        <>
                          <span className="text-xs font-bold text-emerald-600 truncate max-w-full px-2">{formData.comprobante.name}</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Haz clic para reemplazar archivo</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-slate-700">Adjuntar Comprobante</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG o PDF</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Botón de Enviar */}
                  <div className="pt-2">
                    <button 
                      type="submit"
                      disabled={isSubmitting || montoTotal === 0}
                      className="w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm transition-all text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]"
                    >
                      {isSubmitting ? (
                        'Procesando reporte...'
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          Enviar Comprobante (Bs. {formatBs(montoTotal)})
                        </>
                      )}
                    </button>
                  </div>

                </div>
              )}

            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
