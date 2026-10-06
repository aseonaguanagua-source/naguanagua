'use client';
import { useState, useEffect, useMemo } from 'react';
import { Download, FileText, Building, Handshake, AlertCircle, CheckCircle2, Wrench, ClipboardCheck, ShieldCheck, FlaskConical } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';
import { getFAR, isResidencialInm, calcularMensualidad, cleanClasificacionActividad, isCondominioPagoIndividual } from '@/lib/calculos';
import { calcularDeudaInmueble, porMesConRetencion, esUltimoMesHist, reglaCobroInmueble } from '@/lib/deudaMensual';
import { getIdentidadVariants } from '@/lib/formatters';
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
  const [misFactDb, setMisFactDb] = useState<any[]>([]);
  const [cuotasData, setCuotasData] = useState<any[]>([]);
  const [serviciosEsp, setServiciosEsp] = useState<any[]>([]);
  const [pagosPorVerificar, setPagosPorVerificar] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fullDoc = localStorage.getItem('portal_doc') || '';
    setPortalDoc(fullDoc);

    const fetchAll = async () => {
      try {
        if (fullDoc) {
          const variants = getIdentidadVariants(fullDoc);
          const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

          // 1. Inmuebles
          let { data: inmsDB } = await supabase
            .from('inmuebles')
            .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
            .or(orFilter);

          let inmsFinal = inmsDB ? [...inmsDB] : [];
          const isCondo = inmsFinal.some(i => i.es_condominio === true || (i.actividad_principal || '').toLowerCase().includes('condominio'));
          if (isCondo) {
            const condoCodes = inmsFinal.map(i => i.inmueble).filter(Boolean);
            if (condoCodes.length > 0) {
              const { data: hijos } = await supabase
                .from('inmuebles')
                .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
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
          const finalInms = billableInms.length > 0 ? billableInms : inmsFinal;
          setMisInmueblesDb(finalInms);

          // 2. Facturas
          const { data: facturasDB } = await supabase
            .from('facturas')
            .select('*')
            .or(orFilter)
            .order('emision', { ascending: true });

          let combined = facturasDB ? [...facturasDB] : [];

          // Generar recibos dummy mensuales si no hay facturas reales (exactamente igual a Caja y Cobro Movil)
          if (combined.length === 0 && finalInms.length > 0) {
            const hasDeuda = finalInms.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
            if (hasDeuda) {
              const now = new Date();
              finalInms.forEach((inm: any) => {
                const deudaMMV = parseFloat(inm.deuda_mmv || '0');
                const congelada = parseFloat(inm.deuda_congelada_bs || '0');
                const multa = parseFloat(inm.multa_bs || '0');
                const meses = parseInt(inm.meses_deuda || 1);
                // Regla de condominios (igual a Caja): local de condominio comercial ordinario → solo sus multas.
                // Los condominios especiales de pago individual pagan aseo + multas.
                const regla = reglaCobroInmueble(inm, naParentCodes, fullDoc);
                if (regla === 'solo_multa' || (isCondominioPagoIndividual(inm) && (multa > 0 || congelada > 0))) {
                  if (multa > 0 || congelada > 0) {
                    const fechaMora = new Date(now.getFullYear(), now.getMonth() - 2, 1, 12, 0, 0);
                    combined.push({
                      id: `multa-${inm.inmueble}`,
                      referencia: `MULTA-${inm.inmueble}`,
                      identidad: fullDoc,
                      contribuyente: inm.contribuyente || '',
                      emision: fechaMora.toISOString(),
                      vencimiento: fechaMora.toISOString(),
                      estado: 'Pendiente',
                      monto: (multa + congelada).toFixed(2)
                    });
                  }
                  if (regla === 'solo_multa') return;
                }
                if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {
                  const numMeses = Math.max(1, meses);
                  for (let i = 1; i <= numMeses; i++) {
                    const targetDate = new Date(now.getFullYear(), now.getMonth() - numMeses + i - 1, 1, 12, 0, 0);
                    combined.push({
                      id: `dummy-hist-${inm.inmueble}-${i}`,
                      referencia: `RECIB-HIST-${inm.inmueble}-M${i}`,
                      identidad: fullDoc,
                      contribuyente: inm.contribuyente || '',
                      emision: targetDate.toISOString(),
                      vencimiento: targetDate.toISOString(),
                      estado: 'Pendiente',
                      monto: '0'
                    });
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
      const id = (inm.identidad || '').replace(/-/g, '').toUpperCase();
      const idFmt2 = id.charAt(0) + '-' + id.slice(1);
      return portalDoc && (id === docNorm || idFmt2 === docFmt || id === portalDoc.toUpperCase() || id === soloNum);
    });
  }, [misInmueblesDb, inmuebles, portalDoc]);

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
      const matched = inmsSource.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
      const inm = matched || inmsSource[0];
      if (inm) {
        const esRes = isResidencialInm(inm);
        const baseMes = parseFloat(calcularMensualidad(inm, currentRate).toFixed(2));
        const ivaMes = esRes ? 0 : parseFloat((baseMes * 0.16).toFixed(2));
        const ivaPagar = inm.agente_retencion ? ivaMes * 0.25 : ivaMes;
        baseMonto = baseMes + ivaPagar;
      }
    } else if (r.referencia?.startsWith('RECIB-')) {
      let totalDeudaMMV = 0;
      let totalCongelada = 0;
      inmsSource.forEach((inm: any) => { totalDeudaMMV += parseFloat(inm.deuda_mmv || 0); totalCongelada += parseFloat(inm.deuda_congelada_bs || 0); });
      if (totalDeudaMMV > 0 || totalCongelada > 0) baseMonto = (totalDeudaMMV * currentRate) + totalCongelada;
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
      const matched = inmsSource.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
      const inm = matched || inmsSource[0];
      if (inm) {
        const esRes = isResidencialInm(inm);
        baseMes = parseFloat(calcularMensualidad(inm, currentRate).toFixed(2));
        ivaMes = esRes ? 0 : parseFloat((baseMes * 0.16).toFixed(2));
        retencionMes = inm.agente_retencion ? parseFloat((ivaMes * 0.75).toFixed(2)) : 0;
        totalMes = baseMes + ivaMes - retencionMes;
      }
    } else {
      totalMes = parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
      baseMes = totalMes;
    }

    return { baseMes, multaMes, ivaMes, retencionMes, totalMes };
  };

  // Filtrar recibos del usuario (priorizando DB)
  const misFact = useMemo(() => {
    if (misFactDb.length > 0) return misFactDb;
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
  }, [misFactDb, recibos, portalDoc]);

  const pendientes = misFact.filter((f: any) => f.estado === 'Pendiente' || f.estado === 'Abonado' || f.estado === 'Por Verificar').sort((a,b) => (a.emision || '').localeCompare(b.emision || ''));
  const pagadas = misFact.filter((f: any) => f.estado === 'Pagada' || f.estado === 'Pagado').sort((a,b) => (b.emision || '').localeCompare(a.emision || '')).slice(0, 10);

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
  const mesLabel = (d?: string) => {
    if (!d) return '';
    const p = d.split('-');
    if (p.length >= 2) return MESES[parseInt(p[1]) - 1] + ' ' + p[0];
    return d;
  };


  const handleDownloadPDF = () => {
    if (!portalDoc) return;
    const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
    const myContribuyente = contribuyentes?.find((c: any) => (c.Identidad || '').replace(/-/g, '').toUpperCase() === docNorm);

    const viewData = {
      Contribuyente: myContribuyente?.Contribuyente || '',
      Identidad: portalDoc,
      Telefono: myContribuyente?.Telefono || '',
      Direccion: myContribuyente?.Direccion || ''
    };

    // === Generate one PDF per inmueble ===
    const inmsToProcess = misInmuebles.length > 0 ? misInmuebles : [{ inmueble: 'Principal', tipo: 'Inmueble', cant_inmuebles: 1 }];

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let pageAdded = false;

    inmsToProcess.forEach((inm: any, idx: number) => {
      if (pageAdded) doc.addPage();
      pageAdded = true;
      const today = new Date();
      const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const docNro = Math.floor(10000 + Math.random() * 90000);

      // ── LOGOS ──
      try { doc.addImage(logos.iamec, 'PNG', 14, 10, 38, 20); } catch(e) {}

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
      const uso = cleanClasificacionActividad(inm.actividad_principal || inm.clasificacion || '') || 'Servicio de Aseo Urbano';
      const area = inm.area ? `${inm.area} Mt2` : '—';
      const codInm = inm.inmueble || 'Principal';

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
      const dirInm = inm.direccion || viewData.Direccion || '';
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

      // Get recibos for this specific inmueble
      const inmRecibos = pendientes.filter((f: any) => {
        if (!f.referencia) return true;
        if (f.referencia.startsWith('RECIB-HIST-')) {
          const parts = f.referencia.split('-');
          return parts[2] === inm.inmueble || parts[2] === inm.cod_cont || parts[2] === (inm as any).Inmueble;
        }
        if (f.referencia.startsWith('CM-')) {
          const match = f.referencia.match(/(I-\d+|C-\d+)/);
          if (match) {
            const refId = match[0];
            return inm.inmueble === refId || inm.cod_cont === refId || (inm as any).Inmueble === refId;
          }
        }
        return true;
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

      const mesesArr = [...new Set(inmRecibos.map((f: any) => mesLabel(f.emision).toUpperCase()))];
      const periodosLabel = mesesArr.join(', ') || '—';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const resumenRows = [
        [`Períodos Calculados (${inmRecibos.length}):`, periodosLabel],
        ['Monto Recolección Aseo Urbano Bs.', `Bs. ${sumBaseInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
      ];
      if (sumMultaInm > 0) {
        resumenRows.push(['Monto Interés / Multa por Mora Bs.', `Bs. ${sumMultaInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      }
      if (idx === 0 && totalServiciosBs > 0) {
        resumenRows.push(['Monto Servicios Especiales Bs.', `Bs. ${totalServiciosBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      }
      const esRes = isResidencialInm(inm);
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
        doc.text(value, 196, y, { align: 'right' });
        y += 6;
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
        const actClean = cleanClasificacionActividad((inm as any).actividad_principal || (inm as any).clasificacion || '');
        const det = actClean ? `Aseo ${actClean}` : 'Servicio de Aseo Urbano';
        const periodoDate = f.emision ? f.emision.replace(/-/g, '-') : '—';
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
            s.fecha ? s.fecha.replace(/-/g, '-') : '—',
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
            0: { cellWidth: 25 },
            1: { cellWidth: 45 },
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
      doc.text('2) Banco: BANESCO (0134)    |  Cta: 01340415144151031715  |  Titular: IAMEC            |  RIF: G-200076739', 14, y);
      y += 5.5;
      doc.setFont('helvetica', 'italic');
      doc.text('Transferencias oficiales a nombre de: Instituto Autónomo Municipal de Ecosocialismo (IAMEC)', 14, y);

      const fileName = `Estado_Cuenta_${viewData.Identidad}_${codInm}_${Date.now()}.pdf`;
      doc.save(fileName);
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando estado de cuenta...</div>;

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16">
      
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Mi Estado de Cuenta</h1>
          <p className="text-slate-500 text-sm">Visualice su deuda actual y descargue su comprobante</p>
        </div>
        <button 
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 bg-red-600 animate-pulse hover:animate-none text-white px-6 py-3 rounded-xl text-base font-black hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/30"
        >
          <Download className="w-5 h-5" />
          DESCARGAR ESTADO DE CUENTA
        </button>
      </div>

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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-slate-700 uppercase text-sm tracking-wide">Mis Inmuebles Registrados</h2>
          </div>
          <button 
            onClick={() => {
              const rows: any[] = [];
              misInmuebles.forEach((inm: any) => {
                  const factor = parseFloat(inm.mmv_mes) || 0;
                  const cuotaBs = factor * tasaBcv;
                  const cant = parseInt(inm.cant_inmuebles) || 1;
                  const actClean = cleanClasificacionActividad(inm.actividad_principal || inm.clasificacion || '') || 'Servicio de Aseo Urbano';
                  if (cant > 1 && factor > 0) {
                      for (let j = 1; j <= cant; j++) {
                          rows.push({
                              'Código': `${inm.inmueble || inm.cod_cont || '-'} - Unidad ${j}`,
                              'Actividad / Inmueble': actClean,
                              'Dirección': inm.direccion || 'Sin dirección',
                              'Factor': factor.toFixed(2),
                              'Cuota Mensual (Bs)': formatBs(cuotaBs)
                          });
                      }
                  } else {
                      rows.push({
                          'Código': inm.inmueble || inm.cod_cont || '-',
                          'Actividad / Inmueble': actClean,
                          'Dirección': inm.direccion || 'Sin dirección',
                          'Factor': factor.toFixed(2),
                          'Cuota Mensual (Bs)': formatBs(cuotaBs)
                      });
                  }
              });
              exportToExcelWithLogos(rows, `Desglose_Inmuebles_${portalDoc}.xlsx`, 'Desglose Inmuebles');
            }}
            className="flex items-center gap-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-lg shadow-sm transition-transform active:scale-95"
          >
            <Download className="w-3.5 h-3.5" /> Descargar Desglose
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Actividad / Inmueble</th>
                <th className="px-4 py-3">Dirección</th>
                <th className="px-4 py-3 text-center">Factor</th>
                <th className="px-4 py-3 text-right">Cuota Mensual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {misInmuebles.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No se encontraron inmuebles asociados a su cuenta.</td></tr>
              ) : (
                misInmuebles.map((inm: any, i: number) => {
                  const factor = parseFloat(inm.mmv_mes) || 0;
                  const cant = parseInt(inm.cant_inmuebles) || 1;
                  const cuotaBs = factor * cant * tasaBcv;
                  
                  return (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-700">{inm.inmueble || inm.cod_cont || '-'} {cant > 1 ? `(${cant} Unds)` : ''}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{cleanClasificacionActividad(inm.actividad_principal || inm.clasificacion || '') || 'Servicio de Aseo Urbano'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px]">{inm.direccion || 'Sin dirección'}</td>
                      <td className="px-4 py-3 text-center">{factor.toFixed(2)} {cant > 1 ? `x ${cant}` : ''}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">Bs. {formatBs(cuotaBs)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
      {pendientes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h3 className="font-bold text-red-700 uppercase text-sm tracking-wide">Recibos Pendientes</h3>
            <span className="ml-auto text-xs font-bold text-red-600">Total: Bs. {formatBs(totalPendBs)}</span>
          </div>
          {(() => {
            const ivaTot = pendientes.reduce((s: number, f: any) => s + getReciboBreakdown(f).ivaMes, 0);
            const retTot = pendientes.reduce((s: number, f: any) => s + getReciboBreakdown(f).retencionMes, 0);
            if (retTot <= 0) return null;
            return (
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-red-100 text-xs">
                <div className="bg-blue-50 border border-blue-100 rounded px-2 py-1.5"><span className="block text-blue-700 font-semibold">IVA completo (16%)</span><span className="font-black text-blue-900">Bs. {formatBs(ivaTot)}</span></div>
                <div className="bg-amber-50 border border-amber-100 rounded px-2 py-1.5"><span className="block text-amber-700 font-semibold">IVA retenido 75% (Agente de Retención)</span><span className="font-black text-amber-900">- Bs. {formatBs(retTot)}</span></div>
                <div className="bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5"><span className="block text-emerald-700 font-semibold">Total a cancelar</span><span className="font-black text-emerald-900">Bs. {formatBs(totalPendBs)}</span></div>
              </div>
            );
          })()}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-red-50/50 border-b border-red-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3">Mes</th>
                  <th className="px-4 py-3 text-center">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendientes.sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime()).map((f: any, i: number) => {
                  const matchedInm = misInmuebles.find((inm: any) => inm.inmueble && f.referencia.includes(inm.inmueble));
                  const inmuDesc = matchedInm
                    ? cleanClasificacionActividad(matchedInm.actividad_principal || matchedInm.clasificacion || '')
                    : '';
                  return (
                  <tr key={i} className="hover:bg-red-50/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-700 text-xs">{f.referencia}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{mesLabel(f.emision)}</div>
                      {matchedInm && (
                        <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                          {matchedInm.inmueble}{inmuDesc ? ` · ${inmuDesc}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-red-600 text-xs">{f.vencimiento || 'N/A'}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-700">
                      {parseFloat(getReciboMonto(f)) <= 0 && f.estado !== 'Abonado' && f.estado !== 'Pagado' ? (
                        <span className="text-emerald-600">En Verificación</span>
                      ) : (
                        `Bs. ${parseFloat(getReciboMonto(f)).toLocaleString('es-VE', {minimumFractionDigits:2,maximumFractionDigits:2})}`
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

