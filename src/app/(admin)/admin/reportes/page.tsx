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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type ActiveView = null | 'ingresos' | 'corte' | 'libro-ventas' | 'fiscalizacion' | 'empleados' | 'saldos' | 'ingreso-bancario' | 'morosos' | 'transferencias';

const CARDS = [
  { id: 'ingresos' as ActiveView,       label: 'Caja - Ingresos',         emoji: '🖨️',  desc: 'General de Ingresos, Corte, Libro de Ventas', adminOnly: false },
  { id: 'corte' as ActiveView,          label: 'Cuadre de Caja',          emoji: '🗂️',  desc: 'Cuadre diario por cajero y forma de pago',    adminOnly: false },
  { id: 'fiscalizacion' as ActiveView,  label: 'Fiscalizacion',           emoji: '🛡️',  desc: 'Reporte de contribuyentes fiscalizados',       adminOnly: true  },
  { id: 'saldos' as ActiveView,         label: 'Saldo a Favor',           emoji: '💳',  desc: 'Contribuyentes con saldo a favor vigente',     adminOnly: true  },
  { id: 'empleados' as ActiveView,      label: 'Gestion Empleados',       emoji: '👥',  desc: 'Reporte mensual del personal',                 adminOnly: true  },
  { id: 'morosos' as ActiveView,        label: 'Reporte Morosos',         emoji: '🔴',  desc: 'Contribuyentes con deuda pendiente',           adminOnly: true  },
  { id: 'transferencias' as ActiveView,  label: 'Transferencias',          emoji: '🏦',  desc: 'Por Verificar, Pendiente, Débito y Aprobadas',  adminOnly: true  },
];

export default function ReportesPage() {
  const { contribuyentes, tcmmv } = useAppContext();
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [cajeros, setCajeros] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [morososData, setMorososData] = useState<{total: number; deudaTotal: number} | null>(null);
  const [loadingMorosos, setLoadingMorosos] = useState(false);

  useEffect(() => {
    let activeUser = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || '';
    let letra = (typeof window !== 'undefined' ? localStorage.getItem('adminLetra') : null) || '';
    let adminCheck = false;
    if (typeof window !== 'undefined') {
      try {
        const userData = JSON.parse(localStorage.getItem('admin_user_data') || '{}');
        if (userData.usuario) activeUser = userData.usuario;
        if (userData.letra) letra = userData.letra;
        if (userData.rol === 'Administrador' || userData.rol === 'SuperAdmin' || activeUser === 'Administrador' || activeUser === 'dzara') {
          adminCheck = true;
        }
      } catch(e) {}
    }
    const cajeroIdentifier = (!adminCheck && letra) ? `${letra}-${activeUser}` : activeUser;
    setCurrentUser(cajeroIdentifier || activeUser);
    setIsAdmin(adminCheck);

    const loadPagos = async () => {
      const { data } = await supabase.from('pagos_reportados').select('*').not('estado','in','(Anulado,Reversado,Condonado)').order('created_at', { ascending: false });
      if (data) {
        setPagos(data);
        if (adminCheck) {
          const cajerosSet = new Set<string>();
          data.forEach((p: any) => {
            try {
              const dets = typeof p.detalles === 'object' ? p.detalles : JSON.parse(p.detalles || '{}');
              if (dets.cajero) cajerosSet.add(dets.cajero);
            } catch(e) {}
          });
          setCajeros(Array.from(cajerosSet).sort());
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
  const generarLibroVentas = (tipo: 'Diario' | 'Semanal' | 'Mensual') => {
    let pf = pagos;
    if (fechaInicio && fechaFin) {
      const s = new Date(fechaInicio + 'T00:00:00'), e = new Date(fechaFin + 'T23:59:59');
      pf = pagos.filter((p: any) => { const d = new Date(p.created_at); return d >= s && d <= e; });
    }
    generarLibroVentasExcel(pf, contribuyentes, tipo, fechaInicio, fechaFin);
  };
  const generarSaldosFavor = async () => {
    const mes = new Date().toLocaleString('es-VE', { month: 'long' });
    const { data } = await supabase.from('saldos_favor').select('*');
    generarSaldosFavorExcel(data || [], mes);
  };
  const generarCorteCaja = () => {
    const s = fechaInicio ? new Date(fechaInicio + 'T00:00:00') : new Date(new Date().setHours(0,0,0,0));
    const e = fechaFin ? new Date(fechaFin + 'T23:59:59') : new Date(new Date().setHours(23,59,59,999));
    const pf = pagos.filter((p: any) => { const d = new Date(p.created_at); return d >= s && d <= e; });
    generarCorteCajaPDF(pf, contribuyentes, fechaInicio, fechaFin);
  };
  const generarIngresoBancario = (tipo: 'Diario' | 'Semanal' | 'Mensual') => {
    let pf = pagos;
    if (fechaInicio && fechaFin) {
      const s = new Date(fechaInicio + 'T00:00:00'), e = new Date(fechaFin + 'T23:59:59');
      pf = pagos.filter((p: any) => { const d = new Date(p.created_at); return d >= s && d <= e; });
    }
    generarIngresoBancarioPDF(pf, contribuyentes, tipo, fechaInicio, fechaFin);
  };
  const generarEmpleados = async () => {
    const { data } = await supabase.from('gestion_empleados').select('*');
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
    />
  );

  if (activeView === 'corte') return (
    <CuadreCaja
      pagos={pagos} cajeros={cajeros} isAdmin={isAdmin} currentUser={currentUser}
      contribuyentes={contribuyentes}
      onBack={() => setActiveView(null)}
    />
  );

  if (activeView === 'libro-ventas') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">📊 Resumen Libro de Ventas</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3 max-w-md">
        <div className="flex gap-3 mb-4">
          <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Desde</label><input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col flex-1"><label className="text-xs text-slate-500 mb-1">Hasta</label><input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        {(['Diario','Semanal','Mensual'] as const).map(t => (
          <button key={t} onClick={() => generarLibroVentas(t)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-blue-50 border border-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-colors">
            Libro de Ventas {t} <Download className="w-4 h-4 text-blue-500" />
          </button>
        ))}
      </div>
    </div>
  );

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">🔴 Reporte de Morosos</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-lg space-y-4">
        <p className="text-sm text-slate-600">Genera el listado de todos los contribuyentes con recibos <strong>Pendiente</strong> o <strong>Abonado</strong>, ordenados por mayor deuda y meses adeudados.</p>
        {morososData && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-red-700">{morososData.total}</div>
              <div className="text-xs text-red-600 mt-1 font-medium">Contribuyentes Morosos</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-red-700">Bs. {morososData.deudaTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
              <div className="text-xs text-red-600 mt-1 font-medium">Deuda Total Pendiente</div>
            </div>
          </div>
        )}
        <div className="space-y-3">
          <button
            onClick={exportarMorososExcel}
            disabled={loadingMorosos}
            className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold text-emerald-800 transition-colors disabled:opacity-50"
          >
            {loadingMorosos ? 'Generando...' : 'Exportar a Excel (.xlsx)'} <Download className="w-4 h-4 text-emerald-600" />
          </button>
          <button
            onClick={exportarMorososPDF}
            disabled={loadingMorosos}
            className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-sm font-semibold text-red-800 transition-colors disabled:opacity-50"
          >
            {loadingMorosos ? 'Generando...' : 'Exportar a PDF (landscape)'} <Download className="w-4 h-4 text-red-500" />
          </button>
        </div>
        <p className="text-[11px] text-slate-400">* Los contribuyentes con 3+ meses aparecen destacados en rojo en el PDF.</p>
      </div>
    </div>
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
    const fmtDateR = (d: string) => { try { return new Date(d).toLocaleDateString('es-VE'); } catch { return d; } };
    const [tfecha, setTfecha] = React.useState(new Date().toISOString().slice(0,10));
    const [tfechaFin, setTfechaFin] = React.useState(new Date().toISOString().slice(0,10));
    const [testado, setTestado] = React.useState('Todos');
    const getNombreR = (p: any) => {
      if (!p.identidad) return p.contribuyente || '';
      const clean = (s: string) => (s||'').replace(/[-.\s]/g,'').toUpperCase();
      const id = clean(p.identidad);
      const f = contribuyentes.find((c: any) => clean(c.identidad||'')===id||clean(c.Identidad||'')===id);
      return f?.contribuyente||f?.Contribuyente||p.contribuyente||'';
    };
    const getDetR = (p: any) => { try { return typeof p.detalles==='object'?p.detalles:JSON.parse(p.detalles||'{}'); } catch { return {}; } };
    const isDebitoR = (p: any) => p.tipo==='Debito'||p.tipo==='REC'||p.tipo==='Punto de Venta';
    const pagosR = pagos.filter(p => {
      const d = new Date(p.created_at);
      const s = new Date(tfecha+'T00:00'); const e = new Date(tfechaFin+'T23:59');
      if (d < s || d > e) return false;
      if (testado !== 'Todos' && p.estado !== testado) return false;
      return true;
    }).sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
    const totalD = pagosR.filter(isDebitoR).reduce((s,p)=>s+(parseFloat(p.monto)||0),0);
    const totalT = pagosR.filter(p=>!isDebitoR(p)).reduce((s,p)=>s+(parseFloat(p.monto)||0),0);
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
              Débito: <b className="text-emerald-700">Bs. {fmtBsR(totalD)}</b> | Transferencia: <b className="text-blue-700">Bs. {fmtBsR(totalT)}</b> | Total registros: <b>{pagosR.length}</b>
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
                  return (
                    <tr key={p.id} style={{background:i%2===0?'#fff':'#f9fafe'}}>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0'}}>{i+1}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',whiteSpace:'nowrap'}}>{fmtDateR(p.created_at)}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',fontWeight:700}}>{isDebitoR(p)?'Débito':'Transf.'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',color:'#444'}}>{cajero}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',color:'#2a5298',fontWeight:600}}>{p.identidad||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis'}}>{getNombreR(p)||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',whiteSpace:'nowrap'}}>{recs[0]||p.referencia||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0'}}>{p.banco||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0'}}>{p.referencia||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',fontWeight:700,color:getColor(p.estado)}}>{p.estado||'-'}</td>
                      <td style={{padding:'5px 8px',borderBottom:'1px solid #f0f0f0',textAlign:'right',fontWeight:700}}>{fmtBsR(parseFloat(p.monto)||0)}</td>
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

