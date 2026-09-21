'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { AlertTriangle, Eye, CheckCircle, XCircle } from 'lucide-react';

export default function DenunciasPage() {
  const [denuncias] = useState([
    { id: 'DEN-001', fecha: '18/08/2026', usuario: 'Maria Perez', tipo: 'Acumulación de basura', sector: 'Casco Central', estado: 'Abierto' },
    { id: 'DEN-002', fecha: '17/08/2026', usuario: 'Juan Gomez', tipo: 'Camión no pasó', sector: 'Las Salinas', estado: 'Cerrado' },
    { id: 'DEN-003', fecha: '16/08/2026', usuario: 'Condominio El Sol', tipo: 'Bote ilegal', sector: 'Av. Principal', estado: 'En Revisión' }
  ]);

  const [selectedDenuncia, setSelectedDenuncia] = useState<any>(null);

  const columns = [
    { key: 'id', header: 'Ticket' },
    { key: 'fecha', header: 'Fecha' },
    { key: 'usuario', header: 'Reportado por' },
    { key: 'tipo', header: 'Motivo / Tipo' },
    { key: 'sector', header: 'Sector' },
    { key: 'estado', header: 'Estado', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${
        row.estado === 'Abierto' ? 'bg-red-100 text-red-700' : 
        row.estado === 'En Revisión' ? 'bg-yellow-100 text-yellow-700' : 
        'bg-emerald-100 text-emerald-700'
      }`}>{row.estado}</span>
    ) },
    { key: 'acciones', header: 'Atención', render: (row: any) => (
      <div className="flex gap-2">
        <button 
          onClick={() => setSelectedDenuncia(row)}
          className="bg-blue-50 text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors" 
          title="Ver Detalles / Responder"
        >
          <Eye className="w-4 h-4" />
        </button>
        {row.estado !== 'Cerrado' && (
          <button className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-1.5 rounded transition-colors" title="Marcar como Resuelto">
            <CheckCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    ) }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6 relative">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Gestión de Denuncias Ciudadanas
          </h1>
        </div>
      </div>
      <DataTable data={denuncias} columns={columns} itemsPerPage={10} />

      {selectedDenuncia && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="font-bold text-slate-800">Detalle de Denuncia - {selectedDenuncia.id}</h3>
              <button onClick={() => setSelectedDenuncia(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <p><strong>Fecha:</strong> {selectedDenuncia.fecha}</p>
              <p><strong>Reportado por:</strong> {selectedDenuncia.usuario}</p>
              <p><strong>Tipo:</strong> {selectedDenuncia.tipo}</p>
              <p><strong>Sector:</strong> {selectedDenuncia.sector}</p>
              <p><strong>Estado:</strong> {selectedDenuncia.estado}</p>
              <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200">
                <p className="font-semibold mb-1">Descripción:</p>
                <p className="text-slate-600 italic">No se adjuntaron detalles adicionales para esta denuncia de prueba.</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setSelectedDenuncia(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded text-sm font-medium">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
