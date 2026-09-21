'use client';
import { CalendarDays, Map, Clock, AlertCircle, Truck } from 'lucide-react';
import { useState } from 'react';

export default function RutasPage() {
  const [diaSeleccionado, setDiaSeleccionado] = useState('Lunes');

  const cronograma = [
    { 
      dia: 'Lunes', 
      rutas: [
        { id: 'Ruta #1', sectores: 'Casco Central, Av. Silva, Iglesia, La Quinta. El Cañito y Marinas.' },
        { id: 'Ruta #2', sectores: 'Av. Libertador, Av. Hugo Chávez y Calles de Servicio.' },
        { id: 'Ruta #3', sectores: 'Carretera 1; Puente Izate Hasta el Elevado, Brisas del Mar, Km 60, Luxor (ambos sentidos).' }
      ]
    },
    {
      dia: 'Martes',
      rutas: [
        { id: 'Ruta #1', sectores: 'Boca de Aroa, Parque Jurásico, Carretera Nacional, Los Corales, Caribean al Elevado.' },
        { id: 'Ruta #2', sectores: 'Las Delicias de Boca de Aroa (Todos los sectores).' },
        { id: 'Ruta #3', sectores: 'Granja El Tuque I.' }
      ]
    },
    {
      dia: 'Miércoles',
      rutas: [
        { id: 'Ruta #1', sectores: 'Sanare y Buena Vista.' },
        { id: 'Ruta #2', sectores: 'Morrocoy, Agua Salabra.' },
        { id: 'Ruta #3', sectores: 'Av. Libertador y Calles de Servicio.' }
      ]
    },
    {
      dia: 'Jueves',
      rutas: [
        { id: 'Ruta #1', sectores: 'Izate, Brisas del Mar 2, Federico Eeckhout (Naguanagua).' },
        { id: 'Ruta #2', sectores: 'Ali Primera, Santa Rosa, 8 de Diciembre, Tucanica (Naguanagua).' },
        { id: 'Ruta #3', sectores: 'Las Lapas, Felipito y Santa Bárbara.' }
      ]
    },
    {
      dia: 'Viernes',
      rutas: [
        { id: 'Ruta #1', sectores: 'Pescadores, El tuque II, El Calvario, Altos de Nueva Naguanagua, José Laurencio Silva, Km3 (Naguanagua).' },
        { id: 'Ruta #2', sectores: 'Coco Mango, Puerto Flechado, El Esfuerzo (Naguanagua).' }
      ]
    },
    {
      dia: 'Sábado',
      rutas: [
        { id: 'Ruta #1', sectores: 'Av. Libertador de Naguanagua, Av. Hugo Chavez y Calles de Servicio.' },
        { id: 'Ruta #2', sectores: 'Carretera Boca de Aroa hasta Naguanagua.' }
      ]
    }
  ];

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
                    <span className="text-xl font-black text-slate-700">{r.id.split('#')[1]}</span>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Map className="w-3.5 h-3.5" /> Sectores Atendidos
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
