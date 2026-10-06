import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * MONTO DE REPORTE (solo administrador).
 * Corrige el monto que se muestra en los REPORTES (cuadre de caja, ingresos, cortes) cuando un cajero se
 * equivocó al registrar lo facturado o lo pasado por tarjeta. NO modifica el pago real (pagos_reportados.monto),
 * ni la deuda, ni la conciliación, ni la factura: se guarda en detalles.monto_reporte con su historial.
 * montoNuevo = null/'' → quita la corrección (el reporte vuelve a usar el monto real).
 */
export async function POST(req: Request) {
  try {
    const { pagoId, montoNuevo, motivo, usuario } = await req.json();
    const u = String(usuario || '').trim().toLowerCase();
    const { data: trab } = await sb.from('trabajadores').select('usuario, nombre, rol').ilike('usuario', u).maybeSingle();
    if (!trab || !(trab.rol === 'Administrador' || u === 'dzara')) return NextResponse.json({ error: 'Solo un administrador puede corregir montos en los reportes.' }, { status: 403 });
    if (String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo de la corrección.' }, { status: 400 });

    const quitar = montoNuevo === null || montoNuevo === '' || montoNuevo === undefined;
    const nuevo = quitar ? null : r2(parseFloat(String(montoNuevo).replace(',', '.')) || 0);
    if (!quitar && !(nuevo! >= 0)) return NextResponse.json({ error: 'Monto inválido.' }, { status: 400 });

    const { data: pago } = await sb.from('pagos_reportados').select('id, identidad, tipo, referencia, monto, detalles, created_at').eq('id', pagoId).maybeSingle();
    if (!pago) return NextResponse.json({ error: 'El pago no existe.' }, { status: 404 });
    let det: any = pago.detalles || {};
    if (typeof det === 'string') { try { det = JSON.parse(det); } catch { det = {}; } }

    const real = r2(parseFloat(String(pago.monto || 0)) || 0);
    const antes = det.monto_reporte != null ? r2(parseFloat(det.monto_reporte) || 0) : real;
    const quien = `${trab.nombre || trab.usuario} (${trab.usuario})`;

    const nuevoDet: any = {
      ...det,
      correcciones_reporte: [
        ...(Array.isArray(det.correcciones_reporte) ? det.correcciones_reporte : []),
        { antes, despues: quitar ? real : nuevo, quitada: quitar || undefined, motivo: String(motivo).trim(), usuario: quien, fecha: new Date().toISOString() },
      ],
    };
    if (quitar || Math.abs((nuevo as number) - real) < 0.005) delete nuevoDet.monto_reporte;
    else nuevoDet.monto_reporte = nuevo;

    const { data: actualizado, error } = await sb.from('pagos_reportados').update({ detalles: nuevoDet }).eq('id', pago.id).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from('auditoria').insert({
      accion: quitar ? 'Corrección de monto en reporte (quitada)' : 'Corrección de monto en reporte',
      usuario: quien,
      detalles: {
        pago_id: pago.id, identidad: pago.identidad, tipo: pago.tipo, referencia: pago.referencia, cajero: det.cajero || null,
        monto_real_pago: real, monto_reporte_antes: antes, monto_reporte_despues: quitar ? real : nuevo,
        motivo: String(motivo).trim(), fecha_pago: pago.created_at, _categoria: 'REPORTES', criticidad: 'ALTA',
      },
    });

    return NextResponse.json({ ok: true, pago: actualizado });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
