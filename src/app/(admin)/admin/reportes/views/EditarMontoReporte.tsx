'use client';
import React, { useState } from 'react';
import { Pencil } from 'lucide-react';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseDet = (p: any) => { if (!p?.detalles) return {}; if (typeof p.detalles === 'object') return p.detalles; try { return JSON.parse(p.detalles); } catch { return {}; } };

/**
 * Corrección del monto mostrado en REPORTES (solo administrador). No modifica el pago real.
 * Uso: const { CeldaMonto, modal } = useEditarMontoReporte(isAdmin, onPagoActualizado);
 *      <CeldaMonto p={p} valor={monto} style={...} />  …  {modal}
 */
export function useEditarMontoReporte(isAdmin: boolean, onPagoActualizado?: (row: any) => void) {
  const [editar, setEditar] = useState<null | { p: any; monto: string; motivo: string; guardando: boolean; error?: string }>(null);

  const guardar = async (quitar = false) => {
    if (!editar) return;
    setEditar({ ...editar, guardando: true, error: undefined });
    try {
      let usuario = '';
      try { usuario = JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || ''; } catch {}
      const r = await fetch('/api/admin/pagos/corregir-monto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagoId: editar.p.id, montoNuevo: quitar ? null : editar.monto, motivo: editar.motivo, usuario }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      onPagoActualizado?.(d.pago);
      setEditar(null);
    } catch (e: any) {
      setEditar(prev => prev && { ...prev, guardando: false, error: e.message });
    }
  };

  const CeldaMonto = ({ p, valor, style }: { p: any; valor: number; style?: React.CSSProperties }) => (
    <td style={{ ...style, color: p.monto_corregido ? '#b45309' : style?.color }}
      title={p.monto_corregido ? `Monto corregido en reportes. Registrado por el cajero: Bs ${fmtBs(parseFloat(p.monto_real) || 0)}` : undefined}>
      {p.monto_corregido && <span style={{ fontSize: 9, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 3, padding: '0 4px', marginRight: 6 }}>CORREGIDO</span>}
      {fmtBs(valor)}
      {isAdmin && (
        <button onClick={() => setEditar({ p, monto: valor.toFixed(2), motivo: '', guardando: false })}
          title="Corregir el monto en los reportes" style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', verticalAlign: 'middle', padding: 0 }}>
          <Pencil size={12} />
        </button>
      )}
    </td>
  );

  const motivoOk = (editar?.motivo.trim().length || 0) >= 5;
  const modal = editar ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ background: '#1e3a8a', color: '#fff', padding: '12px 16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pencil size={16} /> Corregir monto en reportes
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, lineHeight: 1.6 }}>
            <div><b>Contribuyente:</b> {editar.p.identidad} {editar.p.contribuyente || ''}</div>
            <div><b>Cajero:</b> {parseDet(editar.p).cajero || '-'} · <b>Tipo:</b> {editar.p.tipo}</div>
            <div><b>Registrado por el cajero:</b> Bs {fmtBs(parseFloat(editar.p.monto_real ?? editar.p.monto) || 0)}</div>
          </div>
          <label style={{ fontWeight: 700, color: '#1e3a8a' }} htmlFor="monto-reporte">Monto correcto (Bs)</label>
          <input id="monto-reporte" type="number" step="0.01" min="0" value={editar.monto} autoFocus
            onChange={e => setEditar({ ...editar, monto: e.target.value })}
            style={{ border: '1px solid #94a3b8', borderRadius: 6, padding: '8px 10px', fontSize: 16, fontWeight: 800, textAlign: 'right', fontFamily: 'monospace' }} />
          <label style={{ fontWeight: 700, color: '#1e3a8a' }} htmlFor="motivo-reporte">Motivo (obligatorio)</label>
          <input id="motivo-reporte" value={editar.motivo} placeholder="Ej.: el cajero tecleó mal el monto del punto"
            onChange={e => setEditar({ ...editar, motivo: e.target.value })}
            style={{ border: '1px solid #94a3b8', borderRadius: 6, padding: '8px 10px', fontSize: 13 }} />
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Solo cambia lo que muestran los reportes y sus PDF. El pago, la deuda, la conciliación y la factura no se modifican. Queda registrado en la Auditoría.
          </div>
          {editar.error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: 8, fontSize: 12 }}>{editar.error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <div>
            {editar.p.monto_corregido && (
              <button onClick={() => guardar(true)} disabled={editar.guardando || !motivoOk}
                style={{ background: 'none', border: '1px solid #f59e0b', color: '#b45309', borderRadius: 6, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 12, opacity: motivoOk ? 1 : 0.5 }}>
                Quitar corrección
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditar(null)} disabled={editar.guardando}
              style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
            <button id="btn-guardar-monto-reporte" onClick={() => guardar(false)} disabled={editar.guardando || !motivoOk || !(parseFloat(editar.monto) >= 0)}
              style={{ background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 12, opacity: editar.guardando || !motivoOk ? 0.5 : 1 }}>
              {editar.guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return { CeldaMonto, modal };
}
