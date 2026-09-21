'use client';
import React, { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { AlertTriangle, MessageSquare } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';

export default function ReclamosPage() {
  const { reclamos } = useAppContext();
  
  const columns = [
    { key: 'ticket', header: 'Ticket' },
    { key: 'fecha', header: 'Fecha de Registro' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { key: 'tipo', header: 'Clasificación' },
    { key: 'sector', header: 'Sector Involucrado' },
    { key: 'estado', header: 'Estado', render: (row: any) => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${
        row.estado === 'Abierto' ? 'bg-red-100 text-red-700' : 
        row.estado === 'En Revisión' ? 'bg-yellow-100 text-yellow-700' : 
        'bg-green-100 text-green-700'
      }`}>{row.estado}</span>
    ) },
    { key: 'actions', header: 'Atención', render: () => (
      <button className="text-blue-600 hover:text-blue-900 text-xs flex items-center gap-1">
        <MessageSquare size={14} /> Responder
      </button>
    ) }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-slate-700" />
          <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
            Reclamos y Atención al Contribuyente
          </h1>
        </div>
      </div>
      <DataTable data={reclamos} columns={columns} itemsPerPage={10} />
    </div>
  );
}
