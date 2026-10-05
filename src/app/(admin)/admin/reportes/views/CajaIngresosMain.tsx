'use client';
import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, Lock, CheckCircle, Loader2, Printer, ArrowLeft, FileSpreadsheet, FileText } from 'lucide-react';
import { generarCorteCajaPDF } from '../generators/PdfReports';
import { generarLibroVentas } from '../generators/LibroVentas';

interface Props {
  pagos: any[];
  cajeros: string[];
  isAdmin: boolean;
  currentUser: string;
  tcmmv: number;
  contribuyentes: any[];
  onBack: () => void;
}

type SubTipo = 'General de Ingresos' | 'Corte de Caja' | 'Ingresos por Banco' | 'Libro de Ventas' | 'Resumen Libro de Ventas';

const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString('es-VE'); } catch { return d; } };
const fmtDT = (d: string) => {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('es-VE') + ' - ' + dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return d; }
};
function parseDet(p: any): any {
  if (!p.detalles) return {};
  if (typeof p.detalles === 'object') return p.detalles;
  try { return JSON.parse(p.detalles); } catch { return {}; }
}
function isDebito(p: any) { return p.tipo === 'Debito' || p.tipo === 'REC' || p.tipo === 'Punto de Venta'; }
function getEstadoStyle(estado: string): React.CSSProperties {
  if (estado === 'Aprobado') return { color: '#1a7a1a', fontWeight: 700 };
  if (estado === 'Por Verificar') return { color: '#b45309', fontWeight: 700 };
  if (estado === 'Con Diferencia') return { color: '#6d28d9', fontWeight: 700 };
  if (estado === 'Pendiente') return { color: '#c0392b', fontWeight: 700 };
  return { color: '#555' };
}
function getNombre(p: any, contribuyentes: any[]): string {
  if (!p.identidad) return p.contribuyente || '';
  const clean = (s: string) => (s || '').replace(/[-.\s]/g, '').toUpperCase();
  const idClean = clean(p.identidad);
  const found = contribuyentes.find((c: any) => clean(c.identidad || '') === idClean || clean(c.Identidad || '') === idClean);
  const nombre = found?.contribuyente || found?.Contribuyente || p.contribuyente || '';
  return nombre;
}

import { LISTA_BANCOS } from '@/lib/bancos';

const SUB_TIPOS: SubTipo[] = ['General de Ingresos', 'Corte de Caja', 'Ingresos por Banco', 'Libro de Ventas', 'Resumen Libro de Ventas'];
const BANCOS = LISTA_BANCOS;

export default function CajaIngresosMain({ pagos, cajeros, isAdmin, currentUser, tcmmv, contribuyentes, onBack }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [subTipo, setSubTipo] = useState<SubTipo>('General de Ingresos');
  const [selectedCajas, setSelectedCajas] = useState<string[]>(isAdmin ? [] : [currentUser]);
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [bancFilter, setBancFilter] = useState('');
  const [fechaInicio, setFechaInicio] = useState(today + 'T00:00');
  const [fechaFin, setFechaFin] = useState(today + 'T23:59');
  const [showReport, setShowReport] = useState(false);
  const [showCajaDD, setShowCajaDD] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [cajaCerrada, setCajaCerrada] = useState(false);
  const [showConfirmCierre, setShowConfirmCierre] = useState(false);
  const [tasaEuro, setTasaEuro] = useState(0);

  // Cargar tasa Euro del BCV
  useEffect(() => {
    fetch('https://ve.dolarapi.com/v1/euros/oficial')
      .then(r => r.json())
      .then(d => { if (d?.promedio > 0) setTasaEuro(d.promedio); })
      .catch(() => {});
  }, []);

  const toggleCaja = (c: string) => {
    if (c === '__todos__') { setSelectedCajas([]); return; }
    setSelectedCajas(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  const getFilteredPagos = () => {
    const s = new Date(fechaInicio), e = new Date(fechaFin);
    return pagos.filter(p => {
      // Excluir pagos anulados, reversados o condonados de todos los reportes
      if (p.estado === 'Anulado' || p.estado === 'Reversado' || p.estado === 'Condonado' || p.estado === 'Rechazado') return false;
      const d = new Date(p.created_at);
      if (d < s || d > e) return false;
      const det = parseDet(p);
      // Para debitos: det.cajero. Para transferencias conciliadas: det.analista o det.cajero
      const cajero = det.cajero || det.analista || '';
      if (!isAdmin) {
        const myName = currentUser.toLowerCase();
        const pCajLower = cajero.toLowerCase();
        const matches = pCajLower === myName ||
                        pCajLower.endsWith(`-${myName}`) ||
                        (selectedCajas.length > 0 && selectedCajas.some(sc => sc.toLowerCase() === pCajLower));
        if (!matches) return false;
      }
      if (isAdmin && selectedCajas.length > 0 && !selectedCajas.includes(cajero)) return false;
      if (subTipo === 'Ingresos por Banco' && bancFilter) {
        const bd = det.banco_destino || det.banco_receptor || '';
        if (bd !== bancFilter) return false;
      }
      if (tipoFilter !== 'Todos') {
        if (tipoFilter === 'REC' && !isDebito(p)) return false;
        if (tipoFilter !== 'REC' && isDebito(p)) return false;
        if (tipoFilter !== 'REC' && p.tipo !== tipoFilter) return false;
      }
      return true;
    });
  };

  const pagosFiltrados = useMemo(() => {
    if (!showReport) return [];
    return getFilteredPagos();
  }, [showReport, pagos, fechaInicio, fechaFin, selectedCajas, tipoFilter, bancFilter, subTipo, isAdmin, currentUser]);

  const handleDescargarPDF = () => {
    const items = getFilteredPagos();
    if (!items || items.length === 0) {
      alert('No hay pagos registrados para descargar en el rango y filtros seleccionados.');
      return;
    }
    generarCorteCajaPDF(items, contribuyentes, fechaInicio, fechaFin, tasaEuro);
  };
  const debitos = pagosFiltrados.filter(p => isDebito(p));
  const transferencias = pagosFiltrados.filter(p => !isDebito(p));
  const totalDebito = debitos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalTransf = transferencias.reduce((s, p) => { const d = parseDet(p); return s + (parseFloat(d.monto_conciliado || p.monto) || 0); }, 0);
  const totalIngresos = totalDebito + totalTransf;
  const totalUSD = tcmmv > 0 ? totalIngresos / tcmmv : 0;
  const cajeroLabel = !isAdmin ? currentUser : selectedCajas.length === 0 ? 'Todos' : selectedCajas.join(', ');
  const totalPagos = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const nowStr = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const libroRows = pagosFiltrados.map(p => {
    const det = parseDet(p); const recs: string[] = det.recibos || [];
    return { fecha: p.created_at, rif: p.identidad, nombre: p.contribuyente, tipoDoc: isDebito(p) ? 'REC' : (p.tipo || 'AOC'), recibo: recs[0] || p.referencia || '-', total: parseFloat(p.monto) || 0 };
  });
  const totalLibro = libroRows.reduce((s, r) => s + r.total, 0);

  const S: Record<string, React.CSSProperties> = {
    hdr: { background: '#eeeef6', borderBottom: '1px solid #d5d5e5', padding: '10px 16px' },
    hdrRow: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', width: '100%', marginTop: 8 },
    btnGen: { background: '#26b5b5', color: '#fff', border: 'none', padding: '8px 22px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', alignSelf: 'flex-end' },
    fw: { display: 'flex', flexDirection: 'column' },
    fl: { fontSize: 11, fontWeight: 700, color: '#2a5298', marginBottom: 2 },
    fi: { border: '1px solid #bbb', borderRadius: 4, padding: '6px 10px', fontSize: 12, background: '#fff' },
    rptBox: { border: '1px solid #ccc', borderRadius: 4, marginTop: 12, overflow: 'hidden', fontFamily: 'Arial,sans-serif', fontSize: 13 },
    secHdr: { background: '#e8ecf2', textAlign: 'center', fontWeight: 700, fontSize: 13, padding: '7px 0', borderTop: '1px solid #ccc', borderBottom: '1px solid #ccc', letterSpacing: 1, position: 'relative' },
    th: { background: '#4a6fa5', color: '#fff', padding: '6px 8px', fontSize: 11, fontWeight: 700, textAlign: 'left', borderRight: '1px solid #3a5a90', whiteSpace: 'nowrap' },
    td: { padding: '5px 8px', fontSize: 11, borderRight: '1px solid #ebebeb', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
    tf: { background: '#f0f4f8', fontWeight: 700, padding: '5px 8px', fontSize: 11, borderTop: '1px solid #ccc' },
  };

  const SummaryBox = ({ title, isUSD }: { title: string; isUSD?: boolean }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 240px', borderBottom: '1px solid #ccc' }}>
      <div style={{ padding: '10px 14px', borderRight: '1px solid #ccc', fontSize: 13 }}>
        <div><b>Debito Bs.:</b><span style={{ float: 'right' }}>{fmtBs(totalDebito)}</span></div>
        <div style={{ marginTop: 4 }}><b>Transferencia Bs.:</b><span style={{ float: 'right' }}>{fmtBs(totalTransf)}</span></div>
      </div>
      <div style={{ padding: '10px 14px', borderRight: '1px solid #ccc', fontSize: 12 }}>
        <div><b>Fecha:</b> Desde {new Date(fechaInicio).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit' })} hasta {new Date(fechaFin).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit' })}</div>
        <div style={{ marginTop: 4 }}><b>Cajero:</b> {cajeroLabel}</div>
        <div style={{ textAlign: 'right', marginTop: 4 }}>Total Registros: <b>{pagosFiltrados.length}</b></div>
      </div>
      <div style={{ padding: '10px 14px', background: '#edfaed', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color: '#2a5298', marginBottom: 4 }}>{title}:</div>
        <div style={{ fontSize: isUSD ? 16 : 22, fontWeight: 900 }}>
          Bs. {fmtBs(totalIngresos)}{isUSD && <span style={{ fontSize: 13, marginLeft: 8 }}>USD {fmtBs(totalUSD)}</span>}
        </div>
        {isUSD && <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Tasa: {fmtBs(tcmmv)} Bs x USD al {nowStr}</div>}
      </div>
    </div>
  );

  const IconsTop = ({ showExcel }: { showExcel?: boolean }) => (
    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        onClick={handleDescargarPDF}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#dc2626', color: '#fff', border: 'none',
          padding: '4px 10px', borderRadius: 4, fontWeight: 600,
          cursor: 'pointer', fontSize: 12
        }}
        title="Descargar PDF"
      >
        <Printer size={13}/> PDF
      </button>
      {showExcel && (
        <button
          onClick={() => generarLibroVentas(getFilteredPagos(), contribuyentes, 'Diario', fechaInicio, fechaFin)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#166534', color: '#fff', border: 'none',
            padding: '4px 10px', borderRadius: 4, fontWeight: 600,
            cursor: 'pointer', fontSize: 12
          }}
          title="Descargar Excel"
        >
          <FileSpreadsheet size={13}/> Excel
        </button>
      )}
    </div>
  );

  const DebitoTable = ({ showDT }: { showDT?: boolean }) => (<>
    {debitos.length > 0 && <>
      <div style={S.secHdr}>DEBITO</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{(showDT ? ['#','Fecha/Hora','Tipo','Operador','Contribuyente','Recibo','Banco','Aprobacion','Lote','Estado','Monto'] : ['#','Fecha','Tipo','Operador','Contribuyente','Recibo','Banco','Aprobacion','Lote','Estado','Monto']).map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{debitos.map((p, i) => { const det = parseDet(p); const recs: string[] = det.recibos || []; return (<tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
            <td style={S.td}>{i + 1}</td><td style={S.td}>{showDT ? fmtDT(p.created_at) : fmtDate(p.created_at)}</td>
            <td style={{ ...S.td, fontWeight: 700 }}>{p.tipo}</td><td style={S.td}>{det.cajero || '-'}</td>
            <td style={{ ...S.td, color: '#2a5298' }}>
              <div style={{ fontWeight: 600 }}>{p.identidad}</div>
              <div style={{ fontSize: '0.78em', color: '#555' }}>{getNombre(p, contribuyentes)}</div>
            </td>
            <td style={S.td}>{recs[0] || p.referencia || '-'}</td><td style={S.td}>{p.banco || '-'}</td>
            <td style={S.td}>{det.aprobacion || '-'}</td><td style={S.td}>{det.lote || '-'}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmtBs(parseFloat(p.monto) || 0)}</td>
          </tr>); })}</tbody>
          <tfoot><tr><td colSpan={9} style={S.tf}>Total Items: {debitos.length}</td><td style={{ ...S.tf, textAlign: 'right' }}>Total Debito: {fmtBs(totalDebito)}</td></tr></tfoot>
        </table>
      </div>
    </>}
  </>);

  const TransfTable = ({ showDT }: { showDT?: boolean }) => (<>
    {transferencias.length > 0 && <>
      <div style={S.secHdr}>TRANSFERENCIA</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{(showDT ? ['#','Fecha/Hora','Fecha Bco','Tipo','Fecha Libro','Operador','Contribuyente','Recibo','Banco','Referencia','Banco Destino','Referencia','Estado','Monto'] : ['#','Conciliado','Registro','Tipo','Operador','Contribuyente','Recibo','Banco','Referencia','Banco Empresa','Referencia','Estado','Monto Reportado','Monto Conciliado']).map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{transferencias.map((p, i) => {
            const det = parseDet(p); const recs: string[] = det.recibos || [];
            const mC = parseFloat(det.monto_conciliado || p.monto) || 0;
            const conc = p.estado === 'Aprobado' || p.estado === 'Con Diferencia';
            return (<tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
              <td style={S.td}>{i + 1}</td>
              {showDT ? <><td style={S.td}>{fmtDT(p.created_at)}</td><td style={S.td}>{det.fecha_banco || '-'}</td><td style={{ ...S.td, fontWeight: 700 }}>{p.tipo}</td><td style={S.td}>{det.fecha_banco ? fmtDate(det.fecha_banco) : ((p.identidad?.startsWith('V-') || p.identidad?.startsWith('V') || p.identidad?.startsWith('E-') || p.tipoContribuyente?.toLowerCase().includes('residencial')) ? 'RECIBO' : 'NO FACTURADO')}</td></>
                : <><td style={S.td}>{conc ? <b style={{ color: '#1a7a1a' }}>{det.fecha_banco || fmtDate(p.created_at)}</b> : <span style={{ color: '#aaa' }}>-</span>}</td><td style={S.td}>{fmtDate(p.created_at)}</td><td style={{ ...S.td, fontWeight: 700 }}>{p.tipo}</td></>}
              <td style={S.td}>{det.cajero || '-'}</td><td style={{ ...S.td, color: '#2a5298' }}>
                <div style={{ fontWeight: 600 }}>{p.identidad}</div>
                <div style={{ fontSize: '0.78em', color: '#555' }}>{getNombre(p, contribuyentes)}</div>
              </td>
              <td style={S.td}>{recs[0] || '-'}</td><td style={S.td}>{p.banco || '-'}</td><td style={S.td}>{p.referencia || '-'}</td>
              <td style={S.td}>{det.banco_destino || det.banco_receptor || '-'}</td><td style={S.td}>{p.referencia || '-'}</td>
              {!showDT && <td style={S.td}>{p.estado || '-'}</td>}
              {showDT ? <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmtBs(mC)}</td>
                : <><td style={{ ...S.td, textAlign: 'right' }}>{fmtBs(parseFloat(p.monto) || 0)}</td><td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmtBs(mC)}</td></>}
            </tr>);
          })}</tbody>
          <tfoot><tr><td colSpan={12} style={S.tf}>Total Items: {transferencias.length}</td><td style={{ ...S.tf, textAlign: 'right' }}>Total Transferencia: {fmtBs(totalTransf)}</td></tr></tfoot>
        </table>
      </div>
    </>}
  </>);

  const EmptyMsg = () => <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>No se encontraron registros.</div>;

  const handleCerrarCaja = async () => {
    setCerrando(true);
    setShowConfirmCierre(false);
    try {
      setShowReport(true);
      const items = getFilteredPagos();
      generarCorteCajaPDF(items, contribuyentes, fechaInicio, fechaFin, tasaEuro);
      setCajaCerrada(true);
    } catch (e) {
      alert('Error al cerrar caja: ' + (e as Error).message);
    } finally {
      setCerrando(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Printer size={16}/>Caja - Ingresos</div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2a5298', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12 }}><ArrowLeft size={13}/> Regresar</button>

      <div style={S.hdr}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>{subTipo}</div>
        <div style={S.hdrRow}>
          <div style={S.fw}>
            <span style={S.fl}>Recaudacion - {subTipo}</span>
            <select value={subTipo} onChange={e => { setSubTipo(e.target.value as SubTipo); setShowReport(false); }} style={S.fi}>
              {SUB_TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {subTipo !== 'Ingresos por Banco' && subTipo !== 'Resumen Libro de Ventas' && (
            <div style={{ ...S.fw, position: 'relative' }}>
              <span style={S.fl}>Caja</span>
              <div onClick={() => isAdmin && setShowCajaDD(!showCajaDD)}
                style={{ ...S.fi, cursor: isAdmin ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 4, minWidth: 200, flexWrap: 'wrap', background: isAdmin ? '#fff' : '#f8fafc' }}>
                {!isAdmin
                  ? <span style={{ background: '#e3eaff', border: '1px solid #aac', borderRadius: 3, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#1e3a8a' }}>{currentUser}</span>
                  : selectedCajas.length === 0 ? <span style={{ color: '#888', fontSize: 12 }}>Todos</span>
                  : selectedCajas.map(c => <span key={c} style={{ background: '#e3eaff', border: '1px solid #aac', borderRadius: 3, padding: '1px 7px', fontSize: 11, marginRight: 2 }}>x {c}</span>)}
                {isAdmin && <ChevronDown size={12} style={{ marginLeft: 'auto', color: '#666' }} />}
              </div>
              {showCajaDD && isAdmin && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,.15)', minWidth: 220, maxHeight: 240, overflowY: 'auto' }}>
                  <label style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedCajas.length === 0} onChange={() => toggleCaja('__todos__')} />
                    <span style={{ fontWeight: 700, color: '#2a5298', fontSize: 13 }}>Todos</span>
                  </label>
                  {cajeros.map(c => <label key={c} style={{ display: 'flex', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={selectedCajas.includes(c)} onChange={() => toggleCaja(c)} />{c}
                  </label>)}
                </div>
              )}
            </div>
          )}

          {subTipo === 'Ingresos por Banco' && (
            <div style={S.fw}>
              <span style={S.fl}>Banco</span>
              <select value={bancFilter} onChange={e => setBancFilter(e.target.value)} style={S.fi}>
                <option value="">Todos los bancos</option>
                {BANCOS.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
          )}

          {subTipo !== 'Corte de Caja' && subTipo !== 'Resumen Libro de Ventas' && (
            <div style={S.fw}>
              <span style={S.fl}>Tipo</span>
              <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)} style={S.fi}>
                <option value="Todos">Todos</option><option value="REC">REC</option><option value="AOC">AOC</option><option value="WEB">WEB</option><option value="PEN">PEN</option>
              </select>
            </div>
          )}

          {subTipo !== 'Resumen Libro de Ventas' && (
            <div style={S.fw}>
              <span style={S.fl}>Rango de Fechas</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="datetime-local" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={{ ...S.fi, fontSize: 11 }} />
                <span style={{ color: '#999' }}>-</span>
                <input type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={{ ...S.fi, fontSize: 11 }} />
              </div>
            </div>
          )}
          <button onClick={() => { setShowReport(true); setShowCajaDD(false); }} style={S.btnGen}>Generar Reporte</button>

          <button
            onClick={handleDescargarPDF}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#dc2626', color: '#fff', border: 'none',
              padding: '8px 18px', borderRadius: 6, fontWeight: 700,
              cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
            }}
          >
            <Printer size={15} /> Descargar PDF
          </button>

          <button
            onClick={() => setShowConfirmCierre(true)}
            disabled={cerrando}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: cajaCerrada ? '#166534' : '#dc2626',
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 18px', fontWeight: 700, fontSize: 13,
              cursor: cerrando ? 'not-allowed' : 'pointer',
              opacity: cerrando ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(220,38,38,0.35)',
              transition: 'all 0.2s',
            }}
          >
            {cajaCerrada
              ? <><CheckCircle size={15} style={{ marginRight: 4 }} /> Caja Cerrada</>
              : cerrando
              ? <><Loader2 size={15} style={{ marginRight: 4 }} /> Cerrando...</>
              : <><Lock size={15} style={{ marginRight: 4 }} /> Cerrar Caja</>
            }
          </button>
        </div>
      </div>

      {showConfirmCierre && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 32, maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)', textAlign: 'center',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Lock size={48} color="#dc2626" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
              Cerrar Caja
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              Se generara y descargara el <b>Reporte de Corte de Caja</b> en PDF
              para el periodo seleccionado.<br />
              <span style={{ color: '#dc2626', fontWeight: 600 }}>Cajero: {cajeroLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setShowConfirmCierre(false)}
                style={{
                  padding: '10px 24px', borderRadius: 6, border: '1px solid #cbd5e1',
                  background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarCaja}
                style={{
                  padding: '10px 28px', borderRadius: 6, border: 'none',
                  background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Lock size={14} /> Confirmar Cierre
              </button>
            </div>
          </div>
        </div>
      )}

      {showReport && subTipo === 'General de Ingresos' && (
        <div style={S.rptBox}>
          <div style={{ ...S.secHdr, fontSize: 15, padding: '10px 0' }}>REPORTE GENERAL DE INGRESOS<IconsTop showExcel /></div>
          <SummaryBox title="Total Ingresos" isUSD />
          <DebitoTable /><TransfTable />
          <div style={S.secHdr}>RESUMEN FISCAL POR PERIODOS</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><th style={{ ...S.th, width: '80%' }}>Concepto / Agrupacion por Anos</th><th style={{ ...S.th, textAlign: 'right' }}>Monto Distribuido Bs.</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>TOTAL PERIODOS ANOS 01-2024/01-2026</td><td style={{ ...S.td, textAlign: 'right' }}>0,00</td></tr>
              <tr style={{ background: '#f9fafe' }}><td style={S.td}>TOTAL PERIODOS ANOS 02-2026 EN ADELANTE</td><td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmtBs(totalIngresos)}</td></tr>
              <tr><td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>TOTAL GENERAL RECAUDADO:</td><td style={{ ...S.td, textAlign: 'right', fontWeight: 900, color: '#1a7a1a' }}>{fmtBs(totalIngresos)}</td></tr>
            </tbody>
          </table>
          <div style={{ textAlign: 'right', padding: '8px 12px' }}>
            <button style={{ background: '#f5e6c8', border: '1px solid #e0c080', color: '#7a5500', padding: '6px 16px', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Ver Desglose Detallado por Documento</button>
          </div>
          {pagosFiltrados.length === 0 && <EmptyMsg />}
        </div>
      )}

      {showReport && subTipo === 'Corte de Caja' && (
        <div style={S.rptBox}>
          <div style={{ ...S.secHdr, fontSize: 15, padding: '10px 0' }}>RESUMEN DE CAJA<IconsTop /></div>
          <SummaryBox title="Total Caja" />
          <TransfTable showDT /><DebitoTable showDT />
          {pagosFiltrados.length === 0 && <EmptyMsg />}
        </div>
      )}

      {showReport && subTipo === 'Ingresos por Banco' && (
        <div style={S.rptBox}>
          <div style={{ ...S.secHdr, fontSize: 15, padding: '10px 0' }}>REPORTE GENERAL DE INGRESOS<IconsTop /></div>
          <SummaryBox title="Total Ingresos" isUSD />
          <DebitoTable /><TransfTable />
          {pagosFiltrados.length === 0 && <EmptyMsg />}
        </div>
      )}

      {showReport && subTipo === 'Libro de Ventas' && (
        <div style={S.rptBox}>
          <div style={{ ...S.secHdr, fontSize: 15, padding: '10px 0' }}>
            LIBRO DE VENTAS
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
              <button onClick={handleDescargarPDF} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: '2px 6px' }} title="PDF"><FileText size={15}/></button>
              <button onClick={() => generarLibroVentas(getFilteredPagos(), contribuyentes, 'Diario', fechaInicio, fechaFin)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', padding: '2px 6px' }} title="Excel"><FileSpreadsheet size={15}/></button>
            </div>
          </div>
          <div style={{ padding: '8px 14px', fontSize: 12, borderBottom: '1px solid #eee' }}>
            Fecha desde <b>{fechaInicio.replace('T',' ')}</b> hasta <b>{fechaFin.replace('T',' ')}</b> Caja: <b>{cajeroLabel}</b>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['#','Fecha','CI/RIF','Nombre','Tipo y Documento','Control','tipo','Total','Base','IVA','Exento','IVA Ret.'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{libroRows.map((r, i) => (<tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
                <td style={S.td}>{i + 1}</td><td style={S.td}>{fmtDate(r.fecha)}</td><td style={S.td}>{r.rif}</td>
                <td style={{ ...S.td, color: '#2a5298' }}>{r.nombre}</td><td style={S.td}>{r.tipoDoc}-{r.recibo}</td>
                <td style={S.td}>0</td><td style={S.td}>01-Reg</td>
                <td style={{ ...S.td, textAlign: 'right' }}>{fmtBs(r.total)}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>0,00</td><td style={{ ...S.td, textAlign: 'right' }}>0,00</td>
                <td style={{ ...S.td, textAlign: 'right' }}>{fmtBs(r.total)}</td><td style={{ ...S.td, textAlign: 'right' }}>0,00</td>
              </tr>))}</tbody>
              <tfoot><tr>
                <td colSpan={7} style={S.tf}>{libroRows.length}</td>
                <td style={{ ...S.tf, textAlign: 'right' }}>{fmtBs(totalLibro)}</td>
                <td style={S.tf}>0,00</td><td style={S.tf}>0,00</td>
                <td style={{ ...S.tf, textAlign: 'right' }}>{fmtBs(totalLibro)}</td><td style={S.tf}>0,00</td>
              </tr></tfoot>
            </table>
          </div>
          <div style={S.secHdr}>RESUMEN LIBRO DE VENTAS</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><th style={{ ...S.th, width: '60%' }}>Concepto</th><th style={S.th}>Base Imponible</th><th style={S.th}>Debito Fiscal</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>Sigma Ventas Internas No Gravadas:</td><td style={{ ...S.td, textAlign: 'right' }}>{fmtBs(totalLibro)}</td><td style={{ ...S.td, textAlign: 'right' }}>0,00</td></tr>
              <tr style={{ background: '#f9fafe' }}><td style={S.td}>Sigma de las: Ventas Internas Afectas solo Alicuota General:</td><td style={{ ...S.td, textAlign: 'right' }}>0,00</td><td style={{ ...S.td, textAlign: 'right' }}>0,00</td></tr>
              <tr><td style={{ ...S.td, fontWeight: 700 }}>Totales....:</td><td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmtBs(totalLibro)}</td><td style={{ ...S.td, textAlign: 'right' }}>0,00</td></tr>
            </tbody>
          </table>
          {pagosFiltrados.length === 0 && <EmptyMsg />}
        </div>
      )}

      {showReport && subTipo === 'Resumen Libro de Ventas' && (
        <div style={S.rptBox}>
          <div style={{ ...S.secHdr, fontSize: 15, padding: '10px 0' }}>
            RESUMEN LIBRO DE VENTAS
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <button onClick={() => generarLibroVentas(pagos, contribuyentes, 'Mensual', fechaInicio, fechaFin)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', padding: '2px 6px' }} title="Excel"><FileSpreadsheet size={15}/></button>
            </div>
          </div>
          <div style={{ padding: '6px 14px', fontSize: 12, borderBottom: '1px solid #eee' }}>
            Caja: <b>{cajeroLabel}</b> Tipo: <b>Todos</b>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ background: '#f0f4f8', padding: '8px 14px', fontWeight: 600, fontSize: 13 }}>
                {new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}
              </div>
              <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 20px', fontSize: 13 }}>
                <span>Ventas Internas No Gravadas (Exento):</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{fmtBs(totalPagos)}</span>
                <span>Ventas Internas Afectas (Base Imponible):</span><span style={{ textAlign: 'right' }}>0,00</span>
                <span>IVA Generado:</span><span style={{ textAlign: 'right' }}>0,00</span>
                <span style={{ fontWeight: 700 }}>Total Ventas del Mes:</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{fmtBs(totalPagos)}</span>
              </div>
              <div style={{ padding: '0 20px 10px', fontSize: 11, color: '#999' }}>Documentos procesados: {pagos.length}</div>
            </div>
            <div style={{ background: '#f0f4f8', border: '1px solid #ddd', borderRadius: 4, padding: '14px 20px', fontSize: 13 }}>
              <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 8 }}>TOTAL GENERAL: <span style={{ float: 'right' }}>{fmtBs(totalPagos)}</span></div>
              <div>Base Imponible Total: 0,00 &nbsp;&nbsp; IVA Total: 0,00</div>
              <div>Exentos Total: {fmtBs(totalPagos)} &nbsp;&nbsp; IVA Retenido Total: 0,00</div>
              <div style={{ marginTop: 8, color: '#555' }}>Total Documentos Procesados: {pagos.length}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






