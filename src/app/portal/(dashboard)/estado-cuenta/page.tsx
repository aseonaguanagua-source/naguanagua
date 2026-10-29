'use client';
import DeudaCondominiosPortal from '@/components/DeudaCondominiosPortal';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { Download, FileText, Building, Building2, MapPin, Store, Layers, Filter, Handshake, AlertCircle, CheckCircle2, Wrench, ClipboardCheck, ShieldCheck, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';
import { getFAR, isResidencialInm, isTerrenoInm, calcularMensualidad, cleanClasificacionActividad, isCondominioPagoIndividual, isExoneradoTotalMultas, getMesesExoneradosCount, isMesExoneradoMulta } from '@/lib/calculos';
import { valorUCD } from '@/lib/tasaHistorica';
import { calcularDeudaInmueble, porMesConRetencion, esUltimoMesHist, reglaCobroInmueble } from '@/lib/deudaMensual';
import { construirRecibosContribuyente, desgloseReciboCM, ESTADOS_RECIBO_PENDIENTE } from '@/lib/recibosContribuyente';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';
import { groupInmueblesByLocal, InmuebleClusterGroup } from '@/lib/cajaHelpers';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';

const TIPO_ICON: Record<string, any> = {
  especial: Wrench, extraordinario: FlaskConical, inspeccion: ClipboardCheck, visto_bueno: ShieldCheck
};
const TIPO_LABEL: Record<string, string> = {
  especial: 'Servicio Especial', extraordinario: 'Serv. Extraordinario', inspeccion: 'Inspección', visto_bueno: 'Visto Bueno'
};

export default function EstadoCuentaPage() {
  const { inmuebles, recibos, contribuyentes, tcmmv } = useAppContext();
  const [portalDoc, setPortalDoc] = useState('');
  const tasaBcv = tcmmv || 0;
  const [misInmueblesDb, setMisInmueblesDb] = useState<any[]>([]);
  const [misNaCodes, setMisNaCodes] = useState<string[]>([]);
  const [misFactDb, setMisFactDb] = useState<any[]>([]);
  const [cuotasData, setCuotasData] = useState<any[]>([]);
  const [serviciosEsp, setServiciosEsp] = useState<any[]>([]);
  const [pagosPorVerificar, setPagosPorVerificar] = useState<any[]>([]);
  const [contribuyenteMaster, setContribuyenteMaster] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLocal, setSelectedLocal] = useState<string>('TODOS');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCluster = (localId: string) => {
    setExpandedClusters(prev => ({ ...prev, [localId]: !prev[localId] }));
  };

  const formatFechaClean = (val?: string) => {
    if (!val) return 'N/A';
    if (val.includes('T')) {
      const [d] = val.split('T');
      const parts = d.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const parts = val.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  };

  useEffect(() => {
    const fullDoc = localStorage.getItem('portal_doc') || '';
    setPortalDoc(fullDoc);

    const fetchAll = async () => {
      try {
        if (fullDoc) {
          // Coincidencia exacta de prefijo (V con V, J con J, G con G)
          const variants = getIdentidadVariantsExact(fullDoc);
          const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

          // 1. Inmuebles, Facturas y Contribuyente en tiempo real
          const { data: inmsDB } = await supabase.from('inmuebles').select('*').or(orFilter);
          // Consultar también unidades de condominios asociadas a esta identidad
          const { data: condoUnits } = await supabase.from('condominio_unidades').select('inmueble').or(orFilter);
          let allInms = [...(inmsDB || [])];
          if (condoUnits && condoUnits.length > 0) {
            const condoCodes = condoUnits.map(u => u.inmueble).filter(Boolean);
            const missingCodes = condoCodes.filter(c => !allInms.some(i => i.inmueble === c));
            if (missingCodes.length > 0) {
              const { data: extraInms } = await supabase.from('inmuebles').select('*').in('inmueble', missingCodes);
              if (extraInms) allInms.push(...extraInms);
            }
          }

          // Consultar también hijos asociados vía padre_id (ej: clusters/locales con múltiples actividades)
          const parentCodes = allInms.map(i => i.inmueble).filter(Boolean);
          if (parentCodes.length > 0) {
            const { data: childInms } = await supabase.from('inmuebles').select('*').in('padre_id', parentCodes);
            if (childInms && childInms.length > 0) {
              const missingChildren = childInms.filter(c => !allInms.some(i => i.inmueble === c.inmueble));
              allInms.push(...missingChildren);
            }
          }

          const isActivoInm = (i: any) => {
            const est = (i.estado || 'Activo').trim().toLowerCase();
            return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
          };
          allInms = allInms.filter(isActivoInm);

          const { data: facturasDB } = await supabase
            .from('facturas')
            .select('*')
            .or(orFilter)
            .order('emision', { ascending: true });
          const { data: cData } = await supabase
            .from('contribuyentes')
            .select('nombre, email, telefono, direccion')
            .or(orFilter)
            .limit(1)
            .maybeSingle();

          if (cData) setContribuyenteMaster(cData);

          // FUENTE ÚNICA (idéntica a Caja y Cobro Móvil): inmuebles cobrables, facturas pendientes y meses históricos
          const rc = construirRecibosContribuyente({ inmuebles: allInms, facturas: facturasDB || [], identidad: fullDoc });
          // Deduplicar inmuebles para no repetir unidades
          const seenInmCodes = new Set<string>();
          const distinctInms = allInms.filter(i => {
            if (!i.inmueble || seenInmCodes.has(i.inmueble)) return false;
            seenInmCodes.add(i.inmueble);
            return !isTerrenoInm(i);
          });
          setMisInmueblesDb(distinctInms);
          setMisNaCodes(rc.naCodes);
          const combined: any[] = [
            ...(facturasDB || []).filter((f: any) => !ESTADOS_RECIBO_PENDIENTE.includes(f.estado)),
            ...rc.recibos,
          ];

          combined.sort((a, b) => {
            const aC = a.referencia?.startsWith('CM-'), bC = b.referencia?.startsWith('CM-');
            if (!aC && bC) return -1; if (aC && !bC) return 1;
            return (a.emision || '').localeCompare(b.emision || '');
          });

          setMisFactDb(combined);

          // 3. Convenios
          const { data: convenios } = await supabase.from('convenios_pago').select('*, convenios_cuotas(*)')
            .or(orFilter)
            .in('estado', ['Al Día', 'Activo']);
          if (convenios) {
            const hoy = new Date().toISOString().split('T')[0];
            const cuotas: any[] = [];
            for (const conv of convenios) {
              const cuotasList = conv.convenios_cuotas || [];
              cuotasList.forEach((c: any, idx: number) => {
                if (c.estado === 'Pendiente') {
                  cuotas.push({ conv: conv.numero, cuota: idx + 1, fecha: c.fecha, vencida: c.fecha <= hoy, monto: parseFloat(c.monto) || 0 });
                }
              });
            }
            setCuotasData(cuotas);
          }

          // 4. Servicios Especiales
          const { data: servs } = await supabase.from('servicios_especiales').select('*')
            .or(orFilter);
          setServiciosEsp(servs || []);

          // 5. Pagos Por Verificar
          const { data: pagosVerif } = await supabase.from('pagos_reportados')
            .select('referencia, monto, detalles, created_at')
            .or(orFilter)
            .eq('estado', 'Por Verificar')
            .order('created_at', { ascending: false });
          setPagosPorVerificar(pagosVerif || []);
        }
      } catch (e) { console.error(e); }
      setIsLoading(false);
    };
    fetchAll();
  }, []);

  // Filtrar inmuebles del usuario (priorizando los cargados directamente de DB)
  const misInmuebles = useMemo(() => {
    if (misInmueblesDb.length > 0) return misInmueblesDb;
    const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
    const docFmt = docNorm ? docNorm.charAt(0) + '-' + docNorm.slice(1) : '';
    const soloNum = portalDoc.replace(/\D/g, '');
    return inmuebles.filter((inm: any) => {
      const est = (inm.estado || 'Activo').trim().toLowerCase();
      if (est === 'eliminado' || est === 'inactivo' || est === 'desactivado') return false;
      const id = (inm.identidad || '').replace(/-/g, '').toUpperCase();
      const idFmt2 = id.charAt(0) + '-' + id.slice(1);
      const isDirect = portalDoc && (id === docNorm || idFmt2 === docFmt || id === portalDoc.toUpperCase() || id === soloNum);
      const isLinked = inm.padre_id && inmuebles.some((p: any) => {
        if (p.inmueble !== inm.padre_id) return false;
        const pId = (p.identidad || '').replace(/-/g, '').toUpperCase();
        return pId === docNorm || pId === portalDoc.toUpperCase() || pId === soloNum;
      });
      return isDirect || isLinked;
    });
  }, [misInmueblesDb, inmuebles, portalDoc]);

  // Agrupar por Inmueble / Local Físico (idéntico a Caja y a Inmuebles)
  const clusters: InmuebleClusterGroup[] = useMemo(() => {
    return groupInmueblesByLocal(misInmuebles);
  }, [misInmuebles]);

  // Mes RECIB-HIST con la fórmula única de Caja (incluye retención 75% solo para agentes de retención)
  const histMes = (r: any) => {
    const parts = r.referencia.split('-');
    const inm = misInmuebles.find((i: any) => i.inmueble === parts[2]);
    if (!inm) return null;
    const currentRate = tasaBcv > 0 ? tasaBcv : 1;
    const histRefs = misFact.filter((x: any) => x.referencia?.startsWith(`RECIB-HIST-${parts[2]}-M`));
    const meses = histRefs.map((x: any) => ({ emision: x.emision || new Date().toISOString(), esUltimo: esUltimoMesHist(x.referencia, inm, histRefs.length) }));
    const d = calcularDeudaInmueble(inm, currentRate, meses);
    const idx = histRefs.findIndex((x: any) => x.referencia === r.referencia);
    return porMesConRetencion(d)[idx] || null;
  };

  const getReciboMonto = (r: any): string => {
    if (r.estado === 'Abonado') return String(parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0);
    const inmsSource = misInmuebles;
    const currentRate = tasaBcv > 0 ? tasaBcv : 1;

    let baseMonto = 0;
    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const pm = histMes(r);
      if (pm) baseMonto = pm.total;
    } else if (r.referencia?.startsWith('CM-')) {
      // Monto bruto oficial de recibo mensual CM-
      const d = desgloseReciboCM(r, inmsSource, currentRate);
      baseMonto = d.total;
    } else {
      baseMonto = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    }

    // AHORA restamos los pagos pendientes
    let montoPendiente = 0;
    pagosPorVerificar.forEach((p) => {
      let det: any = {};
      try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch (e) {}
      const refs = det.recibos || [];
      if (refs.includes(r.referencia)) {
        const montoPago = parseFloat(String(p.monto || '0').replace(/[^0-9.]/g, '')) || 0;
        if (refs.length > 0) montoPendiente += (montoPago / refs.length);
      }
    });

    return String(Math.max(0, baseMonto - montoPendiente).toFixed(2));
  };

  const getReciboBreakdown = (r: any) => {
    const inmsSource = misInmuebles;
    const currentRate = tasaBcv > 0 ? tasaBcv : 1;
    let baseMes = 0;
    let multaMes = 0;
    let ivaMes = 0;        // IVA completo (16%)
    let retencionMes = 0;  // IVA retenido (75%) — solo agentes de retención
    let totalMes = 0;      // monto bruto de factura

    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const pm = histMes(r);
      if (pm) {
        baseMes = pm.base;
        multaMes = pm.multa;
        ivaMes = pm.iva;
        retencionMes = pm.retencion;
        totalMes = pm.total;
      }
    } else if (r.referencia?.startsWith('CM-')) {
      const d = desgloseReciboCM(r, inmsSource, currentRate);
      baseMes = d.base; multaMes = d.multa; ivaMes = d.iva;
      retencionMes = Math.round(d.ivaRetenible * 0.75 * 100) / 100;
      totalMes = d.total;
    } else {
      totalMes = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
      if (String(r.referencia || '').startsWith('MULTA-')) {
        multaMes = totalMes;
        baseMes = 0;
      } else {
        baseMes = totalMes;
      }
    }

    return { baseMes, multaMes, ivaMes, retencionMes, totalMes };
  };

  // Filtrar recibos del usuario (priorizando DB)
  const isCondoReceipt = (f: any): boolean => {
    const ref = String(f?.referencia || '').toUpperCase();
    const inmId = String(f?.inmueble || '').toUpperCase();
    // Excluir cualquier inmueble que pertenezca a régimen de condominio
    const matched = misInmuebles.find((i: any) => i.inmueble && (ref.includes(String(i.inmueble).toUpperCase()) || inmId === String(i.inmueble).toUpperCase()));
    if (matched && (
      matched.condominio_padre_id || 
      matched.es_condominio || 
      String(matched.actividad_principal || '').toLowerCase().includes('condominio') || 
      String(matched.actividad_principal || '').toLowerCase().includes('padre en sigyr: urb')
    )) {
      return true;
    }
    return false;
  };

  const misFact = useMemo(() => {
    const source = misFactDb.length > 0 ? misFactDb : (() => {
      const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
      const soloNum = portalDoc.replace(/\D/g, '');
      return recibos.filter((f: any) => {
        const ident = (f.identidad || '').replace(/-/g, '').toUpperCase();
        const cont = (f.contribuyente || '').replace(/-/g, '').toUpperCase();
        return portalDoc && (
          ident === docNorm || ident.includes(soloNum) || 
          cont === docNorm || cont.includes(soloNum)
        );
      });
    })();
    return source.filter((f: any) => !isCondoReceipt(f));
  }, [misFactDb, recibos, portalDoc, misInmuebles]);

  const pendientes = misFact
    .filter((f: any) => (f.estado === 'Pendiente' || f.estado === 'Abonado' || f.estado === 'Por Verificar') && !isCondoReceipt(f))
    .sort((a,b) => (a.emision || '').localeCompare(b.emision || ''));
  const pagadas = misFact
    .filter((f: any) => f.estado === 'Pagada' || f.estado === 'Pagado')
    .sort((a,b) => (b.emision || '').localeCompare(a.emision || ''))
    .slice(0, 10);

  const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const mesLabel = (d?: string | Date | null) => {
    if (!d) return '—';
    if (d instanceof Date) {
      if (isNaN(d.getTime())) return '—';
      return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
    }
    const str = String(d).trim();
    if (!str) return '—';
    if (str.startsWith('MULTA-')) return 'MULTA MUNICIPAL';
    const match = str.match(/^(\d{4})-(\d{1,2})/);
    if (match) {
      const mIdx = parseInt(match[2], 10) - 1;
      if (mIdx >= 0 && mIdx < 12) return `${MESES[mIdx]} ${match[1]}`;
    }
    const matchRev = str.match(/^(\d{1,2})[-/](\d{4})/);
    if (matchRev) {
      const mIdx = parseInt(matchRev[1], 10) - 1;
      if (mIdx >= 0 && mIdx < 12) return `${MESES[mIdx]} ${matchRev[2]}`;
    }
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) return `${MESES[dt.getMonth()]} ${dt.getFullYear()}`;
    return str;
  };

  // Agrupar los recibos pendientes por Local (Cluster / N/A) y por Período/Mes (idéntico a Caja)
  const allRecibosGrupos = useMemo(() => {
    const groupsMap = new Map<string, {
      key: string;
      localId: string;
      cluster?: InmuebleClusterGroup;
      periodo: string;
      emisionDate: string;
      vencimiento: string;
      isMulta: boolean;
      totalBs: number;
      isEnVerificacion: boolean;
      items: Array<{
        recibo: any;
        inmueble: any;
        monto: number;
        inmuDesc: string;
        referencia: string;
        vencimiento: string;
      }>;
    }>();

    const sortedPendientes = [...pendientes].sort((a: any, b: any) => 
      new Date(a.emision || 0).getTime() - new Date(b.emision || 0).getTime()
    );

    for (const f of sortedPendientes) {
      const matchedInm = misInmuebles.find((inm: any) => inm.inmueble && f.referencia?.includes(inm.inmueble));
      const parentCluster = clusters.find(c =>
        c.localId === f.inmueble ||
        c.inms.some(inm => inm.inmueble && f.referencia?.includes(inm.inmueble)) ||
        (f.referencia && f.referencia.includes(c.localId))
      );

      const localId = parentCluster?.localId || matchedInm?.inmueble || f.inmueble || 'LOCAL';
      const esMulta = String(f.referencia || '').startsWith('MULTA-');
      const periodoKey = esMulta ? 'MULTA' : (f.emision ? f.emision.substring(0, 7) : 'MES');
      const groupKey = `${localId}__${periodoKey}`;

      const montoNum = parseFloat(getReciboMonto(f)) || 0;
      const inmuDesc = matchedInm
        ? cleanClasificacionActividad(matchedInm.actividad_principal || matchedInm.clasificacion || '')
        : '';

      if (!groupsMap.has(groupKey)) {
        const etiquetaPeriodo = esMulta
          ? `Multa Municipal (${localId})`
          : mesLabel(f.emision);

        groupsMap.set(groupKey, {
          key: groupKey,
          localId,
          cluster: parentCluster,
          periodo: etiquetaPeriodo,
          emisionDate: f.emision || '',
          vencimiento: f.vencimiento || 'N/A',
          isMulta: esMulta,
          totalBs: 0,
          isEnVerificacion: true,
          items: [],
        });
      }

      const group = groupsMap.get(groupKey)!;
      group.totalBs += montoNum;
      if (montoNum > 0 || f.estado === 'Abonado' || f.estado === 'Pagado') {
        group.isEnVerificacion = false;
      }
      group.items.push({
        recibo: f,
        inmueble: matchedInm,
        monto: montoNum,
        inmuDesc,
        referencia: f.referencia,
        vencimiento: f.vencimiento,
      });
    }

    return Array.from(groupsMap.values());
  }, [pendientes, misInmuebles, clusters]);

  // Cálculos consolidados y canónicos por local (coincidente con Caja)
  const totalMensual = clusters.reduce((acc: number, c: any) => {
    return acc + (c.totalMmv * tasaBcv);
  }, 0);

  const totalPendBs = allRecibosGrupos.reduce((acc: number, g: any) => acc + g.totalBs, 0);

  const cuotasVencidas = cuotasData.filter(c => c.vencida);
  const totalCuotas = cuotasVencidas.reduce((a, c) => a + c.monto, 0);

  const serviciosPendientes = serviciosEsp.filter(s => s.estado !== 'Pagado');
  const totalServiciosBs = serviciosPendientes.reduce((a: number, s: any) => a + (parseFloat(s.monto) || 0), 0);

  const deudaTotalEstimada = totalPendBs + totalCuotas + totalServiciosBs;


  const handleDownloadPDF = (targetLocalId?: string) => {
    if (!portalDoc) return;
    const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
    const myContribuyente = contribuyentes?.find((c: any) => (c.Identidad || '').replace(/-/g, '').toUpperCase() === docNorm);

    const viewData = {
      Contribuyente: contribuyenteMaster?.nombre || misInmuebles[0]?.contribuyente || myContribuyente?.Contribuyente || (typeof window !== 'undefined' ? localStorage.getItem('portal_user') : '') || 'Contribuyente',
      Identidad: portalDoc,
      Telefono: contribuyenteMaster?.telefono || misInmuebles[0]?.telefono || myContribuyente?.Telefono || '',
      Direccion: contribuyenteMaster?.direccion || misInmuebles[0]?.direccion || myContribuyente?.Direccion || 'Naguanagua, Edo. Carabobo'
    };

    const target = targetLocalId || selectedLocal;
    const clustersToRender = (target && target !== 'TODOS')
      ? clusters.filter(c => c.localId === target)
      : clusters;

    if (clustersToRender.length === 0) return;

    const stripNivel = (str: string): string => {
      if (!str) return '';
      return cleanClasificacionActividad(str);
    };

    const MESES_ABR = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const formatPeriodo = (fecha: string | Date | undefined): string => {
      if (!fecha) return 'N/A';
      const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
      if (!isNaN(d.getTime())) {
        return `${MESES_ABR[d.getMonth()]}-${d.getFullYear()}`;
      }
      const parts = String(fecha).split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10);
        return `${MESES_ABR[m - 1] || parts[1]}-${parts[0]}`;
      }
      return String(fecha);
    };

    const today = new Date();
    const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tasaValida = tasaBcv > 0 ? tasaBcv : 1;
    const cajero = typeof window !== 'undefined' ? (localStorage.getItem('portal_user') || viewData.Contribuyente) : viewData.Contribuyente;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let pageCount = 0;

    for (let clusterIdx = 0; clusterIdx < clustersToRender.length; clusterIdx++) {
      const cluster = clustersToRender[clusterIdx];
      const esRes = cluster.tipo === 'RESIDENCIAL';
      const isMultiActivity = cluster.count > 1 || (cluster.inms && cluster.inms.length > 1);

      // Desglose y cálculo individual por cada inmueble / actividad económica del cluster
      let subtotalBaseLocal = 0;
      let subtotalIvaLocal = 0;
      let subtotalMultasLocal = 0;
      let maxMesesCluster = 0;

      const hasChildInms = cluster.inms.some((i: any) => i.padre_id === cluster.localId || cluster.inms.some((p: any) => p.inmueble !== i.inmueble && i.padre_id === p.inmueble));
      const effectiveInms = hasChildInms
        ? cluster.inms.filter((i: any) => i.inmueble !== cluster.localId && !cluster.inms.some((h: any) => h.padre_id === i.inmueble))
        : cluster.inms;

      const clusterInmBreakdown = (effectiveInms.length > 0 ? effectiveInms : cluster.inms).map((inm: any) => {
        if (isTerrenoInm(inm)) {
          return {
            inmueble: inm.inmueble,
            actividad: stripNivel(inm.actividad_principal || 'Terreno'),
            meses: 0,
            bMes: 0,
            iMes: 0,
            baseTotal: 0,
            ivaTotal: 0,
            multaTotal: 0,
            total: 0,
            esCasoSinMulta: true
          };
        }

        // EXACTO COMO EN CAJA Y ADMIN: Redondeo a 2 decimales en Base, luego IVA al 16% sobre la Base redondeada, y mora
        const inmEsRes = isResidencialInm(inm);
        const rawBMes = calcularMensualidad(inm, tasaValida);
        const bMes = Math.round(rawBMes * 100) / 100;
        const iMes = (esRes || inmEsRes) ? 0 : Math.round((bMes * 0.16) * 100) / 100;
        const mBase = parseInt(String(inm.meses_deuda || 0), 10) || 0;
        const mDeuda = mBase > 0 ? mBase
          : ((parseFloat(String(inm.deuda_mmv || 0)) || 0) > 0 || (parseFloat(String(inm.deuda_congelada_bs || 0)) || 0) > 0 ? 1 : 0);
        if (mDeuda > maxMesesCluster) maxMesesCluster = mDeuda;

        const esExoneradoTotal = isExoneradoTotalMultas(inm.notas);
        const totalExoneradosInm = getMesesExoneradosCount(inm.notas);
        const esCasoSinMulta = (inm.inmueble === 'URB014954') || esExoneradoTotal;

        const baseTotal = Math.round((bMes * mDeuda) * 100) / 100;
        const ivaTotal = Math.round((iMes * mDeuda) * 100) / 100;
        let multaTotal = 0;

        if (!esCasoSinMulta && mDeuda > 1) {
          const mesesConMultaInm = Math.max(0, mDeuda - 1 - totalExoneradosInm);
          const tasaMora = (esRes || inmEsRes) ? 0.10 : 0.12;
          const multaMes = Math.round((bMes * tasaMora) * 100) / 100;
          multaTotal = Math.round((multaMes * mesesConMultaInm) * 100) / 100;
        }

        subtotalBaseLocal += baseTotal;
        subtotalIvaLocal += ivaTotal;
        subtotalMultasLocal += multaTotal;

        return {
          inmueble: inm.inmueble,
          actividad: stripNivel(inm.actividad_principal || 'Actividad Comercial'),
          meses: mDeuda,
          bMes,
          iMes,
          baseTotal,
          ivaTotal,
          multaTotal,
          total: Math.round((baseTotal + ivaTotal + multaTotal) * 100) / 100,
          esCasoSinMulta
        };
      });

      const numMesesTotal = maxMesesCluster;
      const baseMensualLocal = Math.round(clusterInmBreakdown.reduce((sum: number, b: any) => sum + b.bMes, 0) * 100) / 100;
      const ivaMensualLocal = Math.round(clusterInmBreakdown.reduce((sum: number, b: any) => sum + b.iMes, 0) * 100) / 100;
      const totalMensualLocal = Math.round((baseMensualLocal + ivaMensualLocal) * 100) / 100;
      const totalServiciosBs = (clusterIdx === 0)
        ? serviciosEsp.filter((s: any) => s.estado !== 'Pagado').reduce((a: number, s: any) => a + (parseFloat(s.monto) || 0), 0)
        : 0;

      subtotalBaseLocal = Math.round(subtotalBaseLocal * 100) / 100;
      subtotalIvaLocal = Math.round(subtotalIvaLocal * 100) / 100;
      subtotalMultasLocal = Math.round(subtotalMultasLocal * 100) / 100;

      const totalPagarLocal = Math.round((subtotalBaseLocal + subtotalIvaLocal + subtotalMultasLocal + totalServiciosBs) * 100) / 100;
      // Agente de retención: retiene el 75% del IVA de sus inmuebles comerciales y cancela el resto.
      const ivaRetenidoLocal = esRes ? 0 : Math.round(clusterInmBreakdown.reduce((s: number, b: any) => {
        const inmB = cluster.inms.find((i: any) => i.inmueble === b.inmueble);
        const bEsRes = inmB ? isResidencialInm(inmB) : false;
        return s + (!bEsRes && (inmB?.agente_retencion === true || String(inmB?.agente_retencion) === 'true') ? b.ivaTotal * 0.75 : 0);
      }, 0) * 100) / 100;
      const esAgenteLocal = ivaRetenidoLocal > 0;
      const totalCancelarLocal = Math.round((totalPagarLocal - ivaRetenidoLocal) * 100) / 100;

      // Determinar fechas de período
      let periodoDesde = 'N/A';
      let periodoHasta = 'N/A';
      if (numMesesTotal > 0) {
        const dIni = new Date(today.getFullYear(), today.getMonth() - numMesesTotal, 1);
        const dFin = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        periodoDesde = formatPeriodo(dIni);
        periodoHasta = formatPeriodo(dFin);
      }

      if (pageCount > 0) doc.addPage();
      pageCount++;

      const docNro = Math.floor(10000 + Math.random() * 90000);

      // ── LOGO IAMEC Naguanagua (lado izquierdo) ──
      try { doc.addImage(logos.iamec, 'PNG', 14, 8, 42, 22); } catch(e) {}

      // ── TÍTULO ──
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('ESTADO DE CUENTA', 105, 15, { align: 'center' });

      doc.setFontSize(8.5);
      if (isMultiActivity) {
        doc.setTextColor(30, 64, 175);
        doc.text('LOCAL UNIFICADO — MÚLTIPLES ACTIVIDADES ECONÓMICAS', 105, 20, { align: 'center' });
      } else if (esRes) {
        doc.setTextColor(5, 150, 105);
        doc.text('EXENTO DE IVA', 105, 20, { align: 'center' });
      }

      doc.setFontSize(8);
      doc.setTextColor(220, 38, 38);
      doc.text(`TASA VIGENTE HASTA: ${tasaVigente}`, 105, 25, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      // ── METADATA & LÍNEA ──
      doc.setLineWidth(0.3);
      doc.line(14, 28, 196, 28);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      doc.text(`Generado por: ${cajero}`, 14, 32);
      doc.setFont('helvetica', 'normal');
      doc.text(`Página ${clusterIdx + 1} de ${clustersToRender.length}   |   Nro.: ${docNro}`, 196, 32, { align: 'right' });
      doc.line(14, 34, 196, 34);

      // ── DATOS DEL CONTRIBUYENTE Y LOCAL ──
      let y = 39;
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text('Contribuyente:', 14, y);
      doc.setFont('helvetica', 'bold');
      const splitContrib = doc.splitTextToSize(String(viewData.Contribuyente || ''), 102);
      doc.text(splitContrib, 38, y);

      doc.setFont('helvetica', 'normal');
      doc.text('R.I.F. / C.I.:', 145, y);
      doc.setFont('helvetica', 'bold');
      doc.text(viewData.Identidad || '', 165, y);
      y += Math.max(5, splitContrib.length * 4);

      if (isMultiActivity) {
        const codigoPrincipal = cluster.localId || 'Principal';
        doc.setFont('helvetica', 'normal');
        doc.text('Código Inmueble:', 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(codigoPrincipal, 42, y);

        doc.setFont('helvetica', 'normal');
        doc.text('Actividades:', 145, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`${cluster.count} Actividades`, 165, y);
        y += 5;
      } else {
        const inmSingle = cluster.inms[0];
        doc.setFont('helvetica', 'normal');
        doc.text('Código Inmueble:', 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(inmSingle?.inmueble || cluster.localId || 'Principal', 40, y);

        const actLabel = cleanClasificacionActividad(inmSingle?.actividad_principal || inmSingle?.clasificacion || '') || 'Servicio de Aseo Urbano';
        doc.setFont('helvetica', 'normal');
        doc.text('Actividad / Inmueble:', 95, y);
        doc.setFont('helvetica', 'bold');
        doc.text(String(actLabel).slice(0, 36), 130, y);
        y += 5;
      }

      const dirStr = cluster.direccion || viewData.Direccion || 'Naguanagua, Edo. Carabobo';
      const splitDir = doc.splitTextToSize(`Dirección Local/Inmueble: ${dirStr}`, 182);
      doc.setFont('helvetica', 'normal');
      doc.text(splitDir, 14, y);
      y += (splitDir.length * 4) + 2;

      // ── DATOS DE LA DEUDA (formato oficial) ──
      const ucdValor = valorUCD(tasaValida);
      const fmtN = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const mesesVencidosDisplay = numMesesTotal;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Meses vencidos:', 14, y);
      doc.setFont('helvetica', 'bold');
      doc.text(String(mesesVencidosDisplay), 40, y);
      doc.setFont('helvetica', 'normal');
      doc.text('Período:', 60, y);
      doc.setFont('helvetica', 'bold');
      doc.text(mesesVencidosDisplay > 0 ? `${periodoDesde} a ${periodoHasta}` : 'Al día', 74, y);
      doc.setFont('helvetica', 'normal');
      doc.text('Valor del UCD (Bs):', 135, y);
      doc.setFont('helvetica', 'bold');
      doc.text(fmtN(ucdValor), 196, y, { align: 'right' });
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.text('Tasa Euro BCV:', 135, y);
      doc.setFont('helvetica', 'bold');
      doc.text(fmtN(tasaValida), 196, y, { align: 'right' });
      y += 3;

      doc.setDrawColor(210, 210, 210);
      doc.line(14, y, 196, y);
      doc.setDrawColor(0, 0, 0);
      y += 4;

      // ── TABLA DE ACTIVIDADES ECONÓMICAS (SI ES LOCAL CON 2 O MÁS ACTIVIDADES) ──
      if (isMultiActivity) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 64, 175);
        doc.text('DETALLE DE ACTIVIDADES ECONÓMICAS DEL LOCAL', 105, y, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        y += 2;

        const actRows = clusterInmBreakdown.map((b: any) => {
          const inmOriginal = cluster.inms.find((i: any) => i.inmueble === b.inmueble);
          const fo = inmOriginal?.mmv_mes ? parseFloat(String(inmOriginal.mmv_mes)) : getFAR(b.actividad);
          return [
            b.inmueble || '—',
            b.actividad,
            fo.toFixed(2),
            `Bs. ${b.bMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${b.iMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${(b.bMes + b.iMes).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ];
        });

        autoTable(doc, {
          startY: y,
          head: [['CÓDIGO', 'ACTIVIDAD ECONÓMICA', 'F.O.', 'BASE MES (Bs.)', 'IVA 16% (Bs.)', 'TOTAL MES (Bs.)']],
          body: actRows,
          foot: [[
            'TOTAL MENSUAL UNIFICADO DEL LOCAL', '', '',
            `Bs. ${baseMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${ivaMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `Bs. ${totalMensualLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]],
          theme: 'grid',
          headStyles: {
            fillColor: [239, 246, 255], textColor: [30, 64, 175],
            fontStyle: 'bold', lineColor: [191, 219, 254], lineWidth: 0.2, halign: 'center', fontSize: 7.5
          },
          footStyles: {
            fillColor: [241, 245, 249], textColor: [15, 23, 42],
            fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.2, fontSize: 7.5
          },
          styles: { fontSize: 7, cellPadding: 1.5 },
          columnStyles: {
            0: { cellWidth: 24, fontStyle: 'bold' },
            1: { cellWidth: 70 },
            2: { cellWidth: 16, halign: 'center' },
            3: { cellWidth: 24, halign: 'right' },
            4: { cellWidth: 24, halign: 'right' },
            5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
          }
        });

        y = (doc as any).lastAutoTable.finalY + 4;
      }

      // ── ESTADO DE CUENTA RESUMIDO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('ESTADO DE CUENTA RESUMIDO', 105, y, { align: 'center' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 4;

      const resumenRows: Array<[string, string]> = [
        [`Períodos Calculados:`, isMultiActivity
          ? clusterInmBreakdown.map((b: any) => `${b.inmueble}: ${b.meses > 0 ? `${b.meses}m` : 'Al Día'}`).join(' | ')
          : (numMesesTotal > 0 ? `${periodoDesde} a ${periodoHasta} (${numMesesTotal} meses)` : 'Solvente / Al Día')
        ],
        ['Monto Recolección Aseo Urbano Bs.:', `Bs. ${subtotalBaseLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ];

      if (clusterIdx === 0 && totalServiciosBs > 0) {
        resumenRows.push(['Monto Servicios Especiales Bs.:', `Bs. ${totalServiciosBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      }

      if (esRes) {
        resumenRows.push(
          ['Total Exento de IVA Bs.:', `Bs. ${subtotalBaseLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['Base Imponible Bs.:', 'Bs. 0,00'],
          ['IVA (0.00%) Bs.:', 'Bs. 0,00'],
          ['Multas (Último mes sin multa) Bs.:', `Bs. ${subtotalMultasLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        );
      } else {
        resumenRows.push(
          ['Total Exento Bs.:', `Bs. ${(clusterIdx === 0 ? totalServiciosBs : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['Base Imponible Bs.:', `Bs. ${subtotalBaseLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['IVA (16.00%) Bs.:', `Bs. ${subtotalIvaLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['Multas (Último mes sin multa) Bs.:', `Bs. ${subtotalMultasLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        );
      }

      resumenRows.push(['Total Estado de Cuenta Bs.:', `Bs. ${totalPagarLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      if (valorUCD(tasaValida) > 0) {
        resumenRows.push(['Total Estado de Cuenta UCD:', `${(totalPagarLocal / valorUCD(tasaValida)).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} UCD`]);
      }
      if (esAgenteLocal) {
        resumenRows.push(
          ['IVA Retenido 75% (Agente de Retención) Bs.:', `- Bs. ${ivaRetenidoLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['IVA a Cancelar (25%) Bs.:', `Bs. ${(subtotalIvaLocal - ivaRetenidoLocal).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        );
      }

      doc.setFontSize(8);
      resumenRows.forEach(([lbl, val]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(lbl, 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(val, 196, y, { align: 'right' });
        y += 4.5;
      });

      doc.line(14, y, 196, y);
      y += 5;

      // ── TOTAL A PAGAR HIGHLIGHT ──
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(esAgenteLocal ? 'TOTAL A CANCELAR (con retención de IVA)' : 'TOTAL A PAGAR', 14, y);
      doc.text(`Bs. ${totalCancelarLocal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 196, y, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      y += 2;
      doc.line(14, y, 196, y);
      y += 5;

      // ── TABLA OFICIAL MES A MES ──
      const ucdV = valorUCD(tasaValida);
      const f2 = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const f4 = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      const porMes = new Map<string, { fecha: Date; base: number; multa: number; iva: number; acts: { act: string; cod: string; monto: number }[] }>();
      clusterInmBreakdown.forEach((b: any) => {
        const inmB = cluster.inms.find((i: any) => i.inmueble === b.inmueble);
        const exon = getMesesExoneradosCount(inmB?.notas);
        const conMulta = b.esCasoSinMulta ? 0 : Math.max(0, b.meses - 1 - exon);
        const tasaMora = esRes ? 0.10 : 0.12;
        for (let k = 0; k < b.meses; k++) {
          const fecha = new Date(today.getFullYear(), today.getMonth() - b.meses + k, 1);
          const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
          if (!porMes.has(key)) porMes.set(key, { fecha, base: 0, multa: 0, iva: 0, acts: [] });
          const m = porMes.get(key)!;
          m.base += b.bMes;
          m.iva += b.iMes;
          m.multa += k < conMulta ? b.bMes * tasaMora : 0;
          m.acts.push({ act: b.actividad, cod: b.inmueble, monto: b.bMes });
        }
      });

      const codigoProp = isMultiActivity
        ? (cluster.inms[0]?.condominio_padre_id || cluster.inms[0]?.padre_id || cluster.localId || cluster.inms[0]?.inmueble)
        : (cluster.inms[0]?.inmueble || cluster.localId || '');
      const oficialRows: any[] = [];
      const mostrarActs = isMultiActivity || cluster.inms.length > 1;
      [...porMes.keys()].sort().forEach(key => {
        const m = porMes.get(key)!;
        const tot = m.base + m.multa + m.iva;
        oficialRows.push([
          { content: codigoProp, styles: { fontStyle: 'bold' } },
          `${String(m.fecha.getMonth() + 1).padStart(2, '0')}/${m.fecha.getFullYear()}`,
          f2(m.base), '-', m.multa > 0 ? f2(m.multa) : '-', esRes ? '-' : f2(m.iva), f2(tot), ucdV > 0 ? f4(tot / ucdV) : '-',
        ]);
        if (mostrarActs) {
          m.acts.forEach(a => oficialRows.push([
            { content: `   Actividad: ${a.act} [${a.cod}]  –  Monto: ${f2(a.monto)}`, colSpan: 8, styles: { fontSize: 6.3, textColor: [71, 85, 105], fontStyle: 'italic' } },
          ]));
        }
      });

      if (oficialRows.length === 0) {
        oficialRows.push([{ content: 'Solvente — No posee períodos pendientes', colSpan: 8, styles: { halign: 'center' } }]);
      }

      autoTable(doc, {
        startY: y,
        head: [['PROPIEDAD', 'MESES', 'SERV. ASEO', 'INT. MORA SERV. ASEO', 'MULTA IMPAGO', 'IVA', 'TOTAL BS', 'UCD']],
        body: oficialRows,
        foot: [[
          'TOTALES',
          `${Math.max(maxMesesCluster, porMes.size)} mes(es)`,
          f2(subtotalBaseLocal), '-', f2(subtotalMultasLocal), f2(subtotalIvaLocal), f2(totalPagarLocal), ucdV > 0 ? f4(totalPagarLocal / ucdV) : '-',
        ], ...(esAgenteLocal ? [
          ['', 'IVA RETENIDO 75%', '', '', '', `- ${f2(ivaRetenidoLocal)}`, `- ${f2(ivaRetenidoLocal)}`, ucdV > 0 ? `- ${f4(ivaRetenidoLocal / ucdV)}` : ''],
          ['', 'TOTAL A CANCELAR', '', '', '', f2(subtotalIvaLocal - ivaRetenidoLocal), f2(totalCancelarLocal), ucdV > 0 ? f4(totalCancelarLocal / ucdV) : ''],
        ] : [])],
        theme: 'grid',
        headStyles: {
          fillColor: [248, 250, 252], textColor: [15, 23, 42],
          fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center', fontSize: 7
        },
        footStyles: {
          fillColor: [241, 245, 249], textColor: [15, 23, 42],
          fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 7, halign: 'right'
        },
        styles: { fontSize: 7, cellPadding: 1.3 },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 18, halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right', fontStyle: 'bold' },
          7: { halign: 'right' }
        }
      });

      y = (doc as any).lastAutoTable.finalY + 5;

      // ── INFORMACIÓN DE PAGO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('INFORMACIÓN PARA PAGOS Y TRANSFERENCIAS', 105, y, { align: 'center' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('1) Banco: BANCAMIGA (0172)  |  Cta: 01720110711101340717  |  Beneficiario: IAMEC BANCAMIGA  |  RIF: G-20008614-9', 14, y);
      y += 3.5;
      doc.text('2) Banco: BANESCO (0134)    |  Cta: 01341089590001008636  |  Beneficiario: IAMEC BANESCO    |  RIF: G-20008614-9', 14, y);
      y += 4;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      const notaUCD = doc.splitTextToSize('UCD: Unidad de Cuenta Dinámica, equivalente a la tasa oficial del Euro publicada por el Banco Central de Venezuela multiplicada por 57 (Ordenanza de Aseo Urbano y Gestión Integral de Residuos del Municipio Naguanagua). El monto en bolívares se calcula con el valor del UCD vigente a la fecha de pago.', 182);
      doc.text(notaUCD, 14, y);
      y += notaUCD.length * 3 + 1;
      doc.setFont('helvetica', 'normal');

      // ── AVISO DE VIGENCIA DE TASA ──
      doc.setLineWidth(0.2);
      doc.setDrawColor(220, 38, 38);
      doc.line(14, y, 196, y);
      y += 3.5;
      doc.setDrawColor(0, 0, 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(220, 38, 38);
      doc.text('IMPORTANTE: Los montos indicados en este estado de cuenta son válidos ÚNICAMENTE para la fecha de emisión del presente documento.', 105, y, { align: 'center' });
      y += 3.5;
      doc.text('La tasa de cambio oficial BCV varía periódicamente. Para cancelar en fecha posterior, solicite un nuevo estado de cuenta actualizado.', 105, y, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    } // fin loop clusters

    // ── LOGOS GUBERNAMENTALES AL PIE (Lacava, Elizabeth, Naguanagua Te Quiero) ──
    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const yFoot = 282;
      try {
        if ((logos as any).lacava) {
          doc.addImage((logos as any).lacava, 'PNG', 14, yFoot, 34, 8.5, undefined, 'FAST');
        }
      } catch {}
      try {
        if ((logos as any).elizabeth) {
          doc.addImage((logos as any).elizabeth, 'PNG', 85, yFoot, 40, 7.5, undefined, 'FAST');
        }
      } catch {}
      try {
        if ((logos as any).naguanaguaTeQuiero) {
          doc.addImage((logos as any).naguanaguaTeQuiero, 'PNG', 162, yFoot - 2, 34, 12, undefined, 'FAST');
        }
      } catch {}
    }

    const fileSuffix = clustersToRender.length === 1 ? clustersToRender[0].localId : 'Consolidado';
    const fileName = `Estado_Cuenta_${viewData.Identidad}_${fileSuffix}_${Date.now()}.pdf`;
    doc.save(fileName);
  };

  if (isLoading) return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando estado de cuenta...</div>;

  const displayedClusters = selectedLocal === 'TODOS'
    ? clusters
    : clusters.filter(c => c.localId === selectedLocal);

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16">
      
      {/* Cabecera Principal con Selector de Local y Botón de Descarga */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Mi Estado de Cuenta</h1>
          <p className="text-slate-500 text-sm">Visualice su deuda actual y descargue su comprobante por local o consolidado</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {clusters.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700">
              <span className="text-slate-400 font-bold">Local:</span>
              <select
                value={selectedLocal}
                onChange={(e) => setSelectedLocal(e.target.value)}
                className="bg-transparent border-none text-slate-800 font-bold focus:outline-none cursor-pointer max-w-[200px] truncate"
              >
                <option value="TODOS">Todos los locales ({clusters.length})</option>
                {clusters.map((c) => (
                  <option key={c.localId} value={c.localId}>
                    {c.localId} - {c.direccion ? (c.direccion.length > 28 ? c.direccion.slice(0, 28) + '...' : c.direccion) : c.tipo}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button 
            onClick={() => handleDownloadPDF(selectedLocal)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-black transition-all shadow-md hover:shadow-red-500/30 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {selectedLocal === 'TODOS' ? 'DESCARGAR CONSOLIDADO (PDF)' : `DESCARGAR ${selectedLocal} (PDF)`}
          </button>
        </div>
      </div>

      {selectedLocal !== 'TODOS' && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-medium">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" />
            <span>Mostrando vista filtrada para el local <strong>{selectedLocal}</strong></span>
          </div>
          <button
            onClick={() => setSelectedLocal('TODOS')}
            className="text-emerald-700 font-bold underline hover:text-emerald-900 cursor-pointer"
          >
            Ver todos los locales ({clusters.length})
          </button>
        </div>
      )}

      {/* Resumen Financiero */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={"rounded-xl border p-4 text-center shadow-sm " + (allRecibosGrupos.length > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200")}>
          <div className={"text-[10px] font-bold uppercase mb-1 " + (allRecibosGrupos.length > 0 ? "text-red-500" : "text-emerald-500")}>Recibos Pend.</div>
          <div className={"text-lg font-bold " + (allRecibosGrupos.length > 0 ? "text-red-700" : "text-emerald-700")}>{allRecibosGrupos.length}</div>
          <div className={"text-[10px] mt-1 font-semibold " + (allRecibosGrupos.length > 0 ? "text-red-600" : "text-emerald-600")}>
            {allRecibosGrupos.length > 0 ? "Bs. " + formatBs(totalPendBs) : "Al día ✓"}
          </div>
          <div className="text-[9px] text-slate-400 font-medium mt-0.5">recibos por local</div>
        </div>
        <div className={"rounded-xl border p-4 text-center shadow-sm " + (cuotasVencidas.length > 0 ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200")}>
          <div className={"text-[10px] font-bold uppercase mb-1 " + (cuotasVencidas.length > 0 ? "text-orange-400" : "text-slate-400")}>Cuotas Conv.</div>
          <div className={"text-lg font-bold " + (cuotasVencidas.length > 0 ? "text-orange-700" : "text-slate-700")}>{cuotasData.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">{cuotasVencidas.length} vencidas</div>
        </div>
        <div className={"rounded-xl border p-4 text-center shadow-sm " + (serviciosPendientes.length > 0 ? "bg-purple-50 border-purple-200" : "bg-white border-slate-200")}>
          <div className={"text-[10px] font-bold uppercase mb-1 " + (serviciosPendientes.length > 0 ? "text-purple-400" : "text-slate-400")}>Servicios Esp.</div>
          <div className={"text-lg font-bold " + (serviciosPendientes.length > 0 ? "text-purple-700" : "text-slate-700")}>{serviciosPendientes.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">
            {serviciosPendientes.length > 0 ? "Bs. " + formatBs(totalServiciosBs) : "Sin pendientes"}
          </div>
        </div>
        <div className={"col-span-2 lg:col-span-1 rounded-xl border p-4 text-center shadow-sm " + (pagosPorVerificar.length > 0 ? "bg-amber-500 border-amber-600" : deudaTotalEstimada > 0 ? "bg-red-600 border-red-700" : "bg-emerald-600 border-emerald-700")}>
          <div className="text-[10px] font-bold text-white/80 uppercase mb-1">Deuda Total</div>
          {pagosPorVerificar.length > 0 ? (
            <>
              <div className="text-sm font-bold text-white">⏳ En Verificación</div>
              <div className="text-[10px] text-white/80 mt-1">{pagosPorVerificar.length} pago{pagosPorVerificar.length > 1 ? 's' : ''} por confirmar</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-white">Bs. {formatBs(deudaTotalEstimada)}</div>
              <div className="text-[10px] text-white/60 mt-1">fact + cuotas + servs</div>
            </>
          )}
        </div>
      </div>

      {/* Mis Inmuebles */}
      {/* Deuda en condominios: solo informativa (se paga por la Caja de Condominios) */}
      <DeudaCondominiosPortal identidad={portalDoc} />

      {/* Mis Inmuebles agrupados por Inmueble / Local Físico (como en Caja) */}
      <div className="space-y-4">
        <div className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <h2 className="font-bold text-slate-700 uppercase text-sm tracking-wide">
              Mis Inmuebles Registrados ({clusters.length} {clusters.length === 1 ? 'Inmueble / Local' : 'Inmuebles / Locales'})
            </h2>
          </div>
        </div>

        {displayedClusters.length === 0 ? (
          <div className="bg-white p-8 text-center text-slate-400 text-sm rounded-xl border border-slate-200 shadow-sm">
            No se encontraron inmuebles asociados a su cuenta.
          </div>
        ) : (
          displayedClusters.map((cluster) => {
            const cuotaClusterBs = cluster.totalMmv * tasaBcv;
            const hasMultiple = cluster.count > 1;
            const isExpanded = expandedClusters[cluster.localId] ?? false;

            return (
              <div key={cluster.localId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:border-slate-300 transition-all">
                {/* Cabecera del Inmueble / Local */}
                <div className="bg-slate-50/80 px-4 py-3.5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md text-xs">
                      {cluster.localId}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      cluster.tipo === 'RESIDENCIAL'
                        ? 'bg-sky-100 text-sky-800 border border-sky-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {cluster.tipo === 'RESIDENCIAL' ? '🏠 Residencial' : '🏪 Comercial'}
                    </span>
                    {hasMultiple && (
                      <button
                        type="button"
                        onClick={() => toggleCluster(cluster.localId)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-200 transition-colors cursor-pointer"
                        title={isExpanded ? 'Ocultar actividades' : 'Ver actividades'}
                      >
                        <Layers className="w-3 h-3 text-purple-600" />
                        <span>{cluster.count} Actividades Consolidadas</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-purple-700" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-purple-700" />
                        )}
                      </button>
                    )}
                    <span className="text-xs text-slate-500 flex items-center gap-1 max-w-md truncate" title={cluster.direccion}>
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      {cluster.direccion || 'Sin dirección registrada'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 self-end md:self-auto flex-wrap">
                    {cluster.esCondominio ? (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 whitespace-nowrap flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-purple-600" />
                        Cancela por Condominio
                      </span>
                    ) : (
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Tarifa Asignada</div>
                        <div className="text-sm font-black text-slate-700">{cluster.totalMmv.toFixed(2)} MMV</div>
                        <div className="text-[10px] text-slate-400">{cluster.count > 1 ? `${cluster.count} actividades` : '1 actividad'}</div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadPDF(cluster.localId)}
                      className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded-lg shadow-sm transition-transform active:scale-95 cursor-pointer"
                      title={`Descargar Estado de Cuenta para ${cluster.localId}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Descargar</span> PDF Local
                    </button>
                    {hasMultiple && (
                      <button
                        type="button"
                        onClick={() => toggleCluster(cluster.localId)}
                        className="flex items-center gap-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                        title={isExpanded ? 'Ocultar desglose de actividades' : 'Desplegar actividades'}
                      >
                        <span>{isExpanded ? 'Ocultar' : 'Ver'} ({cluster.count})</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-purple-700" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-purple-700" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner de Condominio Informativo */}
                {cluster.esCondominio && (
                  <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                    <Building className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <strong className="text-amber-900">Inmueble / Local dentro de Condominio:</strong> Este inmueble forma parte de un régimen de condominio centralizado.
                      <p className="text-[11px] text-amber-900/90 leading-relaxed">
                        Para consultar el detalle de su estado de cuenta, solvencia tributaria o aclarar <strong>multas y cuotas correspondientes al condominio</strong>, debe <strong>comunicarse y coordinar directamente con la Junta o Directiva de su Condominio</strong>, la cual administra el servicio y pagos centralizados ante el IAMEC.
                      </p>
                    </div>
                  </div>
                )}

                {/* Contenido: Si tiene múltiples actividades y está colapsado, mostrar barra interactiva */}
                {hasMultiple && !isExpanded ? (
                  <div
                    onClick={() => toggleCluster(cluster.localId)}
                    className="px-4 py-3 bg-slate-50/60 hover:bg-purple-50/60 cursor-pointer flex items-center justify-between transition-colors border-t border-slate-100 group"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>
                        Este local consolida <b>{cluster.count} actividades comerciales</b> ({cluster.totalMmv.toFixed(2)} MMV total). Haga clic para ver el desglose individual.
                      </span>
                    </div>
                    <span className="text-xs font-bold text-purple-700 group-hover:text-purple-900 flex items-center gap-1 shrink-0 ml-2">
                      <span>Desplegar actividades ({cluster.count})</span>
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
                    </span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-slate-50/50 border-b border-slate-100 text-[11px] uppercase text-slate-400 font-semibold">
                        <tr>
                          <th className="px-4 py-2.5">Código Actividad</th>
                          <th className="px-4 py-2.5">Actividad / Uso</th>
                          <th className="px-4 py-2.5 text-right">Factor MMV</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cluster.inms.map((inm: any, idx: number) => {
                          const factor = parseFloat(String(inm.mmv_mes || 0)) || 0;
                          const cant = parseInt(String(inm.cant_inmuebles || 1), 10) || 1;
                          const actClean = cleanClasificacionActividad(inm.actividad_principal || inm.clasificacion || '') || 'Servicio de Aseo Urbano';

                          return (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-700">
                                {inm.inmueble || inm.cod_cont || '-'}
                                {cant > 1 && <span className="text-[10px] text-slate-400 font-normal ml-1">({cant} Unds)</span>}
                              </td>
                              <td className="px-4 py-2.5 text-xs font-medium text-slate-700">
                                {actClean}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-slate-700">
                                {factor.toFixed(2)} MMV {cant > 1 ? `x ${cant}` : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {hasMultiple && (
                      <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Mostrando las <b>{cluster.count}</b> actividades consolidadas de este local.</span>
                        <button
                          type="button"
                          onClick={() => toggleCluster(cluster.localId)}
                          className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Ocultar actividades</span>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Servicios Especiales Pendientes */}
      {serviciosPendientes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-purple-200 overflow-hidden">
          <div className="bg-purple-50 px-4 py-3 border-b border-purple-200 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-purple-500" />
            <h3 className="font-bold text-purple-700 uppercase text-sm tracking-wide">Servicios Especiales / Inspecciones Asignados</h3>
            <span className="ml-auto text-xs font-bold text-purple-600">Total: Bs. {formatBs(totalServiciosBs)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-purple-50/50 border-b border-purple-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3 text-center">Fecha</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serviciosPendientes.map((s: any, i: number) => {
                  const Icon = TIPO_ICON[s.tipo] || Wrench;
                  const estadoColor = s.estado === 'Pendiente' ? 'bg-red-100 text-red-700' : s.estado === 'Por Verificar' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600';
                  return (
                    <tr key={i} className="hover:bg-purple-50/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-purple-600">
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-xs font-semibold">{TIPO_LABEL[s.tipo] || s.tipo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{s.descripcion}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.referencia || '--'}</td>
                      <td className="px-4 py-3 text-center text-xs">{s.fecha}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={"px-2 py-0.5 rounded-full text-[10px] font-bold " + estadoColor}>{s.estado}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-purple-700">Bs. {formatBs(parseFloat(s.monto || '0'))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-purple-50/50 px-4 py-2 border-t border-purple-100 text-xs text-purple-600 text-center">
            💡 Para cancelar estos servicios, diríjase a la oficina de Aseo Urbano o pague desde el menú <strong>Pagar</strong>.
          </div>
        </div>
      )}

      {/* Recibos Pendientes por Local */}
      {allRecibosGrupos.length > 0 && (() => {
        const targetGrupos = selectedLocal === 'TODOS'
          ? allRecibosGrupos
          : allRecibosGrupos.filter(g => g.localId === selectedLocal);

        const currentPendBs = targetGrupos.reduce((acc: number, g: any) => acc + g.totalBs, 0);
        const targetItems = targetGrupos.flatMap(g => g.items.map(it => it.recibo));
        const ivaTot = targetItems.reduce((s: number, f: any) => s + getReciboBreakdown(f).ivaMes, 0);
        const retTot = targetItems.reduce((s: number, f: any) => s + getReciboBreakdown(f).retencionMes, 0);
        const recibosGrupos = targetGrupos;

        return (
          <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
            <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h3 className="font-bold text-red-700 uppercase text-sm tracking-wide">
                Recibos Pendientes {selectedLocal !== 'TODOS' ? `(${selectedLocal})` : ''}
              </h3>
              <span className="ml-auto text-xs font-bold text-red-600">Total a Cancelar: Bs. {formatBs(retTot > 0 ? (currentPendBs - retTot) : currentPendBs)}</span>
            </div>
            {retTot > 0 && (
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-red-100 text-xs">
                <div className="bg-blue-50 border border-blue-100 rounded px-2 py-1.5"><span className="block text-blue-700 font-semibold">Subtotal Facturado</span><span className="font-black text-blue-900">Bs. {formatBs(currentPendBs)}</span></div>
                <div className="bg-amber-50 border border-amber-100 rounded px-2 py-1.5"><span className="block text-amber-700 font-semibold">IVA retenido 75% (Agente de Retención)</span><span className="font-black text-amber-900">- Bs. {formatBs(retTot)}</span></div>
                <div className="bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5"><span className="block text-emerald-700 font-semibold">Total neto a cancelar</span><span className="font-black text-emerald-900">Bs. {formatBs(currentPendBs - retTot)}</span></div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-red-50/50 border-b border-red-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Referencia / Local</th>
                    <th className="px-4 py-3">Mes / Local</th>
                    <th className="px-4 py-3 text-center">Vencimiento</th>
                    <th className="px-4 py-3 text-right">Monto (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recibosGrupos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">
                        No hay recibos pendientes registrados para este local.
                      </td>
                    </tr>
                  ) : (
                    recibosGrupos.map((g) => {
                      const isMulti = g.items.length > 1;
                      const isExpanded = !!expandedGroups[g.key];
                      const primaryItem = g.items[0];

                      return (
                        <Fragment key={g.key}>
                          <tr
                            className={`hover:bg-red-50/20 transition-colors ${isMulti ? 'cursor-pointer' : ''}`}
                            onClick={() => isMulti && toggleGroup(g.key)}
                          >
                            <td className="px-4 py-3 font-mono text-slate-700 text-xs">
                              {isMulti ? (
                                <div>
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <span>Local: {g.localId}</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                      N/A ({g.items.length} act.)
                                    </span>
                                  </div>
                                  <span className="block text-[10px] text-slate-400 font-sans mt-0.5 line-clamp-1">
                                    {g.cluster?.direccion && g.cluster.direccion !== '0 0' ? g.cluster.direccion : 'Múltiples actividades comerciales'}
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span className="font-semibold text-slate-800">{primaryItem.referencia}</span>
                                  {g.cluster && clusters.length > 1 && (
                                    <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                                      Local: {g.localId}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-sm text-slate-900">{g.periodo}</div>
                                  {isMulti ? (
                                    <div className="text-[11px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
                                      <span>Local {g.localId} · {g.items.length} Actividades Comerciales</span>
                                    </div>
                                  ) : (
                                    primaryItem.inmueble && (
                                      <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                                        {primaryItem.inmueble.inmueble}{primaryItem.inmuDesc ? ` · ${primaryItem.inmuDesc}` : ''}
                                      </div>
                                    )
                                  )}
                                </div>
                                {isMulti && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); toggleGroup(g.key); }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors whitespace-nowrap"
                                  >
                                    <span>{isExpanded ? 'Ocultar' : 'Ver actividades'}</span>
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-red-600 text-xs font-semibold whitespace-nowrap">
                              {formatFechaClean(g.vencimiento)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-red-700 whitespace-nowrap">
                              {g.isEnVerificacion ? (
                                <span className="text-emerald-600 text-xs font-bold">En Verificación</span>
                              ) : (
                                `Bs. ${g.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              )}
                            </td>
                          </tr>
                          {isMulti && isExpanded && (
                            <tr className="bg-slate-50/70 border-b border-slate-200">
                              <td colSpan={4} className="px-6 py-3">
                                <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-inner">
                                  <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-2 flex items-center gap-1.5">
                                    <Store className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Desglose de Actividades Comerciales del Local {g.localId}:</span>
                                  </div>
                                  <div className="divide-y divide-slate-100 text-xs">
                                    {g.items.map((item, idx) => (
                                      <div key={idx} className="py-1.5 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-bold text-slate-700">
                                            {item.inmueble?.inmueble || item.referencia}
                                          </span>
                                          <span className="text-slate-300">|</span>
                                          <span className="text-slate-600 font-medium">
                                            {item.inmuDesc || 'Actividad Comercial'}
                                          </span>
                                          <span className="text-[10px] text-slate-400 font-mono">
                                            ({item.referencia})
                                          </span>
                                        </div>
                                        <div className="font-bold text-slate-800 whitespace-nowrap">
                                          Bs. {item.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Cuotas de Convenio */}
      {cuotasData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
          <div className="bg-orange-50 px-4 py-3 border-b border-orange-200 flex items-center gap-2">
            <Handshake className="w-4 h-4 text-orange-500" />
            <h3 className="font-bold text-orange-700 uppercase text-sm tracking-wide">Cuotas de Convenio de Pago</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-orange-50/50 border-b border-orange-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Convenio</th>
                  <th className="px-4 py-3">Cuota</th>
                  <th className="px-4 py-3 text-center">Fecha</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cuotasData.map((c, i) => (
                  <tr key={i} className={"transition-colors " + (c.vencida ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-orange-50/20')}>
                    <td className="px-4 py-3 font-mono text-slate-700">{c.conv}</td>
                    <td className="px-4 py-3 text-center">#{c.cuota}</td>
                    <td className="px-4 py-3 text-center text-xs">{c.fecha}</td>
                    <td className="px-4 py-3 text-center">
                      {c.vencida ? <span className="text-red-600 font-bold text-xs">VENCIDA</span> : <span className="text-blue-600 text-xs">Próxima</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-orange-700">Bs. {formatBs(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de Pagos */}
      {pagadas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-emerald-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-emerald-700 uppercase text-sm tracking-wide">Últimos Pagos</h3>
            <span className="ml-auto text-xs text-emerald-500">(últimos 10)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-emerald-50/50 border-b border-emerald-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3">Mes</th>
                  <th className="px-4 py-3 text-center">Fecha Pago</th>
                  <th className="px-4 py-3 text-right">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagadas.map((f: any, i: number) => (
                  <tr key={i} className="hover:bg-emerald-50/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-700">{f.referencia}</td>
                    <td className="px-4 py-3 font-medium">{mesLabel(f.emision)}</td>
                    <td className="px-4 py-3 text-center text-xs text-emerald-600">{f.fecha_pago || f.updated_at?.split('T')[0] || 'N/A'}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{f.monto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de Servicios Especiales */}
      {serviciosEsp.filter((s: any) => s.estado === 'Pagado').length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-emerald-200 overflow-hidden mt-6">
          <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-emerald-700 uppercase text-sm tracking-wide">Historial de Servicios Especiales</h3>
            <span className="ml-auto text-xs text-emerald-500">Procesados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-emerald-50/50 border-b border-emerald-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serviciosEsp.filter((s: any) => s.estado === 'Pagado').map((s: any, i: number) => (
                  <tr key={i} className="hover:bg-emerald-50/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-emerald-700 font-semibold capitalize">{s.tipo?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-slate-700 text-xs">{s.descripcion}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                        {s.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">Bs. {Number(s.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sin datos */}
      {misInmuebles.length === 0 && pendientes.length === 0 && pagadas.length === 0 && serviciosPendientes.length === 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-10 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No se encontraron registros para su cuenta.</p>
          <p className="text-xs text-slate-400 mt-1">Si cree que esto es un error, comuníquese con la oficina de aseo urbano.</p>
        </div>
      )}
    </div>
  );
}

