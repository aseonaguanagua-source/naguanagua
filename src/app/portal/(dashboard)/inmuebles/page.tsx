'use client';
import { Building2, Search, Filter } from 'lucide-react';

export default function InmueblesPage() {
  const inmuebles = [
    {
      id: 'I-000252',
      direccion: 'Avenida Hugo Chavez Casa 05 El Calvario Municipio Naguanagua, Falcón Zona Postal 2055',
      tipo: 'Casa',
      uso: 'Residencial',
      area: '200.00 Mt2',
      estado: 'Activo'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <div className="relative w-full sm:w-96">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por código o dirección..." 
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm hover:bg-slate-200 transition-colors border border-slate-200 w-full sm:w-auto justify-center">
          <Filter className="w-4 h-4" />
          Filtros
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-700 uppercase flex items-center gap-2 text-sm">
            <Building2 className="w-4 h-4" />
            MIS INMUEBLES REGISTRADOS
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Código</th>
                <th className="px-6 py-4 font-medium">Dirección</th>
                <th className="px-6 py-4 font-medium">Tipo</th>
                <th className="px-6 py-4 font-medium">Uso</th>
                <th className="px-6 py-4 font-medium">Área</th>
                <th className="px-6 py-4 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inmuebles.map((inmueble) => (
                <tr key={inmueble.id} className="hover:bg-slate-50 transition-colors text-sm">
                  <td className="px-6 py-4 text-slate-700 font-medium">{inmueble.id}</td>
                  <td className="px-6 py-4 text-slate-600 whitespace-normal min-w-[300px]">{inmueble.direccion}</td>
                  <td className="px-6 py-4 text-slate-600">{inmueble.tipo}</td>
                  <td className="px-6 py-4 text-slate-600">{inmueble.uso}</td>
                  <td className="px-6 py-4 text-slate-600">{inmueble.area}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {inmueble.estado}
                    </span>
                  </td>
                </tr>
              ))}
              {inmuebles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No posee inmuebles registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
