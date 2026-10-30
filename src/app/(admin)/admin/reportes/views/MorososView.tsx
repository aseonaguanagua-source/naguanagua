'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Download, ArrowLeft, Search, RefreshCw, AlertTriangle, Users, Building, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generarMorososExcel, generarMorososPDF } from '../generators/Morosos';

interface Props {
  contribuyentes: any[];
  tcmmv: number;
  onBack: () => void;
}

export default function MorososView({ contribuyentes = [], tcmmv = 0, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroMeses, setFiltroMeses] = useState<'todos' | 'criticos' | 'leves'>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');

  // Mapa rápido de contribuyentes por identidad normalizada
  const contribMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of contribuyentes) {
      const id = (c.Identidad || c.identidad || '').replace(/[-.\s]/g, '').toUpperCase();
      if (id) map.set(id, c);
    }
    return map;
  }, [contribuyentes]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      let all: any[] = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data: chunk, error } = await supabase
          .from('facturas')
          .select('*')
          .in('estado', ['Pendiente', 'Abonado'])
          .range(from, from + PAGE_SIZE - 1);
        if (error || !chunk || chunk.length === 0) break;
        all = [...all, ...chunk];
        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setFacturas(all);
      setDataLoaded(true);
    } catch (e) {
      console.error('Error cargando morosos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Agrupar recibos por contribuyente
  const morososList = useMemo(() => {
    const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const getMes = (d: string) => {
      const p = d?.split('-');
      return p?.length >= 2 ? `${MESES[parseInt(p[1]) - 1]}-${p[0]}` : d || '—';
    };

    const grouped: Record<string, { recibos: any[]; contrib: any }> = {};
    for (const f of facturas) {
      const id = (f.identidad || '').replace(/[-.\s]/g, '').toUpperCase();
      if (!id) continue;
      if (!grouped[id]) {
        grouped[id] = { recibos: [], contrib: contribMap.get(id) };
      }
      grouped[id].recibos.push(f);
    }

    return Object.values(grouped)
      .filter(g => g.recibos.length > 0)
      .map(g => {
        const { recibos, contrib } = g;
        let totalDeudaBs = 0;
        for (const f of recibos) {
          totalDeudaBs += parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
        }
        const periodos = recibos
          .sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime())
          .map((f: any) => getMes(f.emision))
          .join(', ');

        const clasificacion = contrib?.Clasificacion || contrib?.clasificacion || 'Residencial';
        const telefono = contrib?.Telefono || contrib?.telefono || '—';

        return {
          id: contrib?.Identidad || recibos[0]?.identidad || '—',
          cod_cont: contrib?.CodCont || contrib?.cod_cont || '—',
          contribuyente: contrib?.Contribuyente || contrib?.contribuyente || recibos[0]?.contribuyente || '—',
          identidad: contrib?.Identidad || recibos[0]?.identidad || '—',
          clasificacion,
          telefono,
          mesesPendientes: recibos.length,
          periodos,
          totalDeudaBs,
        };
      })
      .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);
  }, [facturas, contribMap]);

  // Filtrado reactivo en la tabla
  const morososFiltrados = useMemo(() => {
    let list = morososList;

    if (filtroMeses === 'criticos') {
      list = list.filter(m => m.mesesPendientes >= 3);
    } else if (filtroMeses === 'leves') {
      list = list.filter(m => m.mesesPendientes < 3);
    }

    if (filtroTipo !== 'todos') {
      list = list.filter(m => m.clasificacion.toLowerCase().includes(filtroTipo.toLowerCase()));
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const qClean = q.replace(/[^a-z0-9]/gi, '');
      list = list.filter(m => {
        const idClean = m.identidad.toLowerCase().replace(/[^a-z0-9]/gi, '');
        const nom = m.contribuyente.toLowerCase();
        const cod = m.cod_cont.toLowerCase();
        return nom.includes(q) || cod.includes(q) || idClean.includes(qClean);
      });
    }

    return list;
  }, [morososList, filtroMeses, filtroTipo, searchTerm]);

  // Métricas
  const totalMorosos = morososList.length;
  const deudaTotal = useMemo(() => morososList.reduce((s, m) => s + m.totalDeudaBs, 0), [morososList]);
  const criticosCount = useMemo(() => morososList.filter(m => m.mesesPendientes >= 3).length, [morososList]);
  const deudaCritica = useMemo(() => morososList.filter(m => m.mesesPendientes >= 3).reduce((s, m) => s + m.totalDeudaBs, 0), [morososList]);

  const handleExportExcel = async () => {
    if (facturas.length > 0) {
      await generarMorososExcel(facturas, contribuyentes, tcmmv);
    }
  };

  const handleExportPDF = async () => {
    if (facturas.length > 0) {
      await generarMorososPDF(facturas, contribuyentes, tcmmv);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a Reportes
          </button>
          <div className="h-4 w-px bg-slate-300" />
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              Reporte de Morosos
            </h1>
            <p className="text-xs text-slate-500">Contribuyentes con recibos pendientes o abonados</p>
          </div>
        </div>

        {/* Botones de Exportación */}
        <div className="flex items-center gap-2">
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={handleExportExcel}
            disabled={loading || facturas.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel (.xlsx)
          </button>
          <button
            onClick={handleExportPDF}
            disabled={loading || facturas.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> Exportar PDF
          </button>
        </div>
      </div>

      {/* Tarjetas de Resumen KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Contribuyentes Morosos</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">
            {loading ? '...' : totalMorosos.toLocaleString('es-VE')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Con al menos 1 recibo por cobrar</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Deuda Total Pendiente</span>
            <Building className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">
            {loading ? '...' : `Bs. ${deudaTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {tcmmv > 0 && !loading ? `≈ € ${(deudaTotal / tcmmv).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'En bolívares'}
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-red-600 text-xs font-semibold">
            <span>Morosidad Crítica (3+ meses)</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black text-red-700 mt-2">
            {loading ? '...' : criticosCount.toLocaleString('es-VE')}
          </div>
          <p className="text-[11px] text-red-500 mt-1">Casos prioritarios de cobranza</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-red-600 text-xs font-semibold">
            <span>Deuda en Morosidad Crítica</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black text-red-700 mt-2">
            {loading ? '...' : `Bs. ${deudaCritica.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <p className="text-[11px] text-red-500 mt-1">
            {totalMorosos > 0 && !loading ? `${Math.round((criticosCount / totalMorosos) * 100)}% de los morosos` : ''}
          </p>
        </div>
      </div>

      {/* Filtros de Búsqueda y Segmentación */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-center justify-between">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por Contribuyente, RIF, Cédula o Código..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filtroMeses}
            onChange={e => setFiltroMeses(e.target.value as any)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="todos">Todos los meses adeudados</option>
            <option value="criticos">🔴 Morosos Críticos (3+ meses)</option>
            <option value="leves">🟡 Morosos Recientes (1-2 meses)</option>
          </select>

          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="todos">Todas las clasificaciones</option>
            <option value="comercial">Comercial</option>
            <option value="residencial">Residencial</option>
            <option value="condominio">Condominio</option>
          </select>
        </div>
      </div>

      {/* Tabla Interactiva de Resultados */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <span className="text-xs font-bold text-slate-700">
            Mostrando {morososFiltrados.length.toLocaleString('es-VE')} contribuyentes morosos
          </span>
          <span className="text-xs text-slate-500">
            Total en vista: <b className="text-slate-800">Bs. {morososFiltrados.reduce((s, m) => s + m.totalDeudaBs, 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3 text-center w-12">#</th>
                <th className="py-2.5 px-3 w-28">Código</th>
                <th className="py-2.5 px-3">Contribuyente</th>
                <th className="py-2.5 px-3 w-32">Identidad</th>
                <th className="py-2.5 px-3 w-28">Teléfono</th>
                <th className="py-2.5 px-3 text-center w-24">Meses Deuda</th>
                <th className="py-2.5 px-3">Períodos Pendientes</th>
                <th className="py-2.5 px-3 text-right w-36">Deuda Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Cargando información de morosidad...
                  </td>
                </tr>
              ) : morososFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No se encontraron contribuyentes morosos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                morososFiltrados.map((m, idx) => {
                  const esCritico = m.mesesPendientes >= 3;
                  return (
                    <tr
                      key={m.id + '_' + idx}
                      className={`hover:bg-slate-50 transition-colors ${esCritico ? 'bg-red-50/30' : ''}`}
                    >
                      <td className="py-2.5 px-3 text-center font-medium text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-600">{m.cod_cont}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800">{m.contribuyente}</div>
                        <div className="text-[10px] text-slate-400">{m.clasificacion}</div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">{m.identidad}</td>
                      <td className="py-2.5 px-3 text-slate-500">{m.telefono}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black ${
                            esCritico ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {m.mesesPendientes} {m.mesesPendientes === 1 ? 'mes' : 'meses'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate" title={m.periodos}>
                        {m.periodos}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-black ${esCritico ? 'text-red-700' : 'text-slate-800'}`}>
                        Bs. {m.totalDeudaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
