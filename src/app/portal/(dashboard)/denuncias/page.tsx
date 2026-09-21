'use client';
import { MessageSquare, Camera, Send, History } from 'lucide-react';
import { useState } from 'react';

export default function DenunciasPage() {
  const [activeTab, setActiveTab] = useState('nueva');
  
  const denuncias = [
    { id: 'DEN-001', fecha: '2026-08-10', tipo: 'Bote de basura ilegal', estado: 'En Revisión' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Denuncias y Reclamos</h1>
          <p className="text-slate-500 mt-1">Reporta incidencias, botes ilegales o fallas en el servicio.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button 
            onClick={() => setActiveTab('nueva')}
            className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'nueva' ? 'border-green-600 text-green-700 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Nueva Denuncia</div>
          </button>
          <button 
            onClick={() => setActiveTab('historial')}
            className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'historial' ? 'border-green-600 text-green-700 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <div className="flex items-center gap-2"><History className="w-4 h-4" /> Mis Denuncias</div>
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'nueva' && (
            <div className="max-w-2xl mx-auto">
              <form className="space-y-4" onSubmit={e => { e.preventDefault(); alert("Denuncia enviada. Pronto un agente revisará tu caso."); }}>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tipo de Reporte</label>
                  <select required className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-green-500">
                    <option value="">Seleccione...</option>
                    <option value="Falla de Recolección">Falla de Recolección (El camión no pasó)</option>
                    <option value="Bote Ilegal">Bote de Basura Ilegal en Vía Pública</option>
                    <option value="Falla en Emisión de recibos">Problema de Emisión de recibos o Deuda Incorrecta</option>
                    <option value="Otro">Otro Motivo</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Dirección Exacta de la Incidencia</label>
                  <input required type="text" placeholder="Calle, sector o punto de referencia" className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-green-500" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Descripción Detallada</label>
                  <textarea required rows={4} placeholder="Describa el problema..." className="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:border-green-500"></textarea>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Adjuntar Evidencia (Foto / Documento)</label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                    <Camera className="w-8 h-8 mb-2 text-slate-400" />
                    <span className="text-sm">Haz clic para subir un archivo o arrástralo aquí</span>
                    <span className="text-xs text-slate-400 mt-1">Formatos permitidos: JPG, PNG, PDF (Max. 5MB)</span>
                  </div>
                </div>

                <div className="pt-4">
                  <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg w-full transition-colors flex items-center justify-center gap-2">
                    <Send className="w-5 h-5" /> Enviar Reporte
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="space-y-4">
              <table className="w-full text-sm text-left border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">ID Reporte</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {denuncias.map((denuncia) => (
                    <tr key={denuncia.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-700">{denuncia.id}</td>
                      <td className="px-4 py-3">{denuncia.fecha}</td>
                      <td className="px-4 py-3">{denuncia.tipo}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">{denuncia.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
