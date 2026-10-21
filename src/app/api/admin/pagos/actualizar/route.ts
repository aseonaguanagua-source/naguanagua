import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * ACTUALIZAR UN PAGO (servidor).
 * La base de datos NO permite que el navegador modifique `pagos_reportados` (solo leer e insertar): antes las
 * pantallas hacían el update desde el navegador y fallaba EN SILENCIO (p. ej. Conciliación aprobaba, bajaba la
 * deuda, pero el pago seguía "Por Verificar" y se podía aprobar otra vez → deuda descontada dos veces).
 *
 * Body: { pagoId, cambios: { estado?, banco?, tipo?, detalles?, created_at? }, usuario, soloSiEstado? }
 *  - soloSiEstado: el cambio solo se aplica si el pago sigue en ese estado (evita aprobar dos veces).
 *  Responde { ok: true } o { error } con 409 si el pago ya fue procesado.
 */
const PERMITIDOS = ['estado', 'banco', 'tipo', 'detalles', 'created_at', 'referencia'] as const;
const ESTADOS = ['Aprobado', 'Rechazado', 'Por Verificar', 'Con Diferencia', 'Pendiente'];

export async function POST(req: Request) {
  try {
    const { pagoId, cambios, usuario, soloSiEstado } = await req.json();
    if (!pagoId || !cambios || typeof cambios !== 'object') return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });

    const u = String(usuario || '').trim();
    if (!u) return NextResponse.json({ error: 'Usuario no autorizado. Vuelva a iniciar sesión.' }, { status: 403 });
    let { data: trab } = await sb.from('trabajadores').select('usuario, nombre, estado').ilike('usuario', u).limit(1);
    if (!trab?.length) ({ data: trab } = await sb.from('trabajadores').select('usuario, nombre, estado').ilike('nombre', u).limit(1));
    const t = trab?.[0];
    if (!t || String(t.estado || 'Activo').toLowerCase() !== 'activo') return NextResponse.json({ error: 'Usuario no autorizado. Vuelva a iniciar sesión.' }, { status: 403 });

    const upd: Record<string, any> = {};
    for (const k of PERMITIDOS) if (k in cambios) upd[k] = cambios[k];
    if (!Object.keys(upd).length) return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
    if ('estado' in upd && !ESTADOS.includes(upd.estado)) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });

    // Si se rechaza el pago, restaurar deuda del contribuyente y liberar referencia bancaria
    if (upd.estado === 'Rechazado') {
      const { data: actualP } = await sb.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
      if (actualP) {
        if (actualP.referencia && !actualP.referencia.startsWith('RECH-')) {
          upd.referencia = `RECH-${actualP.referencia}-${pagoId.slice(0, 6)}`;
        }
        let d = typeof upd.detalles === 'object' ? { ...upd.detalles } : (actualP.detalles || {});
        d.referencia_original = actualP.referencia;
        d.factura_digital = { emitida: false, pendiente: false, rechazada: true, rechazada_at: new Date().toISOString() };
        d.saldo_favor = 0;
        d.saldo_favor_bs = 0;
        d.monto_saldo_favor = 0;
        d.saldo_favor_acreditado = false;
        upd.detalles = d;

        // Determinar si el pago había descontado deuda (previamente Aprobado, con conciliación o de Caja/Condominios)
        const detP = typeof actualP.detalles === 'string' ? JSON.parse(actualP.detalles || '{}') : (actualP.detalles || {});
        const detMerged = { ...detP, ...d };
        const habiaDescontadoDeuda = 
          actualP.estado === 'Aprobado' || 
          actualP.estado === 'Con Diferencia' || 
          Boolean(detMerged.fecha_conciliado) || 
          Boolean(detMerged.recibo_caja) || 
          (Array.isArray(detMerged.deuda_previa) && detMerged.deuda_previa.length > 0) || 
          actualP.modulo === 'condominios';

        if (habiaDescontadoDeuda) {
          const prevLista = Array.isArray(detMerged.deuda_previa) && detMerged.deuda_previa.length > 0 ? detMerged.deuda_previa : [];
          
          if (prevLista.length > 0) {
            for (const prev of prevLista) {
              if (prev.unidad) {
                await sb.from('condominio_unidades').update({
                  aseo_pendiente_desde: prev.aseo_pendiente_desde,
                  multa_meses: prev.multa_meses || 0,
                  multa_exonerada_hasta: prev.multa_exonerada_hasta || null,
                }).eq('id', prev.unidad);
              }
              if (prev.condominio) {
                await sb.from('condominios').update({
                  aseo_pendiente_desde: prev.aseo_pendiente_desde,
                  multa_meses: prev.multa_meses || 0,
                }).eq('id', prev.condominio);
              }
              if (prev.id || prev.inmueble) {
                const nMeses = Math.max(0, parseInt(String(prev.meses_deuda || (prev.aseo_pendiente_desde ? 1 : 0))));
                const updInm: any = {
                  meses_deuda: nMeses,
                  deuda_mmv: parseFloat(String(prev.deuda_mmv || 0)),
                  multa_bs: parseFloat(String(prev.multa_bs || 0)),
                  deuda_congelada_bs: parseFloat(String(prev.deuda_congelada_bs || 0)),
                  saldo_favor_bs: parseFloat(String(prev.saldo_favor_bs || 0)),
                };
                if (prev.id) await sb.from('inmuebles').update(updInm).eq('id', prev.id);
                else if (prev.inmueble) await sb.from('inmuebles').update(updInm).eq('inmueble', prev.inmueble);
              }
            }
          } else {
            // Fallback: restaurar por recibos y RIF
            const recibos: string[] = Array.isArray(detMerged.recibos) ? detMerged.recibos : [];
            const propCodes = new Set<string>();
            recibos.forEach((r: string) => {
              const m = r.match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+)/i);
              if (m && m[1]) propCodes.add(m[1].toUpperCase());
              const mDir = r.match(/(URB\d+|AURI\d+)/i);
              if (mDir && mDir[1]) propCodes.add(mDir[1].toUpperCase());
            });
            if (detMerged.cod_inmueble) propCodes.add(String(detMerged.cod_inmueble).toUpperCase());
            if (detMerged.inmueble) propCodes.add(String(detMerged.inmueble).toUpperCase());
            if (actualP.cod_inmueble) propCodes.add(String(actualP.cod_inmueble).toUpperCase());
            if (Array.isArray(detMerged.inmuebles)) {
              detMerged.inmuebles.forEach((ic: any) => {
                if (typeof ic === 'string') propCodes.add(ic.toUpperCase());
                else if (ic?.inmueble) propCodes.add(String(ic.inmueble).toUpperCase());
              });
            }
            if (detMerged.recibo_caja) {
              const rcArr = Array.isArray(detMerged.recibo_caja) ? detMerged.recibo_caja : [detMerged.recibo_caja];
              rcArr.forEach((rc: any) => {
                if (rc?.codContribuyente) propCodes.add(String(rc.codContribuyente).toUpperCase());
                if (rc?.inmueble) propCodes.add(String(rc.inmueble).toUpperCase());
              });
            }

            const rawId = String(actualP.identidad || '').trim().toUpperCase();
            const sinG = rawId.replace(/-/g, '');
            const conG = /^[VEJPG]\d/.test(sinG) ? `${sinG[0]}-${sinG.slice(1)}` : rawId;
            const idVars = [...new Set([rawId, sinG, conG].filter(Boolean))];
            
            const orConditions = [
              ...idVars.map(v => `identidad.eq.${v}`),
              ...Array.from(propCodes).map(c => `inmueble.eq.${c}`)
            ];

            const { data: inmsAfectados } = await sb.from('inmuebles').select('*').or(orConditions.join(','));
            if (inmsAfectados && inmsAfectados.length > 0) {
              for (const inm of inmsAfectados) {
                const mesesPagados = recibos.filter((r: string) => r.toUpperCase().includes(String(inm.inmueble || '').toUpperCase())).length || 1;
                const curMeses = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
                const nuevoMeses = curMeses + mesesPagados;
                const mmv = parseFloat(String(inm.mmv_mes || 0)) || (parseFloat(String(inm.deuda_mmv || 0)) / (curMeses || 1)) || 0;
                await sb.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: parseFloat((mmv * nuevoMeses).toFixed(6)),
                }).eq('id', inm.id);
              }
            }

            // Condominios: retroceder fecha de aseo si aplica
            const esCondo = actualP.modulo === 'condominios' || detMerged.es_condominio || detMerged.modulo === 'condominios';
            if (esCondo) {
              const condoCod = detMerged.condominio?.codigo || detMerged.codigo_condominio || (Array.from(propCodes)[0]);
              if (condoCod) {
                const { data: cRow } = await sb.from('condominios').select('*').eq('codigo', condoCod).maybeSingle();
                if (cRow && cRow.aseo_pendiente_desde) {
                  const mesesARevertir = recibos.length > 0 ? recibos.length : (detMerged.meses || 1);
                  const f = new Date(cRow.aseo_pendiente_desde + 'T12:00:00Z');
                  f.setMonth(f.getMonth() - mesesARevertir);
                  const nuevaFecha = f.toISOString().slice(0, 10);
                  await sb.from('condominios').update({ aseo_pendiente_desde: nuevaFecha }).eq('id', cRow.id);
                  await sb.from('condominio_unidades').update({ aseo_pendiente_desde: nuevaFecha }).eq('condominio_id', cRow.id);
                }
              }
            }
          }

          // Restaurar recibos a Pendiente
          const recibos: string[] = Array.isArray(detMerged.recibos) ? detMerged.recibos : [];
          if (recibos.length > 0) {
            await sb.from('facturas').update({ estado: 'Pendiente' }).in('referencia', recibos);
          }
          if (detMerged.cuotas && detMerged.cuotas.length > 0) {
            await sb.from('convenios_cuotas').update({ estado: 'Pendiente' }).in('id', detMerged.cuotas.map((c: any) => typeof c === 'object' ? c.id : c));
          }
          if (detMerged.servicios && detMerged.servicios.length > 0) {
            await sb.from('servicios_especiales').update({ estado: 'Pendiente' }).in('referencia', detMerged.servicios.map((s: any) => typeof s === 'string' ? s : s.referencia));
          }

          // Limpiar movimientos de condominio
          await sb.from('condominio_movimientos').delete().in('pago_id', [pagoId, detMerged.pago_principal_id, detMerged.pago_vinculado].filter(Boolean));

          // Rechazar comprobantes de retención vinculados
          await sb.from('pagos_reportados').update({ estado: 'Rechazado' }).filter('detalles->>pago_vinculado', 'eq', pagoId);

          // Revertir notas de crédito creadas por exceso o saldo a favor
          try {
            const ors = [];
            if (actualP.referencia) ors.push(`detalles->>origen_referencia.ilike.%${actualP.referencia}%`);
            if (pagoId) ors.push(`detalles->>origen_referencia.ilike.%${pagoId}%`);
            if (ors.length > 0) {
              await sb.from('documentos').update({ estado: 'Anulada' }).eq('tipo', 'Nota de Credito').or(ors.join(','));
            }
          } catch(e) {}
        }
      }
    }

    let q = sb.from('pagos_reportados').update(upd).eq('id', pagoId);
    if (soloSiEstado) q = q.eq('estado', soloSiEstado);
    const { data, error } = await q.select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) {
      const { data: actual } = await sb.from('pagos_reportados').select('estado').eq('id', pagoId).maybeSingle();
      if (!actual) return NextResponse.json({ error: 'El pago no existe.' }, { status: 404 });
      return NextResponse.json({ error: `Este pago ya fue procesado (estado actual: ${actual.estado}). Recargue la página.`, estado: actual.estado }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
