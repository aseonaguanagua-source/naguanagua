'use client';
import { useState, useMemo } from 'react';
import { Printer, ArrowLeft, ChevronDown } from 'lucide-react';

interface Props {
  pagos: any[];
  cajeros: string[];
  isAdmin: boolean;
  currentUser: string;
  onBack: () => void;
  onExportPDF?: () => void;
}

const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d: string) => { try { const dt = new Date(d); return dt.toLocaleDateString('es-VE') + ' - ' + dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return d; } };
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString('es-VE'); } catch { return d; } };

function parseDet(p: any): any {
  if (!p.detalles) return {};
  if (typeof p.detalles === 'object') return p.detalles;
  try { return JSON.parse(p.detalles); } catch { return {}; }
}

function isDebito(p: any) {
  return p.tipo === 'Debito' || p.tipo === 'REC' || p.tipo === 'Punto de Venta';
}

export default function CorteCaja({ pagos, cajeros, isAdmin, currentUser, onBack, onExportPDF }: Props) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [selectedCajas, setSelectedCajas] = useState<string[]>(isAdmin ? [] : [currentUser]);
  const [fechaInicio, setFechaInicio] = useState(todayStr + 'T00:00');
  const [fechaFin, setFechaFin] = useState(todayStr + 'T23:59');
  const [showReport, setShowReport] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const toggleCaja = (caja: string) => {
    if (caja === '__todos__') { setSelectedCajas([]); return; }
    setSelectedCajas(prev => prev.includes(caja) ? prev.filter(c => c !== caja) : [...prev, caja]);
  };

  const pagosFiltrados = useMemo(() => {
    if (!showReport) return [];
    const start = new Date(fechaInicio);
    const end = new Date(fechaFin);
    return pagos.filter(p => {
      const d = new Date(p.created_at);
      if (d < start || d > end) return false;
      const det = parseDet(p);
      const cajero = det.cajero || '';
      if (!isAdmin) {
        const myName = currentUser.toLowerCase();
        const pCajLower = cajero.toLowerCase();
        const matches = pCajLower === myName ||
                        pCajLower.endsWith(`-${myName}`) ||
                        (selectedCajas.length > 0 && selectedCajas.some(sc => sc.toLowerCase() === pCajLower));
        if (!matches) return false;
      }
      if (isAdmin && selectedCajas.length > 0 && !selectedCajas.includes(cajero)) return false;
      // Corte de caja: solo pagos conciliados o debito (auto-aprobado)
      if (isDebito(p)) return true;
      return p.estado === 'Aprobado' || p.estado === 'Con Diferencia';
    });
  }, [showReport, pagos, fechaInicio, fechaFin, selectedCajas, isAdmin, currentUser]);

  const debitos = pagosFiltrados.filter(p => isDebito(p));
  const transferencias = pagosFiltrados.filter(p => !isDebito(p));
  const totalDebito = debitos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalTransf = transferencias.reduce((s, p) => {
    const det = parseDet(p);
    return s + (parseFloat(det.monto_conciliado || p.monto) || 0);
  }, 0);
  const totalCaja = totalDebito + totalTransf;
  const cajeroLabel = !isAdmin ? currentUser : selectedCajas.length === 0 ? 'Todos' : selectedCajas.join(', ');

  const thCls = 'px-2 py-2 text-left text-[11px] font-semibold text-slate-600 border border-slate-200 bg-slate-100 whitespace-nowrap';
  const tdCls = 'px-2 py-1.5 text-[11px] border border-slate-100 whitespace-nowrap';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Regresar
        </button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">Corte de Caja</h1>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wide">Corte de Caja</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-1">Recaudacion</label>
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50" disabled>
              <option>Corte de Caja</option>
            </select>
          </div>
          <div className="flex flex-col relative">
            <label className="text-xs text-slate-500 mb-1">Caja</label>
            <button onClick={() => isAdmin && setShowDropdown(!showDropdown)}
              className={`border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white flex items-center gap-2 min-w-[200px] ${isAdmin ? 'cursor-pointer hover:border-blue-400' : 'cursor-default bg-slate-50'}`}>
              <span className="truncate text-slate-700">
                {!isAdmin ? currentUser : selectedCajas.length === 0 ? 'Todos' : `${selectedCajas.length} seleccionada(s)`}
              </span>
              {isAdmin && <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />}
            </button>
            {showDropdown && isAdmin && (
              <div className="absolute top-full left-0 z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[220px] max-h-60 overflow-y-auto">
                <label className="flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-slate-100">
                  <input type="checkbox" checked={selectedCajas.length === 0} onChange={() => toggleCaja('__todos__')} className="accent-blue-600" />
                  <span className="text-sm font-semibold text-blue-600">Todos</span>
                </label>
                {cajeros.map(c => (
                  <label key={c} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedCajas.includes(c)} onChange={() => toggleCaja(c)} className="accent-blue-600" />
                    <span className="text-sm text-slate-700">{c}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-1">Rango de Fechas</label>
            <div className="flex items-center gap-2">
              <input type="datetime-local" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <span className="text-slate-400 text-xs">-</span>
              <input type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <button onClick={() => { setShowReport(true); setShowDropdown(false); }}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm">
            Generar Reporte
          </button>
        </div>
      </div>

      {showReport && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 text-sm">
                <div><span className="text-slate-500">Debito Bs.:</span> <span className="font-bold">{fmtBs(totalDebito)}</span></div>
                <div><span className="text-slate-500">Transferencia Bs.:</span> <span className="font-bold">{fmtBs(totalTransf)}</span></div>
              </div>
              <div className="flex-1 text-center px-4">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Total Caja:</div>
                <div className="text-3xl font-black text-slate-800">Bs. {fmtBs(totalCaja)}</div>
              </div>
              <div className="text-right space-y-1 text-xs text-slate-500">
                <div>Desde {new Date(fechaInicio).toLocaleString('es-VE')} hasta {new Date(fechaFin).toLocaleString('es-VE')}</div>
                <div>Cajero: <span className="font-semibold text-slate-700">{cajeroLabel}</span></div>
                <div>Total Registros: <span className="font-bold text-slate-800">{pagosFiltrados.length}</span></div>
                <div className="flex gap-2 justify-end mt-1">
                  {onExportPDF && <button onClick={onExportPDF} className="p-1.5 hover:bg-slate-200 rounded" title="PDF"><Printer className="w-4 h-4 text-slate-600" /></button>}
                </div>
              </div>
            </div>
          </div>

          {transferencias.length > 0 && (
            <div className="p-4">
              <h3 className="font-bold text-sm text-slate-700 mb-3 uppercase tracking-wide border-b pb-1">Transferencia</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead><tr>{['#','Fecha/Hora','Fecha Bco','Tipo','Fecha Libro','Cajero','Contribuyente','Recibo','Banco','Referencia','Banco Destino','Referencia','Monto'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                  <tbody>
                    {transferencias.map((p, i) => {
                      const det = parseDet(p);
                      const recibos: string[] = det.recibos || [];
                      const monto = parseFloat(det.monto_conciliado || p.monto) || 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className={tdCls}>{i+1}</td>
                          <td className={tdCls}>{fmtDateTime(p.created_at)}</td>
                          <td className={tdCls}>{det.fecha_banco || '-'}</td>
                          <td className={`${tdCls} font-semibold`}>{p.tipo}</td>
                          <td className={tdCls}>{det.fecha_banco ? fmtDate(det.fecha_banco) : 'NO FACTURADO'}</td>
                          <td className={tdCls}>{det.cajero || '-'}</td>
                          <td className={tdCls}>{p.identidad} - {p.contribuyente}</td>
                          <td className={tdCls}>{recibos[0] || '-'}</td>
                          <td className={tdCls}>{p.banco || '-'}</td>
                          <td className={tdCls}>{p.referencia || '-'}</td>
                          <td className={tdCls}>{det.banco_destino || det.banco_receptor || '-'}</td>
                          <td className={tdCls}>{p.referencia || '-'}</td>
                          <td className={`${tdCls} text-right font-semibold`}>Bs. {fmtBs(monto)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="bg-slate-100 font-bold"><td colSpan={12} className={`${tdCls} text-right`}>Total Transferencia: {transferencias.length} items</td><td className={`${tdCls} text-right`}>Bs. {fmtBs(totalTransf)}</td></tr></tfoot>
                </table>
              </div>
            </div>
          )}

          {debitos.length > 0 && (
            <div className="p-4 border-t border-slate-100">
              <h3 className="font-bold text-sm text-slate-700 mb-3 uppercase tracking-wide border-b pb-1">Debito</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead><tr>{['#','Fecha/Hora','Tipo','Cajero','Contribuyente','Recibo','Banco','Aprobacion','Lote','Monto'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                  <tbody>
                    {debitos.map((p, i) => {
                      const det = parseDet(p);
                      const recibos: string[] = det.recibos || [];
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className={tdCls}>{i+1}</td>
                          <td className={tdCls}>{fmtDateTime(p.created_at)}</td>
                          <td className={`${tdCls} font-semibold`}>{p.tipo}</td>
                          <td className={tdCls}>{det.cajero || '-'}</td>
                          <td className={tdCls}>{p.identidad} - {p.contribuyente}</td>
                          <td className={tdCls}>{recibos[0] || p.referencia || '-'}</td>
                          <td className={tdCls}>{p.banco || '-'}</td>
                          <td className={tdCls}>{det.aprobacion || '-'}</td>
                          <td className={tdCls}>{det.lote || '-'}</td>
                          <td className={`${tdCls} text-right font-semibold`}>Bs. {fmtBs(parseFloat(p.monto)||0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="bg-slate-100 font-bold"><td colSpan={9} className={`${tdCls} text-right`}>Total Debito: {debitos.length} items</td><td className={`${tdCls} text-right`}>Bs. {fmtBs(totalDebito)}</td></tr></tfoot>
                </table>
              </div>
            </div>
          )}

          {pagosFiltrados.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm">No se encontraron pagos conciliados para el periodo seleccionado.</div>
          )}
        </div>
      )}
    </div>
  );
}
