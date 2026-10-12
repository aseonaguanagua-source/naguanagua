'use client';
// Reporte de MULTAS por mes — separado: unidades dentro de condominio / contribuyentes individuales.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, User, RefreshCw, Search, FileSpreadsheet } from 'lucide-react';
import { exportToExcelWithLogos } from '@/lib/excelExport';

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const mesLabel = (p: string) => { const [y, m] = String(p).split('-'); return `${MESES[Number(m) - 1] || m}-${y}`; };
const bs = (n: number) => `Bs. ${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Data = {
  tasa: number; generado: string;
  enCondominio: any[]; contribuyentes: any[];
  resumen: { enCondominio: { registros: number; totalBs: number }; contribuyentes: { registros: number; totalBs: number } };
};

export default function ReporteMultasPage() {
  const [tab, setTab] = useState<'condominio' | 'contribuyente'>('condominio');
  const [data, setData] = useState<Data | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const cargar = async () => {
    setCargando(true); setError('');
    try {
      const r = await fetch('/api/admin/reporte-multas', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setData(j);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const filas = useMemo(() => {
    const arr = tab === 'condominio' ? data?.enCondominio || [] : data?.contribuyentes || [];
    const t = q.trim().toLowerCase();
    if (!t) return arr;
    return arr.filter((x: any) => [x.inmueble, x.identidad, x.propietario, x.contribuyente, x.condominio, x.condominioNombre, x.numero]
      .some(v => String(v || '').toLowerCase().includes(t)));
  }, [data, tab, q]);
  const totalFiltrado = filas.reduce((s: number, x: any) => s + (x.multaTotalBs || 0), 0);

  const exportar = () => {
    if (!filas.length) return alert('No hay registros.');
    const rows = tab === 'condominio'
      ? filas.map((x: any) => ({
          'Condominio': x.condominio, 'Nombre condominio': x.condominioNombre, 'Paga la multa': x.pagaMulta === 'UNIDAD' ? 'La unidad' : 'El condominio',
          'Código': x.inmueble || '', 'Local / N°': x.numero || '', 'Propietario': x.propietario || '', 'Cédula/RIF': x.identidad || '',
          'Meses con multa': x.mesesMulta.map(mesLabel).join(', '), 'Cant. meses': x.mesesMulta.length,
          'Meses de multa anteriores (sin fecha)': x.mesesMultaSinFecha || 0,
          'Multas manuales': x.multasManuales.map((m: any) => `${m.concepto}${m.periodo ? ' ' + m.periodo : ''}`).join('; '),
          'Multa por meses (Bs)': x.multaMesesBs, 'Otras multas (Bs)': Number((x.multaExtraBs + x.multasManualesBs).toFixed(2)), 'Total multa (Bs)': x.multaTotalBs,
        }))
      : filas.map((x: any) => ({
          'Código': x.inmueble, 'Contribuyente': x.contribuyente || '', 'Cédula/RIF': x.identidad || '', 'Actividad': x.actividad || '',
          'Meses de deuda': x.mesesDeuda, 'Meses con multa': x.mesesMulta.map(mesLabel).join(', '), 'Cant. meses': x.mesesMulta.length,
          'Multa por meses (Bs)': x.multaMesesBs, 'Multa fija / congelada (Bs)': x.multaFijaBs, 'Total multa (Bs)': x.multaTotalBs,
        }));
    exportToExcelWithLogos(rows, `Multas_${tab === 'condominio' ? 'Condominios' : 'Contribuyentes'}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      tab === 'condominio' ? 'Multas en condominio' : 'Multas contribuyentes');
  };

  const Chips = ({ meses }: { meses: string[] }) => (
    <div className="flex flex-wrap gap-1 max-w-[420px]">
      {meses.map(p => <span key={p} className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold">{mesLabel(p)}</span>)}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-red-600" /> Multas por Mes</h1>
          <p className="text-sm text-slate-500 mt-1">Meses de multa (mora) que debe cada usuario. Mismas reglas de Caja: el último mes adeudado no lleva multa y los meses exonerados no cuentan.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar} className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded text-sm text-slate-600 hover:bg-slate-50"><RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar</button>
          <button onClick={exportar} className="flex items-center gap-1 px-3 py-2 border border-emerald-300 rounded text-sm text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([['condominio', Building2, 'Dentro de condominio', data.resumen.enCondominio], ['contribuyente', User, 'Contribuyentes', data.resumen.contribuyentes]] as const).map(([k, Icon, t, r]) => (
            <button key={k} onClick={() => setTab(k)} className={`text-left p-4 rounded-xl border-2 transition ${tab === k ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><Icon className="w-4 h-4" /> {t}</div>
              <div className="text-2xl font-black text-red-700 mt-1">{bs(r.totalBs)}</div>
              <div className="text-xs text-slate-500">{r.registros.toLocaleString('es-VE')} {k === 'condominio' ? 'unidades' : 'inmuebles'} con multa · Tasa {data.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-3 flex items-center gap-3 border-b">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tab === 'condominio' ? 'Buscar condominio, código, local, propietario, RIF…' : 'Buscar código, contribuyente, RIF…'}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-red-400" />
          </div>
          <span className="text-sm text-slate-600">{filas.length.toLocaleString('es-VE')} registros · <b className="text-red-700">{bs(totalFiltrado)}</b></span>
        </div>
        {cargando ? <div className="p-10 text-center text-slate-400 text-sm">Calculando multas de todo el sistema… (puede tardar unos segundos)</div>
          : error ? <div className="p-6 text-red-700 text-sm">{error}</div>
          : (
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                  {tab === 'condominio' ? (
                    <tr><th className="px-3 py-2 text-left">Condominio</th><th className="px-3 py-2 text-left">Unidad</th><th className="px-3 py-2 text-left">Meses con multa</th><th className="px-3 py-2 text-left">Otras multas</th><th className="px-3 py-2 text-right">Total multa</th></tr>
                  ) : (
                    <tr><th className="px-3 py-2 text-left">Contribuyente</th><th className="px-3 py-2 text-center">Meses deuda</th><th className="px-3 py-2 text-left">Meses con multa</th><th className="px-3 py-2 text-right">Multa fija</th><th className="px-3 py-2 text-right">Total multa</th></tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.slice(0, 1500).map((x: any, i: number) => tab === 'condominio' ? (
                    <tr key={i} className="hover:bg-slate-50 align-top">
                      <td className="px-3 py-2"><div className="font-semibold text-slate-800">{x.condominioNombre}</div><div className="text-xs text-slate-400">{x.condominio} · {x.modalidad} · paga {x.pagaMulta === 'UNIDAD' ? 'la unidad' : 'el condominio'}</div></td>
                      <td className="px-3 py-2"><div className="font-medium">{x.inmueble || '—'} {x.numero ? <span className="text-slate-400">· {x.numero}</span> : null}</div><div className="text-xs text-slate-500">{x.propietario} {x.identidad ? `· ${x.identidad}` : ''}</div></td>
                      <td className="px-3 py-2"><Chips meses={x.mesesMulta} /><div className="text-[10px] text-slate-400 mt-0.5">{x.mesesMulta.length} mes(es) · {bs(x.multaMesesBs)}</div></td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {x.mesesMultaSinFecha > 0 && <div>{x.mesesMultaSinFecha} mes(es) de multa de pagos anteriores</div>}
                        {x.multasManuales.map((m: any, k: number) => <div key={k}>{m.concepto}{m.periodo ? ` (${m.periodo})` : ''}: {bs(m.montoBs)}</div>)}
                        {!(x.mesesMultaSinFecha > 0) && !x.multasManuales.length && (x.multaExtraBs > 0 ? <div>Multa fija: {bs(x.multaExtraBs)}</div> : '—')}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-red-700 whitespace-nowrap">{bs(x.multaTotalBs)}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="hover:bg-slate-50 align-top">
                      <td className="px-3 py-2"><div className="font-semibold text-slate-800">{x.contribuyente}</div><div className="text-xs text-slate-400">{x.inmueble} · {x.identidad} · {x.actividad}</div></td>
                      <td className="px-3 py-2 text-center">{x.mesesDeuda}</td>
                      <td className="px-3 py-2"><Chips meses={x.mesesMulta} /><div className="text-[10px] text-slate-400 mt-0.5">{x.mesesMulta.length} mes(es) · {bs(x.multaMesesBs)}</div></td>
                      <td className="px-3 py-2 text-right">{x.multaFijaBs > 0 ? bs(x.multaFijaBs) : '—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-red-700 whitespace-nowrap">{bs(x.multaTotalBs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filas.length > 1500 && <p className="p-3 text-xs text-slate-500">Mostrando 1.500 de {filas.length.toLocaleString('es-VE')}. Use el buscador o descargue el Excel para ver todos.</p>}
            </div>
          )}
      </div>
    </div>
  );
}
