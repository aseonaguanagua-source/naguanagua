'use client';
import { CalendarDays, Map, Clock, AlertCircle, Truck } from 'lucide-react';
import { useState } from 'react';
import { RUTAS_NAGUANAGUA } from '@/data/rutasNaguanagua';

export default function RutasPage() {
  const [diaSeleccionado, setDiaSeleccionado] = useState('Lunes');

  // Rutas oficiales (RUTAS DE NAGUANAGUA.xlsx). Se reparten por día según su frecuencia.
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const ABR: Record<string, string> = { Lun: 'Lunes', Mar: 'Martes', 'Mié': 'Miércoles', Jue: 'Jueves', Vie: 'Viernes', 'Sáb': 'Sábado', Dom: 'Domingo' };
  const cronograma = DIAS.map(dia => ({
    dia,
    rutas: RUTAS_NAGUANAGUA.filter((r: any) => {
      const f = String(r.frecuencia || '');
      if (f.startsWith('Diario')) return true;
      return f.split(' ')[0].split('-').some(a => ABR[a] === dia);
    }).map((r: any) => ({
      id: String(r.nombre || '').replace(/^Ruta\s*/i, '') || r.id,
      turno: (String(r.frecuencia).match(/\((.*)\)/) || [])[1] || '',
      sectores: r.sectores,
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cronograma Semanal de Recolección</h1>
          <p className="text-slate-500 mt-1">Conoce los días que el camión del aseo pasa por tu sector.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-600" /> Días de la Semana
            </h2>
            <div className="space-y-2">
              {cronograma.map((c) => (
                <button
                  key={c.dia}
                  onClick={() => setDiaSeleccionado(c.dia)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${diaSeleccionado === c.dia ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'}`}
                >
                  {c.dia}
                </button>
              ))}
            </div>

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Los horarios son estimados y pueden variar. Por favor saca tu basura en bolsas bien cerradas y en los puntos acordados.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-lg">
                <Truck className="w-5 h-5 text-emerald-700" />
              </div>
              <h2 className="font-bold text-slate-700 text-lg">
                Rutas del día: <span className="text-emerald-700">{diaSeleccionado}</span>
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              {cronograma.find(c => c.dia === diaSeleccionado)?.rutas.map((r, i) => (
                <div key={i} className="flex gap-4 p-5 bg-white border border-slate-200 rounded-xl hover:border-emerald-200 hover:shadow-md transition-all">
                  <div className="w-16 h-16 bg-slate-50 rounded-lg flex flex-col items-center justify-center shrink-0 border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ruta</span>
                    <span className="text-sm font-black text-slate-700 text-center leading-tight">{r.id}</span>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Map className="w-3.5 h-3.5" /> Sectores Atendidos{r.turno ? ` · Turno ${r.turno}` : ''}
                    </h3>
                    <p className="text-slate-800 font-medium leading-relaxed">{r.sectores}</p>
                  </div>
                </div>
              ))}
              
              {cronograma.find(c => c.dia === diaSeleccionado)?.rutas.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No hay rutas programadas para este día.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
