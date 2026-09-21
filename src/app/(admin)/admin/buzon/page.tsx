'use client';
import React, { useState } from 'react';
import { Inbox, CheckCircle, XCircle, Eye, Filter, MessageSquareWarning, Wrench, ShieldCheck, SearchCheck, X, FileText, Calendar, User } from 'lucide-react';
import { DataTable } from '@/components/DataTable';

export default function BuzonSolicitudesPage() {
  const [activeTab, setActiveTab] = useState('Todas');
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<any>(null);

  const [solicitudes, setSolicitudes] = useState([
    { id: 'REC-001', tipo: 'Reclamos / Sugerencias', fecha: '2024-03-15', contribuyente: 'Juan Perez', asunto: 'Bote de basura en calle principal', estado: 'Pendiente', icon: MessageSquareWarning, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'SE-002', tipo: 'Servicios Extraordinarios', fecha: '2024-03-14', contribuyente: 'Condominio Marina', asunto: 'Recolección de escombros', estado: 'Aprobado', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'VB-003', tipo: 'Visto Bueno Ambiental', fecha: '2024-03-13', contribuyente: 'Restaurante El Pescador', asunto: 'Renovación de permiso anual', estado: 'Pendiente', icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-50' },
    { id: 'INS-004', tipo: 'Inspección', fecha: '2024-03-12', contribuyente: 'Hotel Playa Blanca', asunto: 'Inspección de cuarto de basura', estado: 'Pendiente', icon: SearchCheck, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'REC-005', tipo: 'Reclamos / Sugerencias', fecha: '2024-03-11', contribuyente: 'Maria Gomez', asunto: 'Falla en recolección ruta 3', estado: 'Pendiente', icon: MessageSquareWarning, color: 'text-orange-500', bg: 'bg-orange-50' },
  ]);

  const tabs = ['Todas', 'Reclamos / Sugerencias', 'Servicios Extraordinarios', 'Visto Bueno Ambiental', 'Inspección'];

  const filteredSolicitudes = activeTab === 'Todas' ? solicitudes : solicitudes.filter(s => s.tipo === activeTab);

  const handleApprove = (id: string) => {
    setSolicitudes(solicitudes.map(s => s.id === id ? { ...s, estado: 'Aprobado' } : s));
  };

  const handleReject = (id: string) => {
    setSolicitudes(solicitudes.map(s => s.id === id ? { ...s, estado: 'Rechazado' } : s));
  };

  const handleViewDetails = (row: any) => {
    setSolicitudSeleccionada(row);
    setIsViewModalOpen(true);
  };

  const columns = [
    { key: 'id', header: 'Ticket' },
    { 
      key: 'tipo', 
      header: 'Categoría', 
      render: (row: any) => (
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${row.bg}`}>
            <row.icon className={`w-4 h-4 ${row.color}`} />
          </div>
          <span className="font-medium text-slate-700">{row.tipo}</span>
        </div>
      )
    },
    { key: 'fecha', header: 'Fecha' },
    { key: 'contribuyente', header: 'Solicitante' },
    { key: 'asunto', header: 'Asunto / Descripción', render: (row: any) => <span className="truncate max-w-xs block">{row.asunto}</span> },
    { key: 'estado', header: 'Estado', render: (row: any) => {
      let badgeClass = '';
      if (row.estado === 'Pendiente') badgeClass = 'bg-amber-100 text-amber-700 border border-amber-200';
      if (row.estado === 'Aprobado') badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      if (row.estado === 'Rechazado') badgeClass = 'bg-red-100 text-red-700 border border-red-200';
      return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}`}>{row.estado}</span>;
    } },
    { key: 'acciones', header: 'Acciones', render: (row: any) => (
      <div className="flex gap-2">
        <button onClick={() => handleViewDetails(row)} className="bg-slate-100 text-slate-600 hover:bg-slate-200 p-1.5 rounded transition-colors" title="Ver Detalles">
          <Eye className="w-4 h-4" />
        </button>
        {row.estado === 'Pendiente' && (
          <>
            <button onClick={() => handleApprove(row.id)} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-1.5 rounded transition-colors" title="Aprobar Solicitud">
              <CheckCircle className="w-4 h-4" />
            </button>
            <button onClick={() => handleReject(row.id)} className="bg-red-50 text-red-600 hover:bg-red-100 p-1.5 rounded transition-colors" title="Rechazar Solicitud">
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    ) }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <Inbox className="w-6 h-6 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">
              Buzón de Solicitudes
            </h1>
            <p className="text-sm text-slate-500">Gestión y aprobación de trámites del portal</p>
          </div>
        </div>
      </div>
      
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-r">
        <div className="flex items-start">
          <div className="ml-3">
            <p className="text-sm text-blue-700 font-medium">
              En este buzón se centralizan las solicitudes de "Reclamos / Sugerencias", "Servicios Extraordinarios", "Visto Bueno Ambiental" e "Inspecciones" para su revisión y aprobación.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-slate-400 mr-2" />
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable data={filteredSolicitudes} columns={columns} itemsPerPage={10} />
      </div>

      {isViewModalOpen && solicitudSeleccionada && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <solicitudSeleccionada.icon className={`w-5 h-5 ${solicitudSeleccionada.color}`} />
                Detalles del Ticket {solicitudSeleccionada.id}
              </h3>
              <button onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><User className="w-3 h-3"/> Solicitante</span>
                  <p className="text-sm font-semibold text-slate-700">{solicitudSeleccionada.contribuyente}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><Calendar className="w-3 h-3"/> Fecha</span>
                  <p className="text-sm font-semibold text-slate-700">{solicitudSeleccionada.fecha}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1"><FileText className="w-3 h-3"/> Asunto / Descripción</span>
                  <p className="text-sm font-medium text-slate-700">{solicitudSeleccionada.asunto}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Estado Actual</span>
                  <div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block ${
                      solicitudSeleccionada.estado === 'Pendiente' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                      solicitudSeleccionada.estado === 'Aprobado' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                      'bg-red-100 text-red-700 border border-red-200'
                    }`}>
                      {solicitudSeleccionada.estado}
                    </span>
                  </div>
                </div>
              </div>

              {solicitudSeleccionada.estado === 'Pendiente' && (
                <div className="pt-4 border-t border-slate-100 flex gap-3">
                  <button 
                    onClick={() => { handleApprove(solicitudSeleccionada.id); setIsViewModalOpen(false); }}
                    className="flex-1 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Aprobar
                  </button>
                  <button 
                    onClick={() => { handleReject(solicitudSeleccionada.id); setIsViewModalOpen(false); }}
                    className="flex-1 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Rechazar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
