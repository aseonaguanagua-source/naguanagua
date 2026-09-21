'use client';
import React, { useState, useEffect } from 'react';
import { DataTable } from '@/components/DataTable';
import { Truck, Map, Edit, Check, X, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const RUTAS_POR_DEFECTO = [
  { id: 'LUN-1', nombre: 'Ruta #1', frecuencia: 'Lunes', sectores: 'Casco Central, Av. Silva, Iglesia, La Quinta. El Cañito y Marinas.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'LUN-2', nombre: 'Ruta #2', frecuencia: 'Lunes', sectores: 'Av. Libertador, Av. Hugo Chávez y Calles de Servicio.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'LUN-3', nombre: 'Ruta #3', frecuencia: 'Lunes', sectores: 'Carretera 1; Puente Izate Hasta el Elevado, Brisas del Mar, Km 60, Luxor (ambos sentidos).', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'MAR-1', nombre: 'Ruta #1', frecuencia: 'Martes', sectores: 'Boca de Aroa, Parque Jurásico, Carretera Nacional, Los Corales, Caribean al Elevado.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'MAR-2', nombre: 'Ruta #2', frecuencia: 'Martes', sectores: 'Las Delicias de Boca de Aroa (Todos los sectores).', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'MAR-3', nombre: 'Ruta #3', frecuencia: 'Martes', sectores: 'Granja El Tuque I.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'MIE-1', nombre: 'Ruta #1', frecuencia: 'Miércoles', sectores: 'Sanare y Buena Vista.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'MIE-2', nombre: 'Ruta #2', frecuencia: 'Miércoles', sectores: 'Morrocoy, Agua Salabra.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'MIE-3', nombre: 'Ruta #3', frecuencia: 'Miércoles', sectores: 'Av. Libertador y Calles de Servicio.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'JUE-1', nombre: 'Ruta #1', frecuencia: 'Jueves', sectores: 'Izate, Brisas del Mar 2, Federico Eeckhout (Naguanagua).', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'JUE-2', nombre: 'Ruta #2', frecuencia: 'Jueves', sectores: 'Ali Primera, Santa Rosa, 8 de Diciembre, Tucanica (Naguanagua).', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'JUE-3', nombre: 'Ruta #3', frecuencia: 'Jueves', sectores: 'Las Lapas, Felipito y Santa Bárbara.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'VIE-1', nombre: 'Ruta #1', frecuencia: 'Viernes', sectores: 'Pescadores, El tuque II, El Calvario, Altos de Nueva Naguanagua, José Laurencio Silva, Km3 (Naguanagua).', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'VIE-2', nombre: 'Ruta #2', frecuencia: 'Viernes', sectores: 'Coco Mango, Puerto Flechado, El Esfuerzo (Naguanagua).', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'SAB-1', nombre: 'Ruta #1', frecuencia: 'Sábado', sectores: 'Av. Libertador de Naguanagua, Av. Hugo Chavez y Calles de Servicio.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' },
  { id: 'SAB-2', nombre: 'Ruta #2', frecuencia: 'Sábado', sectores: 'Carretera Boca de Aroa hasta Naguanagua.', chofer: 'Sin Asignar', vehiculo: 'N/A', estado: 'Activa' }
];

export default function RutasCamionesPage() {
  const [rutas, setRutas] = useState<any[]>(RUTAS_POR_DEFECTO);
  const [isLoading, setIsLoading] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [rutaEditando, setRutaEditando] = useState<any>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [nuevaRuta, setNuevaRuta] = useState({
    nombre: '',
    frecuencia: 'Lunes',
    sectores: '',
    chofer: 'Sin Asignar',
    vehiculo: 'N/A',
    estado: 'Activa'
  });

  const loadRutas = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('rutas').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        setRutas(data);
      } else {
        // Fallback to default
        setRutas(RUTAS_POR_DEFECTO);
      }
    } catch (error) {
      console.error('Error fetching rutas:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadRutas();
  }, []);

  const handleEditClick = (ruta: any) => {
    setRutaEditando({ ...ruta });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (rutaEditando.id.toString().includes('-')) {
         // Default route, just update state for now or handle insert-on-edit
         setRutas(rutas.map(r => r.id === rutaEditando.id ? rutaEditando : r));
      } else {
         const { error } = await supabase
           .from('rutas')
           .update({
             nombre: rutaEditando.nombre,
             frecuencia: rutaEditando.frecuencia,
             sectores: rutaEditando.sectores,
             chofer: rutaEditando.chofer,
             vehiculo: rutaEditando.vehiculo,
             estado: rutaEditando.estado
           })
           .eq('id', rutaEditando.id);
         if (error) throw error;
         setRutas(rutas.map(r => r.id === rutaEditando.id ? rutaEditando : r));
      }
      setIsEditModalOpen(false);
      setRutaEditando(null);
    } catch (error) {
      console.error('Error updating ruta:', error);
      alert('Error actualizando la ruta');
    }
  };

  const handleAddRuta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const idStr = `${nuevaRuta.frecuencia.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const routeData = { ...nuevaRuta, id: idStr }; // Temporary ID for UI
      
      const { data, error } = await supabase
        .from('rutas')
        .insert([{
          id: idStr,
          nombre: nuevaRuta.nombre,
          frecuencia: nuevaRuta.frecuencia,
          sectores: nuevaRuta.sectores,
          chofer: nuevaRuta.chofer,
          vehiculo: nuevaRuta.vehiculo,
          estado: nuevaRuta.estado
        }])
        .select();
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        setRutas([...rutas, data[0]]);
      } else {
        setRutas([...rutas, routeData]);
      }
      
      setIsAddModalOpen(false);
      setNuevaRuta({
        nombre: '',
        frecuencia: 'Lunes',
        sectores: '',
        chofer: 'Sin Asignar',
        vehiculo: 'N/A',
        estado: 'Activa'
      });
      alert('Ruta añadida exitosamente.');
    } catch (error) {
      console.error('Error añadiendo ruta:', error);
      alert('Error guardando la ruta. Es posible que la tabla "rutas" no exista aún.');
    }
  };

  const columns = [
    { key: 'frecuencia', header: 'Día' },
    { key: 'nombre', header: 'Ruta' },
    { key: 'sectores', header: 'Sectores Atendidos' },
    { key: 'chofer', header: 'Chofer Asignado' },
    { key: 'vehiculo', header: 'Vehículo' },
    { key: 'estado', header: 'Estatus', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${
        row.estado === 'Activa' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}>{row.estado}</span>
    ) },
    { key: 'acciones', header: 'Gestión', render: (row: any) => (
      <div className="flex gap-2">
        <button onClick={() => handleEditClick(row)} className="bg-slate-100 text-slate-600 hover:bg-slate-200 p-1.5 rounded transition-colors" title="Editar Ruta">
          <Edit className="w-4 h-4" />
        </button>
        <button className="bg-blue-50 text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors" title="Ver en Mapa (Próximamente)">
          <Map className="w-4 h-4" />
        </button>
      </div>
    ) }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Programación de Rutas de Camiones
          </h1>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="bg-slate-800 text-white hover:bg-slate-700 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2">
          <Plus size={16} /> Nueva Ruta
        </button>
      </div>
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-r">
        <div className="flex">
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Esta tabla muestra el cronograma oficial y las zonas asignadas a cada ruta.
            </p>
          </div>
        </div>
      </div>

      <DataTable data={rutas} columns={columns} itemsPerPage={20} />

      {/* Modal Nueva Ruta */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                Añadir Nueva Ruta
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddRuta} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nombre / Identificador</label>
                <input 
                  type="text" 
                  value={nuevaRuta.nombre}
                  onChange={(e) => setNuevaRuta({...nuevaRuta, nombre: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                  placeholder="Ej. Ruta #4"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Día de Frecuencia</label>
                <select 
                  value={nuevaRuta.frecuencia}
                  onChange={(e) => setNuevaRuta({...nuevaRuta, frecuencia: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="Lunes">Lunes</option>
                  <option value="Martes">Martes</option>
                  <option value="Miércoles">Miércoles</option>
                  <option value="Jueves">Jueves</option>
                  <option value="Viernes">Viernes</option>
                  <option value="Sábado">Sábado</option>
                  <option value="Domingo">Domingo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Sectores Atendidos</label>
                <textarea 
                  value={nuevaRuta.sectores}
                  onChange={(e) => setNuevaRuta({...nuevaRuta, sectores: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none resize-none"
                  rows={3}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Chofer</label>
                  <input 
                    type="text" 
                    value={nuevaRuta.chofer}
                    onChange={(e) => setNuevaRuta({...nuevaRuta, chofer: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Vehículo</label>
                  <input 
                    type="text" 
                    value={nuevaRuta.vehiculo}
                    onChange={(e) => setNuevaRuta({...nuevaRuta, vehiculo: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" /> Añadir Ruta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {isEditModalOpen && rutaEditando && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Edit className="w-4 h-4 text-emerald-600" />
                Editar Ruta: {rutaEditando.id || rutaEditando.nombre}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Sectores</label>
                <textarea 
                  value={rutaEditando.sectores}
                  onChange={(e) => setRutaEditando({...rutaEditando, sectores: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                  rows={2}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Chofer Asignado</label>
                <input 
                  type="text" 
                  value={rutaEditando.chofer}
                  onChange={(e) => setRutaEditando({...rutaEditando, chofer: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Vehículo (Placa / Modelo)</label>
                <input 
                  type="text" 
                  value={rutaEditando.vehiculo}
                  onChange={(e) => setRutaEditando({...rutaEditando, vehiculo: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Estatus</label>
                <select 
                  value={rutaEditando.estado}
                  onChange={(e) => setRutaEditando({...rutaEditando, estado: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="Activa">Activa</option>
                  <option value="Mantenimiento">En Mantenimiento</option>
                  <option value="Inactiva">Inactiva</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
