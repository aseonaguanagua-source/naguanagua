import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { obtenerHistorialPagosMultasYPeriodos } from '@/lib/multasPagadas';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { codigo, inmueble, unidad_id, periodos_custom, usuario, motivo } = await req.json();
    const u = String(usuario || 'Administrador').trim();
    if (String(motivo || '').trim().length < 5) {
      return NextResponse.json({ error: 'Escriba un motivo de al menos 5 caracteres.' }, { status: 400 });
    }

    // 1. Encontrar el inmueble
    let inmCode = inmueble;
    if (!inmCode && unidad_id) {
      const { data: uData } = await sb.from('condominio_unidades').select('inmueble').eq('id', unidad_id).maybeSingle();
      if (uData?.inmueble) inmCode = uData.inmueble;
    }

    if (!inmCode) {
      return NextResponse.json({ error: 'Código de inmueble no especificado.' }, { status: 400 });
    }

    // 2. Cargar notas actuales de inmuebles
    const { data: inm } = await sb.from('inmuebles').select('notas, contribuyente, actividad_principal').eq('inmueble', inmCode).limit(1).maybeSingle();
    let existingNotas: any = {};
    try {
      if (inm?.notas) {
        existingNotas = typeof inm.notas === 'string' ? JSON.parse(inm.notas) : inm.notas;
        if (typeof existingNotas !== 'object' || existingNotas === null) existingNotas = { texto_previo: String(inm.notas) };
      }
    } catch {
      if (inm?.notas) existingNotas = { texto_previo: String(inm.notas) };
    }

    const normalizedPeriodos: Record<string, any> = {};
    const historialPagos = await obtenerHistorialPagosMultasYPeriodos({
      inmueble: inmCode,
      unidad_id: unidad_id || null,
      codigo_condominio: codigo || null,
    });

    if (periodos_custom && typeof periodos_custom === 'object') {
      for (const [k, v] of Object.entries(periodos_custom) as [string, any][]) {
        if (v && typeof v === 'object') {
          const yaPagado = Boolean(historialPagos.porPeriodo[k]);
          const sinM = yaPagado || v.lleva_multa === false || v.exonerar_multa === true;
          normalizedPeriodos[k] = {
            ...v,
            lleva_multa: !sinM,
            exonerar_multa: sinM,
            ...(yaPagado
              ? {
                  referencia_pago: historialPagos.porPeriodo[k].referencia,
                  estado_pago: historialPagos.porPeriodo[k].etiqueta,
                }
              : {}),
          };
        }
      }
    }

    existingNotas.periodos_custom = normalizedPeriodos;

    // Verificar si todos los períodos con mora quedaron sin multa
    const entries = Object.entries(normalizedPeriodos).sort(([a], [b]) => a.localeCompare(b));
    const periodosMora = entries.length > 1 ? entries.slice(0, -1) : entries;
    const todosSinMulta = entries.length > 0 && periodosMora.every(([_, v]) => v.exonerar_multa === true || v.lleva_multa === false);

    // Actualizar inmuebles
    const inmUpd: any = {
      notas: JSON.stringify(existingNotas)
    };
    if (todosSinMulta) {
      inmUpd.multa_bs = 0;
    }

    const { error: errInm } = await sb.from('inmuebles').update(inmUpd).eq('inmueble', inmCode);

    if (errInm) return NextResponse.json({ error: errInm.message }, { status: 500 });

    // Sincronizar también en condominio_unidades y condominio_multas
    try {
      if (todosSinMulta) {
        const { data: uRows } = await sb.from('condominio_unidades')
          .update({ multa_meses: 0, multa_exonerada_hasta: '2099-12-31' })
          .eq('inmueble', inmCode)
          .select('id');
        if (uRows && uRows.length > 0) {
          const uIds = uRows.map((r: any) => r.id);
          await sb.from('condominio_multas')
            .update({ estado: 'Anulada' })
            .in('unidad_id', uIds)
            .eq('estado', 'Pendiente');
        }
      } else if (entries.some(([_, v]) => v.lleva_multa === true && v.exonerar_multa === false)) {
        const conMultaCount = periodosMora.filter(([_, v]) => v.lleva_multa === true).length;
        await sb.from('condominio_unidades')
          .update({ multa_meses: conMultaCount, multa_exonerada_hasta: null })
          .eq('inmueble', inmCode);
      }
    } catch (syncErr) {
      console.warn('Advertencia sincronizando periodos_custom con condominio_unidades:', syncErr);
    }

    // 3. Registrar en Auditoría
    await sb.from('auditoria').insert({
      accion: 'Ajuste de actividad y multas por mes',
      usuario: u,
      detalles: {
        _categoria: 'CONDOMINIOS',
        criticidad: 'ALTA',
        codigo,
        inmueble: inmCode,
        motivo: String(motivo).trim(),
        periodos_modificados: Object.keys(periodos_custom || {}).length
      }
    });

    return NextResponse.json({ ok: true, periodos_custom });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error en el servidor' }, { status: 500 });
  }
}
