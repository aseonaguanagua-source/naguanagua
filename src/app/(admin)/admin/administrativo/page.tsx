'use client';
import React, { useState, useEffect } from 'react';
import { 
  PieChart as PieChartIcon, ArrowUpRight, ArrowDownRight, Users,
  Wallet, AlertTriangle, Building2, TrendingUp, DollarSign 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';

function parseMonto(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  let s = String(val).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export default function DashboardAdministrativo() {
  const { recibos, inmuebles } = useAppContext();
  const [currency, setCurrency] = useState<'Bs' | 'MMV'>('Bs');
  const [tcmmv, setTcmmv] = useState<number>(1);
  const [pagosReportados, setPagosReportados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const [totalRecaudadoBs, setTotalRecaudadoBs] = useState(0);
  const [totalRecaudadoHoyBs, setTotalRecaudadoHoyBs] = useState(0);
  const [totalRecaudadoMesBs, setTotalRecaudadoMesBs] = useState(0);
  const [totalDeudaBs, setTotalDeudaBs] = useState(0);
  const [morosidadRate, setMorosidadRate] = useState(0);
  
  // Charts Data
  const [deudaPorSector, setDeudaPorSector] = useState<any[]>([]);
  const [solvenciaData, setSolvenciaData] = useState<any[]>([]);
  const [topDeudores, setTopDeudores] = useState<any[]>([]);
  const [recaudacionHistoria, setRecaudacionHistoria] = useState<any[]>([]);

  useEffect(() => {
    fetchTCMMV();
  }, []);

  useEffect(() => {
    if (!loading) {
      calculateStats();
    }
  }, [recibos, pagosReportados, inmuebles, loading, tcmmv]);

  const fetchTCMMV = async () => {
    try {
      const res = await fetch('/api/bcv');
      const data = await res.json();
      setTcmmv(data.tcmmv || 1);
      
      const { data: pagos } = await supabase
        .from('pagos_reportados')
        .select('*')
        .eq('estado', 'Aprobado');
      setPagosReportados(pagos || []);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const calculateStats = () => {
    let recaudado = 0;
    let recHoy = 0;
    let recMes = 0;
    let deuda = 0;
    
    // Deuda por contribuyente
    const deudasContribuyentes: Record<string, { nombre: string, monto: number }> = {};
    // Deuda por clasificacion/sector
    const deudasSectores: Record<string, number> = {};
    
    // Recaudacion por dia
    const historiaDiaria: Record<string, number> = {};
    
    const hoyObj = new Date();
    const hoyStr = hoyObj.toISOString().split('T')[0];
    const currentMonth = hoyObj.getMonth();
    const currentYear = hoyObj.getFullYear();

    // Solo sumamos deuda de los recibos pendientes
    recibos.forEach((f: any) => {
      const montoMatch = String(f.monto).match(/[\d.]+/);
      const monto = montoMatch ? parseFloat(montoMatch[0]) : 0;
      
      if (f.estado !== 'Pagado') {
        deuda += monto;
        if (!deudasContribuyentes[f.identidad]) {
          deudasContribuyentes[f.identidad] = { nombre: f.contribuyente, monto: 0 };
        }
        deudasContribuyentes[f.identidad].monto += monto;
      }
    });

    // Calcular recaudacion a partir de pagos aprobados reales
    pagosReportados.forEach((pago: any) => {
      const monto = parseMonto(pago.monto);
      recaudado += monto;

      const dateStr = pago.created_at ? pago.created_at.split('T')[0] : hoyStr;
      const dateObj = new Date(dateStr);

      if (dateStr === hoyStr) recHoy += monto;
      if (dateObj.getMonth() === currentMonth && dateObj.getFullYear() === currentYear) recMes += monto;

      if (!historiaDiaria[dateStr]) historiaDiaria[dateStr] = 0;
      historiaDiaria[dateStr] += monto;
    });

    setTotalRecaudadoBs(recaudado);
    setTotalRecaudadoHoyBs(recHoy);
    setTotalRecaudadoMesBs(recMes);
    setTotalDeudaBs(deuda);

    const totalFacturado = recaudado + deuda;
    setMorosidadRate(totalFacturado > 0 ? (deuda / totalFacturado) * 100 : 0);

    // Inmuebles solventes vs morosos
    let solventes = 0;
    let morosos = 0;
    
    inmuebles.forEach((inm: any) => {
      const deudaInm = deudasContribuyentes[inm.identidad]?.monto || 0;
      if (deudaInm > 0) {
        morosos++;
        
        // Sumar a sector
        const sector = inm.actividad_principal || 'Otros';
        if(!deudasSectores[sector]) deudasSectores[sector] = 0;
        deudasSectores[sector] += deudaInm;
      } else {
        solventes++;
      }
    });

    setSolvenciaData([
      { name: 'Solventes', value: solventes, color: '#10b981' },
      { name: 'Morosos', value: morosos, color: '#ef4444' }
    ]);

    // Top sectores
    const topSectores = Object.entries(deudasSectores)
      .map(([name, monto]) => ({ name, Deuda: monto }))
      .sort((a, b) => b.Deuda - a.Deuda)
      .slice(0, 5); // top 5 sectores
      
    setDeudaPorSector(topSectores);

    // Top deudores
    const topDeud = Object.values(deudasContribuyentes)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);
      
    setTopDeudores(topDeud);

    // Preparar Data Historia 
    // Obtener ultimos 7-14 dias o dias con datos
    const diasOrdenados = Object.keys(historiaDiaria).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());
    const ultimosDias = diasOrdenados.slice(-14); // Ultimos 14 dias con pagos
    const historiaArr = ultimosDias.map(d => ({
       fecha: d,
       Recaudado: historiaDiaria[d]
    }));
    setRecaudacionHistoria(historiaArr);
  };

  const formatCurrency = (val: number) => {
    if (currency === 'MMV') {
      const valMmv = val / tcmmv;
      return `${valMmv.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MMV`;
    }
    return `Bs ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando estadísticas...</div>;
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <PieChartIcon className="w-6 h-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">
            Panel Administrativo
          </h1>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          <button 
            onClick={() => setCurrency('Bs')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currency === 'Bs' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Bolívares (Bs)
          </button>
          <button 
            onClick={() => setCurrency('MMV')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${currency === 'MMV' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            MMV (Euro)
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Recaudado (Diario)</p>
            <h3 className="text-xl font-bold text-slate-800">{formatCurrency(totalRecaudadoHoyBs)}</h3>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 mt-1">
              <ArrowUpRight size={14} /> Solo hoy
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Recaudado (Mensual)</p>
            <h3 className="text-xl font-bold text-slate-800">{formatCurrency(totalRecaudadoMesBs)}</h3>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 mt-1">
              <ArrowUpRight size={14} /> Este mes
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Total Histórico</p>
            <h3 className="text-xl font-bold text-slate-800">{formatCurrency(totalRecaudadoBs)}</h3>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 mt-1">
              <Wallet size={14} /> Acumulado Global
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Deuda Pendiente</p>
            <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(totalDeudaBs)}</h3>
            <span className="text-xs font-medium text-red-500 flex items-center gap-1 mt-1">
              <AlertTriangle size={14} /> Por cobrar
            </span>
          </div>
          <div className="bg-red-100 p-3 rounded-lg text-red-600">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Tasa de Morosidad</p>
            <h3 className="text-2xl font-bold text-slate-800">{morosidadRate.toFixed(1)}%</h3>
            <span className="text-xs font-medium text-amber-600 flex items-center gap-1 mt-1">
              <TrendingUp size={14} /> Recibos vs Pagos
            </span>
          </div>
          <div className="bg-amber-100 p-3 rounded-lg text-amber-600">
            <PieChartIcon size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Total Inmuebles</p>
            <h3 className="text-2xl font-bold text-slate-800">{inmuebles.length}</h3>
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-1">
              <Building2 size={14} /> Contribuyentes
            </span>
          </div>
          <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
            <Building2 size={24} />
          </div>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* BAR CHART RECAUDACION HISTORICA */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-3">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Evolución de Recaudación (Últimos Días)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recaudacionHistoria.map(d => ({...d, Recaudado: currency === 'MMV' ? d.Recaudado / tcmmv : d.Recaudado}))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="fecha" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(v) => currency === 'MMV' ? v.toFixed(0) : (v/1000).toFixed(0)+'k'} />
                <Tooltip 
                  cursor={{fill: '#f1f5f9'}}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: any) => [formatCurrency(currency === 'MMV' ? (value || 0) * tcmmv : (value || 0)), 'Recaudado']}
                />
                <Bar dataKey="Recaudado" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BAR CHART DEUDAS */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Top 5 Sectores con Mayor Deuda</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={deudaPorSector.map(d => ({...d, Deuda: currency === 'MMV' ? d.Deuda / tcmmv : d.Deuda}))} margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(v) => currency === 'MMV' ? v.toFixed(0) : (v/1000).toFixed(0)+'k'} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f1f5f9'}}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: any) => [formatCurrency(currency === 'MMV' ? (value || 0) * tcmmv : (value || 0)), 'Deuda']}
                />
                <Bar dataKey="Deuda" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIE CHART */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800 mb-4 text-center">Estado General de Solvencia</h3>
          <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={solvenciaData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {solvenciaData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-slate-800">{inmuebles.length}</span>
              <span className="text-xs font-medium text-slate-500 uppercase">Inmuebles</span>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {solvenciaData.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{backgroundColor: d.color}}></span>
                <span className="text-sm font-medium text-slate-700">{d.name} <span className="text-slate-400">({d.value})</span></span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* TOP DEUDORES TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" />
            Top 5 Mayores Deudores
          </h3>
          <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-1 rounded">Acción Inmediata Requerida</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-3">Contribuyente</th>
                <th className="px-6 py-3 text-right">Deuda Acumulada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {topDeudores.map((deudor, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-700">{deudor.nombre}</td>
                  <td className="px-6 py-4 text-right font-bold text-red-600">
                    {formatCurrency(deudor.monto)}
                  </td>
                </tr>
              ))}
              {topDeudores.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-6 py-8 text-center text-slate-500">No hay deudores registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
