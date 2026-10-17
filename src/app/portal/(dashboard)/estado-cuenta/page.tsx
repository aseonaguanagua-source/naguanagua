'use client';
import DeudaCondominiosPortal from '@/components/DeudaCondominiosPortal';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { Download, FileText, Building, Building2, MapPin, Store, Layers, Filter, Handshake, AlertCircle, CheckCircle2, Wrench, ClipboardCheck, ShieldCheck, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';
import { getFAR, isResidencialInm, isTerrenoInm, calcularMensualidad, cleanClasificacionActividad, isCondominioPagoIndividual } from '@/lib/calculos';
import { calcularDeudaInmueble, porMesConRetencion, esUltimoMesHist, reglaCobroInmueble } from '@/lib/deudaMensual';
import { construirRecibosContribuyente, desgloseReciboCM, ESTADOS_RECIBO_PENDIENTE } from '@/lib/recibosContribuyente';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';
import { groupInmueblesByLocal, InmuebleClusterGroup } from '@/lib/cajaHelpers';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';
import { exportToExcelWithLogos } from '@/lib/excelExport';

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

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
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
          setMisInmueblesDb([
            ...rc.billables,
            ...allInms.filter(i => (i.condominio_padre_id || i.es_condominio) && !isTerrenoInm(i) && !rc.naCodes.includes(i.inmueble))
          ]);
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
          const { data: convenios } = await supabase.from('convenios').select('*')
            .or(orFilter)
            .in('estado', ['Al Día', 'Activo']);
          if (convenios) {
            const hoy = new Date().toISOString().split('T')[0];
            const cuotas: any[] = [];
            for (const conv of convenios) {
              let parsed: any[] = [];
              try { parsed = JSON.parse(conv.detalle_cuotas || '[]'); } catch {}
              parsed.forEach((c: any) => {
                if (c.estado === 'Pendiente') {
                  cuotas.push({ conv: conv.numero, cuota: c.id + 1, fecha: c.fecha, vencida: c.fecha <= hoy, monto: parseFloat(c.monto) || 0 });
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
      return portalDoc && (id === docNorm || idFmt2 === docFmt || id === portalDoc.toUpperCase() || id === soloNum);
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
    const meses = histRefs.map((x: any) => ({ emision: x.emision || new Date().toISOString(), esUltimo: esUltimoMesHist(x.referencia, inm) }));
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
      if (pm) baseMonto = pm.totalNeto;
    } else if (r.referencia?.startsWith('CM-')) {
      // Igual a Caja (base + IVA + multa por mora), con retención del 75% del IVA para agentes
      const d = desgloseReciboCM(r, inmsSource, currentRate);
      baseMonto = Math.round((d.total - d.ivaRetenible * 0.75) * 100) / 100;
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
    let totalMes = 0;      // lo que va a cancelar

    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const pm = histMes(r);
      if (pm) {
        baseMes = pm.base;
        multaMes = pm.multa;
        ivaMes = pm.iva;
        retencionMes = pm.retencion;
        totalMes = pm.totalNeto;
      }
    } else if (r.referencia?.startsWith('CM-')) {
      const d = desgloseReciboCM(r, inmsSource, currentRate);
      baseMes = d.base; multaMes = d.multa; ivaMes = d.iva;
      retencionMes = Math.round(d.ivaRetenible * 0.75 * 100) / 100;
      totalMes = Math.round((d.total - retencionMes) * 100) / 100;
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
    // Excluir cualquier inmueble que pertenezca a condominio centralizado (no individual)
    const matched = misInmuebles.find((i: any) => i.inmueble && (ref.includes(String(i.inmueble).toUpperCase()) || inmId === String(i.inmueble).toUpperCase()));
    if (matched && !isCondominioPagoIndividual(matched) && !isCondominioPagoIndividual(matched.condominio_padre_id) && (
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

  // Calculos
  const totalMensual = misInmuebles.reduce((acc: number, inm: any) => {
    const factor = parseFloat(inm.mmv_mes) || 0;
    const cant = parseInt(inm.cant_inmuebles) || 1;
    return acc + factor * cant * tasaBcv;
  }, 0);

  const totalPendBs = pendientes.reduce((acc: number, f: any) => {
    const m = parseFloat(getReciboMonto(f)) || 0;
    return acc + m;
  }, 0);

  const cuotasVencidas = cuotasData.filter(c => c.vencida);
  const totalCuotas = cuotasVencidas.reduce((a, c) => a + c.monto, 0);

  const serviciosPendientes = serviciosEsp.filter(s => s.estado !== 'Pagado');
  const totalServiciosBs = serviciosPendientes.reduce((a: number, s: any) => a + (parseFloat(s.monto) || 0), 0);

  const deudaTotalEstimada = totalPendBs + totalCuotas + totalServiciosBs;

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


  const handleDownloadPDF = (targetLocalId?: string) => {
    if (!portalDoc) return;
    const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
    const myContribuyente = contribuyentes?.find((c: any) => (c.Identidad || '').replace(/-/g, '').toUpperCase() === docNorm);

    const viewData = {
      Contribuyente: contribuyenteMaster?.nombre || misInmuebles[0]?.contribuyente || myContribuyente?.Contribuyente || localStorage.getItem('portal_user') || '',
      Identidad: portalDoc,
      Telefono: contribuyenteMaster?.telefono || misInmuebles[0]?.telefono || myContribuyente?.Telefono || '',
      Direccion: contribuyenteMaster?.direccion || misInmuebles[0]?.direccion || myContribuyente?.Direccion || ''
    };

    // Determinar qué locales procesar: si se especifica uno (o selectedLocal !== 'TODOS'), solo ese local
    const target = targetLocalId || selectedLocal;
    const clustersToProcess = (target && target !== 'TODOS')
      ? clusters.filter(c => c.localId === target)
      : clusters;

    if (clustersToProcess.length === 0) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let pageAdded = false;

    clustersToProcess.forEach((cluster, idx) => {
      if (pageAdded) doc.addPage();
      pageAdded = true;
      const today = new Date();
      const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const docNro = Math.floor(10000 + Math.random() * 90000);

      // ── LOGOS ──
      try { doc.addImage(logos.iamec, 'PNG', 14, 10, 38, 20, undefined, 'FAST'); } catch(e) {}

      // ── TITLE ──
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('ESTADO DE CUENTA', 105, 17, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(220, 38, 38);
      doc.text(`TASA VIGENTE HASTA: ${tasaVigente}`, 105, 24, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      // ── HORIZONTAL LINE ──
      doc.setLineWidth(0.3);
      doc.line(14, 32, 196, 32);

      // ── GENERATED BY + NUMBER ──
      const cajeroGuardado = typeof window !== 'undefined' ? localStorage.getItem('portal_user') || viewData.Contribuyente : viewData.Contribuyente;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text(`Generado por: ${cajeroGuardado}`, 14, 38);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nro.: ${docNro}`, 196, 38, { align: 'right' });

      // ── LINE ──
      doc.line(14, 41, 196, 41);

      // ── INMUEBLE INFO ROW ──
      const uso = cluster.count > 1
        ? `${cluster.count} Actividades Consolidadas (${cluster.tipo})`
        : (cleanClasificacionActividad(cluster.inms[0]?.actividad_principal || cluster.inms[0]?.clasificacion || '') || 'Servicio de Aseo Urbano');
      const codInm = cluster.localId;
      const area = (cluster.parentInm?.area || cluster.inms[0]?.area) ? `${cluster.parentInm?.area || cluster.inms[0]?.area} Mt2` : '—';

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Código:', 14, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(codInm, 30, 47);
      doc.setFont('helvetica', 'normal');
      doc.text('Actividad:', 60, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(uso.slice(0, 24), 76, 47);
      doc.setFont('helvetica', 'normal');
      doc.text('Área Operativa:', 115, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(area, 142, 47);
      doc.setFont('helvetica', 'normal');
      doc.text('Identidad:', 162, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(viewData.Identidad, 179, 47);

      // ── NOMBRE/RAZÓN SOCIAL ──
      doc.setFont('helvetica', 'normal');
      doc.text('Nombre o Razón Social:', 14, 54);
      doc.setFont('helvetica', 'bold');
      doc.text(viewData.Contribuyente, 60, 54);

      // ── DIRECCIÓN INMUEBLE ──
      doc.setFont('helvetica', 'normal');
      const dirInm = cluster.direccion || viewData.Direccion || '';
      const splitDir = doc.splitTextToSize(`Dirección Inmueble: ${dirInm}`, 182);
      doc.text(splitDir, 14, 60);

      let y = 60 + splitDir.length * 5 + 5;

      // ── LINE ──
      doc.line(14, y, 196, y);
      y += 6;

      // ── ESTADO DE CUENTA RESUMIDO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('ESTADO DE CUENTA RESUMIDO', 105, y, { align: 'center' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 6;

      // Identificar códigos del cluster para recibos
      const clusterCodes = new Set([
        cluster.localId,
        ...cluster.inms.map(i => i.inmueble).filter(Boolean),
        ...cluster.inms.map((i: any) => i.cod_cont).filter(Boolean)
      ]);

      const miembroDe = (f: any) => cluster.inms.find((m: any) => m.inmueble && String(f.referencia || '').includes(m.inmueble));
      const inmRecibos = pendientes.filter((f: any) => {
        if (!f.referencia) return true;
        if (f.referencia.startsWith('RECIB-HIST-')) {
          const parts = f.referencia.split('-');
          return clusterCodes.has(parts[2]);
        }
        if (f.referencia.startsWith('CM-')) {
          return Array.from(clusterCodes).some(code => f.referencia.includes(code));
        }
        if (f.inmueble) {
          return clusterCodes.has(f.inmueble);
        }
        return clustersToProcess.length === 1;
      });

      const calcMonto = (f: any): number => {
        return parseFloat(getReciboMonto(f)) || 0;
      };

      const sumBaseInm = inmRecibos.reduce((s: number, f: any) => s + getReciboBreakdown(f).baseMes, 0);
      const sumMultaInm = inmRecibos.reduce((s: number, f: any) => s + getReciboBreakdown(f).multaMes, 0);
      const sumIvaInm = inmRecibos.reduce((s: number, f: any) => s + getReciboBreakdown(f).ivaMes, 0);
      const sumRetInm = inmRecibos.reduce((s: number, f: any) => s + getReciboBreakdown(f).retencionMes, 0);
      let totalInm = inmRecibos.reduce((s: number, f: any) => s + calcMonto(f), 0);
      if (idx === 0) totalInm += totalServiciosBs;

      const mesesArr = [...new Set(inmRecibos.map((f: any) => mesLabel(f.emision).toUpperCase()).filter(Boolean))];
      let periodosLabel = 'Solvente / Al Día';
      if (mesesArr.length === 1) {
        periodosLabel = mesesArr[0];
      } else if (mesesArr.length > 1) {
        periodosLabel = `${mesesArr[0]} a ${mesesArr[mesesArr.length - 1]} (${mesesArr.length} meses)`;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const resumenRows = [
        [`Períodos Calculados:`, periodosLabel],
        ['Monto Recolección Aseo Urbano Bs.', `Bs. ${sumBaseInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
      ];
      if (sumMultaInm > 0) {
        resumenRows.push(['Monto Interés / Multa por Mora Bs.', `Bs. ${sumMultaInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      }
      if (idx === 0 && totalServiciosBs > 0) {
        resumenRows.push(['Monto Servicios Especiales Bs.', `Bs. ${totalServiciosBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      }
      const esRes = cluster.tipo === 'RESIDENCIAL';
      if (esRes) {
        resumenRows.push(['Total Exento Bs.', `Bs. ${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      } else {
        resumenRows.push(
          ['Base Imponible Bs.', `Bs. ${sumBaseInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['IVA (16.00%) Bs.', `Bs. ${sumIvaInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        );
      }
      resumenRows.push(['Total estado de cuenta Bs.', `Bs. ${(totalInm + sumRetInm).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      if (sumRetInm > 0) {
        resumenRows.push(
          ['IVA Retenido 75% (Agente de Retención) Bs.', `- Bs. ${sumRetInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['IVA a Cancelar (25%) Bs.', `Bs. ${(sumIvaInm - sumRetInm).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
        );
      }

      resumenRows.forEach(([label, value]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(label, 14, y);
        doc.setFont('helvetica', 'bold');
        const valLines = doc.splitTextToSize(value, 110);
        doc.text(valLines, 196, y, { align: 'right' });
        y += Math.max(5, valLines.length * 4.5);
      });

      // ── LINE ──
      doc.line(14, y, 196, y);
      y += 6;

      // ── TOTAL A PAGAR ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(sumRetInm > 0 ? 'TOTAL A CANCELAR (con retención de IVA)' : 'TOTAL A PAGAR', 14, y);
      doc.text(`Bs. ${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 196, y, { align: 'right' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 8;

      // ── ESTADO DE CUENTA DETALLADO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('ESTADO DE CUENTA DETALLADO', 105, y, { align: 'center' });
      y += 4;

      const detalleRows = inmRecibos.map((f: any) => {
        const b = getReciboBreakdown(f);
        const monto = calcMonto(f);
        const mInm: any = miembroDe(f) || cluster.inms[0];
        const actClean = cleanClasificacionActividad(mInm?.actividad_principal || mInm?.clasificacion || '');
        const det = actClean ? `Aseo ${actClean}` : (cluster.count > 1 ? `Aseo ${cluster.localId}` : 'Servicio de Aseo Urbano');
        const esMulta = String(f.referencia || '').startsWith('MULTA-');
        const periodoDate = esMulta ? 'MULTA MUNICIPAL' : (mesLabel(f.emision) || '—');
        return [
          periodoDate,
          det,
          b.baseMes.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
          b.multaMes.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
          b.ivaMes.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
          b.retencionMes > 0 ? `- ${b.retencionMes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : '0,00',
          monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })
        ];
      });

      if (idx === 0 && serviciosPendientes.length > 0) {
        serviciosPendientes.forEach(s => {
          const montoServicio = parseFloat(s.monto) || 0;
          detalleRows.push([
            mesLabel(s.fecha) || '—',
            (TIPO_LABEL[s.tipo] || 'Serv. Especial') + ': ' + (s.descripcion || ''),
            montoServicio.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
            '0,00', '0,00', '0,00',
            montoServicio.toLocaleString('es-VE', { minimumFractionDigits: 2 })
          ]);
        });
      }

      try {
        autoTable(doc, {
          startY: y,
          head: [['PERIODO', 'DETALLE', 'RECOLECCIÓN', 'MULTA', 'IVA 16%', 'IVA RETENIDO', 'A CANCELAR BS']],
          body: detalleRows,
          theme: 'grid',
          headStyles: { fillColor: [255, 255, 255], textColor: [0,0,0], fontStyle: 'bold', lineColor: [0,0,0], lineWidth: 0.3, halign: 'center' },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 32, halign: 'center' },
            1: { cellWidth: 38 },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right', fontStyle: 'bold' }
          }
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      } catch(e) {}

      // ── INFORMACIÓN DE PAGO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('INFORMACIÓN PARA PAGOS Y TRANSFERENCIAS', 105, y, { align: 'center' });
      y += 5;
      doc.line(14, y, 196, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('1) Banco: BANCAMIGA (0172)  |  Cta: 01720110711101340717  |  Titular: IAMEC BANCAMIGA  |  RIF: G-200086149', 14, y);
      y += 4.5;
      doc.text('2) Banco: BANESCO (0134)    |  Cta: 01341089590001008636  |  Titular: IAMEC BANESCO    |  RIF: G-200086149', 14, y);
      y += 5.5;
      doc.setFont('helvetica', 'italic');
      doc.text('Transferencias oficiales a nombre de: Instituto Autónomo Municipal de Ecosocialismo (IAMEC)', 14, y);
    });

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

    const fileSuffix = clustersToProcess.length === 1 ? clustersToProcess[0].localId : 'Consolidado';
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cuota Mensual</div>
          <div className="text-lg font-bold text-slate-800">Bs. {formatBs(totalMensual)}</div>
          <div className="text-[10px] text-slate-400 mt-1">tasa: {tasaBcv.toFixed(2)}</div>
        </div>
        <div className={"rounded-xl border p-4 text-center shadow-sm " + (pendientes.length > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200")}>
          <div className={"text-[10px] font-bold uppercase mb-1 " + (pendientes.length > 0 ? "text-red-400" : "text-emerald-400")}>Recibos Pend.</div>
          <div className={"text-lg font-bold " + (pendientes.length > 0 ? "text-red-700" : "text-emerald-700")}>{pendientes.length}</div>
          <div className={"text-[10px] mt-1 " + (pendientes.length > 0 ? "text-red-500" : "text-emerald-500")}>
            {pendientes.length > 0 ? "Bs. " + formatBs(totalPendBs) : "Al día ✓"}
          </div>
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
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                const rows: any[] = [];
                clusters.forEach((cluster) => {
                  cluster.inms.forEach((inm) => {
                    const factor = parseFloat(String(inm.mmv_mes || 0)) || 0;
                    const cant = parseInt(String(inm.cant_inmuebles || 1), 10) || 1;
                    const cuotaBs = factor * cant * tasaBcv;
                    const actClean = cleanClasificacionActividad(inm.actividad_principal || inm.clasificacion || '') || 'Servicio de Aseo Urbano';
                    rows.push({
                      'Local / Inmueble': cluster.localId,
                      'Código Actividad': inm.inmueble || (inm as any).cod_cont || '-',
                      'Tipo': cluster.tipo,
                      'Actividad / Uso': actClean,
                      'Dirección': cluster.direccion || 'Sin dirección',
                      'Factor (MMV)': factor.toFixed(2),
                      'Cant': cant,
                      'Cuota Mensual (Bs)': formatBs(cuotaBs)
                    });
                  });
                });
                exportToExcelWithLogos(rows, `Desglose_Inmuebles_${portalDoc}.xlsx`, 'Desglose Inmuebles');
              }}
              className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-lg shadow-sm transition-transform active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Descargar Desglose Excel
            </button>
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
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        <Layers className="w-3 h-3" />
                        {cluster.count} Actividades Consolidadas
                      </span>
                    )}
                    <span className="text-xs text-slate-500 flex items-center gap-1 max-w-md truncate" title={cluster.direccion}>
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      {cluster.direccion || 'Sin dirección registrada'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto">
                    {cluster.esCondominio ? (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 whitespace-nowrap flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-purple-600" />
                        Cancela por Condominio
                      </span>
                    ) : (
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Cuota Local</div>
                        <div className="text-sm font-black text-emerald-700">Bs. {formatBs(cuotaClusterBs)}</div>
                        <div className="text-[10px] text-slate-400">{cluster.totalMmv.toFixed(2)} MMV</div>
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
                  </div>
                </div>

                {/* Banner de Condominio Informativo */}
                {cluster.esCondominio && (
                  <div className="px-4 py-2.5 bg-purple-50/90 border-b border-purple-200 text-xs text-purple-900 flex items-center gap-2">
                    <Building className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <strong>Régimen de Condominio:</strong> Este inmueble cancela el servicio de aseo urbano a través de la administración del condominio. No genera cobranza individual en este portal.
                    </div>
                  </div>
                )}

                {/* Tabla de Actividades / Unidades pertenecientes a este Inmueble */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50/50 border-b border-slate-100 text-[11px] uppercase text-slate-400 font-semibold">
                      <tr>
                        <th className="px-4 py-2.5">Código Actividad</th>
                        <th className="px-4 py-2.5">Actividad / Uso</th>
                        <th className="px-4 py-2.5 text-center">Factor</th>
                        <th className="px-4 py-2.5 text-right">Cuota Mensual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cluster.inms.map((inm: any, idx: number) => {
                        const factor = parseFloat(String(inm.mmv_mes || 0)) || 0;
                        const cant = parseInt(String(inm.cant_inmuebles || 1), 10) || 1;
                        const cuotaBs = factor * cant * tasaBcv;
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
                            <td className="px-4 py-2.5 text-center text-xs text-slate-500">
                              {factor.toFixed(2)} MMV {cant > 1 ? `x ${cant}` : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-700">
                              Bs. {formatBs(cuotaBs)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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

      {/* Recibos Pendientes */}
      {pendientes.length > 0 && (() => {
        const targetPendientes = selectedLocal === 'TODOS'
          ? pendientes
          : (() => {
              const currentCluster = clusters.find(c => c.localId === selectedLocal);
              if (!currentCluster) return pendientes;
              const clusterCodes = new Set([
                currentCluster.localId,
                ...currentCluster.inms.map(i => i.inmueble).filter(Boolean),
                ...currentCluster.inms.map((i: any) => i.cod_cont).filter(Boolean)
              ]);
              return pendientes.filter((f: any) => {
                if (!f.referencia) return true;
                if (f.referencia.startsWith('RECIB-HIST-')) {
                  const parts = f.referencia.split('-');
                  return clusterCodes.has(parts[2]);
                }
                if (f.referencia.startsWith('CM-')) {
                  return Array.from(clusterCodes).some(code => f.referencia.includes(code));
                }
                if (f.inmueble) return clusterCodes.has(f.inmueble);
                return false;
              });
            })();

        const currentPendBs = targetPendientes.reduce((acc: number, f: any) => acc + (parseFloat(getReciboMonto(f)) || 0), 0);
        const ivaTot = targetPendientes.reduce((s: number, f: any) => s + getReciboBreakdown(f).ivaMes, 0);
        const retTot = targetPendientes.reduce((s: number, f: any) => s + getReciboBreakdown(f).retencionMes, 0);

        // Agrupar los recibos pendientes por Local (Cluster / N/A) y por Período/Mes
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

        const sortedPendientes = [...targetPendientes].sort((a: any, b: any) => 
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

        const recibosGrupos = Array.from(groupsMap.values());

        return (
          <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
            <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h3 className="font-bold text-red-700 uppercase text-sm tracking-wide">
                Recibos Pendientes {selectedLocal !== 'TODOS' ? `(${selectedLocal})` : ''}
              </h3>
              <span className="ml-auto text-xs font-bold text-red-600">Total: Bs. {formatBs(currentPendBs)}</span>
            </div>
            {retTot > 0 && (
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-red-100 text-xs">
                <div className="bg-blue-50 border border-blue-100 rounded px-2 py-1.5"><span className="block text-blue-700 font-semibold">IVA completo (16%)</span><span className="font-black text-blue-900">Bs. {formatBs(ivaTot)}</span></div>
                <div className="bg-amber-50 border border-amber-100 rounded px-2 py-1.5"><span className="block text-amber-700 font-semibold">IVA retenido 75% (Agente de Retención)</span><span className="font-black text-amber-900">- Bs. {formatBs(retTot)}</span></div>
                <div className="bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5"><span className="block text-emerald-700 font-semibold">Total a cancelar</span><span className="font-black text-emerald-900">Bs. {formatBs(currentPendBs)}</span></div>
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

