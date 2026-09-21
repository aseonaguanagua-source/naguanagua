'use client';

import { useState, useEffect, useMemo } from 'react';
import { Map, User, Search, Printer, CheckSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64'; 

export default function PlanAccionPage() {
  const [trabajadores, setTrabajadores] = useState<any[]>([]);
  const [morosos, setMorosos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedTrabajador, setSelectedTrabajador] = useState('');
  const [minMeses, setMinMeses] = useState(6);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [asignacionesHoy, setAsignacionesHoy] = useState<Record<string, string>>({});
  
  const [selectedContribuyentes, setSelectedContribuyentes] = useState<Set<string>>(new Set());

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data: trabData } = await supabase.from('trabajadores').select('*').eq('estado', 'Activo');
      setTrabajadores(trabData || []);

      let allFacturas: any[] = [];
      let from = 0;
      while (true) {
        const { data: chunk } = await supabase.from('facturas').select('identidad, contribuyente, monto')
          .in('estado', ['Pendiente', 'Abonado']).range(from, from + 999);
        if (!chunk || chunk.length === 0) break;
        allFacturas = [...allFacturas, ...chunk];
        from += 1000;
        if (chunk.length < 1000) break;
      }

      const grouped: Record<string, { facturasCount: number, deudaBs: number, contribuyente: string, rawId: string }> = {};
      for (const f of allFacturas) {
        const id = (f.identidad || '').replace(/-/g, '').toUpperCase();
        if (!id) continue;
        if (!grouped[id]) {
          grouped[id] = { facturasCount: 0, deudaBs: 0, contribuyente: f.contribuyente || 'N/D', rawId: f.identidad || '' };
        }
        grouped[id].facturasCount++;
        grouped[id].deudaBs += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      }

      const rawIds = Object.values(grouped).map(g => g.rawId.trim());
      let allContrib: any[] = [];
      for (let i = 0; i < rawIds.length; i += 100) {
        const chunkIds = rawIds.slice(i, i + 100);
        const { data: cChunk } = await supabase.from('inmuebles').select('identidad, direccion, actividad_principal')
          .in('identidad', chunkIds);
        if (cChunk) allContrib = [...allContrib, ...cChunk];
      }
      
      const morososArray = Object.entries(grouped).map(([id, info]) => {
        const c = allContrib.find((c: any) => (c.identidad || '').replace(/-/g, '').toUpperCase() === id);
        return {
          identidad: id,
          contribuyente: info.contribuyente,
          mesesAdeudados: info.facturasCount,
          deudaBs: info.deudaBs,
          direccion: c?.direccion || 'Sin dirección registrada',
          tipo: c?.actividad_principal?.toLowerCase().includes('residencial') ? 'Residencial' : c?.actividad_principal?.toLowerCase().includes('comercial') ? 'Comercial' : 'Industrial'
        };
      });

      morososArray.sort((a, b) => b.mesesAdeudados - a.mesesAdeudados);
      setMorosos(morososArray);

      // Cargar asignaciones de hoy
      const hoy = new Date().toISOString().split('T')[0];
      const { data: audits } = await supabase.from('audit_logs')
        .select('*')
        .eq('accion', 'ASIGNACION_PLAN_ACCION')
        .gte('created_at', hoy + 'T00:00:00Z');
      
      const asigMap: Record<string, string> = {};
      if (audits) {
        for (const a of audits) {
          try {
            const det = typeof a.detalles === 'string' ? JSON.parse(a.detalles) : a.detalles;
            if (det.identidad && det.trabajador) {
              asigMap[det.identidad] = det.trabajador;
            }
          } catch(e) {}
        }
      }
      setAsignacionesHoy(asigMap);


    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredMorosos = useMemo(() => {
    return morosos.filter(m => {
      if (m.mesesAdeudados < minMeses) return false;
      if (tipoFiltro !== 'Todos' && m.tipo !== tipoFiltro) return false;
      if (searchTerm && !m.contribuyente.toLowerCase().includes(searchTerm.toLowerCase()) && !m.identidad.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [morosos, minMeses, searchTerm, tipoFiltro]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedContribuyentes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedContribuyentes(next);
  };

  const selectAll = () => {
    if (selectedContribuyentes.size === filteredMorosos.length) {
      setSelectedContribuyentes(new Set());
    } else {
      setSelectedContribuyentes(new Set(filteredMorosos.map(m => m.identidad)));
    }
  };

  const generarPDF = () => {
    if (!selectedTrabajador) {
      alert("Por favor selecciona un trabajador para el plan de acción.");
      return;
    }
    if (selectedContribuyentes.size === 0) {
      alert("Por favor selecciona al menos un contribuyente.");
      return;
    }

    const trabajador = trabajadores.find(t => t.id === selectedTrabajador);
    const nombreTrabajador = trabajador ? trabajador.nombre : 'Trabajador';
    const fecha = new Date().toLocaleDateString('es-VE');

    const doc = new jsPDF('landscape');
    const pageW = doc.internal.pageSize.width;

    if (logos.alcaldia) doc.addImage(logos.alcaldia, 'PNG', 14, 10, 25, 25);
    if (logos.isma) doc.addImage(logos.isma, 'PNG', pageW - 39, 10, 25, 25);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PLAN DE ACCIÓN - RECAUDACIÓN', pageW / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Trabajador Asignado: ${nombreTrabajador}`, pageW / 2, 27, { align: 'center' });
    doc.text(`Fecha: ${fecha}   |   Contribuyentes a visitar: ${selectedContribuyentes.size}`, pageW / 2, 33, { align: 'center' });

    const rowsToPrint = morosos.filter(m => selectedContribuyentes.has(m.identidad));
    
    const tableData = rowsToPrint.map((m, idx) => [
      idx + 1,
      m.contribuyente + '\n(' + m.identidad + ')',
      m.mesesAdeudados,
      m.direccion,
      '',
      '' 
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['N°', 'CONTRIBUYENTE', 'MESES ADEUDADOS', 'DIRECCIÓN', 'FIRMA DEL CONTRIBUYENTE', 'RECLAMOS / OBSERVACIONES']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 60 },
        2: { halign: 'center', cellWidth: 20 },
        3: { cellWidth: 70 },
        4: { cellWidth: 50 }, 
        5: { cellWidth: 50 }  
      }
    });

    doc.save(`Plan_Accion_${nombreTrabajador.replace(/\s+/g, '_')}_${fecha.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Map className="w-6 h-6 text-indigo-500" />
          Plan de Acción: Cobro Móvil
        </h1>
        <button
          onClick={generarPDF}
          disabled={selectedContribuyentes.size === 0 || !selectedTrabajador}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-sm font-semibold transition-colors"
        >
          <Printer className="w-4 h-4" /> Imprimir Plan (PDF)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Trabajador Asignado</label>
          <select 
            value={selectedTrabajador}
            onChange={(e) => setSelectedTrabajador(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">-- Seleccionar Trabajador --</option>
            {trabajadores.map(t => (
              <option key={t.id} value={t.id}>{t.nombre} ({t.rol})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Mínimo Meses Adeudados</label>
          <input 
            type="number" 
            min="1"
            value={minMeses}
            onChange={(e) => setMinMeses(parseInt(e.target.value) || 0)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tipo de Inmueble</label>
          <select 
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="Todos">🏠 Todos (Tipos)</option>
            <option value="Residencial">Residencial</option>
            <option value="Comercial">Comercial</option>
            <option value="Industrial">Industrial</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Buscar Contribuyente</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Nombre o RIF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <User className="w-4 h-4 text-slate-500" />
            Contribuyentes a Visitar ({selectedContribuyentes.size} seleccionados)
          </div>
          <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
            <CheckSquare className="w-3.5 h-3.5" /> {selectedContribuyentes.size === filteredMorosos.length && filteredMorosos.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
          </button>
        </div>
        
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-500">Cargando datos...</div>
          ) : filteredMorosos.length === 0 ? (
            <div className="p-10 text-center text-slate-500">No se encontraron contribuyentes morosos con estos filtros.</div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-white sticky top-0 border-b border-slate-200 text-xs uppercase text-slate-500 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">Sel.</th>
                  <th className="px-4 py-3">Contribuyente</th>
                  <th className="px-4 py-3 text-center">Meses (Facturas)</th>
                  <th className="px-4 py-3">Dirección</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMorosos.map((m) => (
                  <tr 
                    key={m.identidad} 
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedContribuyentes.has(m.identidad) ? 'bg-indigo-50/30' : ''}`}
                    onClick={() => toggleSelect(m.identidad)}
                  >
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedContribuyentes.has(m.identidad)}
                        onChange={() => {}} 
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{m.contribuyente}</div>
                      <div className="text-xs text-slate-500 font-mono">{m.identidad}</div>
                      {asignacionesHoy[m.identidad] && <div className="text-xs text-amber-600 font-bold mt-1">⚠️ Asignado hoy a: {asignacionesHoy[m.identidad]}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                        {m.mesesAdeudados}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[300px] truncate" title={m.direccion}>
                      {m.direccion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
