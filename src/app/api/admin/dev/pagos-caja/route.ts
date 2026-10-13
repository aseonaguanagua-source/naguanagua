import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const det = (p: any) => { if (!p?.detalles) return {}; if (typeof p.detalles === 'object') return p.detalles; try { return JSON.parse(p.detalles); } catch { return {}; } };

/**
 * MODO DEV — Pagos en reportes de caja / corte de caja de CUALQUIER cajero.
 *  { pass, accion: 'cajeros' }                                  → lista de cajeros conocidos
 *  { pass, accion: 'listar', cajero?, desde, hasta }            → pagos del rango (por cajero opcional)
 *  { pass, accion: 'registrar', pago: {...} }                   → inserta un pago en el reporte del cajero
 *  { pass, accion: 'eliminar', id, motivo }                     → elimina el pago (copia completa en auditoría)
 * Solo afecta los REPORTES de caja (pagos_reportados). No modifica deudas de inmuebles.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.pass !== '1756762') return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const usuario = String(b.usuario || 'dev');

    if (b.accion === 'cajeros') {
      const { data } = await sb.from('pagos_reportados').select('detalles').order('created_at', { ascending: false }).limit(3000);
      const set = new Set<string>();
      (data || []).forEach((p: any) => { const c = det(p).cajero; if (c) set.add(String(c)); });
      const { data: trab } = await sb.from('trabajadores').select('usuario');
      (trab || []).forEach((t: any) => t.usuario && set.add(String(t.usuario)));
      return NextResponse.json({ cajeros: [...set].sort((a, c) => a.localeCompare(c)) });
    }

    if (b.accion === 'listar') {
      const desde = new Date(`${b.desde}T00:00:00-04:00`).toISOString();
      const hasta = new Date(`${b.hasta}T23:59:59-04:00`).toISOString();
      const { data, error } = await sb.from('pagos_reportados').select('*').gte('created_at', desde).lte('created_at', hasta).order('created_at', { ascending: true }).limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const cj = String(b.cajero || '').toLowerCase();
      const filas = (data || []).filter((p: any) => {
        if (!cj) return true;
        const c = String(det(p).cajero || '').toLowerCase();
        return c === cj || c.endsWith(`-${cj}`);
      }).map((p: any) => ({ ...p, _det: det(p) }));
      return NextResponse.json({ pagos: filas });
    }

    if (b.accion === 'registrar') {
      const p = b.pago || {};
      const monto = Number(p.monto);
      if (!p.cajero || !(monto > 0) || !p.tipo || !p.fecha) return NextResponse.json({ error: 'Faltan datos: cajero, tipo, monto y fecha.' }, { status: 400 });
      const hora = /^\d{2}:\d{2}$/.test(p.hora || '') ? p.hora : '12:00';
      const id = crypto.randomUUID();
      const fila = {
        id,
        identidad: String(p.identidad || '').trim().toUpperCase() || null,
        monto,
        banco: p.banco || p.tipo,
        referencia: p.referencia || `DEV-${Date.now().toString().slice(-8)}`,
        tipo: p.tipo,
        estado: 'Aprobado',
        created_at: new Date(`${p.fecha}T${hora}:00-04:00`).toISOString(),
        detalles: JSON.stringify({
          cajero: p.cajero, recibos: p.recibo ? [p.recibo] : [], contribuyente: p.contribuyente || undefined, contribuyente_nombre: p.contribuyente || undefined,
          banco_destino: p.banco_destino || undefined, aprobacion: p.aprobacion || undefined, lote: p.lote || undefined,
          fecha_banco: p.fecha_banco || undefined, monto_conciliado: p.tipo === 'Transferencia' ? monto : undefined,
          registrado_dev: true, registrado_por: usuario, nota: p.nota || undefined,
        }),
      };
      const { error } = await sb.from('pagos_reportados').insert(fila);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await sb.from('auditoria').insert({ accion: 'DEV: pago registrado en reporte de caja', usuario, modulo: '/admin/dev',
        detalles: { pago: fila, _categoria: 'CAJA', criticidad: 'ALTA' } });
      return NextResponse.json({ ok: true, id });
    }

    if (b.accion === 'eliminar') {
      if (!b.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
      if (String(b.motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo.' }, { status: 400 });
      const { data: antes } = await sb.from('pagos_reportados').select('*').eq('id', b.id).maybeSingle();
      if (!antes) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
      // Copia completa en auditoría ANTES de borrar (permite restaurarlo)
      const { error: eA } = await sb.from('auditoria').insert({ accion: 'DEV: pago eliminado de reporte de caja', usuario, modulo: '/admin/dev',
        detalles: { motivo: String(b.motivo).trim(), pago_eliminado: antes, _categoria: 'CAJA', criticidad: 'ALTA' } });
      if (eA) return NextResponse.json({ error: 'No se pudo guardar el respaldo en auditoría: ' + eA.message }, { status: 500 });
      const { error } = await sb.from('pagos_reportados').delete().eq('id', b.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
