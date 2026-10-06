import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { extraerCodigoInmueble, parseDetalles } from '@/lib/documentoPago';
import { calcularMensualidad } from '@/lib/calculos';

export const dynamic = 'force-dynamic';

const CAMPOS = ['meses_deuda', 'deuda_mmv', 'multa_bs', 'deuda_congelada_bs', 'saldo_favor_bs'] as const;
const num = (v: any) => parseFloat(String(v ?? 0)) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ELIMINAR UN PAGO Y DEVOLVER LA DEUDA (solo administrador, con motivo, queda en auditoría).
 *  - confirmar=false → vista previa de lo que se restablecerá (no cambia nada).
 *  - confirmar=true  → respalda en auditoría, restablece la deuda, reabre facturas internas y borra el pago.
 * Bloqueos: factura ya emitida en The Factory (hay que anularla) o pagos posteriores sobre los mismos inmuebles.
 */
export async function POST(req: Request) {
  try {
    const { pagoId, motivo, usuario, confirmar } = await req.json();
    if (!pagoId) return NextResponse.json({ error: 'Falta el pago' }, { status: 400 });

    // 1. Solo administrador
    const u = String(usuario || '').trim().toLowerCase();
    const { data: trab } = await supabase.from('trabajadores').select('usuario, nombre, rol, estado').ilike('usuario', u).maybeSingle();
    const esAdmin = !!trab && (trab.rol === 'Administrador' || u === 'dzara') && String(trab.estado || 'Activo').toLowerCase() === 'activo';
    if (!esAdmin) return NextResponse.json({ error: 'Solo un administrador puede eliminar pagos.' }, { status: 403 });
    if (confirmar && String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo de la eliminación.' }, { status: 400 });

    // 2. Pago
    const { data: pago, error: ePago } = await supabase.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
    if (ePago || !pago) return NextResponse.json({ error: 'El pago no existe (¿ya fue eliminado?).' }, { status: 404 });
    const det = parseDetalles(pago.detalles);
    if (det?.factura_digital?.emitida) {
      return NextResponse.json({ error: `Este pago ya tiene la factura N° ${det.factura_digital.numero || ''} emitida en The Factory HKA. Primero anúlela y luego elimine el pago.` }, { status: 409 });
    }

    const recibos: string[] = Array.isArray(det.recibos) ? det.recibos : [];
    const previa: any[] = Array.isArray(det.deuda_previa) ? det.deuda_previa : [];
    const codigos = new Set<string>(recibos.map(r => extraerCodigoInmueble(r)).filter(Boolean) as string[]);
    previa.forEach(p => p?.inmueble && codigos.add(String(p.inmueble).toUpperCase()));

    // 3. Pagos posteriores sobre los mismos inmuebles o el mismo contribuyente → bloquear (se desharían también)
    const { data: posteriores } = await supabase.from('pagos_reportados')
      .select('id, created_at, identidad, monto, detalles').gt('created_at', pago.created_at).order('created_at').limit(1000);
    const choques = (posteriores || []).filter((p: any) => {
      if (p.identidad && p.identidad === pago.identidad) return true;
      const d = parseDetalles(p.detalles);
      const refs: string[] = Array.isArray(d.recibos) ? d.recibos : [];
      return refs.some(r => codigos.has(String(extraerCodigoInmueble(r) || '')));
    });
    if (choques.length > 0) {
      const lista = choques.slice(0, 5).map((p: any) => `${new Date(p.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas' })} · ${p.identidad} · Bs ${num(p.monto).toFixed(2)}`).join('\n');
      return NextResponse.json({ error: `Hay ${choques.length} pago(s) posterior(es) del mismo contribuyente o inmueble. Elimínelos primero (del más reciente al más antiguo):\n${lista}` }, { status: 409 });
    }

    // 4. Estado actual de los inmuebles involucrados
    const ids = previa.map(p => p?.id).filter(Boolean);
    const [{ data: porCodigo }, { data: porId }] = await Promise.all([
      codigos.size ? supabase.from('inmuebles').select('*').in('inmueble', [...codigos]) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from('inmuebles').select('*').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const actuales = new Map<string, any>();
    [...(porCodigo || []), ...(porId || [])].forEach((i: any) => actuales.set(i.id, i));

    // 5. Calcular lo que se restablece
    type Cambio = { id: string; inmueble: string; antes: Record<string, number>; despues: Record<string, number> };
    const cambios: Cambio[] = [];
    let estimado = false;

    if (previa.length > 0) {
      for (const p of previa) {
        const act = actuales.get(p.id) || [...actuales.values()].find(i => i.inmueble === p.inmueble);
        if (!act) continue;
        const antes: any = {}, despues: any = {};
        let difiere = false;
        for (const c of CAMPOS) {
          antes[c] = num(act[c]); despues[c] = num(p[c]);
          if (Math.abs(antes[c] - despues[c]) > 0.000001) difiere = true;
        }
        if (difiere) cambios.push({ id: act.id, inmueble: act.inmueble, antes, despues });
      }
    } else {
      // Pagos sin foto (anteriores al 06/10): se estima con los meses y multas cobrados
      estimado = true;
      if (det.es_abono || recibos.includes('RECIB-DEUDA')) {
        return NextResponse.json({ error: 'Este pago es un abono o "deuda total" sin foto de la deuda anterior: no se puede calcular con seguridad cuánto devolver. Ajuste la deuda manualmente desde Contribuyentes y luego elimine el pago.' }, { status: 409 });
      }
      const tasa = num(det.tasa_bcv_aplicada || det.tasa_bcv);
      const montos = det.montos && typeof det.montos === 'object' ? det.montos : {};
      for (const cod of codigos) {
        const act = [...actuales.values()].find(i => String(i.inmueble).toUpperCase() === cod);
        if (!act) continue;
        const mesesPagados = recibos.filter(r => new RegExp(`^RECIB-HIST-${cod}-M\\d+$`, 'i').test(r)).length;
        const multaPagada = recibos.filter(r => /^MULTA-/i.test(r) && extraerCodigoInmueble(r) === cod).reduce((s, r) => s + num(montos[r]), 0);
        if (!mesesPagados && !multaPagada) continue;
        const antes: any = {}; CAMPOS.forEach(c => { antes[c] = num(act[c]); });
        const despues: any = { ...antes };
        if (mesesPagados) {
          despues.meses_deuda = antes.meses_deuda + mesesPagados;
          despues.deuda_mmv = antes.meses_deuda > 0 && antes.deuda_mmv > 0
            ? +(antes.deuda_mmv * despues.meses_deuda / antes.meses_deuda).toFixed(6)
            : (tasa > 0 ? +((calcularMensualidad(act, tasa) / (57 * tasa)) * despues.meses_deuda).toFixed(6) : antes.deuda_mmv);
        }
        if (multaPagada) despues.multa_bs = r2(antes.multa_bs + multaPagada);
        cambios.push({ id: act.id, inmueble: act.inmueble, antes, despues });
      }
    }

    // Facturas internas que el cobro marcó como pagadas
    const { data: facturas } = recibos.length
      ? await supabase.from('facturas').select('id, referencia, estado').in('referencia', recibos)
      : { data: [] as any[] };
    const facturasReabrir = (facturas || []).filter((f: any) => /pagad/i.test(String(f.estado || '')));

    const resumen = {
      pago: { id: pago.id, identidad: pago.identidad, monto: num(pago.monto), fecha: pago.created_at, cajero: det.cajero || null, referencia: pago.referencia || null },
      estimado, cambios, facturasReabrir: facturasReabrir.map((f: any) => f.referencia),
    };
    if (!confirmar) return NextResponse.json({ preview: true, ...resumen });

    // 6. Respaldo completo en auditoría ANTES de tocar nada
    const { error: eAud } = await supabase.from('auditoria').insert({
      accion: 'Eliminación de pago (deuda restablecida)',
      usuario: `${trab!.nombre || trab!.usuario} (${trab!.usuario})`,
      detalles: {
        identidad: pago.identidad, motivo: String(motivo).trim(), estimado,
        pago_respaldo: pago,
        inmuebles_antes: cambios.map(c => ({ ...actuales.get(c.id) })),
        cambios, facturas_reabiertas: facturasReabrir.map((f: any) => f.referencia),
        _categoria: 'PAGOS', criticidad: 'ALTA',
      },
    });
    if (eAud) return NextResponse.json({ error: `No se pudo guardar el respaldo en auditoría: ${eAud.message}. No se eliminó nada.` }, { status: 500 });

    // 7. Restablecer deuda
    for (const c of cambios) {
      const { error } = await supabase.from('inmuebles').update(c.despues).eq('id', c.id);
      if (error) return NextResponse.json({ error: `Falló al restablecer ${c.inmueble}: ${error.message}. El pago NO se eliminó; el respaldo quedó en auditoría.` }, { status: 500 });
    }
    if (facturasReabrir.length) {
      await supabase.from('facturas').update({ estado: 'Pendiente' }).in('id', facturasReabrir.map((f: any) => f.id));
    }

    // 8. Borrar el pago
    const { error: eDel } = await supabase.from('pagos_reportados').delete().eq('id', pago.id);
    if (eDel) return NextResponse.json({ error: `La deuda se restableció pero no se pudo borrar el pago: ${eDel.message}` }, { status: 500 });

    return NextResponse.json({ ok: true, ...resumen });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error inesperado' }, { status: 500 });
  }
}
