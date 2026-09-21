'use client';
import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { generarCorteCajaPDF } from '../generators/PdfReports';

interface Props {
  pagos: any[];
  cajeros: string[];
  isAdmin: boolean;
  currentUser: string;
  onBack: () => void;
}

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
const FORMAS = ['Todas', 'Debito', 'Transferencia', 'Deposito', 'Cheque', 'Efectivo'];

export default function CuadreCaja({ pagos, cajeros, isAdmin, currentUser, onBack }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [cajero, setCajero] = useState(isAdmin ? '' : currentUser);
  const [forma, setForma] = useState('Todas');
  const [fecha, setFecha] = useState(today);
  const [showReport, setShowReport] = useState(false);

  const pagosFiltrados = useMemo(() => {
    if (!showReport) return [];
    const s = new Date(fecha + 'T00:00:00');
    const e = new Date(fecha + 'T23:59:59');
    return pagos.filter(p => {
      const d = new Date(p.created_at);
      if (d < s || d > e) return false;
      const det = parseDet(p);
      const pCajero = det.cajero || '';
      if (!isAdmin && pCajero !== currentUser) return false;
      if (cajero && pCajero !== cajero) return false;
      if (forma !== 'Todas') {
        if (forma === 'Debito' && !isDebito(p)) return false;
        if (forma === 'Transferencia' && isDebito(p)) return false;
      }
      // Solo conciliados
      if (!isDebito(p) && p.estado !== 'Aprobado' && p.estado !== 'Con Diferencia') return false;
      return true;
    });
  }, [showReport, pagos, fecha, cajero, forma, isAdmin, currentUser]);

  const debitos = pagosFiltrados.filter(p => isDebito(p));
  const transferencias = pagosFiltrados.filter(p => !isDebito(p));
  const totalDebito = debitos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalTransf = transferencias.reduce((s, p) => { const d = parseDet(p); return s + (parseFloat(d.monto_conciliado || p.monto) || 0); }, 0);
  const totalCuadre = totalDebito + totalTransf;
  const cajeroLabel = cajero ? cajero : 'Todos';

  const S: Record<string, React.CSSProperties> = {
    hdr: { background: '#eeeef6', borderBottom: '1px solid #d5d5e5', padding: '10px 16px' },
    hdrTitle: { fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    hdrRow: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', width: '100%' },
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

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🗂 Cuadre de Caja</div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2a5298', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12 }}>
        ← Regresar
      </button>

      <div style={S.hdr}>
        <div style={S.hdrTitle}>Cuadre Caja</div>
        <div style={S.hdrRow}>
          <div style={S.fw}>
            <span style={S.fl}>Recaudacion - Cuadre Caja</span>
            <select value="Cuadre Caja" disabled style={S.fi}><option>Cuadre Caja</option></select>
          </div>

          <div style={S.fw}>
            <span style={S.fl}>Cajero</span>
            <select value={cajero} onChange={e => setCajero(e.target.value)} style={{ ...S.fi, minWidth: 220 }}>
              {isAdmin && <option value="">Todos</option>}
              {cajeros.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={S.fw}>
            <span style={S.fl}>Forma de pago</span>
            <select value={forma} onChange={e => setForma(e.target.value)} style={S.fi}>
              {FORMAS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>

          <div style={S.fw}>
            <span style={S.fl}>Rango de Fechas</span>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={S.fi} />
          </div>

          <button onClick={() => setShowReport(true)} style={S.btnGen}>Generar Reporte</button>
        </div>
      </div>

      {showReport && (
        <div style={S.rptBox}>
          <div style={{ ...S.secHdr, fontSize: 15, padding: '10px 0' }}>
            RESUMEN CUADRE DE CAJA
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
              <button onClick={() => generarCorteCajaPDF(pagosFiltrados, [], fecha, fecha)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="PDF">🖨</button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>≡</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 200px', borderBottom: '1px solid #ccc' }}>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #ccc', fontSize: 13 }}>
              <div><b>Debito Bs.:</b><span style={{ float: 'right' }}>{fmtBs(totalDebito)}</span></div>
              <div style={{ marginTop: 4 }}><b>Transferencia Bs.:</b><span style={{ float: 'right' }}>{fmtBs(totalTransf)}</span></div>
            </div>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #ccc', fontSize: 12 }}>
              <div><b>Fecha:</b> Desde {fecha} hasta {fecha}</div>
              <div style={{ marginTop: 4 }}><b>Cajero:</b> {cajeroLabel}</div>
              <div style={{ textAlign: 'right', marginTop: 4 }}>Total Registros: <b>{pagosFiltrados.length}</b></div>
            </div>
            <div style={{ padding: '10px 14px', background: '#edfaed', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: '#2a5298', marginBottom: 4 }}>Total Cuadre:</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>Bs. {fmtBs(totalCuadre)}</div>
            </div>
          </div>

          {/* Transferencias */}
          {transferencias.length > 0 && <>
            <div style={S.secHdr}>TRANSFERENCIA</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['#', 'Fecha/Hora', 'Fecha Bco', 'Tipo', 'Fecha Libro', 'Cajero', 'Contribuyente', 'Recibo', 'Banco', 'Referencia', 'Banco Destino', 'Referencia', 'Monto']
                    .map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {transferencias.map((p, i) => {
                    const det = parseDet(p); const recs: string[] = det.recibos || [];
                    const mC = parseFloat(det.monto_conciliado || p.monto) || 0;
                    return (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={S.td}>{fmtDT(p.created_at)}</td>
                        <td style={S.td}>{det.fecha_banco || '-'}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{p.tipo}</td>
                        <td style={S.td}>{det.fecha_banco ? fmtDate(det.fecha_banco) : 'NO FACTURADO'}</td>
                        <td style={S.td}>{det.cajero || '-'}</td>
                        <td style={{ ...S.td, color: '#2a5298' }}>{p.identidad}-{p.contribuyente}</td>
                        <td style={S.td}>{recs[0] || '-'}</td>
                        <td style={S.td}>{p.banco || '-'}</td>
                        <td style={S.td}>{p.referencia || '-'}</td>
                        <td style={S.td}>{det.banco_destino || det.banco_receptor || '-'}</td>
                        <td style={S.td}>{p.referencia || '-'}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmtBs(mC)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={12} style={S.tf}>Total Items: {transferencias.length}</td>
                    <td style={{ ...S.tf, textAlign: 'right' }}>Total Transferencia: {fmtBs(totalTransf)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>}

          {/* Debitos */}
          {debitos.length > 0 && <>
            <div style={S.secHdr}>DEBITO</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['#', 'Fecha/Hora', 'Tipo', 'Cajero', 'Contribuyente', 'Recibo', 'Banco', 'Aprobacion', 'Lote', 'Monto']
                    .map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {debitos.map((p, i) => {
                    const det = parseDet(p); const recs: string[] = det.recibos || [];
                    return (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={S.td}>{fmtDT(p.created_at)}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{p.tipo}</td>
                        <td style={S.td}>{det.cajero || '-'}</td>
                        <td style={{ ...S.td, color: '#2a5298' }}>{p.identidad}-{p.contribuyente}</td>
                        <td style={S.td}>{recs[0] || p.referencia || '-'}</td>
                        <td style={S.td}>{p.banco || '-'}</td>
                        <td style={S.td}>{det.aprobacion || '-'}</td>
                        <td style={S.td}>{det.lote || '-'}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmtBs(parseFloat(p.monto) || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={9} style={S.tf}>Total Items: {debitos.length}</td>
                    <td style={{ ...S.tf, textAlign: 'right' }}>Total Debito: {fmtBs(totalDebito)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>}
          {pagosFiltrados.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>No se encontraron registros.</div>
          )}
        </div>
      )}
    </div>
  );
}
