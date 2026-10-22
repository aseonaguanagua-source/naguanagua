'use client';
import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, Printer, ArrowLeft, Pencil, Search, X } from 'lucide-react';
import { generarCuadreCajaPDF } from '../generators/CuadreCaja';
import { clasificarBancoDestino } from '@/lib/cuentasBancarias';

interface Props {
  pagos: any[];
  cajeros: string[];
  isAdmin: boolean;
  currentUser: string;
  contribuyentes?: any[];
  onBack: () => void;
  /** Se llama con la fila actualizada tras corregir el monto de reporte */
  onPagoActualizado?: (row: any) => void;
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
function isSaldoPago(p: any) {
  const t = String(p.tipo || '').toUpperCase().trim();
  const det = parseDet(p);
  const detTipo = String(det.tipo || '').toUpperCase();
  return t.includes('SALDO') || t.includes('NOTA DE CREDITO') || t.includes('NOTA DE CRÉDITO') ||
         detTipo.includes('SALDO') || detTipo.includes('NOTA DE CREDITO') || detTipo.includes('NOTA DE CRÉDITO') ||
         Boolean(det.es_saldo_a_favor || det.es_nota_credito);
}
function isDebitoPago(p: any) {
  if (isSaldoPago(p)) return false;
  const t = String(p.tipo || '').toUpperCase().trim();
  return (t.includes('DEBITO') || t.includes('DÉBITO') || t === 'REC' || t === 'PUNTO DE VENTA') && !t.includes('CREDITO') && !t.includes('CRÉDITO') && !t.includes('TMD') && !t.includes('TVD');
}
function isCreditoPago(p: any) {
  if (isSaldoPago(p)) return false;
  const t = String(p.tipo || '').toUpperCase().trim();
  return (t.includes('CREDITO') || t.includes('CRÉDITO') || t.includes('TMD') || t.includes('TVD')) && !t.includes('NOTA');
}
function isDepositoPago(p: any) {
  const t = String(p.tipo || '').toUpperCase().trim();
  return !isCreditoPago(p) && !isDebitoPago(p) && (t.includes('DEPOSITO') || t.includes('DEPÓSITO'));
}
function isRetencionPago(p: any) {
  const t = String(p.tipo || '').toUpperCase().trim();
  return t.includes('RETENCION') || t.includes('RETENCIÓN');
}
function isTransfPago(p: any) {
  return !isDebitoPago(p) && !isCreditoPago(p) && !isDepositoPago(p) && !isSaldoPago(p) && !isRetencionPago(p);
}

function getNombre(p: any, contribMap?: Map<string, string>): string {
  if (!p.identidad) return p.contribuyente || '';
  const clean = (s: string) => (s || '').replace(/[-.\s]/g, '').toUpperCase();
  const idClean = clean(p.identidad);
  return contribMap?.get(idClean) || p.contribuyente || '';
}

function coincideBusqueda(p: any, term: string, contribMap?: Map<string, string>): boolean {
  if (!term || !term.trim()) return true;
  const q = term.trim().toLowerCase();
  const qClean = q.replace(/[^a-z0-9]/gi, '');
  const det = parseDet(p);

  // 1. Identidad / RIF / Cédula
  const idRaw = String(p.identidad || '').toLowerCase();
  const idClean = idRaw.replace(/[^a-z0-9]/gi, '');
  if (idRaw.includes(q)) return true;
  if (qClean && idClean.includes(qClean)) return true;

  // 2. Nombre / Contribuyente
  const nombre = String(getNombre(p, contribMap) || p.contribuyente || det.contribuyente || '').toLowerCase();
  if (nombre.includes(q)) return true;

  // 3. Referencia bancaria
  const refRaw = String(p.referencia || det.referencia || '').toLowerCase();
  const refClean = refRaw.replace(/[^a-z0-9]/gi, '');
  if (refRaw.includes(q)) return true;
  if (qClean && refClean.includes(qClean)) return true;
  const refSinCeros = refClean.replace(/^0+/, '');
  const qSinCeros = qClean.replace(/^0+/, '');
  if (qSinCeros && refSinCeros && (refSinCeros.includes(qSinCeros) || qSinCeros.includes(refSinCeros))) return true;

  // 4. Monto
  const montoNum = parseFloat(p.monto) || 0;
  const montoConcNum = parseFloat(det.monto_conciliado) || 0;
  const montoStr = String(p.monto || '');
  const montoConcStr = String(det.monto_conciliado || '');
  const montoBsStr = fmtBs(montoNum).toLowerCase();
  const montoConcBsStr = fmtBs(montoConcNum).toLowerCase();
  if (montoStr.includes(q) || montoConcStr.includes(q)) return true;
  if (montoBsStr.includes(q) || montoConcBsStr.includes(q)) return true;
  const qNumClean = q.replace(/[^0-9]/g, '');
  if (qNumClean.length >= 2) {
    const m1Clean = montoNum.toFixed(2).replace(/[^0-9]/g, '');
    const m2Clean = montoConcNum.toFixed(2).replace(/[^0-9]/g, '');
    if (m1Clean.includes(qNumClean) || m2Clean.includes(qNumClean)) return true;
  }

  // 5. Recibos / Facturas
  const recs = (Array.isArray(det.recibos) ? det.recibos.join(' ') : String(det.recibos || '')).toLowerCase();
  if (recs.includes(q)) return true;
  if (qClean && recs.replace(/[^a-z0-9]/gi, '').includes(qClean)) return true;

  // 6. Bancos
  const banco = String(p.banco || '').toLowerCase();
  const bDest = String(det.banco_destino || det.banco_receptor || det.banco_emisor || '').toLowerCase();
  if (banco.includes(q) || bDest.includes(q)) return true;

  // 7. Aprobación y Lote
  const aprob = String(det.aprobacion || '').toLowerCase();
  const lote = String(det.lote || '').toLowerCase();
  if (aprob.includes(q) || lote.includes(q)) return true;

  // 8. Cajero / Analista
  const cajero = String(det.cajero || det.analista || '').toLowerCase();
  if (cajero.includes(q)) return true;

  // 9. Tipo y Estado
  const tipo = String(p.tipo || '').toLowerCase();
  const estado = String(p.estado || '').toLowerCase();
  if (tipo.includes(q) || estado.includes(q)) return true;

  // 10. Código de Inmueble
  const codInm = String(det.cod_inmueble || '').toLowerCase();
  if (codInm && (codInm.includes(q) || (qClean && codInm.replace(/[^a-z0-9]/gi, '').includes(qClean)))) return true;

  return false;
}

const FORMAS = ['Todas', 'Tarjetas (Débito y Crédito)', 'Debito', 'Credito (TMD / TVD)', 'Transferencia', 'Transferencia - Banesco', 'Transferencia - Bancamiga', 'Deposito', 'Saldo a Favor', 'Retenciones IVA'];

export default function CuadreCaja({ pagos, cajeros, isAdmin, currentUser, contribuyentes = [], onBack, onPagoActualizado }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const contribMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contribuyentes) {
      const raw = c.identidad || c.Identidad;
      if (raw) {
        const id = String(raw).replace(/[-.\s]/g, '').toUpperCase();
        const nom = c.contribuyente || c.Contribuyente || c.razon_social || '';
        if (id && nom) m.set(id, nom);
      }
    }
    return m;
  }, [contribuyentes]);

  const effectiveIsAdmin = useMemo(() => {
    if (isAdmin) return true;
    if (typeof window === 'undefined') return false;
    try {
      const u = JSON.parse(localStorage.getItem('admin_user_data') || '{}');
      const uLower = (u.usuario || currentUser || '').toLowerCase();
      if (uLower === 'patricia' || uLower === 'n-patricia' || (u.letra && u.letra.toUpperCase() === 'N' && uLower.includes('patricia')) || uLower === 'administrador' || uLower === 'dzara') return true;
      if (u.rol === 'Administrador' || u.rol === 'SuperAdmin') return true;
      if (u.permisos?.ver_todos_reportes_caja || (Array.isArray(u.permisos) && u.permisos.includes('ver_todos_reportes_caja'))) return true;
    } catch {}
    return false;
  }, [isAdmin, currentUser]);

  const [cajero, setCajero] = useState(effectiveIsAdmin ? '' : currentUser);
  const [forma, setForma] = useState('Todas');
  const [fecha, setFecha] = useState(today);
  const [showReport, setShowReport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [buscarEnTodoHistorial, setBuscarEnTodoHistorial] = useState(false);

  useEffect(() => {
    if (effectiveIsAdmin && cajero === currentUser) {
      setCajero('');
    }
  }, [effectiveIsAdmin, currentUser]);

  // ── Corrección de monto y fecha (cuadre de caja y reportes) ──
  const [editar, setEditar] = useState<null | { p: any; monto: string; fecha: string; motivo: string; guardando: boolean; error?: string }>(null);
  const guardarMonto = async (quitar = false) => {
    if (!editar) return;
    setEditar({ ...editar, guardando: true, error: undefined });
    try {
      let usuario = '';
      try { usuario = JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || ''; } catch {}
      const r = await fetch('/api/admin/pagos/corregir-monto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId: editar.p.id, montoNuevo: quitar ? null : editar.monto, fechaNueva: editar.fecha, motivo: editar.motivo, usuario }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      onPagoActualizado?.(d.pago);
      if (d.nuevaFecha) {
        setFecha(d.nuevaFecha);
        setShowReport(true);
      }
      setEditar(null);
    } catch (e: any) {
      setEditar(prev => prev && { ...prev, guardando: false, error: e.message });
    }
  };
  /** Celda de monto: muestra el monto (marcado si fue corregido) y el lápiz para el administrador */
  const CeldaMonto = ({ p, valor }: { p: any; valor: number }) => (
    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: p.monto_corregido ? '#b45309' : undefined }}
      title={p.monto_corregido ? `Monto corregido en reportes. Registrado por el cajero: Bs ${fmtBs(parseFloat(p.monto_real) || 0)}` : undefined}>
      {p.monto_corregido && <span style={{ fontSize: 9, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 3, padding: '0 4px', marginRight: 6 }}>CORREGIDO</span>}
      {fmtBs(valor)}
      {effectiveIsAdmin && (
        <button onClick={() => {
          const det = parseDet(p);
          const pFecha = det.fecha_transaccion || (p.created_at ? p.created_at.slice(0, 10) : today);
          setEditar({ p, monto: String(valor.toFixed(2)), fecha: pFecha, motivo: '', guardando: false });
        }}
          title="Editar monto o fecha de pago en el cuadre" style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', verticalAlign: 'middle' }}>
          <Pencil size={12} />
        </button>
      )}
    </td>
  );

  const getFilteredPagos = () => {
    const s = new Date(fecha + 'T00:00:00');
    const e = new Date(fecha + 'T23:59:59');
    const hasSearch = !!searchTerm.trim();
    return pagos.filter(p => {
      // Excluir pagos anulados o rechazados
      if (p.estado === 'Anulado' || p.estado === 'Reversado' || p.estado === 'Condonado' || p.estado === 'Rechazado') return false;
      const det = parseDet(p);
      const d = new Date(p.created_at);
      const fTx = det.fecha_transaccion || det.fecha_banco || '';
      const fechaCoincide = (d >= s && d <= e) || (fTx && fTx === fecha);
      if (!fechaCoincide && !(buscarEnTodoHistorial && hasSearch)) return false;

      const pCajero = det.cajero || det.analista || '';
      if (!effectiveIsAdmin) {
        const myName = currentUser.toLowerCase();
        const pCajLower = pCajero.toLowerCase();
        const matches = pCajLower === myName ||
                        pCajLower.endsWith(`-${myName}`) ||
                        pCajLower.includes(myName) ||
                        myName.includes(pCajLower) ||
                        (cajero && pCajLower === cajero.toLowerCase());
        if (!matches) return false;
      } else if (cajero && pCajero !== cajero) {
        return false;
      }
      if (forma !== 'Todas') {
        if (forma === 'Tarjetas (Débito y Crédito)' && !isDebitoPago(p) && !isCreditoPago(p)) return false;
        if (forma === 'Debito' && !isDebitoPago(p)) return false;
        if (forma === 'Credito (TMD / TVD)' && !isCreditoPago(p)) return false;
        if (forma === 'Transferencia' && !isTransfPago(p)) return false;
        if (forma === 'Transferencia - Banesco' && (!isTransfPago(p) || clasificarBancoDestino(p) !== 'Banesco')) return false;
        if (forma === 'Transferencia - Bancamiga' && (!isTransfPago(p) || clasificarBancoDestino(p) !== 'Bancamiga')) return false;
        if (forma === 'Deposito' && !isDepositoPago(p)) return false;
        if (forma === 'Saldo a Favor' && !isSaldoPago(p)) return false;
        if (forma === 'Retenciones IVA' && !isRetencionPago(p)) return false;
      }
      // Las transferencias registradas por cajero deben salir en su cuadre
      // Solo transferencias del portal web sin cajero requieren estar previamente conciliadas
      if (isTransfPago(p) && !det.cajero && p.estado !== 'Aprobado' && p.estado !== 'Con Diferencia') return false;

      if (hasSearch && !coincideBusqueda(p, searchTerm, contribMap)) return false;

      return true;
    });
  };

  const pagosFiltrados = useMemo(() => {
    if (!showReport && !searchTerm.trim()) return [];
    return getFilteredPagos();
  }, [showReport, pagos, fecha, cajero, forma, effectiveIsAdmin, currentUser, searchTerm, buscarEnTodoHistorial, contribMap]);

  const debitos = pagosFiltrados.filter(p => isDebitoPago(p));
  const creditos = pagosFiltrados.filter(p => isCreditoPago(p));
  const transferencias = pagosFiltrados.filter(p => isTransfPago(p));
  const depositos = pagosFiltrados.filter(p => isDepositoPago(p));
  const saldosAFavor = pagosFiltrados.filter(p => isSaldoPago(p));
  const retenciones = pagosFiltrados.filter(p => isRetencionPago(p));

  const transfBanesco = transferencias.filter(p => clasificarBancoDestino(p) === 'Banesco');
  const transfBancamiga = transferencias.filter(p => clasificarBancoDestino(p) === 'Bancamiga');
  const transfOtros = transferencias.filter(p => {
    const b = clasificarBancoDestino(p);
    return b !== 'Banesco' && b !== 'Bancamiga';
  });

  const totalDebito = debitos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalCredito = creditos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalTransf = transferencias.reduce((s, p) => { const d = parseDet(p); return s + (parseFloat(d.monto_conciliado || p.monto) || 0); }, 0);
  const totalTransfBanesco = transfBanesco.reduce((s, p) => { const d = parseDet(p); return s + (parseFloat(d.monto_conciliado || p.monto) || 0); }, 0);
  const totalTransfBancamiga = transfBancamiga.reduce((s, p) => { const d = parseDet(p); return s + (parseFloat(d.monto_conciliado || p.monto) || 0); }, 0);
  const totalTransfOtros = transfOtros.reduce((s, p) => { const d = parseDet(p); return s + (parseFloat(d.monto_conciliado || p.monto) || 0); }, 0);
  const totalDeposito = depositos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalSaldo = saldosAFavor.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalRetenciones = retenciones.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const totalCuadre = totalDebito + totalCredito + totalTransf + totalDeposito + totalSaldo;
  const cajeroLabel = cajero ? cajero : (!effectiveIsAdmin ? currentUser : 'Todos');

  const renderTablaTransf = (titulo: string, items: any[], subtotalMonto: number, themeColor: string, bgTheme: string, borderTheme: string) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ ...S.secHdr, background: bgTheme, color: themeColor, border: `1px solid ${borderTheme}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px' }}>
          <span style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            🏦 {titulo}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: themeColor }}>
            {items.length} registro(s) · Subtotal: Bs {fmtBs(subtotalMonto)}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['#', 'Fecha/Hora', 'Fecha Bco', 'Tipo', 'Fecha Libro', 'Cajero', 'Contribuyente', 'Recibo', 'Banco Emisor', 'Referencia', 'Banco Destino', 'Monto']
                .map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((p, i) => {
                const det = parseDet(p); const recs: string[] = det.recibos || [];
                const mC = parseFloat(det.monto_conciliado || p.monto) || 0;
                const bancoDestClass = clasificarBancoDestino(p);
                const bDestTexto = det.banco_destino || det.banco_receptor || p.banco || '-';
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
                    <td style={S.td}>{i + 1}</td>
                    <td style={S.td}>{fmtDT(p.created_at)}</td>
                    <td style={S.td}>{det.fecha_banco || '-'}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{p.tipo}</td>
                    <td style={S.td}>{det.fecha_banco ? fmtDate(det.fecha_banco) : ((p.identidad?.startsWith('V-') || p.identidad?.startsWith('V') || p.identidad?.startsWith('E-') || p.tipoContribuyente?.toLowerCase().includes('residencial')) ? 'RECIBO' : 'NO FACTURADO')}</td>
                    <td style={S.td}>{det.cajero || '-'}</td>
                    <td style={{ ...S.td, color: '#2a5298' }}>{p.identidad} - {getNombre(p, contribMap) || p.contribuyente}</td>
                    <td style={S.td}>{recs[0] || '-'}</td>
                    <td style={S.td}>{p.banco || '-'}</td>
                    <td style={S.td}>{p.referencia || '-'}</td>
                    <td style={S.td}>
                      {bancoDestClass === 'Banesco' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                          BANESCO
                        </span>
                      ) : bancoDestClass === 'Bancamiga' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                          BANCAMIGA
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#475569' }}>{bDestTexto}</span>
                      )}
                    </td>
                    <CeldaMonto p={p} valor={mC} />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={11} style={{ ...S.tf, color: themeColor }}>Subtotal {titulo}: {items.length} item(s)</td>
                <td style={{ ...S.tf, textAlign: 'right', color: themeColor, fontWeight: 900 }}>Bs {fmtBs(subtotalMonto)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const handleDescargarPDF = () => {
    const items = getFilteredPagos();
    if (!items || items.length === 0) {
      alert('No hay transacciones registradas para la fecha seleccionada.');
      return;
    }
    generarCuadreCajaPDF(items, fecha, fecha, cajeroLabel, contribuyentes);
  };

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
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Printer size={16} /> Cuadre de Caja
      </div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2a5298', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12 }}>
        <ArrowLeft size={13} /> Regresar
      </button>

      <div style={S.hdr}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={S.hdrTitle}>Cuadre Caja</div>
          {searchTerm.trim() && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: 999, fontWeight: 700, border: '1px solid #bfdbfe' }}>
                {pagosFiltrados.length} resultado(s)
              </span>
            </div>
          )}
        </div>

        {/* BUSCADOR GENERAL CUADRE DE CAJA */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 12 }}>
          <Search size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              if (!showReport && e.target.value.trim()) setShowReport(true);
            }}
            placeholder="Buscar por RIF, cédula, monto, referencia, recibo, contribuyente, banco, cajero..."
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#1e293b', background: 'transparent' }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex', alignItems: 'center' }}
              title="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap', borderLeft: '1px solid #e2e8f0', paddingLeft: 12, userSelect: 'none' }} title="Ignora la fecha seleccionada y busca en todos los registros cargados">
            <input
              type="checkbox"
              checked={buscarEnTodoHistorial}
              onChange={e => {
                setBuscarEnTodoHistorial(e.target.checked);
                if (!showReport) setShowReport(true);
              }}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontWeight: buscarEnTodoHistorial ? 700 : 500, color: buscarEnTodoHistorial ? '#1e40af' : '#64748b' }}>
              Buscar en todo el historial
            </span>
          </label>
        </div>

        <div style={S.hdrRow}>
          <div style={S.fw}>
            <span style={S.fl}>Recaudacion - Cuadre Caja</span>
            <select value="Cuadre Caja" disabled style={S.fi}><option>Cuadre Caja</option></select>
          </div>

          <div style={S.fw}>
            <span style={S.fl}>Cajero</span>
            {effectiveIsAdmin ? (
              <select value={cajero} onChange={e => setCajero(e.target.value)} style={{ ...S.fi, minWidth: 220 }}>
                <option value="">Todos</option>
                {cajeros.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <select value={cajero || currentUser} disabled style={{ ...S.fi, minWidth: 220, background: '#f8fafc', color: '#1e293b', fontWeight: 700, cursor: 'not-allowed' }}>
                <option value={cajero || currentUser}>{cajero || currentUser}</option>
              </select>
            )}
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
        </div>
      </div>

      {showReport && (
        <div style={S.rptBox}>
          <div style={{ ...S.secHdr, fontSize: 15, padding: '10px 0' }}>
            RESUMEN CUADRE DE CAJA
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
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 200px', borderBottom: '1px solid #ccc' }}>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #ccc', fontSize: 13 }}>
              <div><b>Débito (POS) Bs.:</b><span style={{ float: 'right' }}>{fmtBs(totalDebito)}</span></div>
              <div style={{ marginTop: 4 }}><b>Crédito (TMD / TVD) Bs.:</b><span style={{ float: 'right', color: '#1e40af', fontWeight: 600 }}>{fmtBs(totalCredito)}</span></div>
              <div style={{ marginTop: 4 }}>
                <b>Transferencia Bs.:</b>
                <span style={{ float: 'right', fontWeight: 700 }}>{fmtBs(totalTransf)}</span>
              </div>
              <div style={{ marginLeft: 12, marginTop: 2, fontSize: 11, color: '#047857', display: 'flex', justifyContent: 'space-between' }}>
                <span>• Banesco ({transfBanesco.length}):</span>
                <b>Bs {fmtBs(totalTransfBanesco)}</b>
              </div>
              <div style={{ marginLeft: 12, marginTop: 1, fontSize: 11, color: '#0284c7', display: 'flex', justifyContent: 'space-between' }}>
                <span>• Bancamiga ({transfBancamiga.length}):</span>
                <b>Bs {fmtBs(totalTransfBancamiga)}</b>
              </div>
              {transfOtros.length > 0 && (
                <div style={{ marginLeft: 12, marginTop: 1, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                  <span>• Otros ({transfOtros.length}):</span>
                  <b>Bs {fmtBs(totalTransfOtros)}</b>
                </div>
              )}
              {totalDeposito > 0 && <div style={{ marginTop: 4 }}><b>Depósito Bs.:</b><span style={{ float: 'right' }}>{fmtBs(totalDeposito)}</span></div>}
              {totalSaldo > 0 && <div style={{ marginTop: 4 }}><b>Saldo a Favor Bs.:</b><span style={{ float: 'right' }}>{fmtBs(totalSaldo)}</span></div>}
              {totalRetenciones > 0 && <div style={{ marginTop: 4, color: '#64748b' }}><b>Retención IVA (Informativo - No suma):</b><span style={{ float: 'right' }}>{fmtBs(totalRetenciones)}</span></div>}
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

          {/* Tarjetas de Credito */}
          {creditos.length > 0 && <>
            <div style={{ ...S.secHdr, background: '#e0e7ff', color: '#1e3a8a' }}>TARJETA DE CRÉDITO (TMD / TVD)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['#', 'Fecha/Hora', 'Tipo', 'Cajero', 'Contribuyente', 'Recibo', 'Banco', 'Aprobación / Ref', 'Monto']
                    .map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {creditos.map((p, i) => {
                    const det = parseDet(p); const recs: string[] = det.recibos || [];
                    return (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={S.td}>{fmtDT(p.created_at)}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#1e40af' }}>{p.tipo}</td>
                        <td style={S.td}>{det.cajero || '-'}</td>
                        <td style={{ ...S.td, color: '#2a5298' }}>{p.identidad}-{p.contribuyente}</td>
                        <td style={S.td}>{recs[0] || p.referencia || '-'}</td>
                        <td style={S.td}>{p.banco || '-'}</td>
                        <td style={S.td}>{p.referencia || det.aprobacion || '-'}</td>
                        <CeldaMonto p={p} valor={parseFloat(p.monto) || 0} />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} style={S.tf}>Total Items Crédito: {creditos.length}</td>
                    <td style={{ ...S.tf, textAlign: 'right', color: '#1e40af' }}>Total Crédito: {fmtBs(totalCredito)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>}

          {/* Transferencias Banesco */}
          {transfBanesco.length > 0 && renderTablaTransf('TRANSFERENCIAS BANESCO', transfBanesco, totalTransfBanesco, '#065f46', '#ecfdf5', '#a7f3d0')}

          {/* Transferencias Bancamiga */}
          {transfBancamiga.length > 0 && renderTablaTransf('TRANSFERENCIAS BANCAMIGA', transfBancamiga, totalTransfBancamiga, '#0369a1', '#f0f9ff', '#bae6fd')}

          {/* Otras Transferencias si existen */}
          {transfOtros.length > 0 && renderTablaTransf('OTRAS TRANSFERENCIAS', transfOtros, totalTransfOtros, '#475569', '#f8fafc', '#cbd5e1')}

          {/* Sumatoria Total de Transferencias */}
          {transferencias.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px 16px', marginTop: 14, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                📊 SUMATORIA TOTAL DE TRANSFERENCIAS ({transferencias.length} registros)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#065f46', fontWeight: 700 }}>
                  Banesco ({transfBanesco.length}): <span style={{ fontSize: 13, fontWeight: 900 }}>Bs {fmtBs(totalTransfBanesco)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 700 }}>
                  Bancamiga ({transfBancamiga.length}): <span style={{ fontSize: 13, fontWeight: 900 }}>Bs {fmtBs(totalTransfBancamiga)}</span>
                </div>
                {transfOtros.length > 0 && (
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>
                    Otras ({transfOtros.length}): <span style={{ fontSize: 13, fontWeight: 900 }}>Bs {fmtBs(totalTransfOtros)}</span>
                  </div>
                )}
                <div style={{ fontSize: 13, background: '#1e293b', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 900 }}>
                  TOTAL GENERAL: Bs {fmtBs(totalTransf)}
                </div>
              </div>
            </div>
          )}

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
                        <CeldaMonto p={p} valor={parseFloat(p.monto) || 0} />
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

          {/* Saldo a Favor / Nota de Crédito (Informativo, no suma a caja) */}
          {saldosAFavor.length > 0 && <>
            <div style={{ ...S.secHdr, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>
              SALDO A FAVOR / NOTA DE CRÉDITO (INFORMATIVO)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['#', 'Fecha/Hora', 'Tipo', 'Cajero', 'Contribuyente', 'Recibo / Factura', 'Referencia / Comprobante', 'Estado', 'Monto']
                    .map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {saldosAFavor.map((p, i) => {
                    const det = parseDet(p);
                    const recs: string[] = det.recibos || [];
                    return (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#faf5ff' }}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={S.td}>{fmtDT(p.created_at)}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#6d28d9' }}>{p.tipo}</td>
                        <td style={S.td}>{det.cajero || '-'}</td>
                        <td style={{ ...S.td, color: '#2a5298' }}>{p.identidad}-{p.contribuyente}</td>
                        <td style={S.td}>{recs[0] || p.referencia || '-'}</td>
                        <td style={S.td}>{p.referencia || '-'}</td>
                        <td style={S.td}><span style={{ color: '#16a34a', fontWeight: 700 }}>{p.estado || 'Aprobado'}</span></td>
                        <CeldaMonto p={p} valor={parseFloat(p.monto) || 0} />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} style={{ ...S.tf, color: '#6d28d9' }}>Total Saldo a Favor / Nota de Crédito: {saldosAFavor.length}</td>
                    <td style={{ ...S.tf, textAlign: 'right', color: '#6d28d9', fontWeight: 900 }}>Bs {fmtBs(totalSaldo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>}

          {/* Retenciones de IVA (Informativo, no suma a caja) */}
          {retenciones.length > 0 && <>
            <div style={{ ...S.secHdr, background: '#f1f5f9', color: '#475569' }}>RETENCIONES DE IVA (COMPROBANTES - INFORMATIVO / NO SUMA EN CUADRE)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['#', 'Fecha/Hora', 'Tipo', 'Cajero', 'Contribuyente', 'Comprobante', 'Estado', 'Monto Retenido']
                    .map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {retenciones.map((p, i) => {
                    const det = parseDet(p);
                    return (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafe' }}>
                        <td style={S.td}>{i + 1}</td>
                        <td style={S.td}>{fmtDT(p.created_at)}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#475569' }}>{p.tipo}</td>
                        <td style={S.td}>{det.cajero || '-'}</td>
                        <td style={{ ...S.td, color: '#2a5298' }}>{p.identidad}-{p.contribuyente}</td>
                        <td style={S.td}>{p.referencia || '-'}</td>
                        <td style={S.td}><span style={{ color: '#16a34a', fontWeight: 700 }}>{p.estado || 'Aprobado'}</span></td>
                        <CeldaMonto p={p} valor={parseFloat(p.monto) || 0} />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} style={S.tf}>Total Comprobantes: {retenciones.length} (Informativo, no suma a caja)</td>
                    <td style={{ ...S.tf, textAlign: 'right', color: '#475569' }}>Total Retención: {fmtBs(totalRetenciones)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>}
          {pagosFiltrados.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No se encontraron registros.</div>
              {searchTerm && (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  Ningún pago coincide con &quot;<b>{searchTerm}</b>&quot;.
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{ marginLeft: 8, background: '#e2e8f0', color: '#1e293b', border: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ background: '#1e3a8a', color: '#fff', padding: '12px 16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pencil size={16} /> Corregir monto y fecha en reportes
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, lineHeight: 1.6 }}>
                <div><b>Contribuyente:</b> {editar.p.identidad} {editar.p.contribuyente || ''}</div>
                <div><b>Cajero:</b> {parseDet(editar.p).cajero || '-'} · <b>Tipo:</b> {editar.p.tipo}</div>
                <div><b>Registrado por el cajero:</b> Bs {fmtBs(parseFloat(editar.p.monto_real ?? editar.p.monto) || 0)}</div>
              </div>
              <label style={{ fontWeight: 700, color: '#1e3a8a' }} htmlFor="fecha-reporte-cuadre">Fecha en que se pagó (día del cuadre)</label>
              <input id="fecha-reporte-cuadre" type="date" value={editar.fecha}
                onChange={e => setEditar({ ...editar, fecha: e.target.value })}
                style={{ border: '1px solid #94a3b8', borderRadius: 6, padding: '8px 10px', fontSize: 14, fontWeight: 700 }} />
              <label style={{ fontWeight: 700, color: '#1e3a8a' }} htmlFor="monto-reporte">Monto correcto (Bs)</label>
              <input id="monto-reporte" type="number" step="0.01" min="0" value={editar.monto} autoFocus
                onChange={e => setEditar({ ...editar, monto: e.target.value })}
                style={{ border: '1px solid #94a3b8', borderRadius: 6, padding: '8px 10px', fontSize: 16, fontWeight: 800, textAlign: 'right', fontFamily: 'monospace' }} />
              <label style={{ fontWeight: 700, color: '#1e3a8a' }} htmlFor="motivo-reporte">Motivo (obligatorio)</label>
              <input id="motivo-reporte" value={editar.motivo} placeholder="Ej.: el cajero tecleó mal el monto del punto o fecha errónea"
                onChange={e => setEditar({ ...editar, motivo: e.target.value })}
                style={{ border: '1px solid #94a3b8', borderRadius: 6, padding: '8px 10px', fontSize: 13 }} />
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Ajusta los reportes, el cuadre diario y sus PDF. Queda registrado en la Auditoría.
              </div>
              {editar.error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: 8, fontSize: 12 }}>{editar.error}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <div>
                {editar.p.monto_corregido && (
                  <button onClick={() => guardarMonto(true)} disabled={editar.guardando || editar.motivo.trim().length < 5}
                    style={{ background: 'none', border: '1px solid #f59e0b', color: '#b45309', borderRadius: 6, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12, opacity: editar.motivo.trim().length < 5 ? 0.5 : 1 }}>
                    Quitar corrección
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditar(null)} disabled={editar.guardando}
                  style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                <button id="btn-guardar-monto-reporte" onClick={() => guardarMonto(false)} disabled={editar.guardando || editar.motivo.trim().length < 5 || !(parseFloat(editar.monto) >= 0)}
                  style={{ background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 12, opacity: editar.guardando || editar.motivo.trim().length < 5 ? 0.5 : 1 }}>
                  {editar.guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
