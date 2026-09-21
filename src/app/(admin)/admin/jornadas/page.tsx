'use client';
import React, { useState } from 'react';
import { Calendar, Users, Target, FileDown, Search, Plus, MapPin, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export default function JornadasPage() {
  const [jornadas, setJornadas] = useState([
    { id: 1, fecha: '2026-09-08', sector: 'Casco Central', equipo: 'Equipo A', status: 'Planificada', comerciosA_Visitar: 45, comercios_Visitados: 0 },
    { id: 2, fecha: '2026-09-10', sector: 'Carretera Nacional', equipo: 'Equipo B', status: 'Planificada', comerciosA_Visitar: 30, comercios_Visitados: 0 },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nuevaJornada, setNuevaJornada] = useState({ fecha: '', sector: '', equipo: '', comercios: 0 });

  const exportarReportePDF = () => {
    alert("Generando PDF de métricas de jornada... (Se integrará con jsPDF/html2pdf)");
  };

  const agregarJornada = () => {
    if(!nuevaJornada.fecha || !nuevaJornada.sector || !nuevaJornada.equipo) return alert("Completa todos los campos");
    setJornadas([...jornadas, {
      id: Date.now(),
      fecha: nuevaJornada.fecha,
      sector: nuevaJornada.sector,
      equipo: nuevaJornada.equipo,
      status: 'Planificada',
      comerciosA_Visitar: Number(nuevaJornada.comercios),
      comercios_Visitados: 0
    }]);
    setIsModalOpen(false);
    setNuevaJornada({ fecha: '', sector: '', equipo: '', comercios: 0 });
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-6 relative">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-orange-600" />
          <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">Jornadas de Campo (Censo)</h1>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow"
        >
          <Plus size={16} /> Planificar Jornada
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          <div className="bg-blue-100 p-4 rounded-full">
            <Target className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Comercios Objetivo (Mes)</p>
            <p className="text-2xl font-black text-slate-800">{jornadas.reduce((a,b)=>a+b.comerciosA_Visitar,0)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          <div className="bg-emerald-100 p-4 rounded-full">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Censos Completados</p>
            <p className="text-2xl font-black text-slate-800">{jornadas.reduce((a,b)=>a+b.comercios_Visitados,0)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Reporte de Operatividad</p>
            <p className="text-xs text-slate-400 mt-1">Exporta el rendimiento por sector.</p>
          </div>
          <button onClick={exportarReportePDF} className="bg-slate-100 hover:bg-slate-200 p-3 rounded-full text-slate-700 transition-colors">
            <FileDown className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <h2 className="font-bold text-slate-800">Cronograma de Jornadas</h2>
        </div>
        <div className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3">Sector</th>
                <th className="px-6 py-3">Equipo Asignado</th>
                <th className="px-6 py-3">Meta Comercios</th>
                <th className="px-6 py-3">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {jornadas.map(j => (
                <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{j.fecha}</td>
                  <td className="px-6 py-4 flex items-center gap-2"><MapPin size={14} className="text-slate-400"/> {j.sector}</td>
                  <td className="px-6 py-4">{j.equipo}</td>
                  <td className="px-6 py-4">{j.comerciosA_Visitar}</td>
                  <td className="px-6 py-4">
                    <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold">{j.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="font-bold text-lg mb-4">Planificar Nueva Jornada</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Fecha</label>
                <input type="date" value={nuevaJornada.fecha} onChange={e=>setNuevaJornada({...nuevaJornada, fecha: e.target.value})} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Sector / Zona</label>
                <input type="text" value={nuevaJornada.sector} onChange={e=>setNuevaJornada({...nuevaJornada, sector: e.target.value})} className="w-full border p-2 rounded" placeholder="Ej. Calle Principal" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Equipo / Operadores</label>
                <input type="text" value={nuevaJornada.equipo} onChange={e=>setNuevaJornada({...nuevaJornada, equipo: e.target.value})} className="w-full border p-2 rounded" placeholder="Ej. Equipo 1 (Maria, Juan)" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Meta (Comercios a Visitar)</label>
                <input type="number" value={nuevaJornada.comercios} onChange={e=>setNuevaJornada({...nuevaJornada, comercios: Number(e.target.value)})} className="w-full border p-2 rounded" />
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button onClick={()=>setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 rounded">Cancelar</button>
                <button onClick={agregarJornada} className="px-4 py-2 text-white bg-orange-600 rounded font-bold">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
