'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  RefreshCw,
  AlertTriangle,
  Users,
  Building,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isResidencialInm, isTerrenoInm, calcularMensualidad } from '@/lib/calculos';
import {
  generarMorososExcel,
  generarMorososPDF,
  construirListaMorosos,
  generarPeriodosPorMeses,
} from '../generators/Morosos';

interface Props {
  contribuyentes: any[];
  tcmmv: number;
  onBack: () => void;
}

const PAGE_SIZE_TABLE = 100;

export default function MorososView({ contribuyentes = [], tcmmv = 0, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [inmueblesDirectos, setInmueblesDirectos] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroMeses, setFiltroMeses] = useState<'todos' | 'criticos' | 'leves'>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [currentPage, setCurrentPage] = useState(1);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      let all: any[] = [];
      let lastId: any = null;
      const STEP = 1000;
      for (let guard = 0; guard < 50; guard++) {
        let q = supabase
          .from('inmuebles')
          .select(
            'id,identidad,inmueble,contribuyente,tipo,clasificacion,telefono,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,multa_bs,meses_deuda,agente_retencion,estado,es_condominio,condominio_padre_id,padre_id'
          )
          .gt('meses_deuda', 0)
          .neq('estado', 'Eliminado')
          .order('id', { ascending: true })
          .limit(STEP);
        if (lastId !== null) q = q.gt('id', lastId);
        const { data: chunk, error } = await q;
        if (error || !chunk || chunk.length === 0) break;
        all.push(...chunk);
        lastId = chunk[chunk.length - 1].id;
        if (chunk.length < STEP) break;
      }
      setInmueblesDirectos(all);
    } catch (e) {
      console.error('Error cargando morosos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!contribuyentes || contribuyentes.length === 0) {
      cargarDatos();
    }
  }, [contribuyentes?.length]);

  // Construir lista de morosos desde inmueblesDirectos (si se recargó manualmente o si contribuyentes estaba vacío)
  // o desde contribuyentes en memoria (fuente canónica agrupada de AppContext).
  const morososList = useMemo(() => {
    if (inmueblesDirectos.length > 0) {
      const tasa = tcmmv > 0 ? tcmmv : 1;
      const map = new Map<string, any>();

      for (const row of inmueblesDirectos) {
        const esEliminado = ['eliminado', 'inactivo', 'desactivado'].includes(
          String(row.estado || '').trim().toLowerCase()
        );
        if (esEliminado || isTerrenoInm(row)) continue;

        const cod = row.inmueble || row.id;
        const groupKey = row.padre_id || cod || row.id;
        const esRes = isResidencialInm(row);
        const bMes = calcularMensualidad(row, tasa);
        const m = parseInt(String(row.meses_deuda || 0), 10) || 0;
        const deudaMMV = parseFloat(String(row.deuda_mmv || 0)) || 0;
        const totalMeses = Math.max(0, m > 0 ? m : deudaMMV > 0 ? 1 : 0);
        const mesesConMora = Math.max(0, totalMeses - 1);
        const tasaMora = esRes ? 0.1 : 0.12;

        const base4 = Math.round(bMes * totalMeses * 10000) / 10000;
        const iva4 = esRes ? 0 : Math.round(base4 * 0.16 * 10000) / 10000;
        const multa4 = Math.round(bMes * tasaMora * mesesConMora * 10000) / 10000;
        const ret4 =
          !esRes && row.agente_retencion === true ? Math.round(iva4 * 0.75 * 10000) / 10000 : 0;
        const saldoFavor = parseFloat(String(row.saldo_favor_bs || 0)) || 0;
        const rowCongelada = parseFloat(String(row.deuda_congelada_bs || 0)) || 0;
        const rowMultaBs = parseFloat(String(row.multa_bs || 0)) || 0;
        const rowDeudaBs =
          Math.round(
            Math.max(0, base4 + iva4 + multa4 + rowCongelada + rowMultaBs - ret4 - saldoFavor) * 100
          ) / 100;

        if (!map.has(groupKey)) {
          let clase = 'Residencial';
          if (row.es_condominio || row.clasificacion === 'Condominio') {
            clase = 'Condominio';
          } else if (esRes) {
            clase = 'Residencial';
          } else if ((row.tipo || '').toUpperCase().includes('COMERCIAL')) {
            clase = 'Comercial';
          } else if ((row.tipo || '').toUpperCase().includes('INDUSTRIAL')) {
            clase = 'Industrial';
          }
          map.set(groupKey, {
            id: row.id || groupKey,
            cod_cont: groupKey,
            contribuyente: row.contribuyente || 'Sin Nombre',
            identidad: row.identidad || '—',
            clasificacion: clase,
            telefono: row.telefono || '—',
            mesesPendientes: totalMeses,
            periodos: generarPeriodosPorMeses(totalMeses),
            totalDeudaBs: rowDeudaBs,
          });
        } else {
          const existing = map.get(groupKey);
          existing.totalDeudaBs = Math.round((existing.totalDeudaBs + rowDeudaBs) * 100) / 100;
          if (!row.padre_id) {
            existing.contribuyente = row.contribuyente || existing.contribuyente;
            existing.identidad = row.identidad || existing.identidad;
            existing.mesesPendientes = Math.max(existing.mesesPendientes, totalMeses);
            existing.periodos = generarPeriodosPorMeses(existing.mesesPendientes);
          }
        }
      }

      return Array.from(map.values())
        .filter((x) => x.mesesPendientes > 0 && x.totalDeudaBs > 0.01)
        .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);
    }

    return construirListaMorosos([], contribuyentes, tcmmv);
  }, [inmueblesDirectos, contribuyentes, tcmmv]);

  // Filtrado reactivo en la tabla
  const morososFiltrados = useMemo(() => {
    let list = morososList;

    if (filtroMeses === 'criticos') {
      list = list.filter((m) => m.mesesPendientes >= 3);
    } else if (filtroMeses === 'leves') {
      list = list.filter((m) => m.mesesPendientes < 3);
    }

    if (filtroTipo !== 'todos') {
      list = list.filter((m) =>
        String(m.clasificacion || '')
          .toLowerCase()
          .includes(filtroTipo.toLowerCase())
      );
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const qClean = q.replace(/[^a-z0-9]/gi, '');
      list = list.filter((m) => {
        const idClean = String(m.identidad || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/gi, '');
        const nom = String(m.contribuyente || '').toLowerCase();
        const cod = String(m.cod_cont || '').toLowerCase();
        return nom.includes(q) || cod.includes(q) || (qClean.length > 0 && idClean.includes(qClean));
      });
    }

    return list;
  }, [morososList, filtroMeses, filtroTipo, searchTerm]);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [filtroMeses, filtroTipo, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(morososFiltrados.length / PAGE_SIZE_TABLE));
  const morososPaginados = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE_TABLE;
    return morososFiltrados.slice(start, start + PAGE_SIZE_TABLE);
  }, [morososFiltrados, currentPage]);

  // Métricas
  const totalMorosos = morososList.length;
  const deudaTotal = useMemo(
    () => morososList.reduce((s, m) => s + (Number(m.totalDeudaBs) || 0), 0),
    [morososList]
  );
  const criticosCount = useMemo(
    () => morososList.filter((m) => m.mesesPendientes >= 3).length,
    [morososList]
  );
  const deudaCritica = useMemo(
    () =>
      morososList
        .filter((m) => m.mesesPendientes >= 3)
        .reduce((s, m) => s + (Number(m.totalDeudaBs) || 0), 0),
    [morososList]
  );

  const handleExportExcel = async () => {
    if (morososFiltrados.length === 0) return;
    setExportingExcel(true);
    try {
      await generarMorososExcel(morososFiltrados, contribuyentes, tcmmv);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPDF = async () => {
    if (morososFiltrados.length === 0) return;
    setExportingPdf(true);
    try {
      await generarMorososPDF(morososFiltrados, contribuyentes, tcmmv);
    } finally {
      setExportingPdf(false);
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
            <p className="text-xs text-slate-500">Contribuyentes con meses y saldos pendientes por cobrar</p>
          </div>
        </div>

        {/* Botones de Exportación */}
        <div className="flex items-center gap-2">
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            title="Recargar datos desde la base de datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={handleExportExcel}
            disabled={loading || exportingExcel || morososFiltrados.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {exportingExcel ? 'Generando Excel...' : 'Exportar Excel (.xlsx)'}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={loading || exportingPdf || morososFiltrados.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {exportingPdf ? 'Generando PDF...' : 'Exportar PDF'}
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
          <p className="text-[11px] text-slate-400 mt-1">Con al menos 1 mes por cobrar</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Deuda Total Pendiente</span>
            <Building className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">
            {loading
              ? '...'
              : `Bs. ${deudaTotal.toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {tcmmv > 0 && !loading
              ? `≈ € ${(deudaTotal / tcmmv).toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : 'En bolívares'}
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
            {loading
              ? '...'
              : `Bs. ${deudaCritica.toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </div>
          <p className="text-[11px] text-red-500 mt-1">
            {totalMorosos > 0 && !loading
              ? `${Math.round((criticosCount / totalMorosos) * 100)}% de los morosos`
              : ''}
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
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Contribuyente, RIF, Cédula o Código..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filtroMeses}
            onChange={(e) => setFiltroMeses(e.target.value as any)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="todos">Todos los meses adeudados</option>
            <option value="criticos">🔴 Morosos Críticos (3+ meses)</option>
            <option value="leves">🟡 Morosos Recientes (1-2 meses)</option>
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
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
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
          <span className="text-xs font-bold text-slate-700">
            Mostrando {morososFiltrados.length.toLocaleString('es-VE')} contribuyentes morosos
          </span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">
              Total en vista:{' '}
              <b className="text-slate-800">
                Bs.{' '}
                {morososFiltrados
                  .reduce((s, m) => s + (Number(m.totalDeudaBs) || 0), 0)
                  .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </b>
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-semibold text-slate-700 px-1">
                  Pág. {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
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
              ) : morososPaginados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No se encontraron contribuyentes morosos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                morososPaginados.map((m, idx) => {
                  const globalIdx = (currentPage - 1) * PAGE_SIZE_TABLE + idx;
                  const esCritico = m.mesesPendientes >= 3;
                  return (
                    <tr
                      key={m.id + '_' + globalIdx}
                      className={`hover:bg-slate-50 transition-colors ${esCritico ? 'bg-red-50/30' : ''}`}
                    >
                      <td className="py-2.5 px-3 text-center font-medium text-slate-400">
                        {globalIdx + 1}
                      </td>
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
                            esCritico
                              ? 'bg-red-100 text-red-700 border border-red-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {m.mesesPendientes} {m.mesesPendientes === 1 ? 'mes' : 'meses'}
                        </span>
                      </td>
                      <td
                        className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate"
                        title={m.periodos}
                      >
                        {m.periodos}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-black ${
                          esCritico ? 'text-red-700' : 'text-slate-800'
                        }`}
                      >
                        Bs.{' '}
                        {Number(m.totalDeudaBs || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
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
