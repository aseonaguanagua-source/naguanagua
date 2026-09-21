'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { History, Eye, X, FileText } from 'lucide-react';

export default function HistorialDocumentosPage() {
  const [data] = useState([
    { id: 'DOC-101', contribuyente: 'Carlos Ruiz', tipo: 'Solvencia', fecha: '18-08-2026', emisor: 'Admin', estado: 'Generado', detalles: 'Solvencia generada por pago del mes de agosto correspondiente al Inmueble Residencial N-2834.' },
    { id: 'DOC-102', contribuyente: 'Tienda La Esquina', tipo: 'Recibo', fecha: '17-08-2026', emisor: 'Sistema', estado: 'Enviado', detalles: 'Recibo automática mensual generada para el comercio Tienda La Esquina (J-12345678).' },
    { id: 'DOC-103', contribuyente: 'Condominio El Sol', tipo: 'Notificación', fecha: '15-08-2026', emisor: 'Fiscal 01', estado: 'Leído', detalles: 'Notificación de vencimiento de pago enviada al administrador del condominio.' },
  ]);

  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const columns = [
    { key: 'id', header: 'ID Documento' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { key: 'tipo', header: 'Tipo' },
    { key: 'fecha', header: 'Fecha' },
    { key: 'emisor', header: 'Emisor' },
    { key: 'estado', header: 'Estado', render: (row: any) => (
      <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded text-xs font-semibold">{row.estado}</span>
    ) },
    { key: 'actions', header: 'Acciones', render: (row: any) => (
      <button 
        onClick={() => setSelectedDoc(row)} 
        className="text-slate-600 hover:text-slate-900 text-xs flex items-center gap-1"
      >
        <Eye size={14} /> Ver Detalle
      </button>
    ) }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6 relative">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Historial de Documentos
          </h1>
        </div>
      </div>
      <DataTable data={data} columns={columns} itemsPerPage={10} />

      {/* Modal de Detalle */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-slate-800 flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Detalles del Documento
              </h3>
              <button onClick={() => setSelectedDoc(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">ID Documento</span>
                  <p className="text-sm font-medium text-slate-800">{selectedDoc.id}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Fecha</span>
                  <p className="text-sm font-medium text-slate-800">{selectedDoc.fecha}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Tipo</span>
                  <p className="text-sm font-medium text-slate-800">{selectedDoc.tipo}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Estado</span>
                  <div>
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">{selectedDoc.estado}</span>
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Contribuyente Destino</span>
                  <p className="text-sm font-medium text-slate-800">{selectedDoc.contribuyente}</p>
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="text-xs font-bold text-slate-500 uppercase">Emisor / Autorizado por</span>
                  <p className="text-sm font-medium text-slate-800">{selectedDoc.emisor}</p>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">Descripción / Detalles</span>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {selectedDoc.detalles || 'No hay detalles adicionales registrados para este documento.'}
                </p>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedDoc(null)} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
