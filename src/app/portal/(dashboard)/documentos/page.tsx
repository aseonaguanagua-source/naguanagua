'use client';
import { History, Download, Eye, FileText, Search } from 'lucide-react';

export default function DocumentosPage() {
  const recibos = [
    { id: 'REC-2026-08-001', fecha: '17/08/2026', monto: '49.153,50', concepto: 'Aseo residencial (Agosto 2026)', estado: 'Pagado' },
    { id: 'REC-2026-07-001', fecha: '15/07/2026', monto: '49.153,50', concepto: 'Aseo residencial (Julio 2026)', estado: 'Pagado' },
    { id: 'REC-2026-06-001', fecha: '16/06/2026', monto: '49.153,50', concepto: 'Aseo residencial (Junio 2026)', estado: 'Pagado' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <div className="relative w-full sm:w-96">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por Nro. de Recibo..." 
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-700 uppercase flex items-center gap-2 text-sm">
            <History className="w-4 h-4" />
            HISTORIAL DE DOCUMENTOS Y RECIBOS
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Nro. Recibo</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Concepto</th>
                <th className="px-6 py-4 font-medium">Monto (Bs.)</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recibos.map((recibo) => (
                <tr key={recibo.id} className="hover:bg-slate-50 transition-colors text-sm">
                  <td className="px-6 py-4 text-slate-700 font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    {recibo.id}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{recibo.fecha}</td>
                  <td className="px-6 py-4 text-slate-600">{recibo.concepto}</td>
                  <td className="px-6 py-4 text-slate-700 font-semibold">{recibo.monto}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {recibo.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <button className="text-slate-400 hover:text-blue-600 transition-colors" title="Ver Recibo">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button className="text-slate-400 hover:text-blue-600 transition-colors" title="Descargar PDF">
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
