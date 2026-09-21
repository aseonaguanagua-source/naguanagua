'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { TrendingUp, FileSpreadsheet, Calendar, RefreshCw, Filter, Building, Home, Briefcase } from 'lucide-react';
import { formatBs } from '@/lib/formatCurrency';
import { exportToExcelWithLogos } from '@/lib/excelExport';
import { useAppContext } from '@/store/AppContext';

type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_pasado' | 'personalizado';
type Sector = 'Todos' | 'Residencial' | 'Comercial' | 'Industrial';

// Parsea montos venezolanos: "1.234,50" -> 1234.50 y tambien "1234.50" -> 1234.50
function parseMonto(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  let s = String(val).trim();
  // Detectar si tiene formato venezolano (punto como separador de miles, coma como decimal)
  // Ej: "1.234,50" -> remover puntos -> "1234,50" -> reemplazar coma -> "1234.50"
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function getRange(periodo: Periodo, desde: string, hasta: string) {
  // Ajustar a hora Venezuela UTC-4
  const now = new Date();
  const vzOffsetMin = -4 * 60;
  const localNow = new Date(now.getTime() + (vzOffsetMin - now.getTimezoneOffset()) * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const toISO = (d: Date) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth()+1) + '-' + pad(d.getUTCDate());
  switch (periodo) {
    case 'hoy': { const t = toISO(localNow); return { desde: t, hasta: t }; }
    case 'semana': {
      const day = localNow.getUTCDay() || 7;
      const lunes = new Date(localNow);
      lunes.setUTCDate(localNow.getUTCDate() - day + 1);
      return { desde: toISO(lunes), hasta: toISO(localNow) };
    }
    case 'mes': return { desde: localNow.getUTCFullYear() + '-' + pad(localNow.getUTCMonth()+1) + '-01', hasta: toISO(localNow) };
    case 'mes_pasado': {
      const first = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth()-1, 1));
      const last = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 0));
      return { desde: toISO(first), hasta: toISO(last) };
    }
    case 'personalizado': return { desde, hasta };
    default: return { desde: toISO(localNow), hasta: toISO(localNow) };
  }
}

export default function RecaudacionWidget() {
  const { inmuebles } = useAppContext();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagos, setPagos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sectorFiltro, setSectorFiltro] = useState<Sector>('Todos');

  // Normaliza actividad_principal a sector real (Residencial/Comercial/Industrial)
  const normSector = (actividad: string, clasificacion: string) => {
    const a = (actividad || '').toLowerCase();
    const c = (clasificacion || '').toLowerCase();
    if (a.includes('fabrica') || a.includes('industrial') || a.includes('embotelladora') ||
        a.includes('concretera') || a.includes('almacen') || a.includes('taller') ||
        c.includes('industrial')) return 'Industrial';
    if (a.includes('residencial') || a.includes('condominio') || a.includes('apartamento') ||
        a.includes('casa') || a.includes('vivienda')) return 'Residencial';
    if (a.length > 3) return 'Comercial';
    return 'Residencial';
  };

  // Mapa identidad -> sector usando actividad_principal
  const sectorMap = useMemo(() => {
    const m = new Map<string, string>();
    inmuebles.forEach((inm: any) => {
      const id = (inm.identidad || '').replace(/-/g, '').toUpperCase();
      if (id && !m.has(id)) m.set(id, normSector(
        inm.actividad_principal || inm.ActividadPrincipal || '',
        inm.clasificacion || inm.Clasificacion || ''
      ));
    });
    return m;
  }, [inmuebles]);

  const fetchPagos = async () => {
    setIsLoading(true);
    const range = getRange(periodo, desde, hasta);
    try {
      const { data } = await supabase
        .from('pagos_reportados')
        .select('*')
        .eq('estado', 'Aprobado')
        .gte('created_at', range.desde + 'T00:00:00')
        .lte('created_at', range.hasta + 'T23:59:59')
        .order('created_at', { ascending: false });
      setPagos(data || []);
    } catch(e) { console.error(e); }
    setIsLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPagos(); }, [periodo, desde, hasta]);

  // Enriquecer con sector
  const pagosConSector = useMemo(() => pagos.map(p => {
    const idNorm = (p.identidad || '').replace(/-/g, '').toUpperCase();
    return { ...p, sector: sectorMap.get(idNorm) || 'Residencial' };
  }), [pagos, sectorMap]);

  // Filtrar por sector
  const pagosFiltrados = useMemo(() =>
    sectorFiltro === 'Todos' ? pagosConSector : pagosConSector.filter(p => p.sector === sectorFiltro),
  [pagosConSector, sectorFiltro]);

  const tot = pagosConSector.reduce((a, p) => a + parseMonto(p.monto), 0);
  const totFilt = pagosFiltrados.reduce((a, p) => a + parseMonto(p.monto), 0);
  const tra = pagosConSector.filter(p => p.tipo === 'Transferencia').reduce((a, p) => a + parseMonto(p.monto), 0);
  const deb = pagosConSector.filter(p => p.tipo === 'Debito' || p.tipo === 'Punto de Venta' || p.tipo === 'REC').reduce((a, p) => a + parseMonto(p.monto), 0);

  const contadores = useMemo(() => ({
    Residencial: pagosConSector.filter(p => p.sector === 'Residencial').reduce((a, p) => a + parseMonto(p.monto), 0),
    Comercial:   pagosConSector.filter(p => p.sector === 'Comercial').reduce((a, p) => a + parseMonto(p.monto), 0),
    Industrial:  pagosConSector.filter(p => p.sector === 'Industrial').reduce((a, p) => a + parseMonto(p.monto), 0),
  }), [pagosConSector]);

  const lbl: Record<Periodo, string> = { hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', mes_pasado: 'Mes pasado', personalizado: 'Periodo' };

  const exportar = () => {
    if (!pagosFiltrados.length) return alert('No hay registros.');
    const d = pagosFiltrados.map(p => ({
      'Fecha': new Date(p.created_at).toLocaleDateString('es-VE'),
      'Identidad': p.identidad,
      'Sector': p.sector,
      'Banco': p.banco || '--',
      'Tipo': p.tipo,
      'Referencia': p.referencia || '--',
      'Monto (Bs)': parseMonto(p.monto).toFixed(2)
    }));
    const fname = 'Recaudacion_' + (sectorFiltro !== 'Todos' ? sectorFiltro + '_' : '') + new Date().toISOString().split('T')[0] + '.xlsx';
    exportToExcelWithLogos(d, fname, 'Recaudacion');
  };

  const btnCls = (active: boolean) =>
    'px-3 py-1.5 rounded text-xs font-semibold transition-colors ' +
    (active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200');

  const sectorColors: Record<Sector, string> = {
    Todos: 'bg-slate-700 text-white',
    Residencial: 'bg-blue-600 text-white',
    Comercial: 'bg-amber-500 text-white',
    Industrial: 'bg-indigo-600 text-white'
  };
  const sectorIcons: Record<Sector, any> = { Todos: Filter, Residencial: Home, Comercial: Building, Industrial: Briefcase };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      {/* Header: periodo */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-slate-700">Recaudación por Periodo</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['hoy', 'semana', 'mes', 'mes_pasado'] as Periodo[]).map(p => (
            <button key={p} onClick={() => setPeriodo(p)} className={btnCls(periodo === p)}>{lbl[p]}</button>
          ))}
          <button onClick={() => setPeriodo('personalizado')} className={btnCls(periodo === 'personalizado') + ' flex items-center gap-1'}>
            <Filter className="w-3 h-3" />Personalizado
          </button>
          <button onClick={fetchPagos} className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">
            <RefreshCw className={'w-3.5 h-3.5 ' + (isLoading ? 'animate-spin' : '')} />
          </button>
          <button onClick={exportar} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700">
            <FileSpreadsheet className="w-3.5 h-3.5" />Excel
          </button>
        </div>
      </div>

      {/* Rango personalizado */}
      {periodo === 'personalizado' && (
        <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap bg-slate-50">
          <Calendar className="w-4 h-4 text-slate-500" />
          <label className="text-xs font-semibold text-slate-600">Desde:</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-xs outline-none" />
          <label className="text-xs font-semibold text-slate-600">Hasta:</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-xs outline-none" />
        </div>
      )}

      {/* Filtro Sector */}
      <div className="px-6 py-2.5 border-b flex items-center gap-2 flex-wrap bg-white">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Filtrar sector:</span>
        {(['Todos', 'Residencial', 'Comercial', 'Industrial'] as Sector[]).map(s => {
          const Icon = sectorIcons[s];
          return (
            <button key={s} onClick={() => setSectorFiltro(s)}
              className={'px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors ' + (sectorFiltro === s ? sectorColors[s] : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              <Icon className="w-3 h-3" />{s}
            </button>
          );
        })}
        {sectorFiltro !== 'Todos' && (
          <span className="ml-auto text-xs text-slate-500 font-medium">{pagosFiltrados.length} pagos · Bs. {formatBs(totFilt)}</span>
        )}
      </div>

      <div className="p-6">
        {/* Tarjetas resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
          <div className="col-span-2 sm:col-span-1 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
            <p className="text-[10px] text-emerald-600 font-semibold uppercase mb-1">Total {lbl[periodo]}</p>
            <p className="text-xl font-black text-emerald-700">Bs. {formatBs(tot)}</p>
            <p className="text-[10px] text-emerald-500 mt-1">{pagosConSector.length} transacciones</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-blue-500 font-semibold uppercase mb-1 flex items-center justify-center gap-1"><Home className="w-3 h-3" /> Residencial</p>
            <p className="text-sm font-bold text-blue-700">Bs. {formatBs(contadores.Residencial)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-amber-500 font-semibold uppercase mb-1 flex items-center justify-center gap-1"><Building className="w-3 h-3" /> Comercial</p>
            <p className="text-sm font-bold text-amber-700">Bs. {formatBs(contadores.Comercial)}</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-indigo-500 font-semibold uppercase mb-1 flex items-center justify-center gap-1"><Briefcase className="w-3 h-3" /> Industrial</p>
            <p className="text-sm font-bold text-indigo-700">Bs. {formatBs(contadores.Industrial)}</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-orange-500 font-semibold uppercase mb-1">Debito / POS</p>
            <p className="text-sm font-bold text-orange-700">Bs. {formatBs(deb)}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
            <p className="text-[10px] text-purple-500 font-semibold uppercase mb-1">Transferencias</p>
            <p className="text-sm font-bold text-purple-700">Bs. {formatBs(tra)}</p>
          </div>
        </div>

        {/* Tabla */}
        {isLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Cargando...</div>
        ) : pagosFiltrados.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No hay pagos aprobados en este periodo{sectorFiltro !== 'Todos' ? ' para el sector ' + sectorFiltro : ''}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b text-slate-600 uppercase">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Identidad</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2 text-right">Monto (Bs)</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltrados.slice(0, 50).map(p => (
                  <tr key={p.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2">{new Date(p.created_at).toLocaleDateString('es-VE')}</td>
                    <td className="px-3 py-2 font-medium">{p.identidad}</td>
                    <td className="px-3 py-2">
                      <span className={'px-1.5 py-0.5 rounded text-[10px] font-bold ' + (p.sector === 'Comercial' ? 'bg-amber-100 text-amber-700' : p.sector === 'Industrial' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700')}>{p.sector}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={'px-2 py-0.5 rounded text-[10px] font-bold ' + (p.tipo === 'Debito' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>{p.tipo}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{p.referencia || '--'}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">Bs. {formatBs(parseMonto(p.monto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagosFiltrados.length > 50 && <p className="text-center text-xs text-slate-400 mt-2">Mostrando 50 de {pagosFiltrados.length}. Exporta Excel para todos.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

