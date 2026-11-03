'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Building2,
  Users,
  FileSpreadsheet,
  FileText,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  AlertTriangle,
  Landmark,
  CreditCard,
  ArrowLeft,
  LogOut,
  CheckCircle2,
  Clock,
  Layers,
  Award,
  Activity,
  Briefcase,
  Receipt,
  Calendar,
  Truck,
} from 'lucide-react';
import PresidenciaFlotaRutasTracker from '@/components/PresidenciaFlotaRutasTracker';

import { aplicarMontoReporte } from '@/app/(admin)/admin/reportes/montoReporte';
import { generarMorososPDF } from '@/app/(admin)/admin/reportes/generators/Morosos';
import { generarCorteCajaPDF, generarIngresoBancarioPDF } from '@/app/(admin)/admin/reportes/generators/PdfReports';
import {
  generarMontoDiarioRecaudadoPDF,
  generarLibroVentasPDF,
  generarTotalPuntosVentaPDF,
  generarConciliacionTransferenciasPDF,
  generarReporteRecibosPagosPDF,
  generarSaldosFavorPDF,
  generarEmpleadosPDF,
  generarFiscalizacionPDF,
} from '@/app/(admin)/admin/reportes/generators/PresidenciaPdfReports';

type Moneda = 'BS' | 'EUR' | 'USD';
type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_pasado' | 'anio' | 'todo' | 'custom';
type ActiveTab = 'recaudacion' | 'flota_rutas' | 'catastro' | 'condominios_seniat' | 'administrativo' | 'reportes';

const COLORS_SECTOR = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
const COLORS_METODO = ['#10b981', '#38bdf8', '#a855f7'];
const COLORS_MOROSIDAD = ['#10b981', '#eab308', '#f97316', '#ef4444', '#991b1b'];

const isDebitoPago = (p: any) =>
  p.tipo === 'Debito' || p.tipo === 'REC' || p.tipo === 'Punto de Venta';

export default function PresidenciaDashboard() {
  const router = useRouter();
  const [authNombre, setAuthNombre] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [statsData, setStatsData] = useState<any>(null);

  // Controles globales
  const [activeTab, setActiveTab] = useState<ActiveTab>('recaudacion');
  const [moneda, setMoneda] = useState<Moneda>('BS');
  const [periodo, setPeriodo] = useState<Periodo>('mes');

  const hoyCaracas = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()),
    []
  );
  const inicioMesCaracas = useMemo(() => hoyCaracas.slice(0, 8) + '01', [hoyCaracas]);

  const [fechaDesde, setFechaDesde] = useState<string>(inicioMesCaracas);
  const [fechaHasta, setFechaHasta] = useState<string>(hoyCaracas);

  // Filtros de tablas
  const [busquedaPago, setBusquedaPago] = useState<string>('');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('TODOS');
  const [filtroSector, setFiltroSector] = useState<string>('TODOS');
  const [busquedaDeudor, setBusquedaDeudor] = useState<string>('');
  const [busquedaCondominio, setBusquedaCondominio] = useState<string>('');

  // Estados de descarga de reportes
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);
  const [cachedDatasets, setCachedDatasets] = useState<{
    contribuyentes: any[];
    saldosFavor: any[];
    empleados: any[];
  } | null>(null);

  // Verificar sesión de Presidencia o Administrador
  useEffect(() => {
    try {
      const rawPres = sessionStorage.getItem('presidencia_auth');
      if (rawPres) {
        const parsed = JSON.parse(rawPres);
        if (Date.now() - (parsed.ts || 0) < 12 * 3600 * 1000) {
          setAuthNombre(parsed.nombre || 'Presidencia Ejecutiva');
          return;
        }
      }
      const rawAdmin = localStorage.getItem('admin_user_data');
      if (rawAdmin) {
        const adminObj = JSON.parse(rawAdmin);
        if (adminObj?.nombre || adminObj?.usuario) {
          setAuthNombre(adminObj.nombre || adminObj.usuario);
          return;
        }
      }
      router.replace('/presidencia/login');
    } catch {
      router.replace('/presidencia/login');
    }
  }, [router]);

  const fetchEstadisticas = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/presidencia/estadisticas', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'No se pudieron cargar las estadísticas presidenciales.');
      }
      setStatsData(json);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error de conexión al cargar estadísticas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authNombre) {
      fetchEstadisticas(false);
    }
  }, [authNombre, fetchEstadisticas]);

  // Actualizar fechas al cambiar el período rápido
  const handleSelectPeriodo = (nuevo: Periodo) => {
    setPeriodo(nuevo);
    const now = new Date();
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);

    if (nuevo === 'hoy') {
      setFechaDesde(hoyCaracas);
      setFechaHasta(hoyCaracas);
    } else if (nuevo === 'semana') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startWeek = new Date(now);
      startWeek.setDate(diff);
      setFechaDesde(fmt(startWeek));
      setFechaHasta(hoyCaracas);
    } else if (nuevo === 'mes') {
      setFechaDesde(inicioMesCaracas);
      setFechaHasta(hoyCaracas);
    } else if (nuevo === 'mes_pasado') {
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setFechaDesde(fmt(firstLastMonth));
      setFechaHasta(fmt(lastLastMonth));
    } else if (nuevo === 'anio') {
      setFechaDesde(`${hoyCaracas.slice(0, 4)}-01-01`);
      setFechaHasta(hoyCaracas);
    } else if (nuevo === 'todo') {
      setFechaDesde('2024-01-01');
      setFechaHasta(hoyCaracas);
    }
  };

  // Tasas de cambio
  const tcmmv = Number(statsData?.tasas?.tcmmv || statsData?.tasas?.eur || 1);
  const tasaUsd = Number(statsData?.tasas?.usd || tcmmv || 1);

  const convertirMonto = useCallback(
    (montoBs: number) => {
      if (!montoBs || isNaN(montoBs)) return 0;
      if (moneda === 'EUR') return tcmmv > 0 ? montoBs / tcmmv : 0;
      if (moneda === 'USD') return tasaUsd > 0 ? montoBs / tasaUsd : 0;
      return montoBs;
    },
    [moneda, tcmmv, tasaUsd]
  );

  const simboloMoneda = moneda === 'BS' ? 'Bs.' : moneda === 'EUR' ? '€' : '$';

  const fmtDinero = useCallback(
    (montoBs: number) => {
      const val = convertirMonto(montoBs);
      return `${simboloMoneda} ${val.toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
    [convertirMonto, simboloMoneda]
  );

  const fmtBsFijo = (montoBs: number) =>
    `Bs. ${(Number(montoBs) || 0).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const fmtEurFijo = (montoBs: number) =>
    `€ ${(tcmmv > 0 ? (Number(montoBs) || 0) / tcmmv : 0).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const fmtUsdFijo = (montoBs: number) =>
    `$ ${(tasaUsd > 0 ? (Number(montoBs) || 0) / tasaUsd : 0).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Pagos con aplicarMontoReporte
  const pagosNormalizados = useMemo(() => {
    const raw = statsData?.pagos || [];
    return raw.map((p: any) => aplicarMontoReporte(p));
  }, [statsData]);

  // Pagos filtrados por rango de fecha seleccionado
  const pagosPeriodo = useMemo(() => {
    if (!pagosNormalizados.length) return [];
    const start = fechaDesde ? new Date(`${fechaDesde}T00:00:00`) : new Date('2020-01-01');
    const end = fechaHasta ? new Date(`${fechaHasta}T23:59:59.999`) : new Date('2099-12-31');
    return pagosNormalizados.filter((p: any) => {
      const d = new Date(p.created_at);
      return d >= start && d <= end;
    });
  }, [pagosNormalizados, fechaDesde, fechaHasta]);

  // Métricas financieras del período
  const finanzasPeriodo = useMemo(() => {
    let totalBs = 0;
    let debitoBs = 0;
    let debitoCount = 0;
    let transfBs = 0;
    let transfCount = 0;
    let aprobadosCount = 0;
    let porVerificarCount = 0;
    let bancamigaBs = 0;
    let banescoBs = 0;
    let otrosBancosBs = 0;

    const porSector: Record<string, { montoBs: number; count: number }> = {
      Residencial: { montoBs: 0, count: 0 },
      Comercial: { montoBs: 0, count: 0 },
      Industrial: { montoBs: 0, count: 0 },
    };

    const porCanal: Record<string, { montoBs: number; count: number }> = {};
    const porDiaMap = new Map<string, { fecha: string; totalBs: number; debitoBs: number; transfBs: number; ops: number }>();

    pagosPeriodo.forEach((p: any) => {
      const m = parseFloat(p.monto) || 0;
      totalBs += m;

      if (p.estado === 'Aprobado') aprobadosCount++;
      else porVerificarCount++;

      const esDeb = isDebitoPago(p);
      if (esDeb) {
        debitoBs += m;
        debitoCount++;
      } else {
        transfBs += m;
        transfCount++;
      }

      const b = String(p.bancoDestino || p.banco || '').toLowerCase();
      if (b.includes('bancamiga') || b.includes('0172')) bancamigaBs += m;
      else if (b.includes('banesco') || b.includes('0134')) banescoBs += m;
      else if (esDeb) bancamigaBs += m;
      else otrosBancosBs += m;

      const sec = p.sector || 'Residencial';
      if (!porSector[sec]) porSector[sec] = { montoBs: 0, count: 0 };
      porSector[sec].montoBs += m;
      porSector[sec].count++;

      const canal = p.origen || 'Taquilla Central';
      if (!porCanal[canal]) porCanal[canal] = { montoBs: 0, count: 0 };
      porCanal[canal].montoBs += m;
      porCanal[canal].count++;

      const diaKey = String(p.created_at || '').slice(0, 10);
      if (diaKey) {
        const prev = porDiaMap.get(diaKey) || {
          fecha: diaKey,
          totalBs: 0,
          debitoBs: 0,
          transfBs: 0,
          ops: 0,
        };
        prev.totalBs += m;
        if (esDeb) prev.debitoBs += m;
        else prev.transfBs += m;
        prev.ops += 1;
        porDiaMap.set(diaKey, prev);
      }
    });

    const serieDiaria = Array.from(porDiaMap.values())
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((item) => ({
        ...item,
        label: item.fecha.slice(5).split('-').reverse().join('/'),
        totalConv: Number(convertirMonto(item.totalBs).toFixed(2)),
        debitoConv: Number(convertirMonto(item.debitoBs).toFixed(2)),
        transfConv: Number(convertirMonto(item.transfBs).toFixed(2)),
      }));

    const chartMetodo = [
      {
        name: 'Punto de Venta (Débito)',
        value: Number(convertirMonto(debitoBs).toFixed(2)),
        montoBs: debitoBs,
        count: debitoCount,
      },
      {
        name: 'Transferencias / Conciliación',
        value: Number(convertirMonto(transfBs).toFixed(2)),
        montoBs: transfBs,
        count: transfCount,
      },
    ];

    const chartBancos = [
      {
        banco: 'Bancamiga (0172)',
        monto: Number(convertirMonto(bancamigaBs).toFixed(2)),
        montoBs: bancamigaBs,
      },
      {
        banco: 'Banesco (0134)',
        monto: Number(convertirMonto(banescoBs).toFixed(2)),
        montoBs: banescoBs,
      },
      ...(otrosBancosBs > 0
        ? [
            {
              banco: 'Otros / Por Asignar',
              monto: Number(convertirMonto(otrosBancosBs).toFixed(2)),
              montoBs: otrosBancosBs,
            },
          ]
        : []),
    ];

    const chartSectores = Object.entries(porSector).map(([name, val]) => ({
      name,
      value: Number(convertirMonto(val.montoBs).toFixed(2)),
      montoBs: val.montoBs,
      count: val.count,
    }));

    const chartCanales = Object.entries(porCanal)
      .map(([canal, val]) => ({
        canal,
        monto: Number(convertirMonto(val.montoBs).toFixed(2)),
        montoBs: val.montoBs,
        count: val.count,
      }))
      .sort((a, b) => b.montoBs - a.montoBs);

    return {
      totalBs,
      debitoBs,
      debitoCount,
      transfBs,
      transfCount,
      totalOps: pagosPeriodo.length,
      aprobadosCount,
      porVerificarCount,
      ticketPromedioBs: pagosPeriodo.length > 0 ? totalBs / pagosPeriodo.length : 0,
      bancamigaBs,
      banescoBs,
      serieDiaria,
      chartMetodo,
      chartBancos,
      chartSectores,
      chartCanales,
    };
  }, [pagosPeriodo, convertirMonto]);

  // Pagos filtrados para la tabla interactiva
  const pagosTabla = useMemo(() => {
    return pagosPeriodo.filter((p: any) => {
      if (filtroMetodo === 'DEBITO' && !isDebitoPago(p)) return false;
      if (filtroMetodo === 'TRANSFERENCIA' && isDebitoPago(p)) return false;
      if (filtroSector !== 'TODOS' && p.sector !== filtroSector) return false;
      if (busquedaPago.trim()) {
        const q = busquedaPago.toLowerCase();
        const matchId = String(p.identidad || '').toLowerCase().includes(q);
        const matchNom = String(p.contribuyenteNombre || '').toLowerCase().includes(q);
        const matchRef = String(p.referencia || '').toLowerCase().includes(q);
        const matchInm = String(p.codInmueble || '').toLowerCase().includes(q);
        if (!matchId && !matchNom && !matchRef && !matchInm) return false;
      }
      return true;
    });
  }, [pagosPeriodo, filtroMetodo, filtroSector, busquedaPago]);

  // Helper para cargar datasets pesados bajo demanda cuando se descarga un reporte
  const ensureReportDatasets = async () => {
    if (cachedDatasets) return cachedDatasets;
    const res = await fetch('/api/presidencia/estadisticas?modo=report_datasets', {
      cache: 'no-store',
    });
    const json = await res.json();
    const data = {
      contribuyentes: json.contribuyentes || [],
      saldosFavor: json.saldosFavor || [],
      empleados: json.empleados || [],
    };
    setCachedDatasets(data);
    return data;
  };

  // Funciones de descarga de reportes oficiales del sistema interno (TODOS EN PDF EJECUTIVO)
  const handleDownloadReport = async (reportId: string, subTipo?: 'Diario' | 'Semanal' | 'Mensual') => {
    try {
      setDownloadingReport(subTipo ? `${reportId}_${subTipo}` : reportId);

      if (reportId === 'monto_diario') {
        await generarMontoDiarioRecaudadoPDF({
          pagos: pagosNormalizados,
          fechaInicio: fechaDesde,
          fechaFin: fechaHasta,
          tcmmvActual: tcmmv || 1,
        });
        return;
      }

      if (reportId === 'morosos_pdf') {
        const res = await fetch('/api/presidencia/estadisticas?modo=morosos_export', {
          cache: 'no-store',
        });
        const json = await res.json();
        const facturasPendientes = json.facturasPendientes || [];
        const contribs = json.contribuyentes || [];
        await generarMorososPDF(facturasPendientes, contribs, tcmmv || 1);
        return;
      }

      const datasets = await ensureReportDatasets();

      if (reportId === 'libro_ventas') {
        await generarLibroVentasPDF(
          pagosPeriodo,
          datasets.contribuyentes,
          subTipo || 'Mensual',
          fechaDesde,
          fechaHasta
        );
      } else if (reportId === 'puntos_venta') {
        await generarTotalPuntosVentaPDF(pagosPeriodo, fechaDesde, fechaHasta, datasets.contribuyentes);
      } else if (reportId === 'conciliacion_bancaria') {
        await generarConciliacionTransferenciasPDF(
          pagosPeriodo,
          datasets.contribuyentes,
          fechaDesde,
          fechaHasta
        );
      } else if (reportId === 'recibos_pagos') {
        await generarReporteRecibosPagosPDF(
          pagosPeriodo,
          datasets.contribuyentes,
          fechaDesde,
          fechaHasta
        );
      } else if (reportId === 'corte_caja_pdf') {
        generarCorteCajaPDF(
          pagosPeriodo.length > 0 ? pagosPeriodo : pagosNormalizados,
          datasets.contribuyentes,
          fechaDesde,
          fechaHasta,
          tcmmv || 1
        );
      } else if (reportId === 'ingreso_bancario_pdf') {
        generarIngresoBancarioPDF(
          pagosPeriodo.length > 0 ? pagosPeriodo : pagosNormalizados,
          datasets.contribuyentes,
          subTipo || 'Mensual',
          fechaDesde,
          fechaHasta
        );
      } else if (reportId === 'saldos_favor') {
        const mesActual = new Date().toLocaleString('es-VE', { month: 'long' });
        await generarSaldosFavorPDF(datasets.saldosFavor, mesActual);
      } else if (reportId === 'empleados') {
        await generarEmpleadosPDF(datasets.empleados);
      } else if (reportId === 'fiscalizacion_general') {
        await generarFiscalizacionPDF(datasets.contribuyentes.slice(0, 250), 'General', tcmmv || 1);
      } else if (reportId === 'fiscalizacion_pendientes') {
        const morososList = datasets.contribuyentes.filter(
          (c: any) => Number(c.deuda_mmv || 0) > 0 || Number(c.meses_deuda || 0) > 0
        );
        await generarFiscalizacionPDF(morososList.slice(0, 250), 'Pendientes', tcmmv || 1);
      }
    } catch (err: any) {
      alert('Error al generar el reporte PDF: ' + (err?.message || 'Intente nuevamente'));
    } finally {
      setDownloadingReport(null);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('presidencia_auth');
    router.push('/portal');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06120e] text-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-[#B8CD29]/30 border-t-[#B8CD29] rounded-full animate-spin mb-5" />
        <h2 className="text-xl font-black text-[#B8CD29] tracking-wide text-center">
          CARGANDO CENTRO DE MANDO PRESIDENCIAL
        </h2>
        <p className="text-sm text-emerald-200/70 mt-2 text-center max-w-md">
          Sincronizando estadísticas financieras, catastro municipal, condominios, facturación SENIAT y reportes oficiales del IAMEC...
        </p>
      </div>
    );
  }

  const catastro = statsData?.catastro || {};
  const condominios = statsData?.condominios || {};
  const facturacion = statsData?.facturacionFiscal || {};
  const adminStats = statsData?.administrativo || {};

  // Datos para gráficos de Catastro
  const chartSolvenciaCatastro = [
    { name: 'Inmuebles Solventes', value: catastro.inmsSolventes || 0, color: '#10b981' },
    { name: 'Inmuebles con Deuda', value: catastro.inmsConDeuda || 0, color: '#ef4444' },
  ];

  const chartDeudaSector = ['Residencial', 'Comercial', 'Industrial'].map((sec) => {
    const info = catastro.deudaPorSector?.[sec] || {};
    return {
      sector: sec,
      Inmuebles: info.inmuebles || 0,
      Solventes: info.solventes || 0,
      Morosos: info.morosos || 0,
      DeudaConv: Number(convertirMonto(info.deudaBs || 0).toFixed(2)),
      deudaMmv: Number((info.deudaMmv || 0).toFixed(2)),
    };
  });

  const chartTramosMorosidad = [
    { tramo: 'Al Día (0m)', cantidad: catastro.tramosMorosidad?.alDia || 0, fill: '#10b981' },
    { tramo: '1 a 2 Meses', cantidad: catastro.tramosMorosidad?.de1a2Meses || 0, fill: '#eab308' },
    { tramo: '3 a 6 Meses', cantidad: catastro.tramosMorosidad?.de3a6Meses || 0, fill: '#f97316' },
    { tramo: '7 a 12 Meses', cantidad: catastro.tramosMorosidad?.de7a12Meses || 0, fill: '#ef4444' },
    { tramo: '+12 Meses', cantidad: catastro.tramosMorosidad?.masDe12Meses || 0, fill: '#991b1b' },
  ];

  const topDeudoresFiltrados = (catastro.top25Deudores || []).filter((d: any) => {
    if (!busquedaDeudor.trim()) return true;
    const q = busquedaDeudor.toLowerCase();
    return (
      String(d.identidad || '').toLowerCase().includes(q) ||
      String(d.contribuyente || '').toLowerCase().includes(q) ||
      String(d.inmueble || '').toLowerCase().includes(q)
    );
  });

  const condominiosFiltrados = (condominios.listaCondominios || []).filter((c: any) => {
    if (!busquedaCondominio.trim()) return true;
    const q = busquedaCondominio.toLowerCase();
    return (
      String(c.codigo || '').toLowerCase().includes(q) ||
      String(c.nombre || '').toLowerCase().includes(q) ||
      String(c.identidad || '').toLowerCase().includes(q)
    );
  });

  const chartRolesTrabajadores = Object.entries(adminStats.trabajadoresPorRol || {}).map(
    ([rol, count]) => ({
      rol,
      cantidad: Number(count) || 0,
    })
  );

  return (
    <div className="min-h-screen bg-[#071510] text-slate-100 pb-16 font-sans">
      {/* ══ CINTILLO INSTITUCIONAL OFICIAL (5 LOGOS GRANDES Y ADAPTADOS) ══ */}
      <div className="bg-slate-950/90 border-b border-emerald-900/60 px-2 sm:px-6 pt-3 pb-2">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl px-2 sm:px-6 py-2.5 shadow-xl border border-white/80 grid grid-cols-5 items-center divide-x divide-slate-200 w-full">
            <div className="flex justify-center items-center px-1 sm:px-3">
              <img
                src="/logos/LACAVA.png"
                alt="Lacava Gobernador"
                className="h-9 sm:h-14 md:h-16 w-full max-w-[140px] object-contain"
              />
            </div>
            <div className="flex justify-center items-center px-1 sm:px-3">
              <img
                src="/logos/NAGUANAGUATEQUIERO.png"
                alt="Naguanagua Te Quiero"
                className="h-10 sm:h-14 md:h-16 w-full max-w-[150px] object-contain"
              />
            </div>
            <div className="flex justify-center items-center px-1 sm:px-3">
              <img
                src="/logos/ELIZABETH.png"
                alt="Elizabeth Niño Alcaldesa"
                className="h-9 sm:h-13 md:h-15 w-full max-w-[150px] object-contain"
              />
            </div>
            <div className="flex justify-center items-center px-1 sm:px-3">
              <img
                src="/logos/INSTITUTO.png"
                alt="Instituto Autónomo Municipal de Ecosocialismo"
                className="h-10 sm:h-14 md:h-16 w-full max-w-[160px] object-contain"
              />
            </div>
            <div className="flex justify-center items-center px-1 sm:px-3">
              <img
                src="/logos/IAMEC.png"
                alt="IAMEC"
                className="h-9 sm:h-14 md:h-16 w-full max-w-[140px] object-contain"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ══ BARRA EJECUTIVA SUPERIOR ══ */}
      <header className="sticky top-0 z-30 bg-[#081a14]/95 backdrop-blur-md border-b border-emerald-800/50 px-3 sm:px-6 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8CD29] to-emerald-600 flex items-center justify-center text-slate-950 font-black shadow-md shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#B8CD29]/20 text-[#B8CD29] border border-[#B8CD29]/40">
                    MODO PRESIDENCIA
                  </span>
                  <span className="text-xs text-emerald-300/80 font-medium hidden sm:inline">
                    • {authNombre}
                  </span>
                </div>
                <h1 className="text-base sm:text-xl font-black text-white tracking-tight leading-tight">
                  CENTRO DE ESTADÍSTICA Y GESTIÓN INTEGRAL IAMEC
                </h1>
              </div>
            </div>

            {/* Botones móviles rápidos */}
            <div className="flex lg:hidden items-center gap-1.5">
              <button
                onClick={() => fetchEstadisticas(true)}
                disabled={refreshing}
                className="p-2 rounded-xl bg-emerald-900/50 border border-emerald-700/50 text-emerald-200 hover:bg-emerald-800/60"
                title="Actualizar en vivo"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl bg-rose-950/60 border border-rose-700/50 text-rose-300 hover:bg-rose-900/60"
                title="Salir a Soy Contribuyente"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Controles de Tasas, Moneda y Navegación */}
          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2">
            {/* Tasas BCV Oficiales */}
            <div className="flex items-center gap-2 bg-slate-900/90 border border-emerald-800/60 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-400 font-semibold">UCD/€:</span>
              <span className="text-[#B8CD29] font-black">
                Bs. {tcmmv.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400 font-semibold">USD:</span>
              <span className="text-sky-400 font-black">
                Bs. {tasaUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Selector de Moneda de Visualización */}
            <div className="flex items-center bg-slate-900 border border-emerald-800/60 rounded-xl p-1">
              {(['BS', 'EUR', 'USD'] as Moneda[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                    moneda === m
                      ? 'bg-[#B8CD29] text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {m === 'BS' ? 'Bs.' : m === 'EUR' ? '€ UCD' : '$ USD'}
                </button>
              ))}
            </div>

            {/* Botones Desktop */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => fetchEstadisticas(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-700/50 text-emerald-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Actualizando...' : 'Actualizar'}
              </button>
              <button
                onClick={() => router.push('/portal')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Modo Contribuyente
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/50 text-rose-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ══ NAVEGACIÓN DE PESTAÑAS EJECUTIVAS + FILTRO DE FECHAS ══ */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 space-y-4">
        {errorMsg && (
          <div className="bg-rose-950/80 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>⚠️ {errorMsg}</span>
            <button
              onClick={() => fetchEstadisticas(false)}
              className="px-3 py-1 bg-rose-700 hover:bg-rose-600 rounded-lg text-xs font-bold"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Pestañas principales adaptables */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            {
              id: 'recaudacion' as ActiveTab,
              label: 'Recaudación & Finanzas',
              sub: 'Ingresos, Cajas y Bancos',
              icon: TrendingUp,
            },
            {
              id: 'flota_rutas' as ActiveTab,
              label: 'Rutas, Flota & GPS',
              sub: 'Camiones, Taller y Tracker',
              icon: Truck,
            },
            {
              id: 'catastro' as ActiveTab,
              label: 'Catastro & Morosidad',
              sub: 'Solvencia, Sectores y Deuda',
              icon: Building2,
            },
            {
              id: 'condominios_seniat' as ActiveTab,
              label: 'Condominios & SENIAT',
              sub: 'Residencias y Facturación',
              icon: Receipt,
            },
            {
              id: 'administrativo' as ActiveTab,
              label: 'Gestión Administrativa',
              sub: 'Personal, Censo y Auditoría',
              icon: Users,
            },
            {
              id: 'reportes' as ActiveTab,
              label: 'Descargar Reportes',
              sub: 'PDF Oficiales Ejecutivos',
              icon: Download,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-br from-[#B8CD29]/25 to-emerald-900/60 border-[#B8CD29] shadow-lg shadow-[#B8CD29]/10'
                    : 'bg-slate-900/70 border-slate-800 hover:border-emerald-700/50 hover:bg-slate-900'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    active ? 'bg-[#B8CD29] text-slate-950' : 'bg-slate-800 text-emerald-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-xs sm:text-sm font-black truncate ${
                      active ? 'text-[#B8CD29]' : 'text-white'
                    }`}
                  >
                    {tab.label}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{tab.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Barra de Período y Rango de Fechas (aplica a Recaudación y Descarga de Reportes) */}
        <div className="bg-slate-900/80 border border-emerald-900/60 rounded-2xl p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-emerald-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Período:
            </span>
            {(
              [
                { id: 'hoy', label: 'Hoy' },
                { id: 'semana', label: 'Esta Semana' },
                { id: 'mes', label: 'Este Mes' },
                { id: 'mes_pasado', label: 'Mes Pasado' },
                { id: 'anio', label: 'Todo el Año' },
                { id: 'todo', label: 'Histórico Total' },
              ] as { id: Periodo; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPeriodo(p.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodo === p.id
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1">
              <span className="text-[11px] text-slate-400 font-semibold">Desde:</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setPeriodo('custom');
                }}
                className="bg-transparent text-xs font-bold text-white outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1">
              <span className="text-[11px] text-slate-400 font-semibold">Hasta:</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setPeriodo('custom');
                }}
                className="bg-transparent text-xs font-bold text-white outline-none"
              />
            </div>
            <button
              onClick={() => setActiveTab('reportes')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#B8CD29] hover:bg-[#c8de38] text-slate-950 font-black text-xs shadow cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Reportes ({pagosPeriodo.length})
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: RECAUDACIÓN & FINANZAS
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'recaudacion' && (
          <div className="space-y-5">
            {/* Tarjetas KPI Principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Recaudado */}
              <div className="bg-gradient-to-br from-emerald-950/90 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Total Recaudado (Período)
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {fmtDinero(finanzasPeriodo.totalBs)}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-300 gap-1">
                  <span>{fmtBsFijo(finanzasPeriodo.totalBs)}</span>
                  <span className="text-[#B8CD29] font-bold">{fmtEurFijo(finanzasPeriodo.totalBs)}</span>
                  <span className="text-sky-400 font-bold">{fmtUsdFijo(finanzasPeriodo.totalBs)}</span>
                </div>
              </div>

              {/* Punto de Venta / Débito */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Punto de Venta (Débito)
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                    <CreditCard className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white">
                  {fmtDinero(finanzasPeriodo.debitoBs)}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>{finanzasPeriodo.debitoCount} operaciones POS</span>
                  <span className="text-emerald-400 font-bold">
                    {finanzasPeriodo.totalBs > 0
                      ? ((finanzasPeriodo.debitoBs / finanzasPeriodo.totalBs) * 100).toFixed(1)
                      : '0.0'}
                    % del total
                  </span>
                </div>
              </div>

              {/* Transferencias y Conciliación */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    Transferencias Bancarias
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400">
                    <Landmark className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white">
                  {fmtDinero(finanzasPeriodo.transfBs)}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>{finanzasPeriodo.transfCount} transferencias</span>
                  <span className="text-sky-400 font-bold">
                    {finanzasPeriodo.totalBs > 0
                      ? ((finanzasPeriodo.transfBs / finanzasPeriodo.totalBs) * 100).toFixed(1)
                      : '0.0'}
                    % del total
                  </span>
                </div>
              </div>

              {/* Operaciones & Ticket Promedio */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#B8CD29]">
                    Operaciones Procesadas
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-[#B8CD29]/15 flex items-center justify-center text-[#B8CD29]">
                    <Activity className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-white">
                  {finanzasPeriodo.totalOps.toLocaleString('es-VE')} pagos
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>Promedio: {fmtDinero(finanzasPeriodo.ticketPromedioBs)}</span>
                  <span className="text-emerald-400 font-bold">
                    {finanzasPeriodo.aprobadosCount} aprobados
                  </span>
                </div>
              </div>
            </div>

            {/* Gráficos Principales: Evolución Diaria + Distribución por Método */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Evolución Diaria */}
              <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      📈 Evolución Diaria de Recaudación ({simboloMoneda})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Comparativa diaria entre Punto de Venta (Débito) y Transferencias Bancarias
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#B8CD29] bg-[#B8CD29]/10 border border-[#B8CD29]/30 px-2.5 py-1 rounded-lg">
                    {finanzasPeriodo.serieDiaria.length} días con actividad
                  </span>
                </div>

                <div className="h-72 w-full">
                  {finanzasPeriodo.serieDiaria.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-500">
                      No hay transacciones registradas en este rango de fechas.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={finanzasPeriodo.serieDiaria}>
                        <defs>
                          <linearGradient id="colorDebito" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="colorTransf" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="debitoConv"
                          name={`Débito POS (${simboloMoneda})`}
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorDebito)"
                        />
                        <Area
                          type="monotone"
                          dataKey="transfConv"
                          name={`Transferencias (${simboloMoneda})`}
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorTransf)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Dona de Método de Pago y Bancos */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    💳 Proporción por Método de Pago
                  </h3>
                  <p className="text-xs text-slate-400 mb-2">
                    Distribución porcentual del ingreso recaudado
                  </p>
                </div>

                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={finanzasPeriodo.chartMetodo}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={78}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {finanzasPeriodo.chartMetodo.map((_, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={COLORS_METODO[idx % COLORS_METODO.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2 mt-2">
                  {finanzasPeriodo.chartMetodo.map((item, idx) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between bg-slate-950/70 px-3 py-2 rounded-xl border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS_METODO[idx % COLORS_METODO.length] }}
                        />
                        <span className="font-bold text-slate-200">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-white">{fmtDinero(item.montoBs)}</div>
                        <div className="text-[10px] text-slate-400">{item.count} pagos</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Segunda fila de Gráficos: Bancos Receptores, Sectores Económicos y Cajas/Canales */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bancos Receptores */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  🏦 Recaudación por Banco Receptor
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Bancamiga (0172) vs Banesco (0134) en {simboloMoneda}
                </p>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={finanzasPeriodo.chartBancos}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="banco" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="monto" name={`Monto (${simboloMoneda})`} radius={[8, 8, 0, 0]}>
                        {finanzasPeriodo.chartBancos.map((_, i) => (
                          <Cell
                            key={i}
                            fill={i === 0 ? '#10b981' : i === 1 ? '#3b82f6' : '#f59e0b'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recaudación por Sector Económico */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  🏭 Ingresos por Sector Catastral
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Residencial, Comercial e Industrial ({simboloMoneda})
                </p>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={finanzasPeriodo.chartSectores}
                        cx="50%"
                        cy="50%"
                        outerRadius={68}
                        dataKey="value"
                      >
                        {finanzasPeriodo.chartSectores.map((_, idx) => (
                          <Cell
                            key={`sec-${idx}`}
                            fill={COLORS_SECTOR[idx % COLORS_SECTOR.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-2">
                  {finanzasPeriodo.chartSectores.map((s, idx) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between text-xs bg-slate-950/60 px-2.5 py-1.5 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: COLORS_SECTOR[idx % COLORS_SECTOR.length] }}
                        />
                        <span className="font-bold text-slate-300">{s.name}</span>
                      </div>
                      <span className="font-black text-white">
                        {fmtDinero(s.montoBs)} ({s.count})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recaudación por Caja / Canal */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  🖥️ Rendimiento por Caja / Canal
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Desglose operativo por taquilla, portal web y cobro móvil
                </p>
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {finanzasPeriodo.chartCanales.map((c) => {
                    const pct =
                      finanzasPeriodo.totalBs > 0
                        ? Math.min(100, (c.montoBs / finanzasPeriodo.totalBs) * 100)
                        : 0;
                    return (
                      <div
                        key={c.canal}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5"
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-slate-200">{c.canal}</span>
                          <span className="font-black text-[#B8CD29]">{fmtDinero(c.montoBs)}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-[#B8CD29]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                          <span>{c.count} operaciones</span>
                          <span>{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tabla Interactiva de Transacciones del Período */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    🧾 Detalle de Transacciones y Conciliación ({pagosTabla.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Auditoría en tiempo real de todos los pagos registrados en el período
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={busquedaPago}
                      onChange={(e) => setBusquedaPago(e.target.value)}
                      placeholder="Buscar RIF, nombre, ref, inmueble..."
                      className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-[#B8CD29] w-56"
                    />
                  </div>
                  <select
                    value={filtroMetodo}
                    onChange={(e) => setFiltroMetodo(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none"
                  >
                    <option value="TODOS">Todos los Métodos</option>
                    <option value="DEBITO">Solo Débito / POS</option>
                    <option value="TRANSFERENCIA">Solo Transferencias</option>
                  </select>
                  <select
                    value={filtroSector}
                    onChange={(e) => setFiltroSector(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none"
                  >
                    <option value="TODOS">Todos los Sectores</option>
                    <option value="Residencial">Residencial</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Industrial">Industrial</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[420px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 text-slate-300 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 font-bold">Fecha</th>
                      <th className="py-2.5 px-3 font-bold">RIF / Cédula</th>
                      <th className="py-2.5 px-3 font-bold">Contribuyente</th>
                      <th className="py-2.5 px-3 font-bold">Inmueble</th>
                      <th className="py-2.5 px-3 font-bold">Sector</th>
                      <th className="py-2.5 px-3 font-bold">Canal / Caja</th>
                      <th className="py-2.5 px-3 font-bold">Método / Banco</th>
                      <th className="py-2.5 px-3 font-bold">Referencia</th>
                      <th className="py-2.5 px-3 font-bold text-right">Monto ({simboloMoneda})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {pagosTabla.slice(0, 150).map((p: any) => {
                      const esDeb = isDebitoPago(p);
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 whitespace-nowrap text-slate-300">
                            {new Date(p.created_at).toLocaleDateString('es-VE')}
                          </td>
                          <td className="py-2 px-3 font-bold text-emerald-400 whitespace-nowrap">
                            {p.identidad || '-'}
                          </td>
                          <td className="py-2 px-3 max-w-[200px] truncate text-white font-medium">
                            {p.contribuyenteNombre || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                            {p.codInmueble || '-'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.sector === 'Comercial'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : p.sector === 'Industrial'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {p.sector || 'Residencial'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                            {p.origen || '-'}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={`font-bold ${
                                esDeb ? 'text-emerald-400' : 'text-sky-400'
                              }`}
                            >
                              {esDeb ? '💳 Débito POS' : '🏦 Transf.'}
                            </span>{' '}
                            <span className="text-slate-400 text-[11px]">({p.bancoDestino})</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">
                            {p.referencia || '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-black text-white whitespace-nowrap">
                            {fmtDinero(parseFloat(p.monto) || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pagosTabla.length > 150 && (
                <p className="text-[11px] text-slate-400 mt-2 text-right">
                  Mostrando las primeras 150 transacciones de {pagosTabla.length}. Para el listado completo descargue el Excel en la pestaña de Reportes.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: CATASTRO & MOROSIDAD MUNICIPAL
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'catastro' && (
          <div className="space-y-5">
            {/* KPIs de Catastro */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase text-slate-400">
                    Padrón Catastral Activo
                  </span>
                  <Building2 className="w-4 h-4 text-[#B8CD29]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {(catastro.totalInmueblesActivos || 0).toLocaleString('es-VE')}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-300">
                  <span>🏠 Res: {catastro.inmsResidenciales || 0}</span>
                  <span>🏪 Com: {catastro.inmsComerciales || 0}</span>
                  <span>🏭 Ind: {catastro.inmsIndustriales || 0}</span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase text-emerald-400">
                    Inmuebles Solventes (Al Día)
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                  {(catastro.inmsSolventes || 0).toLocaleString('es-VE')}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs">
                  <span className="text-slate-400">Índice de Solvencia:</span>
                  <span className="font-black text-emerald-300">
                    {(catastro.porcentajeSolvencia || 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-rose-500/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase text-rose-400">
                    Inmuebles con Morosidad
                  </span>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-rose-400">
                  {(catastro.inmsConDeuda || 0).toLocaleString('es-VE')}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs">
                  <span className="text-slate-400">Índice de Morosidad:</span>
                  <span className="font-black text-rose-300">
                    {(catastro.porcentajeMorosidad || 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-rose-950/70 via-slate-900 to-slate-900 border border-rose-500/40 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase text-rose-300">
                    Cartera Total por Cobrar
                  </span>
                  <Layers className="w-4 h-4 text-rose-300" />
                </div>
                <div className="text-2xl font-black text-white">
                  {fmtDinero(catastro.deudaTotalBsEstimada || 0)}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-300">
                  <span>
                    UCD:{' '}
                    {(catastro.deudaTotalMmv || 0).toLocaleString('es-VE', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    €
                  </span>
                  <span className="text-amber-300 font-bold">
                    Multas: {fmtDinero(catastro.multaTotalBs || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Segunda fila de KPIs de Catastro */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-semibold">
                  Potencial Mensual de Facturación
                </div>
                <div className="text-base sm:text-lg font-black text-[#B8CD29] mt-0.5">
                  {fmtDinero(catastro.facturacionMensualPotencialBs || 0)}
                </div>
                <div className="text-[10px] text-slate-400">
                  {(catastro.facturacionMensualPotencialMmv || 0).toLocaleString('es-VE', {
                    maximumFractionDigits: 2,
                  })}{' '}
                  UCD / mes
                </div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-semibold">
                  Agentes de Retención Especiales
                </div>
                <div className="text-base sm:text-lg font-black text-sky-400 mt-0.5">
                  {(catastro.inmsAgentesRetencion || 0).toLocaleString('es-VE')} empresas
                </div>
                <div className="text-[10px] text-slate-400">Contribuyentes Especiales SENIAT</div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-semibold">
                  Cobertura de Correo Electrónico
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-400 mt-0.5">
                  {(catastro.inmsConCorreo || 0).toLocaleString('es-VE')} inmuebles
                </div>
                <div className="text-[10px] text-slate-400">Censados con email activo</div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400 font-semibold">
                  Cobertura Telefónica / WhatsApp
                </div>
                <div className="text-base sm:text-lg font-black text-purple-400 mt-0.5">
                  {(catastro.inmsConTelefono || 0).toLocaleString('es-VE')} inmuebles
                </div>
                <div className="text-[10px] text-slate-400">Con teléfono de contacto</div>
              </div>
            </div>

            {/* Gráficos de Catastro y Morosidad */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Solvencia vs Morosidad */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  🟢 Solvencia vs 🔴 Morosidad
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Estado actual del padrón de inmuebles del municipio
                </p>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartSolvenciaCatastro}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={76}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartSolvenciaCatastro.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Morosidad por Antigüedad */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  ⏳ Antigüedad de la Deuda (Meses)
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Clasificación de inmuebles según meses pendientes
                </p>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartTramosMorosidad}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="tramo" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="cantidad" name="Inmuebles" radius={[6, 6, 0, 0]}>
                        {chartTramosMorosidad.map((item, idx) => (
                          <Cell key={idx} fill={item.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Comparativa Sectorial de Deuda */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  🏢 Deuda por Sector ({simboloMoneda})
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Distribución de cuentas por cobrar según uso del inmueble
                </p>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartDeudaSector}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="sector" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="DeudaConv"
                        name={`Deuda (${simboloMoneda})`}
                        fill="#ef4444"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Top 25 Mayores Deudores y Top Actividades Económicas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Top 25 Deudores */}
              <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      🔴 Top 25 Mayores Deudores del Municipio
                    </h3>
                    <p className="text-xs text-slate-400">
                      Principales cuentas por cobrar priorizadas para fiscalización y cobranza
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={busquedaDeudor}
                      onChange={(e) => setBusquedaDeudor(e.target.value)}
                      placeholder="Filtrar deudor o RIF..."
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                    />
                    <button
                      onClick={() => handleDownloadReport('morosos_pdf')}
                      disabled={downloadingReport !== null}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      PDF Morosos
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-96">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 text-slate-300 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Inmueble</th>
                        <th className="py-2 px-3">RIF / CI</th>
                        <th className="py-2 px-3">Contribuyente</th>
                        <th className="py-2 px-3">Sector</th>
                        <th className="py-2 px-3 text-center">Meses</th>
                        <th className="py-2 px-3 text-right">Deuda UCD (€)</th>
                        <th className="py-2 px-3 text-right">Deuda ({simboloMoneda})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {topDeudoresFiltrados.map((d: any, idx: number) => (
                        <tr key={d.id || idx} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono text-slate-300">{d.inmueble}</td>
                          <td className="py-2 px-3 font-bold text-rose-400">{d.identidad}</td>
                          <td className="py-2 px-3 max-w-[190px] truncate text-white font-medium">
                            {d.contribuyente}
                          </td>
                          <td className="py-2 px-3 text-slate-300">{d.sector}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                              {d.mesesDeuda}m
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-[#B8CD29]">
                            € {Number(d.deudaMmv || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right font-black text-white">
                            {fmtDinero(d.deudaBs || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top Actividades Económicas */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  🏪 Top 12 Actividades Económicas
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Rubros con mayor presencia en el censo municipal
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {(catastro.topActividades || []).map((act: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-white mb-1">
                        <span className="truncate pr-2">
                          {idx + 1}. {act.actividad}
                        </span>
                        <span className="text-[#B8CD29] shrink-0">{act.total} inms.</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="text-emerald-400">✔ {act.solventes} al día</span>
                        <span className="text-rose-400">⚠ {act.morosos} con deuda</span>
                        <span>€ {Number(act.deudaMmv || 0).toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: CONDOMINIOS & FACTURACIÓN FISCAL SENIAT
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'condominios_seniat' && (
          <div className="space-y-5">
            {/* Sección 1: Facturación Fiscal SENIAT */}
            <div className="bg-slate-900/90 border border-emerald-800/50 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#B8CD29]" />
                    Facturación Digital Homologada SENIAT (Imprenta Digital TFHKA)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Control fiscal de facturas emitidas (01-REG), notas de crédito (03-REG), recibos y retenciones IVA (75%)
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReport('libro_ventas', 'Mensual')}
                  disabled={downloadingReport !== null}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer self-start"
                >
                  <FileText className="w-4 h-4" />
                  Descargar Libro de Ventas SENIAT (PDF)
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-3.5">
                  <div className="text-[11px] text-emerald-400 font-bold uppercase">
                    Facturas Digitales (01-REG)
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {(facturacion.facturasDigitalesEmitidas || 0).toLocaleString('es-VE')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Emitidas y timbradas</div>
                </div>

                <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3.5">
                  <div className="text-[11px] text-amber-400 font-bold uppercase">
                    Pendientes por Facturar
                  </div>
                  <div className="text-2xl font-black text-amber-300 mt-1">
                    {(facturacion.facturasDigitalesPendientes || 0).toLocaleString('es-VE')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Pagos aprobados sin 01-REG</div>
                </div>

                <div className="bg-slate-950/80 border border-rose-500/30 rounded-xl p-3.5">
                  <div className="text-[11px] text-rose-400 font-bold uppercase">
                    Notas de Crédito (03-REG)
                  </div>
                  <div className="text-2xl font-black text-rose-300 mt-1">
                    {(facturacion.notasCreditoEmitidas || 0).toLocaleString('es-VE')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Facturas anuladas fiscalmente</div>
                </div>

                <div className="bg-slate-950/80 border border-sky-500/30 rounded-xl p-3.5">
                  <div className="text-[11px] text-sky-400 font-bold uppercase">
                    Recibos Oficiales de Caja
                  </div>
                  <div className="text-2xl font-black text-sky-300 mt-1">
                    {(facturacion.recibosCajaEmitidos || 0).toLocaleString('es-VE')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Con correlativo asignado</div>
                </div>

                <div className="bg-slate-950/80 border border-purple-500/30 rounded-xl p-3.5 col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-purple-400 font-bold uppercase">
                    Retenciones IVA (75%)
                  </div>
                  <div className="text-lg font-black text-white mt-1">
                    {fmtDinero(facturacion.retencionesIvaTotalBs || 0)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {facturacion.pagosConRetencionCount || 0} comprobantes aplicados
                  </div>
                </div>
              </div>
            </div>

            {/* Sección 2: Estadísticas de Condominios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold uppercase text-slate-400">
                  Total Condominios Registrados
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white mt-1">
                  {condominios.totalCondominios || 0}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs text-slate-300">
                  <span>🏘️ Res: {condominios.condominiosResidenciales || 0}</span>
                  <span>🏢 Com: {condominios.condominiosComerciales || 0}</span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4">
                <div className="text-xs font-bold uppercase text-emerald-400">
                  Condominios Solventes
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">
                  {condominios.condominiosSolventes || 0}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs text-slate-400">
                  <span>Con deuda pendiente:</span>
                  <span className="text-rose-400 font-bold">
                    {condominios.condominiosConDeuda || 0}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold uppercase text-sky-400">
                  Unidades / Apartamentos Censados
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white mt-1">
                  {(condominios.totalUnidadesCondo || 0).toLocaleString('es-VE')}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs text-slate-400">
                  <span>Unidades activas en condominios</span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold uppercase text-[#B8CD29]">
                  Solvencia por Unidades
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#B8CD29] mt-1">
                  {(condominios.unidadesSolventes || 0).toLocaleString('es-VE')} al día
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs">
                  <span className="text-slate-400">Unidades con deuda:</span>
                  <span className="text-rose-400 font-bold">
                    {condominios.unidadesConDeuda || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabla de Condominios */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    🏘️ Padrón General de Condominios Residenciales y Comerciales (
                    {condominiosFiltrados.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Estado de solvencia, modalidad de cobro, unidades declaradas y tarifa UCD
                  </p>
                </div>
                <input
                  type="text"
                  value={busquedaCondominio}
                  onChange={(e) => setBusquedaCondominio(e.target.value)}
                  placeholder="Buscar condominio, código o RIF..."
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none w-full sm:w-64"
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 text-slate-300 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Nombre del Condominio</th>
                      <th className="py-2.5 px-3">RIF / Identidad</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Modalidad</th>
                      <th className="py-2.5 px-3 text-center">Unidades</th>
                      <th className="py-2.5 px-3 text-right">Tarifa UCD</th>
                      <th className="py-2.5 px-3 text-center">Estado de Solvencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {condominiosFiltrados.map((c: any) => (
                      <tr key={c.codigo} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono font-bold text-[#B8CD29]">
                          {c.codigo}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">{c.nombre}</td>
                        <td className="py-2 px-3 text-slate-300">{c.identidad || '-'}</td>
                        <td className="py-2 px-3 text-slate-300">{c.tipo || 'Residencial'}</td>
                        <td className="py-2 px-3 text-slate-300">{c.modalidad || '-'}</td>
                        <td className="py-2 px-3 text-center font-bold text-white">
                          {c.cant_declarada || 0}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-400">
                          € {Number(c.tarifa_mmv || 0).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {c.solvente ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                              ✔ SOLVENTE
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                              ⚠ PENDIENTE ({c.aseo_pendiente_desde})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 4: GESTIÓN ADMINISTRATIVA, PERSONAL Y AUDITORÍA
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'administrativo' && (
          <div className="space-y-5">
            {/* KPIs Administrativos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                  <span>Personal IAMEC</span>
                  <Users className="w-4 h-4 text-[#B8CD29]" />
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  {adminStats.trabajadoresActivos || 0} activos
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  De {adminStats.totalTrabajadores || 0} funcionarios registrados
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                  <span>Pre-Registros Censo</span>
                  <Briefcase className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  {adminStats.totalPreRegistros || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  <span className="text-emerald-400 font-bold">
                    {adminStats.preRegAprobados || 0} aprobados
                  </span>{' '}
                  •{' '}
                  <span className="text-amber-400 font-bold">
                    {adminStats.preRegPendientes || 0} pendientes
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                  <span>Atención / Reclamos</span>
                  <Clock className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  {adminStats.totalReclamos || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  <span className="text-emerald-400 font-bold">
                    {adminStats.reclamosResueltos || 0} resueltos
                  </span>{' '}
                  •{' '}
                  <span className="text-amber-400 font-bold">
                    {adminStats.reclamosPendientes || 0} en revisión
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                  <span>Servicios Especiales</span>
                  <Award className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  {adminStats.totalServiciosEspeciales || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  <span className="text-emerald-400 font-bold">
                    {adminStats.serviciosPagados || 0} pagados
                  </span>{' '}
                  •{' '}
                  <span className="text-amber-400 font-bold">
                    {adminStats.serviciosPendientes || 0} pendientes
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                  <span>Convenios y Saldos</span>
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  {adminStats.totalConvenios || 0} convenios
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {adminStats.totalSaldosFavor || 0} cuentas con saldo a favor
                </div>
              </div>
            </div>

            {/* Gráfico de Personal por Rol + Nómina de Usuarios del Sistema */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  👥 Distribución de Personal por Rol
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Estructura operativa de usuarios del sistema IAMEC
                </p>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRolesTrabajadores} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                      <YAxis dataKey="rol" type="category" stroke="#94a3b8" fontSize={11} width={95} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="cantidad" name="Funcionarios" fill="#B8CD29" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabla de Funcionarios y Cajas */}
              <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
                <h3 className="text-sm sm:text-base font-black text-white mb-1">
                  🪪 Directorio de Funcionarios, Cajeros y Operadores ({adminStats.listaTrabajadores?.length || 0})
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Personal habilitado en cajas recaudadoras, cobro móvil, censo y administración
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-64">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 text-slate-300 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Usuario</th>
                        <th className="py-2 px-3">Nombre Completo</th>
                        <th className="py-2 px-3">Rol Operativo</th>
                        <th className="py-2 px-3 text-center">Serie / Caja</th>
                        <th className="py-2 px-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {(adminStats.listaTrabajadores || []).map((t: any) => (
                        <tr key={t.id || t.usuario} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-bold text-[#B8CD29]">
                            {t.usuario}
                          </td>
                          <td className="py-2 px-3 font-bold text-white">{t.nombre}</td>
                          <td className="py-2 px-3 text-slate-300">{t.rol}</td>
                          <td className="py-2 px-3 text-center">
                            {t.letra ? (
                              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                                Caja {t.letra}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                t.estado === 'Activo'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {t.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Bitácora de Auditoría en Vivo */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm sm:text-base font-black text-white mb-1">
                🛡️ Bitácora de Auditoría y Movimientos del Sistema Interno
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Últimas acciones administrativas y operativas registradas en el instituto
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-80">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 text-slate-300 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Fecha y Hora</th>
                      <th className="py-2 px-3">Funcionario / Usuario</th>
                      <th className="py-2 px-3">Módulo</th>
                      <th className="py-2 px-3">Acción Realizada</th>
                      <th className="py-2 px-3">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {(adminStats.auditoriaReciente || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          Sin registros recientes en la bitácora.
                        </td>
                      </tr>
                    ) : (
                      (adminStats.auditoriaReciente || []).map((log: any, idx: number) => (
                        <tr key={log.id || idx} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 whitespace-nowrap text-slate-400">
                            {log.created_at
                              ? new Date(log.created_at).toLocaleString('es-VE')
                              : '-'}
                          </td>
                          <td className="py-2 px-3 font-bold text-[#B8CD29]">
                            {log.usuario || log.admin_user || 'Sistema'}
                          </td>
                          <td className="py-2 px-3 text-emerald-300 font-semibold">
                            {log.modulo || log.tabla || 'General'}
                          </td>
                          <td className="py-2 px-3 text-white font-medium">
                            {log.accion || log.operacion || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-300 max-w-md truncate">
                            {typeof log.detalles === 'object'
                              ? JSON.stringify(log.detalles)
                              : log.detalles || log.descripcion || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 5: CENTRO DE DESCARGA DE REPORTES OFICIALES EN PDF (SISTEMA INTERNO)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'reportes' && (
          <div className="space-y-5">
            <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-[#B8CD29]/50 rounded-2xl p-4 sm:p-6 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#B8CD29] text-slate-950">
                    REPORTES OFICIALES DEL SISTEMA INTERNO IAMEC (FORMATO PDF)
                  </span>
                  <h2 className="text-lg sm:text-2xl font-black text-white mt-2">
                    📥 Centro Ejecutivo de Descarga de Reportes Oficiales (PDF)
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1">
                    Todos los reportes oficiales del Instituto se generan y descargan directamente en <b>formato PDF ejecutivo</b> con membrete institucional, aplicando el rango seleccionado arriba (<b>{fechaDesde}</b> al <b>{fechaHasta}</b>).
                  </p>
                </div>
                <div className="bg-slate-950/90 border border-emerald-800/60 rounded-2xl px-4 py-3 text-right shrink-0">
                  <div className="text-[11px] text-slate-400 font-semibold">
                    Operaciones en el Rango
                  </div>
                  <div className="text-xl font-black text-[#B8CD29]">
                    {pagosPeriodo.length.toLocaleString('es-VE')} registros
                  </div>
                  <div className="text-xs text-white font-bold">
                    {fmtBsFijo(finanzasPeriodo.totalBs)}
                  </div>
                </div>
              </div>
            </div>

            {/* Grid de Tarjetas de Descarga de Reportes en PDF */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 1. Monto Diario Recaudado (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">📅</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300">
                      PDF OFICIAL CON LOGOS
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Monto Diario Recaudado (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Reporte gerencial en PDF con desglose diario por Punto de Venta (Bs y €), Transferencias (Bs y €), Banesco, Bancamiga y Totales consolidados.
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReport('monto_diario')}
                  disabled={downloadingReport !== null}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#B8CD29] hover:bg-[#c9de38] text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  {downloadingReport === 'monto_diario'
                    ? 'Generando PDF...'
                    : 'Descargar Monto Diario Recaudado (PDF)'}
                </button>
              </div>

              {/* 2. Libro de Ventas Fiscal SENIAT (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">📊</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300">
                      PDF SENIAT 01-REG / 03-REG
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Libro de Ventas Fiscal SENIAT (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Reporte oficial en PDF de Facturas Digitales emitidas (01-REG), Notas de Crédito (03-REG) y comprobantes de retención IVA 75%.
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(['Diario', 'Semanal', 'Mensual'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleDownloadReport('libro_ventas', t)}
                      disabled={downloadingReport !== null}
                      className="py-2 px-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {t} (PDF)
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Total Puntos de Venta (Todas las Cajas - PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">💳</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300">
                      PDF MULTICAJA & COBRO MÓVIL
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Total Puntos de Venta (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Detalle completo en PDF de cobros por tarjeta de débito de todas las cajas y Cobro Móvil Bancamiga, con lote, referencia, titular y resumen por caja.
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReport('puntos_venta')}
                  disabled={downloadingReport !== null}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  {downloadingReport === 'puntos_venta'
                    ? 'Generando PDF...'
                    : 'Descargar Total Puntos de Venta (PDF)'}
                </button>
              </div>

              {/* 4. Conciliación Bancaria de Transferencias (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🏦</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300">
                      PDF BANESCO & BANCAMIGA
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Conciliación Bancaria (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Reporte oficial en PDF de conciliación de transferencias clasificadas por banco receptor (Banesco y Bancamiga) con subtotales.
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReport('conciliacion_bancaria')}
                  disabled={downloadingReport !== null}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  {downloadingReport === 'conciliacion_bancaria'
                    ? 'Generando PDF...'
                    : 'Descargar Conciliación Bancaria (PDF)'}
                </button>
              </div>

              {/* 5. Reporte de Recibos de Pagos (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🧾</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-teal-500/20 text-teal-300">
                      PDF PLANILLA OFICIAL
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Reporte de Recibos de Pagos (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Relación detallada en PDF de recibos emitidos con Código de Inmueble, N° de Recibo, Servicio de Aseo Urbano, Multas y Totales.
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReport('recibos_pagos')}
                  disabled={downloadingReport !== null}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  {downloadingReport === 'recibos_pagos'
                    ? 'Generando PDF...'
                    : 'Descargar Recibos de Pagos (PDF)'}
                </button>
              </div>

              {/* 6. Record Oficial de Morosos (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-rose-500/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🔴</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300">
                      PDF PADRÓN DE COBRANZAS
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Record Oficial de Morosos (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Padrón completo en PDF de contribuyentes e inmuebles con deuda pendiente (Código, RIF/Cédula, Razón Social, Teléfono, Meses y Deuda Total en Bs).
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReport('morosos_pdf')}
                  disabled={downloadingReport !== null}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  {downloadingReport === 'morosos_pdf'
                    ? 'Generando PDF...'
                    : 'Descargar Record de Morosos (PDF)'}
                </button>
              </div>

              {/* 7. Corte de Caja General (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🗂️</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300">
                      DOCUMENTO PDF
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Corte General de Caja (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Acta ejecutiva en PDF con el cierre consolidado de todas las operaciones de caja en el rango seleccionado.
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadReport('corte_caja_pdf')}
                  disabled={downloadingReport !== null}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  {downloadingReport === 'corte_caja_pdf'
                    ? 'Generando PDF...'
                    : 'Descargar Corte de Caja (PDF)'}
                </button>
              </div>

              {/* 8. Ingreso Bancario Consolidado (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🏛️</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300">
                      REPORTE PDF BANCOS
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Ingreso Bancario Consolidado (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Resumen ejecutivo en PDF de ingresos bancarios clasificados por modalidad (Diario, Semanal o Mensual).
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(['Diario', 'Semanal', 'Mensual'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleDownloadReport('ingreso_bancario_pdf', t)}
                      disabled={downloadingReport !== null}
                      className="py-2 px-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {t} (PDF)
                    </button>
                  ))}
                </div>
              </div>

              {/* 9. Saldos a Favor, Empleados y Fiscalización (PDF) */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-[#B8CD29]/60 rounded-2xl p-5 flex flex-col justify-between transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🛡️</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300">
                      AUDITORÍA INTERNA PDF
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Auditoría: Saldos, Personal y Fiscalización (PDF)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Descarga directa en PDF de los reportes administrativos de Saldos a Favor, Nómina de Personal y Fiscalización Municipal.
                  </p>
                </div>
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => handleDownloadReport('saldos_favor')}
                    disabled={downloadingReport !== null}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs flex items-center justify-between cursor-pointer"
                  >
                    <span>💰 Saldos a Favor Vigentes (PDF)</span>
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownloadReport('empleados')}
                    disabled={downloadingReport !== null}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs flex items-center justify-between cursor-pointer"
                  >
                    <span>👥 Gestión de Personal / Empleados (PDF)</span>
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownloadReport('fiscalizacion_pendientes')}
                    disabled={downloadingReport !== null}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center justify-between cursor-pointer"
                  >
                    <span>🛡️ Expedientes por Fiscalizar (PDF)</span>
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            PESTAÑA: RUTAS, ESTATUS DE CAMIONES Y TRACKER GPS EN VIVO (MODO MAQUETA)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'flota_rutas' && <PresidenciaFlotaRutasTracker />}
      </div>
    </div>
  );
}
