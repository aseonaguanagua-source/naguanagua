const fs = require('fs');

const content = `'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShieldCheck, Download, RefreshCw, Search, Filter, X, User, Calendar } from 'lucide-react';
import * as xlsx from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CATEGORIAS = ['TODAS', 'SESION', 'COBRO', 'TRANSFERENCIA', 'TASA', 'CONTRIBUYENTE', 'FACTURA', 'REPORTE', 'CONFIGURACION', 'CONVENIO', 'SISTEMA'];

const CAT_COLORS = {
  SESION:        'bg-blue-100 text-blue-800',
  COBRO:         'bg-emerald-100 text-emerald-800',
  TRANSFERENCIA: 'bg-purple-100 text-purple-800',
  TASA:          'bg-amber-100 text-amber-800',
  CONTRIBUYENTE: 'bg-sky-100 text-sky-800',
  FACTURA:       'bg-orange-100 text-orange-800',
  REPORTE:       'bg-slate-100 text-slate-700',
  CONFIGURACION: 'bg-red-100 text-red-800',
  CONVENIO:      'bg-indigo-100 text-indigo-800',
  SISTEMA:       'bg-gray-100 text-gray-700',
};

export default function AuditoriaPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('TODAS');
  const [filterUser, setFilterUser] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [usuarios, setUsuarios] = useState([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('auditoria')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (filterCat !== 'TODAS') q = q.eq('categoria', filterCat);
      if (filterUser) q = q.eq('usuario', filterUser);
      if (filterDateFrom) q = q.gte('created_at', filterDateFrom + 'T00:00:00');
      if (filterDateTo)   q = q.lte('created_at', filterDateTo + 'T23:59:59');
      const { data } = await q;
      if (data) {
        setLogs(data);
        const uList = [...new Set(data.map(l => l.usuario).filter(Boolean))];
        setUsuarios(uList);
      }
    } finally { setLoading(false); }
  }, [filterCat, filterUser, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = logs.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.usuario?.toLowerCase().includes(s) ||
      l.accion?.toLowerCase().includes(s) ||
      l.modulo?.toLowerCase().includes(s) ||
      JSON.stringify(l.detalles || {}).toLowerCase().includes(s)
    );
  });

  const exportarExcel = () => {
    const data = filtered.map(l => ({
      'Fecha':      new Date(l.created_at).toLocaleString('es-VE'),
      'Usuario':    l.usuario,
      'Categoria':  l.categoria || 'SISTEMA',
      'Modulo':     l.modulo || '',
      'Accion':     l.accion,
      'Detalles':   typeof l.detalles === 'object' ? JSON.stringify(l.detalles) : (l.detalles || ''),
    }));
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Auditoria');
    xlsx.writeFile(wb, 'Auditoria_' + new Date().getTime() + '.xlsx');
  };

  const parseDetalles = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(e){ return { texto: raw }; } }
    return raw;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            Auditoria de Sistema
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Registro completo e inmutable de todas las actividades del personal.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-sm font-medium transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button onClick={exportarExcel} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
            <Download size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {['COBRO','TRANSFERENCIA','SESION','TASA','FACTURA'].map(cat => {
          const count = logs.filter(l => l.categoria === cat).length;
          return (
            <button key={cat} onClick={() => setFilterCat(filterCat === cat ? 'TODAS' : cat)}
              className={"p-3 rounded-lg border text-left transition-all " + (filterCat === cat ? 'border-indigo-300 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300')}>
              <div className={"text-xs font-bold px-1.5 py-0.5 rounded inline-block mb-1 " + (CAT_COLORS[cat] || 'bg-gray-100 text-gray-700')}>{cat}</div>
              <div className="text-2xl font-black text-slate-800">{count}</div>
              <div className="text-xs text-slate-400">eventos</div>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar en acciones, usuario, detalles..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="border border-slate-200 rounded py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
              className="border border-slate-200 rounded py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">Todos los usuarios</option>
              {usuarios.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="border border-slate-200 rounded py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <span className="text-slate-400 text-xs">to</span>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="border border-slate-200 rounded py-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          {(filterCat !== 'TODAS' || filterUser || filterDateFrom || filterDateTo || search) && (
            <button onClick={() => { setFilterCat('TODAS'); setFilterUser(''); setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); }}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-sm">
              <X size={14} /> Limpiar
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Mostrando <span className="font-bold text-slate-600">{filtered.length}</span> de {logs.length} registros
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-300" />
            Cargando registros de auditoria...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" style={{minWidth:'900px'}}>
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Fecha y Hora</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Accion</th>
                  <th className="px-4 py-3">Modulo</th>
                  <th className="px-4 py-3">Detalles</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No hay registros.</td></tr>
                ) : filtered.map((l, i) => {
                  const det = parseDetalles(l.detalles);
                  const cat = l.categoria || 'SISTEMA';
                  const fecha = new Date(l.created_at);
                  return (
                    <tr key={l.id || i}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer transition-colors"
                      onClick={() => setSelectedLog(l)}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-slate-700 text-xs">{fecha.toLocaleDateString('es-VE')}</div>
                        <div className="text-[11px] text-slate-400">{fecha.toLocaleTimeString('es-VE')}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800">{l.usuario || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={"px-2 py-0.5 rounded text-[10px] font-black " + (CAT_COLORS[cat] || 'bg-gray-100 text-gray-700')}>{cat}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 max-w-[200px]">{l.accion}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono truncate max-w-[120px]" title={l.modulo}>
                        {l.modulo ? l.modulo.replace('/admin/','').replace('/','') : '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="flex flex-wrap gap-1">
                          {det.identidad && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">{det.identidad}</span>}
                          {det.monto_bs && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">Bs.{Number(det.monto_bs).toLocaleString('es-VE',{minimumFractionDigits:2})}</span>}
                          {det.metodo && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">{det.metodo}</span>}
                          {det.banco && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px]">{det.banco}</span>}
                          {det.referencia_pago && <span className="px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded text-[10px] font-mono">Ref:{det.referencia_pago}</span>}
                          {det.nueva_tasa && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">Tasa:{det.nueva_tasa}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-slate-800">Detalle del Registro</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400 text-xs block">Fecha</span><span className="font-semibold">{new Date(selectedLog.created_at).toLocaleString('es-VE')}</span></div>
                <div><span className="text-slate-400 text-xs block">Usuario</span><span className="font-bold text-indigo-700">{selectedLog.usuario}</span></div>
                <div><span className="text-slate-400 text-xs block">Categoria</span>
                  <span className={"px-2 py-0.5 rounded text-[11px] font-black " + (CAT_COLORS[selectedLog.categoria || 'SISTEMA'] || 'bg-gray-100')}>{selectedLog.categoria || 'SISTEMA'}</span>
                </div>
                <div><span className="text-slate-400 text-xs block">Modulo</span><span className="font-mono text-xs">{selectedLog.modulo || '—'}</span></div>
              </div>
              <div><span className="text-slate-400 text-xs block mb-1">Accion</span>
                <div className="bg-slate-50 rounded-lg px-4 py-2.5 font-semibold text-slate-800">{selectedLog.accion}</div>
              </div>
              <div><span className="text-slate-400 text-xs block mb-1">Detalles Completos</span>
                <pre className="bg-slate-900 text-emerald-300 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(parseDetalles(selectedLog.detalles), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(
  'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/auditoria/page.tsx',
  content, 'utf8'
);
console.log('✅ auditoria/page.tsx reescrito con filtros completos y categorias');
