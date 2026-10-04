'use client';
import { CalendarDays, Map, Clock, AlertCircle, Truck } from 'lucide-react';
import { useState } from 'react';

export default function RutasPage() {
  const [diaSeleccionado, setDiaSeleccionado] = useState('Lunes');

  const cronograma = [
    { 
      dia: 'Lunes', 
      rutas: [
        { id: 'Ruta #1', sectores: 'Casco Central de Naguanagua, Av. Universidad, Calle Puerto Cabello, La Begoña.' },
        { id: 'Ruta #2', sectores: 'Urb. La Granja, Av. Salvador Feo La Cruz, C.C. La Granja, C.C. Cristal.' },
        { id: 'Ruta #3', sectores: 'Urb. Las Quintas (I, II y III), Capremco, Av. Valencia, Guayabal.' }
      ]
    },
    {
      dia: 'Martes',
      rutas: [
        { id: 'Ruta #1', sectores: 'Urb. Mañongo, Palma Real, Piedras Pintadas, C.C. Sambil Naguanagua.' },
        { id: 'Ruta #2', sectores: 'Tazajal, Los Guayabitos, Rotaria, Altos de Guere.' },
        { id: 'Ruta #3', sectores: 'Tarapío, Brisas de Tarapío, San Teodoro, Barrio Unión.' }
      ]
    },
    {
      dia: 'Miércoles',
      rutas: [
        { id: 'Ruta #1', sectores: 'Vivienda Rural de Bárbula, Colinas de Girardot, Guere.' },
        { id: 'Ruta #2', sectores: 'Nueva Esparta, Santa Eduviges, Fundación Carabobo.' },
        { id: 'Ruta #3', sectores: 'Av. Universidad Norte, Arco de Bárbula, Redoma de Guaparo.' }
      ]
    },
    {
      dia: 'Jueves',
      rutas: [
        { id: 'Ruta #1', sectores: 'El Rincón, Los Mangos, Los Samanes, Sector El Salto.' },
        { id: 'Ruta #2', sectores: 'Carialinda, Lomas del Este Naguanagua, Monte Sión.' },
        { id: 'Ruta #3', sectores: 'La Entrada, Las Marías, Sector Girardot.' }
      ]
    },
    {
      dia: 'Viernes',
      rutas: [
        { id: 'Ruta #1', sectores: 'Trincheras (Centro, Las Rosas, El Salto, Sector Termas).' },
        { id: 'Ruta #2', sectores: 'Corredor Comercial Av. Universidad y Casco Histórico.' }
      ]
    },
    {
      dia: 'Sábado',
      rutas: [
        { id: 'Ruta #1', sectores: 'Grandes Generadores Comerciales, Av. Feo La Cruz y C.C. Vía Veneto.' },
        { id: 'Ruta #2', sectores: 'Operativo Especial de Mantenimiento y Aseo General Naguanagua.' }
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
