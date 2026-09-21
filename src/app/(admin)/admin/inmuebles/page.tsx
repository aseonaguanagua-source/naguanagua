'use client';
import React from 'react';
import { DataTable } from '@/components/DataTable';
import { useAppContext } from '@/store/AppContext';
import { Building, MoreVertical, BellOff, Mail } from 'lucide-react';
import Link from 'next/link';

export default function InmueblesPage() {
  const { inmuebles } = useAppContext();

  // Map JSON to the columns shown in the UI "Inmueble Master (Condominio)"
  const columns = [
    { key: 'Inmueble', header: 'Código' },
    { key: 'Uso', header: 'Uso', render: (row: any) => row['Clasificacion'] || 'Residencial' },
    { key: 'Tipo', header: 'Tipo' },
    { 
      key: 'Verificado', 
      header: 'Verificado',
      render: (row: any) => (
        <div className="text-center">
          <span className="text-red-500 font-semibold text-xs">NO</span>
          <p className="text-[10px] text-slate-500 mt-1 leading-tight">Faltan Documentos</p>
        </div>
      )
    },
    { 
      key: 'Solvente', 
      header: 'Solvente',
      render: (row: any) => {
        const saldo = parseFloat(row['Saldo']) || 0;
        return (
          <div className="text-center">
            {saldo <= 0 ? (
              <span className="text-green-500 font-semibold text-xs">SI</span>
            ) : (
              <span className="text-red-500 font-semibold text-xs">NO</span>
            )}
            <p className="text-[10px] text-slate-500 mt-1 leading-tight">{row['Cant Inmuebles']} Asociados</p>
          </div>
        );
      }
    },
    { key: 'Condicion', header: 'Condición', render: () => 'Pro' },
    { key: 'Actividad', header: 'Actividad', render: (row: any) => row['Actividad Principal'] },
    { key: 'Direccion', header: 'Dirección' },
    { 
      key: 'Alertas', 
      header: 'Alertas',
      render: () => (
        <div className="flex flex-col items-center text-slate-400">
          <BellOff className="w-4 h-4 mb-1" />
          <span className="text-[9px]">Sin Alertas</span>
        </div>
      )
    },
    { 
      key: 'Mensajes', 
      header: 'Mensajes',
      render: () => (
        <div className="flex flex-col items-center text-slate-400">
          <Mail className="w-4 h-4 mb-1" />
          <span className="text-[9px]">Sin Mensajes</span>
        </div>
      )
    },
    {
      key: 'actions',
      header: '',
      render: () => (
        <button className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
        <Building className="w-5 h-5 text-slate-700" />
        <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
          Inmueble Master (Condominio)
        </h1>
      </div>

      {/* Tabs placeholder from image */}
      <div className="flex bg-slate-100 p-2 rounded text-sm text-slate-700 font-medium mb-4 w-fit">
        <div className="px-4 py-1 bg-white shadow-sm rounded border border-slate-200 cursor-default">INMUEBLES</div>
        <Link href="/admin/condominios-cob" className="px-4 py-1 text-slate-500 hover:text-slate-800 transition-colors">
          CONDOMINIOS Y COMERCIOS
        </Link>
      </div>

      {/* DataTable */}
      <DataTable data={inmuebles} columns={columns} itemsPerPage={20} />
    </div>
  );
}
