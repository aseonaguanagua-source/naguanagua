'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Info,
  Download,
  RefreshCw,
  Search,
  Filter,
  X,
  User,
  Calendar,
  Copy,
  Check,
  Eye,
  Printer,
  DollarSign,
  Activity,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import * as xlsx from 'xlsx';

export type AuditCriticality = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

const CATEGORIAS = [
  'TODAS',
  'COBRO',
  'CAJA',
  'DEUDA',
  'CONTRIBUYENTE',
  'INMUEBLE',
  'TASA',
  'FACTURACION',
  'CONCILIACION',
  'CONVENIO',
  'SESION',
  'SEGURIDAD',
  'REPORTE',
  'CONFIGURACION',
  'TRANSFERENCIA',
  'RECIBO',
  'SISTEMA'
];

const CRITICIDADES: ('TODAS' | AuditCriticality)[] = ['TODAS', 'CRITICA', 'ALTA', 'MEDIA', 'BAJA'];

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  COBRO:         { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CAJA:          { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  DEUDA:         { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200' },
  CONTRIBUYENTE: { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  INMUEBLE:      { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  TASA:          { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  FACTURACION:   { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  CONCILIACION:  { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200' },
  CONVENIO:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  SESION:        { bg: 'bg-slate-100',  text: 'text-slate-700',   border: 'border-slate-300' },
  SEGURIDAD:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  REPORTE:       { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200' },
  CONFIGURACION: { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  TRANSFERENCIA: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  RECIBO:        { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  SISTEMA:       { bg: 'bg-gray-100',   text: 'text-gray-700',    border: 'border-gray-300' },
};

const CRIT_STYLES: Record<AuditCriticality, { bg: string; text: string; border: string; badge: string; icon: any }> = {
  CRITICA: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-300',
    badge: 'bg-red-600 text-white font-black animate-pulse shadow-sm',
    icon: ShieldAlert
  },
  ALTA: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    badge: 'bg-amber-500 text-white font-bold shadow-sm',
    icon: AlertTriangle
  },
  MEDIA: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800 font-medium',
    icon: AlertCircle
  },
  BAJA: {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-600',
    icon: Info
  },
};

const parseDetalles = (raw: any): any => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { texto: raw };
    }
  }
  return raw;
};

const getCategoria = (log: any): string => {
  if (log.categoria) return log.categoria;
  const det = parseDetalles(log.detalles);
  return det._categoria || 'SISTEMA';
};

const getModulo = (log: any): string => {
  if (log.modulo) return log.modulo;
  const det = parseDetalles(log.detalles);
  return det._modulo || '';
};

const getCriticidad = (log: any): AuditCriticality => {
  const det = parseDetalles(log.detalles);
  if (det.criticidad && ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(det.criticidad)) {
    return det.criticidad;
  }
  // Heurística de respaldo para registros legacy:
  const cat = getCategoria(log);
  const accion = (log.accion || '').toLowerCase();
  if (accion.includes('anula') || accion.includes('ajuste') || accion.includes('elimin') || accion.includes('tasa') || accion.includes('crédito') || accion.includes('credito')) {
    return 'CRITICA';
  }
  if (cat === 'COBRO' || cat === 'CONCILIACION' || cat === 'DEUDA') {
    return 'ALTA';
  }
  if (cat === 'SESION' || accion.includes('consulta')) {
    return 'BAJA';
  }
  return 'MEDIA';
};

const getTodayVE = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('TODAS');
  const [filterCrit, setFilterCrit] = useState<'TODAS' | AuditCriticality>('TODAS');
  const [filterUser, setFilterUser] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | '7days' | 'month'>('all');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Manejo de presets de fechas
  const applyDatePreset = (preset: 'all' | 'today' | 'yesterday' | '7days' | 'month') => {
    setDatePreset(preset);
    const todayStr = getTodayVE();
    const today = new Date(todayStr + 'T12:00:00');

    if (preset === 'all') {
      setFilterDateFrom('');
      setFilterDateTo('');
    } else if (preset === 'today') {
      setFilterDateFrom(todayStr);
      setFilterDateTo(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setFilterDateFrom(yStr);
      setFilterDateTo(yStr);
    } else if (preset === '7days') {
      const past7 = new Date(today);
      past7.setDate(past7.getDate() - 6);
      setFilterDateFrom(past7.toISOString().split('T')[0]);
      setFilterDateTo(todayStr);
    } else if (preset === 'month') {
      const startOfMonth = todayStr.substring(0, 8) + '01';
      setFilterDateFrom(startOfMonth);
      setFilterDateTo(todayStr);
    }
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('auditoria')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (filterDateFrom) q = q.gte('created_at', filterDateFrom + 'T00:00:00');
      if (filterDateTo)   q = q.lte('created_at', filterDateTo + 'T23:59:59');
      if (filterUser)     q = q.eq('usuario', filterUser);
      if (filterCat !== 'TODAS') q = (q as any).eq('categoria', filterCat);

      const { data, error } = await q;
      if (error) {
        console.error('Error fetching auditoria logs:', error);
      }
      setLogs(data || []);
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo, filterUser, filterCat]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Lista única de operadores / usuarios
  const usuarios = useMemo(() => {
    const list = logs.map(l => l.usuario).filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [logs]);

  // Filtrado reactivo en el cliente
  const filtered = useMemo(() => {
    return logs.filter(l => {
      // Filtro de categoría (para registros legacy o cuando no filtró en BD)
      if (filterCat !== 'TODAS') {
        if (getCategoria(l) !== filterCat) return false;
      }
      // Filtro de criticidad
      if (filterCrit !== 'TODAS') {
        if (getCriticidad(l) !== filterCrit) return false;
      }
      // Filtro de usuario
      if (filterUser && l.usuario !== filterUser) {
        return false;
      }
      // Búsqueda de texto libre multifactorial
      if (search.trim()) {
        const s = search.toLowerCase().trim();
        const userMatch = (l.usuario || '').toLowerCase().includes(s);
        const actionMatch = (l.accion || '').toLowerCase().includes(s);
        const modMatch = (getModulo(l) || '').toLowerCase().includes(s);
        const detStr = JSON.stringify(l.detalles || {}).toLowerCase();
        const detMatch = detStr.includes(s);

        if (!userMatch && !actionMatch && !modMatch && !detMatch) {
          return false;
        }
      }
      return true;
    });
  }, [logs, filterCat, filterCrit, filterUser, search]);

  // Métricas KPI Forenses
  const stats = useMemo(() => {
    let cobrosCount = 0;
    let criticasCount = 0;
    let contribCount = 0;
    let totalMontoBs = 0;

    filtered.forEach(l => {
      const cat = getCategoria(l);
      const crit = getCriticidad(l);
      const det = parseDetalles(l.detalles);

      if (cat === 'COBRO' || cat === 'CAJA' || cat === 'CONCILIACION') {
        cobrosCount++;
        if (det.monto_bs && !isNaN(Number(det.monto_bs))) {
          totalMontoBs += Number(det.monto_bs);
        }
      }
      if (crit === 'CRITICA') {
        criticasCount++;
      }
      if (cat === 'CONTRIBUYENTE' || cat === 'INMUEBLE' || cat === 'DEUDA') {
        contribCount++;
      }
    });

    return {
      total: filtered.length,
      cobrosCount,
      criticasCount,
      contribCount,
      totalMontoBs,
      operadoresActivos: new Set(filtered.map(l => l.usuario).filter(Boolean)).size,
    };
  }, [filtered]);

  // Exportar Excel Completo
  const exportarExcel = () => {
    const data = filtered.map(l => {
      const det = parseDetalles(l.detalles);
      const d = new Date(l.created_at);
      return {
        'ID Evento':   l.id || '',
        'Fecha (VE)':  d.toLocaleDateString('es-VE'),
        'Hora (VE)':   d.toLocaleTimeString('es-VE'),
        'Operador':    l.usuario || 'Desconocido',
        'Criticidad':  getCriticidad(l),
        'Categoría':   getCategoria(l),
        'Módulo':      (getModulo(l) || '').replace('/admin/', '').replace('/', '') || 'General',
        'Acción':      l.accion || '',
        'Identidad / RIF': det.identidad || det.contribuyente || det.rif || det.cedula || '',
        'Código Inmueble': det.codigo_catastral || det.codigo || det.inmueble || '',
        'Monto Bs':    det.monto_bs || '',
        'Método Pago': det.metodo || det.forma_pago || '',
        'Banco / Caja':det.banco || det.cajero_letra || '',
        'Referencia':  det.referencia_pago || det.referencia || '',
        'Tasa BCV':    det.nueva_tasa || det.tasa_bcv || '',
        'Detalles JSON': JSON.stringify(det),
      };
    });

    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Trazabilidad_Forense');
    xlsx.writeFile(wb, `Auditoria_Naguanagua_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleCopyJson = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const clearAllFilters = () => {
    setFilterCat('TODAS');
    setFilterCrit('TODAS');
    setFilterUser('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setDatePreset('all');
    setSearch('');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto print:p-0 print:m-0">
      {/* Encabezado Superior */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                Centro de Auditoría y Trazabilidad Integral
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 tracking-normal border border-indigo-200">
                  Forensic Log
                </span>
              </h1>
              <p className="text-slate-500 text-xs md:text-sm mt-0.5">
                Supervisión forense inmutable de todas las operaciones, cobros, tasas, ajustes y accesos del personal municipal.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 print:hidden">
          <button
            onClick={() => window.print()}
            title="Imprimir reporte formal"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Printer size={15} /> Imprimir / PDF
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-indigo-600' : ''} />
            Actualizar
          </button>
          <button
            onClick={exportarExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md shadow-emerald-100 transition-all"
          >
            <FileSpreadsheet size={15} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* KPI Cards Forenses */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Eventos */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Eventos</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.total.toLocaleString()}</span>
            <span className="text-[11px] text-slate-400">filtrados</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            <span className="font-semibold text-indigo-600">{stats.operadoresActivos}</span> operadores activos
          </div>
        </div>

        {/* Cobros y Movimientos de Caja */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cobros & Caja</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700">{stats.cobrosCount.toLocaleString()}</span>
            <span className="text-[11px] text-emerald-600 font-medium">operaciones</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-bold truncate mt-1">
            Bs. {stats.totalMontoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Acciones Críticas */}
        <div
          onClick={() => setFilterCrit(filterCrit === 'CRITICA' ? 'TODAS' : 'CRITICA')}
          className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-all ${
            filterCrit === 'CRITICA'
              ? 'bg-red-50 border-red-400 ring-2 ring-red-200'
              : 'bg-white border-slate-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Acciones Críticas</span>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-red-600">{stats.criticasCount.toLocaleString()}</span>
            <span className="text-[11px] text-red-500 font-bold">sensibles</span>
          </div>
          <div className="text-[11px] text-red-600/80 mt-1">
            Tasas, ajustes, anulaciones y créditos
          </div>
        </div>

        {/* Modificaciones Catastro / Deudas */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">Contribuyentes & Deudas</span>
            <Layers className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.contribCount.toLocaleString()}</span>
            <span className="text-[11px] text-sky-600 font-medium">cambios</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Censo, inmuebles y convenios
          </div>
        </div>

        {/* Operadores Detectados */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Personal en Turno</span>
            <User className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-700">{usuarios.length}</span>
            <span className="text-[11px] text-slate-400">usuarios</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate" title={usuarios.join(', ')}>
            {usuarios.slice(0, 3).join(', ')}{usuarios.length > 3 ? ` +${usuarios.length - 3}` : ''}
          </div>
        </div>
      </div>

      {/* Barra de Filtros Multifactorial */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4 print:hidden">
        {/* Fila 1: Búsqueda, Usuario, Categoría, Criticidad */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Búsqueda de texto */}
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar operador, acción, cédula, RIF, ref bancaria, inmueble..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Selector de Operador */}
          <div className="md:col-span-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                <option value="">Todos los trabajadores / operadores</option>
                {usuarios.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de Categoría */}
          <div className="md:col-span-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                {CATEGORIAS.map(c => (
                  <option key={c} value={c}>
                    Categoría: {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de Criticidad */}
          <div className="md:col-span-2">
            <select
              value={filterCrit}
              onChange={e => setFilterCrit(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              {CRITICIDADES.map(cr => (
                <option key={cr} value={cr}>
                  {cr === 'TODAS' ? 'Criticidad: Todas' : `Nivel: ${cr}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fila 2: Presets de Fechas y Rango Específico */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Rango:</span>
            {[
              { id: 'all', label: 'Todo el Histórico' },
              { id: 'today', label: 'Hoy' },
              { id: 'yesterday', label: 'Ayer' },
              { id: '7days', label: 'Últimos 7 días' },
              { id: 'month', label: 'Este Mes' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyDatePreset(p.id as any)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  datePreset === p.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => {
                  setFilterDateFrom(e.target.value);
                  setDatePreset('all');
                }}
                className="bg-transparent text-xs text-slate-700 focus:outline-none"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => {
                  setFilterDateTo(e.target.value);
                  setDatePreset('all');
                }}
                className="bg-transparent text-xs text-slate-700 focus:outline-none"
              />
            </div>

            {(filterCat !== 'TODAS' ||
              filterCrit !== 'TODAS' ||
              filterUser ||
              filterDateFrom ||
              filterDateTo ||
              search) && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 text-slate-400 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors"
              >
                <X size={14} /> Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Resumen de conteo */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 font-medium">
          <div>
            Mostrando <span className="font-black text-slate-800">{filtered.length}</span> registros de trazabilidad
            (de <span className="font-semibold text-slate-600">{logs.length}</span> cargados)
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[11px] text-slate-400">Auditoría en tiempo real activa</span>
          </div>
        </div>
      </div>

      {/* Tabla Principal de Auditoría */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
            <p className="text-sm font-medium">Cargando registros forenses de auditoría...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <ShieldCheck className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
            <p className="text-base font-semibold text-slate-700">No se encontraron registros de auditoría</p>
            <p className="text-xs text-slate-400">Prueba ajustando los filtros de fecha, usuario o categoría.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" style={{ minWidth: '1050px' }}>
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Fecha y Hora</th>
                  <th className="px-4 py-3.5">Operador / Trabajador</th>
                  <th className="px-4 py-3.5">Nivel</th>
                  <th className="px-4 py-3.5">Categoría</th>
                  <th className="px-4 py-3.5">Acción Ejecutada</th>
                  <th className="px-4 py-3.5">Módulo / Pantalla</th>
                  <th className="px-4 py-3.5">Entidad / Sujeto Afectado</th>
                  <th className="px-4 py-3.5 text-right">Trazabilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((l, i) => {
                  const det = parseDetalles(l.detalles);
                  const cat = getCategoria(l);
                  const crit = getCriticidad(l);
                  const modulo = getModulo(l);
                  const fecha = new Date(l.created_at);
                  const catStyle = CAT_COLORS[cat] || CAT_COLORS.SISTEMA;
                  const critStyle = CRIT_STYLES[crit] || CRIT_STYLES.MEDIA;
                  const CritIcon = critStyle.icon;

                  const sujeto =
                    det.identidad ||
                    det.contribuyente ||
                    det.codigo_catastral ||
                    det.codigo ||
                    det.inmueble ||
                    det.rif ||
                    det.cedula ||
                    '';

                  return (
                    <tr
                      key={l.id || i}
                      className="hover:bg-indigo-50/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedLog(l)}
                    >
                      {/* Fecha y Hora */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800 text-[11px]">
                          {fecha.toLocaleDateString('es-VE')}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {fecha.toLocaleTimeString('es-VE')}
                        </div>
                      </td>

                      {/* Operador / Trabajador */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                            {(l.usuario || 'U').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 text-xs block leading-tight">
                              {l.usuario || 'Desconocido'}
                            </span>
                            {det.cajero_letra && (
                              <span className="text-[9px] font-mono text-indigo-600 font-bold">
                                Caja {det.cajero_letra}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Nivel de Criticidad */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${critStyle.badge}`}
                        >
                          <CritIcon size={11} />
                          {crit}
                        </span>
                      </td>

                      {/* Categoría */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                        >
                          {cat}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="px-4 py-3 font-semibold text-slate-800 max-w-[260px] leading-snug">
                        {l.accion}
                        {det.nota && (
                          <div className="text-[10px] font-normal text-slate-500 italic mt-0.5 line-clamp-1">
                            "{det.nota}"
                          </div>
                        )}
                      </td>

                      {/* Módulo */}
                      <td className="px-4 py-3 text-slate-500 text-[11px] font-mono whitespace-nowrap">
                        {modulo ? modulo.replace('/admin/', '').split('?')[0] : 'general'}
                      </td>

                      {/* Entidad / Sujeto */}
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="flex flex-wrap gap-1 items-center">
                          {sujeto && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[10px] font-bold">
                              {sujeto}
                            </span>
                          )}
                          {det.monto_bs && !isNaN(Number(det.monto_bs)) && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-black">
                              Bs. {Number(det.monto_bs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          {det.metodo && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">
                              {det.metodo}
                            </span>
                          )}
                          {det.referencia_pago && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded font-mono text-[9px]">
                              Ref: {det.referencia_pago}
                            </span>
                          )}
                          {det.nueva_tasa && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-mono text-[10px] font-bold">
                              Tasa: {det.nueva_tasa}
                            </span>
                          )}
                          {det.total_facturado && (
                            <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-[10px] font-bold">
                              {det.total_facturado} facturas
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Botón Ver Trazabilidad */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedLog(l);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-600 text-slate-600 hover:text-white border border-slate-200 hover:border-indigo-600 rounded-md text-[11px] font-bold transition-all shadow-xs"
                        >
                          <Eye size={12} /> Inspeccionar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Forense de Inspección de Trazabilidad */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                    Inspección Forense de Registro
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        CRIT_STYLES[getCriticidad(selectedLog)]?.badge || 'bg-slate-200'
                      }`}
                    >
                      {getCriticidad(selectedLog)}
                    </span>
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    ID: {selectedLog.id || 'N/A'} • {new Date(selectedLog.created_at).toLocaleString('es-VE')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Tarjeta de Metadatos Principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Operador</span>
                  <span className="font-bold text-indigo-700 text-sm">{selectedLog.usuario || 'Desconocido'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Categoría</span>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black ${
                      CAT_COLORS[getCategoria(selectedLog)]?.bg || 'bg-slate-100'
                    } ${CAT_COLORS[getCategoria(selectedLog)]?.text || 'text-slate-800'}`}
                  >
                    {getCategoria(selectedLog)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Módulo</span>
                  <span className="font-mono text-slate-700 font-semibold truncate block">
                    {getModulo(selectedLog) || 'General'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Zona Horaria</span>
                  <span className="font-semibold text-slate-600">América/Caracas</span>
                </div>
              </div>

              {/* Acción Principal */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Acción Registrada
                </span>
                <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 text-sm">
                  {selectedLog.accion}
                </div>
              </div>

              {/* Desglose Estructurado de Detalles */}
              {(() => {
                const det = parseDetalles(selectedLog.detalles);
                const keys = Object.keys(det).filter(k => !k.startsWith('_') && k !== 'criticidad');
                if (keys.length === 0) return null;

                return (
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Campos Estructurados del Evento
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                      {keys.map(k => (
                        <div key={k} className="p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                            {k.replace(/_/g, ' ')}
                          </span>
                          <span className="font-bold text-slate-800 text-xs break-all">
                            {typeof det[k] === 'object' ? JSON.stringify(det[k]) : String(det[k])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Payload JSON Crudo para Peritaje Forense */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Payload Completo Inmutable (JSON)
                  </span>
                  <button
                    onClick={() => handleCopyJson(parseDetalles(selectedLog.detalles))}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    {copiedJson ? (
                      <>
                        <Check size={12} className="text-emerald-600" /> Copiado al portapapeles
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copiar JSON
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-900 text-emerald-400 rounded-xl p-4 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-56 leading-relaxed border border-slate-800">
                  {JSON.stringify(parseDetalles(selectedLog.detalles), null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Firma criptográfica de sesión auditada automáticamente
              </span>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all"
              >
                Cerrar Inspección
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

