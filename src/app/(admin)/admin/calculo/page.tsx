'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calculator, TrendingUp, DollarSign, Activity, Users, Settings2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { useAppContext } from '@/store/AppContext';

export default function CalculoProyeccionPage() {
  const { inmuebles, tcmmv } = useAppContext();
  
  // Base state
  const baseTcmmvReal = tcmmv || 1;
  
  // Simulator states
  const [simTcmmv, setSimTcmmv] = useState<number>(baseTcmmvReal);
  const [resAdj, setResAdj] = useState<number>(0);
  const [comAdj, setComAdj] = useState<number>(0);
  
  useEffect(() => {
    if (tcmmv) setSimTcmmv(tcmmv);
  }, [tcmmv]);

  // Compute Base and Simulated Projections
  const data = useMemo(() => {
    let baseResMMV = 0;
    let baseComMMV = 0;
    
    inmuebles.forEach((inm: any) => {
      const isResidencial = (inm.actividad_principal || '').toLowerCase().includes('residencial') || ['Apartamento', 'Casa', 'Vivienda'].includes(inm.tipo);
      
      const factor = parseFloat(inm.mmv_mes) || 0;
      const cant = parseInt(inm.cant_inmuebles) || 1;
      const subtotalMMV = factor * cant;

      if (isResidencial) {
        baseResMMV += subtotalMMV;
      } else {
        baseComMMV += subtotalMMV;
      }
    });

    const simResMMV = baseResMMV * (1 + (resAdj / 100));
    const simComMMV = baseComMMV * (1 + (comAdj / 100));

    return {
      baseResMMV,
      baseComMMV,
      simResMMV,
      simComMMV,
      
      baseTotalMMV: baseResMMV + baseComMMV,
      simTotalMMV: simResMMV + simComMMV,
      
      baseTotalBs: (baseResMMV + baseComMMV) * baseTcmmvReal,
      simTotalBs: (simResMMV + simComMMV) * simTcmmv,
      
      baseResBs: baseResMMV * baseTcmmvReal,
      baseComBs: baseComMMV * baseTcmmvReal,
      
      simResBs: simResMMV * simTcmmv,
      simComBs: simComMMV * simTcmmv
    };
  }, [inmuebles, baseTcmmvReal, simTcmmv, resAdj, comAdj]);

  const chartData = [
    {
      name: 'Residencial',
      'Recaudación Actual (Bs)': parseFloat(data.baseResBs.toFixed(2)),
      'Proyección Simulada (Bs)': parseFloat(data.simResBs.toFixed(2)),
    },
    {
      name: 'Comercial e Ind.',
      'Recaudación Actual (Bs)': parseFloat(data.baseComBs.toFixed(2)),
      'Proyección Simulada (Bs)': parseFloat(data.simComBs.toFixed(2)),
    },
  ];

  const formatNumber = (num: number) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Cálculo y Proyección
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* PANEL IZQUIERDO: SIMULADOR Y CONTROLES */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Settings2 className="w-4 h-4 text-blue-600" />
              Simulador de Ajustes
            </h3>
            
            <div className="space-y-6">
              {/* Tasa BCV */}
              <div>
                <label className="flex justify-between text-sm font-semibold text-slate-700 mb-2">
                  <span>Simular Tasa (TCMMV)</span>
                  <span className="text-blue-600 font-bold">Bs. {formatNumber(simTcmmv)}</span>
                </label>
                <input 
                  type="range" 
                  min={Math.max(1, baseTcmmvReal - 20)} 
                  max={baseTcmmvReal + 50} 
                  step="0.01"
                  value={simTcmmv} 
                  onChange={(e) => setSimTcmmv(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1 font-medium">
                  <span>Actual: Bs. {formatNumber(baseTcmmvReal)}</span>
                  <button onClick={() => setSimTcmmv(baseTcmmvReal)} className="text-blue-500 hover:underline">Restaurar</button>
                </div>
              </div>

              {/* Ajuste Residencial */}
              <div>
                <label className="flex justify-between text-sm font-semibold text-slate-700 mb-2">
                  <span>Tarifas Residenciales</span>
                  <span className={resAdj >= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                    {resAdj > 0 ? '+' : ''}{resAdj}%
                  </span>
                </label>
                <input 
                  type="range" 
                  min="-50" 
                  max="100" 
                  step="5"
                  value={resAdj} 
                  onChange={(e) => setResAdj(parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-end text-xs font-medium mt-1">
                  <button onClick={() => setResAdj(0)} className="text-emerald-600 hover:underline">Restaurar</button>
                </div>
              </div>

              {/* Ajuste Comercial */}
              <div>
                <label className="flex justify-between text-sm font-semibold text-slate-700 mb-2">
                  <span>Tarifas Comerciales</span>
                  <span className={comAdj >= 0 ? "text-purple-600 font-bold" : "text-red-600 font-bold"}>
                    {comAdj > 0 ? '+' : ''}{comAdj}%
                  </span>
                </label>
                <input 
                  type="range" 
                  min="-50" 
                  max="100" 
                  step="5"
                  value={comAdj} 
                  onChange={(e) => setComAdj(parseInt(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-end text-xs font-medium mt-1">
                  <button onClick={() => setComAdj(0)} className="text-purple-600 hover:underline">Restaurar</button>
                </div>
              </div>
            </div>
            
            <div className="mt-6 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 font-medium">
              Nota: Estos controles son solo para **simulación** y proyección. No alterarán la deuda real de los contribuyentes ni la ordenanza en base de datos.
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: RESULTADOS Y GRÁFICAS */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* TABLERO MENSUAL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 rounded-full opacity-50 pointer-events-none"></div>
              <h3 className="text-slate-500 text-sm font-bold tracking-wide uppercase mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Mensual (Base Actual)
              </h3>
              <p className="text-3xl font-black text-slate-800 mb-1">
                Bs. {formatNumber(data.baseTotalBs)}
              </p>
              <p className="text-sm font-semibold text-slate-500">
                {formatNumber(data.baseTotalMMV)} MMV
              </p>
            </div>

            <div className={`bg-white rounded-xl shadow-sm border ${data.simTotalBs > data.baseTotalBs ? 'border-emerald-300' : data.simTotalBs < data.baseTotalBs ? 'border-red-300' : 'border-slate-200'} p-5 relative overflow-hidden`}>
              <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10 pointer-events-none ${data.simTotalBs > data.baseTotalBs ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
              <h3 className="text-slate-500 text-sm font-bold tracking-wide uppercase mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Mensual (Simulado)
              </h3>
              <p className={`text-3xl font-black mb-1 ${data.simTotalBs > data.baseTotalBs ? 'text-emerald-700' : data.simTotalBs < data.baseTotalBs ? 'text-red-600' : 'text-slate-800'}`}>
                Bs. {formatNumber(data.simTotalBs)}
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-slate-500">{formatNumber(data.simTotalMMV)} MMV</span>
                {data.simTotalBs !== data.baseTotalBs && (
                  <span className={`px-2 py-0.5 rounded text-xs ${data.simTotalBs > data.baseTotalBs ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {data.simTotalBs > data.baseTotalBs ? '+' : ''}{((data.simTotalBs - data.baseTotalBs) / data.baseTotalBs * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* TABLERO ANUAL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl shadow-sm border border-slate-200 p-5 relative overflow-hidden">
              <h3 className="text-slate-500 text-sm font-bold tracking-wide uppercase mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Anual (Base Actual)
              </h3>
              <p className="text-2xl font-bold text-slate-700 mb-1">
                Bs. {formatNumber(data.baseTotalBs * 12)}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {formatNumber(data.baseTotalMMV * 12)} MMV al año
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl shadow-sm border border-slate-200 p-5 relative overflow-hidden">
              <h3 className="text-slate-500 text-sm font-bold tracking-wide uppercase mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Anual (Simulado)
              </h3>
              <p className={`text-2xl font-bold mb-1 ${data.simTotalBs > data.baseTotalBs ? 'text-emerald-700' : data.simTotalBs < data.baseTotalBs ? 'text-red-600' : 'text-slate-700'}`}>
                Bs. {formatNumber(data.simTotalBs * 12)}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {formatNumber(data.simTotalMMV * 12)} MMV al año
              </p>
            </div>
          </div>

          {/* GRAFICA */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              Comparativa por Sector (Mensual)
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontWeight: 600}} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748B'}}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    cursor={{fill: '#F1F5F9'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`Bs. ${formatNumber(value)}`]}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Recaudación Actual (Bs)" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  <Bar dataKey="Proyección Simulada (Bs)" fill="#F97316" radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
