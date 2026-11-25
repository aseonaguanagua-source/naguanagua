'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { TrendingUp, FileSpreadsheet, Calendar, RefreshCw, Filter, Building, Home, Briefcase } from 'lucide-react';
import { formatBs } from '@/lib/formatCurrency';
import { exportToExcelWithLogos } from '@/lib/excelExport';
import { useAppContext } from '@/store/AppContext';
import { aplicarMontoReporte } from '@/app/(admin)/admin/reportes/montoReporte';

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
  const initialRange = useMemo(() => getRange('mes', '', ''), []);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desde, setDesde] = useState(initialRange.desde);
  const [hasta, setHasta] = useState(initialRange.hasta);
  const [pagos, setPagos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sectorFiltro, setSectorFiltro] = useState<Sector>('Todos');

  const handleSelectPeriodo = (nuevo: Periodo) => {
    setPeriodo(nuevo);
    if (nuevo !== 'personalizado') {
      const r = getRange(nuevo, desde, hasta);
      setDesde(r.desde);
      setHasta(r.hasta);
    } else if (!desde || !hasta) {
      const r = getRange('mes', '', '');
      if (!desde) setDesde(r.desde);
      if (!hasta) setHasta(r.hasta);
    }
  };

  // Normaliza actividad_principal a sector real (Residencial/Comercial/Industrial)
  const normSector = (actividad: string, clasificacion: string) => {
    const a = (actividad || '').toLowerCase();
    const c = (clasificacion || '').toLowerCase();
    if (a.includes('fabrica') || a.includes('industrial') || a.includes('embotelladora') ||
        a.includes('concretera') || a.includes('manufactura') || a.includes('almacen') || a.includes('taller') ||
        c.includes('industrial')) return 'Industrial';
    if (a.includes('residencial') || (a.includes('condominio') && !a.includes('oficina')) || a.includes('apartamento') ||
        a.includes('casa') || a.includes('vivienda')) return 'Residencial';
    if (a.length > 3) return 'Comercial';
    return 'Residencial';
  };

  // Mapa identidad -> sector usando actividad_principal
  const sectorMap = useMemo(() => {
    const m = new Map<string, string>();
    inmuebles.forEach((inm: any) => {
      if (inm.estado === 'Eliminado' || inm.estado === 'Inactivo') return;
      const id = String(inm.identidad || '').replace(/[-.\s]/g, '').toUpperCase();
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
      const all: any[] = [];
      const seenIds = new Set<string>();
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('pagos_reportados')
          .select('id, identidad, monto, tipo, estado, referencia, banco, created_at, detalles')
          .eq('estado', 'Aprobado')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        for (const row of data as any[]) {
          const k = String(row?.id || '');
          if (k && seenIds.has(k)) continue;
          if (k) seenIds.add(k);
          all.push(row);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const pagoPorId = new Map<string, any>();
      all.forEach(p => { if (p?.id) pagoPorId.set(String(p.id), p); });

      const parseDet = (p: any): any => {
        if (!p?.detalles) return {};
        if (typeof p.detalles === 'object') return p.detalles;
        try { return JSON.parse(p.detalles); } catch { return {}; }
      };

      const isSaldoPago = (p: any, det: any) => {
        const t = String(p.tipo || '').toUpperCase().trim();
        if (t && !t.includes('SALDO') && !t.includes('NOTA DE CREDITO') && !t.includes('NOTA DE CRÉDITO')) return false;
        const paList = Array.isArray(det.pagos_agregados) ? det.pagos_agregados : [];
        if (paList.some((x: any) => x?.metodo && !String(x.metodo).toUpperCase().includes('SALDO'))) return false;
        const detTipo = String(det.tipo || '').toUpperCase();
        return t.includes('SALDO') || t.includes('NOTA DE CREDITO') || t.includes('NOTA DE CRÉDITO') ||
               detTipo.includes('SALDO') || detTipo.includes('NOTA DE CREDITO') || detTipo.includes('NOTA DE CRÉDITO') ||
               Boolean(det.es_saldo_a_favor || det.es_nota_credito);
      };

      const esDeb = (p: any, det: any) =>
        !isSaldoPago(p, det) && /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta|^rec$/i.test(String(p.tipo || '').trim());

      const parseFechaCaracas = (raw: any): Date | null => {
        if (!raw) return null;
        const str = String(raw).trim();
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dmyMatch) {
          const ymd = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
          const d = new Date(`${ymd}T12:00:00-04:00`);
          return isNaN(d.getTime()) ? null : d;
        }
        if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?(Z|\+00:00)?)?$/i.test(str)) {
          const d = new Date(`${str.slice(0, 10)}T12:00:00-04:00`);
          return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
      };

      const obtenerFechaEfectivaCuadre = (p: any, det: any): string => {
        const corrList = Array.isArray(det.correcciones_reporte) ? det.correcciones_reporte : [];
        const lastCorr = corrList.length > 0 ? corrList[corrList.length - 1] : null;
        const corrTieneFecha = Boolean(
          lastCorr?.fecha_nueva &&
          String(lastCorr.fecha_anterior || '').slice(0, 10) !== String(lastCorr.fecha_nueva).slice(0, 10)
        );
        if (corrTieneFecha && lastCorr?.fecha_nueva) {
          const dCorr = parseFechaCaracas(lastCorr.fecha_nueva);
          if (dCorr) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(dCorr);
        }
        if (!esDeb(p, det)) {
          const fd = det.factura_digital || {};
          const pagoPadre = det.pago_principal_id ? pagoPorId.get(String(det.pago_principal_id)) : null;
          const detPadre = pagoPadre ? parseDet(pagoPadre) : null;
          const fdPadre = detPadre?.factura_digital || {};
          const rc0 = Array.isArray(det.recibo_caja) ? det.recibo_caja[0] : det.recibo_caja;
          const rcPadre0 = Array.isArray(detPadre?.recibo_caja) ? detPadre.recibo_caja[0] : detPadre?.recibo_caja;

          const candidatos = [
            det.fecha_emision_override,
            (fd.emitida || fd.numero_documento || fd.numero_control) ? fd.fecha_emision : '',
            detPadre?.fecha_emision_override,
            (fdPadre?.emitida || fdPadre?.numero_documento || fdPadre?.numero_control) ? fdPadre.fecha_emision : '',
            rc0?.fechaEmision,
            rcPadre0?.fechaEmision,
            det.fecha_transaccion,
            rc0?.fechaIngresoCaja,
            rcPadre0?.fechaIngresoCaja,
            det.fecha_ingreso_caja,
          ];
          for (const c of candidatos) {
            const dCand = parseFechaCaracas(c);
            if (dCand) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(dCand);
          }
          const createdStr = String(p.created_at || '');
          if (createdStr.includes('T16:00:00') && det.recibo_caja_at) {
            const dReal = new Date(det.recibo_caja_at);
            if (!isNaN(dReal.getTime())) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(dReal);
          }
        }
        try {
          return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date(p.created_at));
        } catch {
          return String(p.created_at || '').slice(0, 10);
        }
      };

      const obtenerMontoEfectivoCuadre = (p: any, det: any): number => {
        if (det?.monto_reporte != null) return parseMonto(det.monto_reporte);
        const mBase = parseMonto(p?.monto);
        if (esDeb(p, det)) return mBase;
        const tUpper = String(p.tipo || '').toUpperCase().trim();
        if (tUpper.includes('DEPOSITO') || tUpper.includes('DEPÓSITO')) return mBase;
        const mConc = parseMonto(det?.monto_conciliado);
        const esMultiple = Boolean(
          det?.es_pago_adicional ||
          det?.abono_completado ||
          (Array.isArray(det?.pagos_agregados) && det.pagos_agregados.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1) ||
          (Array.isArray(det?.formasPago) && det.formasPago.filter((x: any) => !/saldo\s*a\s*favor|nota\s*de\s*cr[eé]dito/i.test(String(x?.metodo || x?.tipo || x?.referencia || ''))).length > 1)
        );
        if (esMultiple && mBase > 0 && mConc > mBase + 1) return mBase;
        if (mConc > 0 && (!Array.isArray(det?.pagos_agregados) || !det.pagos_agregados.some((x: any) => /saldo\s*a\s*favor/i.test(String(x?.referencia || x?.metodo || ''))))) {
          return mConc;
        }
        return mBase || mConc;
      };

      const valid = all
        .map(p => aplicarMontoReporte(p))
        .map(p => {
          const det = parseDet(p);
          const fEf = obtenerFechaEfectivaCuadre(p, det);
          const mEf = obtenerMontoEfectivoCuadre(p, det);
          return {
            ...p,
            monto: mEf,
            fechaEfectiva: fEf,
            created_at: fEf ? `${fEf}T12:00:00-04:00` : p.created_at,
            detalles: det,
          };
        })
        .filter(p => {
          const fEf = p.fechaEfectiva || '';
          if (fEf < range.desde || fEf > range.hasta) return false;
          const t = String(p.tipo || '').trim();
          const det: any = p.detalles || {};
          if (/retenci|saldo a favor|nota de cr[eé]dito/i.test(t) || isSaldoPago(p, det)) return false;
          const caj = String(det?.cajero || det?.analista || '').trim();
          if (/^(dz-)?dzara$|^c-dzara$/i.test(caj)) return false;
          return (parseMonto(p.monto) || 0) > 0;
        });
      setPagos(valid);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPagos(); }, [periodo, desde, hasta]);

  // Enriquecer con sector
  const pagosConSector = useMemo(() => pagos.map(p => {
    const idNorm = String(p.identidad || '').replace(/[-.\s]/g, '').toUpperCase();
    return { ...p, sector: sectorMap.get(idNorm) || 'Residencial' };
  }), [pagos, sectorMap]);

  // Filtrar por sector
  const pagosFiltrados = useMemo(() =>
    sectorFiltro === 'Todos' ? pagosConSector : pagosConSector.filter(p => p.sector === sectorFiltro),
  [pagosConSector, sectorFiltro]);

  const tot = pagosConSector.reduce((a, p) => a + parseMonto(p.monto), 0);
  const totFilt = pagosFiltrados.reduce((a, p) => a + parseMonto(p.monto), 0);
  const deb = pagosConSector
    .filter(p => /^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta|^rec$/i.test(String(p.tipo || '').trim()))
    .reduce((a, p) => a + parseMonto(p.monto), 0);
  const tra = pagosConSector
    .filter(p => !/^(d[eé]bito|cr[eé]dito|tmd|tvd)\b|punto|tarjeta|^rec$/i.test(String(p.tipo || '').trim()))
    .reduce((a, p) => a + parseMonto(p.monto), 0);

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
            <button key={p} onClick={() => handleSelectPeriodo(p)} className={btnCls(periodo === p)}>{lbl[p]}</button>
          ))}
          <button onClick={() => handleSelectPeriodo('personalizado')} className={btnCls(periodo === 'personalizado') + ' flex items-center gap-1'}>
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
            <p className="text-[10px] text-emerald-500 mt-1">{pagosConSector.length.toLocaleString('es-VE')} transacciones</p>
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

