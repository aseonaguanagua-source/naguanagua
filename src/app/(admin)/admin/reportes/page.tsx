'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/store/AppContext';
import { Download } from 'lucide-react';
import * as xlsx from 'xlsx';
import { generarLibroVentas as generarLibroVentasExcel } from './generators/LibroVentas';
import { generarSaldosFavorExcel } from './generators/SaldoAFavor';
import { generarCorteCajaPDF, generarIngresoBancarioPDF } from './generators/PdfReports';
import { generarEmpleadosExcel } from './generators/Empleados';
import { generarFiscalizacionExcel } from './generators/Fiscalizacion';
import { generarCuadreCajaPDF } from './generators/CuadreCaja';
import { generarMorososExcel, generarMorososPDF } from './generators/Morosos';
import CajaIngresosMain from './views/CajaIngresosMain';
import CuadreCaja from './views/CuadreCaja';
import MorososView from './views/MorososView';
import { aplicarMontoReporte } from './montoReporte';

import { generarTotalPuntosVenta, generarConciliacionTransferencias } from './generators/ReportesCaja';
import { generarReporteRecibosPagos } from './generators/ReporteRecibosPagos';
import { generarMontoDiarioRecaudado } from './generators/MontoDiarioRecaudado';
import { generarReporteServiciosExcel } from './generators/ReporteServicios';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type ActiveView = null | 'ingresos' | 'corte' | 'libro-ventas' | 'recibos-pagos' | 'conciliacion-bancaria' | 'puntos-venta' | 'monto-diario' | 'servicios' | 'fiscalizacion' | 'empleados' | 'saldos' | 'ingreso-bancario' | 'morosos' | 'transferencias';

const CARDS = [
  { id: 'ingresos' as ActiveView,              label: 'Caja - Ingresos',                emoji: '🖨️',  desc: 'Vista interactiva de ingresos, corte y conciliación', adminOnly: false },
  { id: 'monto-diario' as ActiveView,          label: 'Monto Diario Recaudado',         emoji: '📅',  desc: 'Punto y Transferencias en Bs y € con logos oficiales', adminOnly: false },
  { id: 'libro-ventas' as ActiveView,          label: 'Libro de Ventas SENIAT',         emoji: '📊',  desc: 'Solo Facturas Digitales (01-REG y 03-REG)',           adminOnly: false },
  { id: 'recibos-pagos' as ActiveView,         label: 'Reporte de Recibos de Pagos',    emoji: '🧾',  desc: 'Excel de recibos de pago emitidos',                    adminOnly: false },
  { id: 'conciliacion-bancaria' as ActiveView, label: 'Conciliación Bancaria',          emoji: '🏦',  desc: 'Transferencias por mes y banco (Banesco / Bancamiga)', adminOnly: false },
  { id: 'puntos-venta' as ActiveView,          label: 'Total Puntos de Venta',          emoji: '💳',  desc: 'Débitos por caja, totales por caja y general',         adminOnly: false },
  { id: 'corte' as ActiveView,                 label: 'Cuadre de Caja',                 emoji: '🗂️',  desc: 'Cuadre diario por cajero y forma de pago',            adminOnly: false },
  { id: 'transferencias' as ActiveView,        label: 'Monitoreo Transferencias',       emoji: '🔍',  desc: 'Por Verificar, Pendiente, Débito y Aprobadas',         adminOnly: true  },
  { id: 'morosos' as ActiveView,               label: 'Reporte Morosos',                emoji: '🔴',  desc: 'Contribuyentes con deuda pendiente',                  adminOnly: false },
  { id: 'saldos' as ActiveView,                label: 'Saldo a Favor',                  emoji: '💰',  desc: 'Contribuyentes con saldo a favor vigente',            adminOnly: true  },
  { id: 'fiscalizacion' as ActiveView,         label: 'Fiscalizacion',                  emoji: '🛡️',  desc: 'Reporte de contribuyentes fiscalizados',              adminOnly: true  },
  { id: 'empleados' as ActiveView,             label: 'Gestion Empleados',              emoji: '👥',  desc: 'Reporte mensual del personal',                        adminOnly: true  },
];

export default function ReportesPage() {
  const { contribuyentes, tcmmv } = useAppContext();
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [cajeros, setCajeros] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const [fechaInicio, setFechaInicio] = useState(hoyStr.slice(0, 8) + '01');
  const [fechaFin, setFechaFin] = useState(hoyStr);
  const [morososData, setMorososData] = useState<{total: number; deudaTotal: number} | null>(null);
  const [loadingMorosos, setLoadingMorosos] = useState(false);
  const [tfecha, setTfecha] = useState(hoyStr);
  const [tfechaFin, setTfechaFin] = useState(hoyStr);
  const [testado, setTestado] = useState('Todos');
  const [servTipoFiltro, setServTipoFiltro] = useState('Todos');
  const [servEstadoFiltro, setServEstadoFiltro] = useState('Todos');

  useEffect(() => {
    let activeUser = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || '';
    let letra = (typeof window !== 'undefined' ? localStorage.getItem('adminLetra') : null) || '';
    let adminCheck = false;
    let canViewAllReports = false;
    if (typeof window !== 'undefined') {
      try {
        const userData = JSON.parse(localStorage.getItem('admin_user_data') || '{}');
        if (userData.usuario) activeUser = userData.usuario;
        if (userData.letra) letra = userData.letra;

        const hasPermiso = (k: string) => {
          if (!userData?.permisos) return false;
          if (Array.isArray(userData.permisos)) return userData.permisos.includes(k);
          if (typeof userData.permisos === 'object') return Boolean(userData.permisos[k]);
          return false;
        };

        const uLower = (activeUser || '').toLowerCase();
        const esUsuarioTodasCajas = 
          uLower === 'patricia' || 
          uLower === 'n-patricia' || 
          (letra && letra.toUpperCase() === 'N' && uLower.includes('patricia')) ||
          uLower === 'administrador' || 
          uLower === 'dzara';

        if (userData.rol === 'Administrador' || userData.rol === 'SuperAdmin' || uLower === 'administrador' || uLower === 'dzara') {
          adminCheck = true;
        }
        if (adminCheck || hasPermiso('ver_todos_reportes_caja') || esUsuarioTodasCajas) {
          canViewAllReports = true;
        }
      } catch(e) {}
    }
    const cajeroIdentifier = (!adminCheck && letra) ? `${letra}-${activeUser}` : activeUser;
    setCurrentUser(cajeroIdentifier || activeUser);
    setIsAdmin(adminCheck || canViewAllReports);

    const loadPagos = async () => {
      let allPagos: any[] = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('pagos_reportados')
          .select('*')
          .not('estado','in','(Reversado,Condonado)')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        allPagos.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      if (allPagos.length > 0) {
        setPagos(allPagos.map(aplicarMontoReporte));
        if (adminCheck || canViewAllReports) {
          const CAJEROS_CANONICOS: Record<string, string> = {
            'arianny': 'A-arianny', 'a-arianny': 'A-arianny', 'arianny seijas': 'A-arianny', 'a-arianny seijas': 'A-arianny',
            'maira': 'B-maira', 'b-maira': 'B-maira', 'maira castellano': 'B-maira', 'b-maira castellano': 'B-maira',
            'daniela': 'C-daniela', 'c-daniela': 'C-daniela', 'daniela gonzalez': 'C-daniela', 'c-daniela gonzalez': 'C-daniela',
            'otto': 'D-otto', 'd-otto': 'D-otto', 'otto schram': 'D-otto', 'd-otto schram': 'D-otto',
            'luis': 'E-luis', 'e-luis': 'E-luis', 'luis vivas': 'E-luis', 'e-luis vivas': 'E-luis',
            'omar': 'F-omar', 'f-omar': 'F-omar', 'omar lopez': 'F-omar', 'f-omar lopez': 'F-omar',
            'marianny': 'H-marianny', 'h-marianny': 'H-marianny', 'marianny orta': 'H-marianny', 'h-marianny orta': 'H-marianny',
            'nany': 'J-nany', 'j-nany': 'J-nany', 'nany lovera': 'J-nany', 'j-nany lovera': 'J-nany',
            'johana': 'K-johana', 'k-johana': 'K-johana', 'johana pena': 'K-johana', 'johana peña': 'K-johana', 'k-johana pena': 'K-johana', 'k-johana peña': 'K-johana',
            'valentina': 'M-valentina', 'm-valentina': 'M-valentina', 'valentina castellanos': 'M-valentina', 'm-valentina castellanos': 'M-valentina',
            'patricia': 'N-patricia', 'n-patricia': 'N-patricia', 'patricia povis': 'N-patricia', 'n-patricia povis': 'N-patricia',
            'carlieth': 'O-carlieth', 'o-carlieth': 'O-carlieth', 'carlieth palencia': 'O-carlieth', 'o-carlieth palencia': 'O-carlieth',
            'mariangel': 'P-mariangel', 'p-mariangel': 'P-mariangel', 'mariangel adarmes': 'P-mariangel', 'p-mariangel adarmes': 'P-mariangel',
            'nell': 'Q-nell', 'q-nell': 'Q-nell',
            'damary': 'R-damary', 'damaris': 'R-damary', 'r-damary': 'R-damary', 'r-damaris': 'R-damary', 'damary vina': 'R-damary', 'damary viña': 'R-damary', 'r-damary vina': 'R-damary', 'r-damary viña': 'R-damary',
            'isamar': 'isamar', 'isamar cortell': 'isamar',
            'raquel': 'raquel', 'raquel carmona': 'raquel',
          };
          const EXCLUIDOS = new Set(['dzara', 'dz-dzara', 'c-dzara', 'damary2', 'x-damary2', 'david', 'z-david', 'zelda', 'z-zelda']);
          const normalizarCajeroOpcion = (raw: any): string | null => {
            const s = String(raw || '').trim();
            if (!s) return null;
            const lower = s.toLowerCase().replace(/\s+/g, ' ');
            if (EXCLUIDOS.has(lower)) return null;
            if (CAJEROS_CANONICOS[lower]) return CAJEROS_CANONICOS[lower];
            const prefMatch = lower.match(/^([a-z]{1,2})\s*-\s*(.+)$/);
            if (prefMatch) {
              const letra = prefMatch[1];
              const resto = prefMatch[2].trim();
              if (EXCLUIDOS.has(`${letra}-${resto}`) || EXCLUIDOS.has(resto)) return null;
              if (CAJEROS_CANONICOS[resto]) return CAJEROS_CANONICOS[resto];
              const primerNombre = resto.split(' ')[0];
              if (CAJEROS_CANONICOS[`${letra}-${primerNombre}`]) return CAJEROS_CANONICOS[`${letra}-${primerNombre}`];
            }
            return s;
          };

          const cajerosSet = new Set<string>();
          allPagos.forEach((p: any) => {
            try {
              const dets = typeof p.detalles === 'object' ? p.detalles : JSON.parse(p.detalles || '{}');
              const c1 = normalizarCajeroOpcion(dets.cajero);
              const c2 = normalizarCajeroOpcion(dets.analista);
              if (c1) cajerosSet.add(c1);
              if (c2) cajerosSet.add(c2);
            } catch(e) {}
          });
          // Asegurar inclusión de todos los cajeros activos con letra registrados
          try {
            const { data: trabs } = await supabase
              .from('trabajadores')
              .select('usuario, letra, estado')
              .not('letra', 'is', null);
            if (trabs) {
              trabs.forEach((t: any) => {
                if (String(t.estado || '').toLowerCase() === 'suspendido') return;
                const u = (t.usuario || '').trim();
                const l = (t.letra || '').trim().toUpperCase();
                if (l && u) {
                  const norm = normalizarCajeroOpcion(`${l}-${u}`);
                  if (norm) cajerosSet.add(norm);
                }
              });
            }
          } catch(e) {}
          setCajeros(Array.from(cajerosSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
        } else {
          const myOptions = new Set<string>();
          if (cajeroIdentifier) myOptions.add(cajeroIdentifier);
          if (activeUser) myOptions.add(activeUser);
          setCajeros(Array.from(myOptions));
        }
      }
    };
    loadPagos();
  }, []);

  // --- Legacy export functions (kept for download buttons) ---
  const fechaEfectivaPago = (p: any): Date => {
    const det = typeof p.detalles === 'string' ? (() => { try { return JSON.parse(p.detalles); } catch { return {}; } })() : (p.detalles || {});
    const fd = det.factura_digital || {};
    const fOv = det.fecha_emision_override || (fd.fecha_emision ? String(fd.fecha_emision).slice(0, 10) : '');
    if (fOv && /^\d{4}-\d{2}-\d{2}$/.test(String(fOv))) {
      return new Date(`${String(fOv)}T12:00:00`);
    }
    return new Date(p.created_at);
  };

  const generarLibroVentas = (tipo: 'Diario' | 'Semanal' | 'Mensual') => {
    let pf = pagos;
    if (fechaInicio && fechaFin) {
      const s = new Date(fechaInicio + 'T00:00:00.000-04:00'), e = new Date(fechaFin + 'T23:59:59.999-04:00');
      pf = pagos.filter((p: any) => { const d = new Date(p.created_at); return !isNaN(d.getTime()) && d >= s && d <= e; });
    }
    generarLibroVentasExcel(pf, contribuyentes, tipo, fechaInicio, fechaFin);
  };
  const generarSaldosFavor = async () => {
    const mes = new Date().toLocaleString('es-VE', { month: 'long' });
    const { data } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, clasificacion, estado, saldo_favor_bs, updated_at')
      .gt('saldo_favor_bs', 0)
      .order('saldo_favor_bs', { ascending: false });
    generarSaldosFavorExcel(data || [], mes);
  };
  const generarCorteCaja = () => {
    const s = fechaInicio ? new Date(fechaInicio + 'T00:00:00.000-04:00') : new Date(new Date().setHours(0,0,0,0));
    const e = fechaFin ? new Date(fechaFin + 'T23:59:59.999-04:00') : new Date(new Date().setHours(23,59,59,999));
    const pf = pagos.filter((p: any) => { const d = new Date(p.created_at); return d >= s && d <= e; });
    generarCorteCajaPDF(pf, contribuyentes, fechaInicio, fechaFin);
  };
  const generarIngresoBancario = (tipo: 'Diario' | 'Semanal' | 'Mensual') => {
    let pf = pagos;
    if (fechaInicio && fechaFin) {
      const s = new Date(fechaInicio + 'T00:00:00.000-04:00'), e = new Date(fechaFin + 'T23:59:59.999-04:00');
      pf = pagos.filter((p: any) => { const d = new Date(p.created_at); return d >= s && d <= e; });
    }
    generarIngresoBancarioPDF(pf, contribuyentes, tipo, fechaInicio, fechaFin);
  };
  const generarEmpleados = async () => {
    const { data } = await supabase.from('trabajadores').select('*');
    if (data) generarEmpleadosExcel(data);
  };
  const generarFiscalizacion = (tipo: string) => {
    generarFiscalizacionExcel(contribuyentes.slice(0, 50), tipo);
  };

  // --- Routing ---
  if (activeView === 'ingresos') return (
    <CajaIngresosMain
      pagos={pagos} cajeros={cajeros} isAdmin={isAdmin} currentUser={currentUser}
      tcmmv={tcmmv || 0} contribuyentes={contribuyentes} onBack={() => setActiveView(null)}
      onPagoActualizado={(row: any) => setPagos(prev => prev.map(p => (p.id === row.id ? aplicarMontoReporte(row) : p)))}
    />
  );

  if (activeView === 'corte') return (
    <CuadreCaja
      pagos={pagos} cajeros={cajeros} isAdmin={isAdmin} currentUser={currentUser}
      contribuyentes={contribuyentes}
      onPagoActualizado={(row: any) => setPagos(prev => prev.map(p => (p.id === row.id ? aplicarMontoReporte(row) : p)))}
      onBack={() => setActiveView(null)}
    />
  );

  if (activeView === 'libro-ventas') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">📊 Libro de Ventas SENIAT</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 max-w-lg">
        <p className="text-xs text-slate-600">
          Genera el Libro de Ventas en Excel con formato SENIAT. Incluye exclusivamente facturas digitales emitidas (01-REG) y facturas anuladas por Nota de Crédito (03-REG).
        </p>
        <div className="flex gap-3">
          <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Desde</label><input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Hasta</label><input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        {(['Diario','Semanal','Mensual'] as const).map(t => (
          <button key={t} onClick={() => generarLibroVentas(t)} className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold text-emerald-900 transition-colors">
            Descargar Libro de Ventas {t} (Excel) <Download className="w-4 h-4 text-emerald-700" />
          </button>
        ))}
      </div>
    </div>
  );

  if (activeView === 'recibos-pagos') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold text-slate-800">🧾 Reporte de Recibos de Pagos</h1>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 max-w-lg">
          <p className="text-xs text-slate-600">
            Genera la planilla oficial en Excel del <b>REPORTE DE RECIBOS DE PAGOS</b> con columnas de Código Inmueble, N° de Recibo, Servicio de Aseo, Multas y Totales.
          </p>
          <div className="flex gap-3">
            <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Desde</label><input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Hasta</label><input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <button
            onClick={() => generarReporteRecibosPagos(pagos, contribuyentes, fechaInicio, fechaFin)}
            className="w-full flex items-center justify-between px-4 py-3 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-sm font-semibold text-teal-900 transition-colors"
          >
            Descargar REPORTE DE RECIBOS DE PAGOS (Excel) <Download className="w-4 h-4 text-teal-700" />
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'conciliacion-bancaria') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold text-slate-800">🏦 Conciliación Bancaria de Transferencias</h1>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 max-w-lg">
          <p className="text-xs text-slate-600">
            Descarga la hoja de cálculo con la conciliación de transferencias organizadas por mes del pago, con separación detallada de <b>Banesco</b> y <b>Bancamiga</b> y subtotales por banco.
          </p>
          <div className="flex gap-3">
            <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Desde</label><input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Hasta</label><input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <button
            onClick={() => generarConciliacionTransferencias(pagos, contribuyentes, fechaInicio, fechaFin)}
            className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-sm font-semibold text-purple-900 transition-colors"
          >
            Descargar Conciliación Bancaria (Excel) <Download className="w-4 h-4 text-purple-700" />
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'puntos-venta') {
    const pf = pagos.filter((p: any) => {
      const x = new Date(p.created_at);
      if (isNaN(x.getTime())) return false;
      const dStr = new Date(x.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
      return dStr >= fechaInicio && dStr <= fechaFin;
    });
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold text-slate-800">💳 Total Puntos de Venta (Débitos)</h1>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 max-w-lg">
          <p className="text-xs text-slate-600">
            Descarga el reporte detallado en Excel de todos los cobros de punto de venta (débito) de todas las cajas (con contribuyente, RIF, inmueble, recibo, lote, aprobación y desglose de IVA), además del resumen por día y por caja.
          </p>
          <div className="flex gap-3">
            <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Desde</label><input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Hasta</label><input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <button
            onClick={() => generarTotalPuntosVenta(pf, fechaInicio, fechaFin, contribuyentes)}
            className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm font-semibold text-blue-900 transition-colors"
          >
            Descargar Detalle y Total Puntos de Venta — Todas las Cajas (Excel) <Download className="w-4 h-4 text-blue-700" />
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'monto-diario') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold text-slate-800">📅 Monto Diario Recaudado</h1>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 max-w-lg">
          <p className="text-xs text-slate-600">
            Genera la planilla oficial en Excel del <b>MONTO DIARIO RECAUDADO</b> con desglose diario/semanal por Punto de Venta (Bs y €), Transferencias y Depósitos (Bs y €), Estado de Cuenta consolidado y logos oficiales del IAMEC.
          </p>
          <div className="flex gap-3">
            <div className="flex flex-col flex-1">
              <label className="text-xs text-slate-500 mb-1">Desde</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col flex-1">
              <label className="text-xs text-slate-500 mb-1">Hasta</label>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <button
            onClick={() => generarMontoDiarioRecaudado({ pagos, fechaInicio, fechaFin, tcmmvActual: tcmmv || 0 })}
            className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-sm font-semibold text-indigo-900 transition-colors"
          >
            Descargar Monto Diario Recaudado (Excel) <Download className="w-4 h-4 text-indigo-700" />
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'servicios') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold text-slate-800">🛠️ Reporte de Servicios Especiales y Extraordinarios</h1>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 max-w-lg">
          <p className="text-xs text-slate-600">
            Genera la planilla oficial en Excel de <b>SERVICIOS ESPECIALES Y EXTRAORDINARIOS</b> con columnas de Tipo de Servicio, Fecha, Código, Nombre, Dirección, Fecha a Realizar, Monto a Pagar, Pagado, totalización y logos oficiales del IAMEC.
          </p>
          <div className="flex gap-3">
            <div className="flex flex-col flex-1">
              <label className="text-xs text-slate-500 mb-1">Desde</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col flex-1">
              <label className="text-xs text-slate-500 mb-1">Hasta</label>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-slate-500 mb-1">Tipo de Servicio</label>
              <select value={servTipoFiltro} onChange={e => setServTipoFiltro(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="Todos">Todos los Servicios</option>
                <option value="esp_ext">Solo Especiales y Extraordinarios</option>
                <option value="especial">Servicio Especial</option>
                <option value="extraordinario">Servicio Extraordinario</option>
                <option value="inspeccion">Inspección</option>
                <option value="visto_bueno">Visto Bueno Ambiental</option>
                <option value="tala_poda">Permisos (Tala/Poda)</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-slate-500 mb-1">Estado</label>
              <select value={servEstadoFiltro} onChange={e => setServEstadoFiltro(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="Todos">Todos</option>
                <option value="Pagado">Pagado</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Por Verificar">Por Verificar</option>
              </select>
            </div>
          </div>
          <button
            onClick={() =>
              generarReporteServiciosExcel({
                pagos,
                contribuyentes,
                fechaInicio,
                fechaFin,
                tipoFiltro: servTipoFiltro,
                estadoFiltro: servEstadoFiltro,
              })
            }
            className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold text-emerald-900 transition-colors"
          >
            Descargar Reporte con Rango de Fechas (Excel) <Download className="w-4 h-4 text-emerald-700" />
          </button>
          <button
            onClick={() =>
              generarReporteServiciosExcel({
                pagos,
                contribuyentes,
                tipoFiltro: servTipoFiltro,
                estadoFiltro: servEstadoFiltro,
              })
            }
            className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-sm font-semibold text-purple-900 transition-colors"
          >
            Descargar Histórico Completo (Sin Límite de Fecha) <Download className="w-4 h-4 text-purple-700" />
          </button>
        </div>
      </div>
    );
  }

  if (activeView === 'fiscalizacion') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">🛡️ Fiscalizacion</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3 max-w-md">
        <button onClick={() => generarFiscalizacion('General')} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-purple-50 border border-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-colors">Reporte General (Excel) <Download className="w-4 h-4 text-purple-500" /></button>
        <button onClick={() => generarFiscalizacion('Pendientes')} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-purple-50 border border-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-colors">Por Fiscalizar (Excel) <Download className="w-4 h-4 text-purple-500" /></button>
      </div>
    </div>
  );

  if (activeView === 'empleados') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">👥 Gestion Empleados</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-md">
        <button onClick={generarEmpleados} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-orange-50 border border-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-colors">Reporte Mensual (Excel) <Download className="w-4 h-4 text-orange-500" /></button>
      </div>
    </div>
  );



  const cargarMorosos = async () => {
    setLoadingMorosos(true);
    try {
      let all: any[] = []; let from = 0;
      while (true) {
        const { data: chunk } = await supabase.from('facturas').select('*')
          .in('estado', ['Pendiente', 'Abonado']).range(from, from + 999);
        if (!chunk || chunk.length === 0) break;
        all = [...all, ...chunk];
        from += 1000;
        if (chunk.length < 1000) break;
      }
      const ids = new Set(all.map((f: any) => (f.identidad || '').replace(/-/g,'').toUpperCase()).filter(Boolean));
      const totalDeuda = all.reduce((s: number, f: any) => s + (parseFloat(String(f.monto || '0').replace(/[^\d.]/g,'')) || 0), 0);
      setMorososData({ total: ids.size, deudaTotal: totalDeuda });
      return all;
    } catch(e) { console.error(e); return []; }
    finally { setLoadingMorosos(false); }
  };

  const exportarMorososExcel = async () => {
    const recibos = await cargarMorosos();
    if (recibos.length > 0) await generarMorososExcel(recibos, contribuyentes, tcmmv || 0);
  };

  const exportarMorososPDF = async () => {
    const recibos = await cargarMorosos();
    if (recibos.length > 0) await generarMorososPDF(recibos, contribuyentes, tcmmv || 0);
  };

  if (activeView === 'morosos') return (
    <MorososView
      contribuyentes={contribuyentes}
      tcmmv={tcmmv || 0}
      onBack={() => setActiveView(null)}
    />
  );

  if (activeView === 'saldos') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">💳 Saldo a Favor</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-md">
        <button onClick={generarSaldosFavor} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-teal-50 border border-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-colors">Reporte Mensual (Excel) <Download className="w-4 h-4 text-teal-500" /></button>
      </div>
    </div>
  );

  if (activeView === 'ingreso-bancario') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">🏦 Ingreso Bancario</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3 max-w-md">
        <div className="flex gap-3 mb-4">
          <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Desde</label><input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Hasta</label><input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        {(['Diario','Semanal','Mensual'] as const).map(t => (
          <button key={t} onClick={() => generarIngresoBancario(t)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-red-50 border border-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-colors">
            Ingreso Bancario {t} (PDF) <Download className="w-4 h-4 text-red-500" />
          </button>
        ))}
      </div>
    </div>
  );

  if (activeView === 'transferencias') {
    const fmtBsR = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDateR = (d: string) => {
      if (!d) return '-';
      const s = String(d).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, day] = s.split('-');
        return `${Number(day)}/${Number(m)}/${y}`;
      }
      try {
        return new Date(s).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
      } catch {
        return d;
      }
    };
    const getNombreR = (p: any) => {
      if (!p.identidad) return p.contribuyente || '';
      const clean = (s: string) => (s||'').replace(/[-.\s]/g,'').toUpperCase();
      const id = clean(p.identidad);
      const f = contribuyentes.find((c: any) => clean(c.identidad||'')===id||clean(c.Identidad||'')===id);
      return f?.contribuyente||f?.Contribuyente||p.contribuyente||'';
    };
    const getDetR = (p: any) => { try { return typeof p.detalles==='object'?p.detalles:JSON.parse(p.detalles||'{}'); } catch { return {}; } };
    const isSaldoR = (p: any) => {
      const t = String(p.tipo || '').toUpperCase().trim();
      const det = getDetR(p);
      if (t && !t.includes('SALDO') && !t.includes('NOTA DE CREDITO') && !t.includes('NOTA DE CRÉDITO')) return false;
      const paList = Array.isArray(det.pagos_agregados) ? det.pagos_agregados : [];
      if (paList.some((x: any) => x?.metodo && !String(x.metodo).toUpperCase().includes('SALDO'))) return false;
      const detTipo = String(det.tipo || '').toUpperCase();
      return t.includes('SALDO') || t.includes('NOTA DE CREDITO') || t.includes('NOTA DE CRÉDITO') ||
             detTipo.includes('SALDO') || detTipo.includes('NOTA DE CREDITO') || detTipo.includes('NOTA DE CRÉDITO') ||
             Boolean(det.es_saldo_a_favor || det.es_nota_credito);
    };
    const isRetencionR = (p: any) => {
      const t = String(p.tipo || '').toUpperCase().trim();
      const det = getDetR(p);
      return t.includes('RETENCION') || t.includes('RETENCIÓN') || Boolean(det?.es_retencion && !t.includes('TRANSFERENCIA') && !t.includes('DEBITO') && !t.includes('DÉBITO') && !t.includes('CREDITO') && !t.includes('CRÉDITO') && !t.includes('TMD') && !t.includes('TVD'));
    };
    const isDebitoPOSR = (p: any) => {
      if (isSaldoR(p)) return false;
      const t = String(p.tipo || '').toUpperCase().trim();
      return (t.includes('DEBITO') || t.includes('DÉBITO') || t === 'REC' || t === 'PUNTO DE VENTA') && !t.includes('CREDITO') && !t.includes('CRÉDITO') && !t.includes('TMD') && !t.includes('TVD');
    };
    const isCreditoPOSR = (p: any) => {
      if (isSaldoR(p)) return false;
      const t = String(p.tipo || '').toUpperCase().trim();
      return (t.includes('CREDITO') || t.includes('CRÉDITO') || t.includes('TMD') || t.includes('TVD')) && !t.includes('NOTA');
    };
    const isTarjetaR = (p: any) => isDebitoPOSR(p) || isCreditoPOSR(p);
    const parseMontoNumR = (v: any): number => {
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      if (!v) return 0;
      const s = String(v).trim();
      if (s.includes(',') && s.includes('.')) {
        return Number(s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) || 0;
      }
      if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
      return Number(s) || 0;
    };
    const obtenerMontoEfectivoR = (p: any): number => {
      if (isTarjetaR(p)) return parseFloat(p.monto) || 0;
      const d = getDetR(p);
      if (d?.monto_reporte != null) return parseMontoNumR(d.monto_reporte);
      const mBase = parseMontoNumR(p?.monto);
      const tUpper = String(p.tipo || '').toUpperCase().trim();
      if (tUpper.includes('DEPOSITO') || tUpper.includes('DEPÓSITO')) return mBase;
      const mConc = parseMontoNumR(d?.monto_conciliado);
      const esMultiple = Boolean(
        d?.es_pago_adicional ||
        d?.abono_completado ||
        (Array.isArray(d?.pagos_agregados) && d.pagos_agregados.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito|desc\.?\s*saldo/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1) ||
        (Array.isArray(d?.formasPago) && d.formasPago.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito|desc\.?\s*saldo/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1)
      );
      if (esMultiple && mBase > 0 && mConc > mBase + 1) return mBase;
      if (mConc > 0 && (!Array.isArray(d?.pagos_agregados) || !d.pagos_agregados.some((x: any) => /saldo\s*a\s*favor/i.test(String(x?.referencia || x?.metodo || ''))))) return mConc;
      return mBase || mConc;
    };
    const pagoPorIdR = new Map<string, any>();
    for (const p of pagos) {
      if (p?.id) pagoPorIdR.set(String(p.id), p);
    }
    const parseFechaCaracasR = (val: any): Date | null => {
      if (!val) return null;
      const s = String(val).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T12:00:00-04:00`);
        return !isNaN(d.getTime()) ? d : null;
      }
      const d = new Date(s);
      return !isNaN(d.getTime()) ? d : null;
    };
    const obtenerFechaEfectivaR = (p: any, det: any): Date => {
      const corrList = Array.isArray(det.correcciones_reporte) ? det.correcciones_reporte : [];
      const lastCorr = corrList.length > 0 ? corrList[corrList.length - 1] : null;
      const corrTieneFecha = Boolean(
        lastCorr?.fecha_nueva &&
        String(lastCorr.fecha_anterior || '').slice(0, 10) !== String(lastCorr.fecha_nueva).slice(0, 10)
      );
      if (corrTieneFecha && lastCorr?.fecha_nueva) {
        const dCorr = parseFechaCaracasR(lastCorr.fecha_nueva);
        if (dCorr) return dCorr;
      }
      if (!isTarjetaR(p)) {
        const fd = det.factura_digital || {};
        const pagoPadre = det.pago_principal_id ? pagoPorIdR.get(String(det.pago_principal_id)) : null;
        const detPadre = pagoPadre ? getDetR(pagoPadre) : null;
        const fdPadre = detPadre?.factura_digital || {};
        const rc0 = Array.isArray(det.recibo_caja) ? det.recibo_caja[0] : det.recibo_caja;
        const rcPadre0 = Array.isArray(detPadre?.recibo_caja) ? detPadre.recibo_caja[0] : detPadre?.recibo_caja;
        const candidatos = [
          det.fecha_emision_override,
          (fd.emitida || fd.numero_documento || fd.numero_control) ? fd.fecha_emision : '',
          detPadre?.fecha_emision_override,
          (fdPadre?.emitida || fdPadre?.numero_documento || fdPadre?.numero_control) ? fdPadre.fecha_emision : '',
          rc0?.fechaEmision,
          rcPadre0?.fechaEmision,
          det.fecha_transaccion,
          rc0?.fechaIngresoCaja,
          rcPadre0?.fechaIngresoCaja,
          det.fecha_ingreso_caja,
        ];
        for (const c of candidatos) {
          const dCand = parseFechaCaracasR(c);
          if (dCand) return dCand;
        }
        const createdStr = String(p.created_at || '');
        if (createdStr.includes('T16:00:00') && det.recibo_caja_at) {
          const dReal = new Date(det.recibo_caja_at);
          if (!isNaN(dReal.getTime())) return dReal;
        }
      }
      return new Date(p.created_at);
    };
    const pagosR = pagos.filter(p => {
      if (p.estado === 'Anulado' || p.estado === 'Reversado' || p.estado === 'Condonado' || p.estado === 'Rechazado') return false;
      if (isSaldoR(p) || isRetencionR(p)) return false;
      const det = getDetR(p);
      const cajTest = String(det?.cajero || det?.analista || '').trim();
      if (/^(dz-)?dzara$|^c-dzara$/i.test(cajTest)) return false;
      if (det?.monto_reporte != null && Number(det.monto_reporte) <= 0 && (Number(p?.monto) || 0) <= 0) return false;
      const d = obtenerFechaEfectivaR(p, det);
      let dYmd = '';
      try {
        dYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);
      } catch {
        dYmd = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(p.created_at || '').slice(0, 10);
      }
      if (!dYmd || dYmd < tfecha || dYmd > tfechaFin) return false;
      if (testado !== 'Todos' && p.estado !== testado) return false;
      return true;
    }).sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
    const totalDebitoPOS = pagosR.filter(isDebitoPOSR).reduce((s,p)=>s+obtenerMontoEfectivoR(p),0);
    const totalCreditoPOS = pagosR.filter(isCreditoPOSR).reduce((s,p)=>s+obtenerMontoEfectivoR(p),0);
    const totalD = totalDebitoPOS + totalCreditoPOS;
    const totalT = pagosR.filter(p=>!isTarjetaR(p)).reduce((s,p)=>s+obtenerMontoEfectivoR(p),0);
    const estados = ['Todos','Por Verificar','Aprobado','Con Diferencia','Pendiente'];
    const getColor = (e: string) => e==='Aprobado'?'#166534':e==='Por Verificar'?'#92400e':e==='Con Diferencia'?'#5b21b6':e==='Pendiente'?'#991b1b':'#555';
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
          <span className="text-slate-300">|</span>
          <h1 className="text-lg font-bold text-slate-800">🏦 Reporte de Transferencias</h1>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div className="flex flex-col"><label className="text-xs text-slate-500 mb-1">Desde</label><input type="date" value={tfecha} onChange={e=>setTfecha(e.target.value)} className="border rounded-lg px-3 py-2 text-sm"/></div>
            <div className="flex flex-col"><label className="text-xs text-slate-500 mb-1">Hasta</label><input type="date" value={tfechaFin} onChange={e=>setTfechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm"/></div>
            <div className="flex flex-col"><label className="text-xs text-slate-500 mb-1">Estado</label>
              <select value={testado} onChange={e=>setTestado(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
                {estados.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="text-xs text-slate-500 self-end pb-2">
              Punto (Débito + Crédito): <b className="text-emerald-700">Bs. {fmtBsR(totalD)}</b> <span className="text-[11px] text-slate-400">(Débito: Bs. {fmtBsR(totalDebitoPOS)} · Crédito TMD/TVD: Bs. {fmtBsR(totalCreditoPOS)})</span> | Transferencia: <b className="text-blue-700">Bs. {fmtBsR(totalT)}</b> | Total registros: <b>{pagosR.length}</b>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'#4a6fa5',color:'#fff'}}>
                  {['#','Fecha','Tipo','Operador','RIF/CI','Contribuyente','Recibo','Banco','Referencia','Estado','Monto'].map(h=>(
                    <th key={h} style={{padding:'6px 8px',textAlign:'left',whiteSpace:'nowrap',borderRight:'1px solid #3a5a90'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagosR.map((p,i)=>{
                  const det = getDetR(p);
                  let recs: string[] = [];
                  try { recs = det.recibos||[]; } catch{}
                  const cajero = det.cajero||det.analista||'-';
                  const fechaEf = obtenerFechaEfectivaR(p, det);
                  const tipoLabel = isDebitoPOSR(p) ? 'Débito' : isCreditoPOSR(p) ? `Crédito (${p.tipo})` : 'Transf.';
                  return (
                    <tr key={p.id} style={{background:i%2===0?'#fff':'#f9fafe'}}>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0'}}>{i+1}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',whiteSpace:'nowrap'}}>{fmtDateR(fechaEf.toISOString())}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',fontWeight:700}}>{tipoLabel}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',color:'#444'}}>{cajero}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',color:'#2a5298',fontWeight:600}}>{p.identidad||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis'}}>{getNombreR(p)||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',whiteSpace:'nowrap'}}>{recs[0]||p.referencia||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0'}}>{p.banco||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0'}}>{p.referencia||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',fontWeight:700,color:getColor(p.estado)}}>{p.estado||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',textAlign:'right',fontWeight:700}}>{fmtBsR(obtenerMontoEfectivoR(p))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{background:'#f0f4f8',fontWeight:700}}>
                  <td colSpan={10} style={{padding:'5px 8px'}}>Total: {pagosR.length} registros</td>
                  <td style={{padding:'5px 8px',textAlign:'right'}}>Bs. {fmtBsR(totalD+totalT)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --- Main landing: Cards ---
  const visibleCards = CARDS.filter(c => isAdmin || !c.adminOnly);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-800">Reportes</h1>
        <p className="text-slate-500 text-sm mt-1">Selecciona un modulo para generar o visualizar el reporte</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {visibleCards.map(card => (
          <button
            key={card.id}
            onClick={() => setActiveView(card.id)}
            className="group bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center gap-3 text-center hover:border-blue-400 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="text-3xl group-hover:scale-110 transition-transform duration-200">{card.emoji}</div>
            <span className="text-sm font-semibold text-slate-700 leading-tight">{card.label}</span>
            <span className="text-[11px] text-slate-400 leading-snug">{card.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

