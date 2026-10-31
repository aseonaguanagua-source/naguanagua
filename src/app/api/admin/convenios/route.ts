import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const identidad = url.searchParams.get('identidad');
    const codigo = url.searchParams.get('codigo');

    let query = supabase
      .from('convenios_pago')
      .select('*, convenios_cuotas(*)')
      .order('created_at', { ascending: false });

    if (identidad || codigo) {
      const idClean = (identidad || '').replace(/\D/g, '');
      const codClean = (codigo || '').replace(/\D/g, '');
      const filters: string[] = [];
      if (idClean.length >= 4) {
        filters.push(`identidad.ilike.%${idClean}%`);
        filters.push(`numero.ilike.%${idClean}%`);
      }
      if (codClean.length >= 2) {
        filters.push(`numero.ilike.%${codClean}%`);
      }
      if (codigo && codigo.length >= 3) {
        filters.push(`numero.ilike.%${codigo}%`);
      }
      if (filters.length > 0) {
        query = query.or(filters.join(','));
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching convenios_pago in API:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err: any) {
    console.error('API convenios GET error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      convId,
      nroConvenio,
      identidad,
      contribuyente,
      montoTotal,
      cuotas,
      docUrl,
      listaCuotas,
      inmueblesUpdates,
      facturasReferencias,
      tasaAplicada
    } = body;

    if (!identidad || !montoTotal || !cuotas) {
      return NextResponse.json({ ok: false, error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const finalConvId = convId || crypto.randomUUID();
    const finalNro = nroConvenio || `CONV-${Date.now().toString().slice(-6)}`;

    // Verificar si ya existe por id o número
    const { data: existing } = await supabase
      .from('convenios_pago')
      .select('id, numero')
      .or(`id.eq.${finalConvId},numero.eq.${finalNro}`)
      .maybeSingle();

    let targetConvId = finalConvId;

    if (existing) {
      targetConvId = existing.id;
      const { error: updErr } = await supabase.from('convenios_pago').update({
        monto_total: parseFloat(montoTotal) || 0,
        cuotas: parseInt(cuotas) || 1,
        estado: 'Al Día'
      }).eq('id', existing.id);

      if (updErr) {
        console.error('Error actualizando convenios_pago:', updErr);
        return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
      }

      // Eliminar cuotas anteriores para reemplazarlas
      await supabase.from('convenios_cuotas').delete().eq('convenio_id', existing.id);
    } else {
      const { error: convErr } = await supabase.from('convenios_pago').insert({
        id: finalConvId,
        numero: finalNro,
        identidad: identidad,
        monto_total: parseFloat(montoTotal) || 0,
        cuotas: parseInt(cuotas) || 1,
        estado: 'Al Día',
        inicial: 0
      });

      if (convErr) {
        console.error('Error insertando en convenios_pago:', convErr);
        return NextResponse.json({ ok: false, error: convErr.message }, { status: 500 });
      }
    }

    // 2. Insertar cuotas en convenios_cuotas
    if (Array.isArray(listaCuotas) && listaCuotas.length > 0) {
      const cuotasPayload = listaCuotas.map((c: any) => ({
        id: crypto.randomUUID(),
        convenio_id: targetConvId,
        fecha: c.fecha,
        monto: parseFloat(c.monto) || 0,
        estado: 'Pendiente'
      }));

      const { error: cuotasErr } = await supabase.from('convenios_cuotas').insert(cuotasPayload);
      if (cuotasErr) {
        console.error('Error insertando en convenios_cuotas:', cuotasErr);
      }
    }

    // 3. Actualizar inmuebles (guardando foto de deuda previa para poder restaurar si se anula el convenio)
    const deudaPreviaInmuebles: any[] = [];
    if (Array.isArray(inmueblesUpdates) && inmueblesUpdates.length > 0) {
      const idsInm = inmueblesUpdates.map((u: any) => u.id).filter(Boolean);
      const { data: prevInms } = idsInm.length > 0
        ? await supabase.from('inmuebles').select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, notas').in('id', idsInm)
        : { data: [] as any[] };
      const prevMap = new Map((prevInms || []).map((p: any) => [p.id, p]));

      for (const upd of inmueblesUpdates) {
        if (!upd.id) continue;
        const pInm = prevMap.get(upd.id);
        if (pInm) {
          deudaPreviaInmuebles.push({
            id: pInm.id,
            inmueble: pInm.inmueble,
            meses_deuda: pInm.meses_deuda ?? 0,
            deuda_mmv: pInm.deuda_mmv ?? 0,
            multa_bs: pInm.multa_bs ?? 0,
          });
        }
        const tagPrev = pInm ? ` [PRE_CONV:${pInm.meses_deuda ?? 0}:${pInm.deuda_mmv ?? 0}]` : '';
        await supabase
          .from('inmuebles')
          .update({
            deuda_mmv: 0,
            meses_deuda: 0,
            deuda_congelada_bs: upd.deuda_congelada_bs,
            notas: `Convenio de Pago ${finalNro} (${cuotas} cuotas por Bs. ${montoTotal})${tagPrev}`
          })
          .eq('id', upd.id);
      }
    }

    // 4. Actualizar facturas pendientes asociadas
    if (Array.isArray(facturasReferencias) && facturasReferencias.length > 0) {
      await supabase
        .from('facturas')
        .update({ estado: 'Refinanciado' })
        .in('referencia', facturasReferencias);
    }

    // 5. Registrar auditoría
    try {
      await supabase.from('auditoria').insert({
        accion: 'Convenio de Pago Creado',
        modulo: 'CONVENIO',
        usuario: 'ADMIN',
        detalles: {
          nro_convenio: finalNro,
          identidad,
          contribuyente,
          monto_congelado: montoTotal,
          cuotas,
          tasa_bcv: tasaAplicada,
          deuda_previa_inmuebles: deudaPreviaInmuebles,
          facturas_refinanciadas: facturasReferencias || []
        }
      });
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      id: finalConvId,
      numero: finalNro,
      message: 'Convenio creado y deuda congelada exitosamente.'
    });
  } catch (err: any) {
    console.error('API convenios POST error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const numero = searchParams.get('numero');

    if (!id && !numero) {
      return NextResponse.json({ ok: false, error: 'Falta id o número de convenio' }, { status: 400 });
    }

    let query = supabase.from('convenios_pago').select('*');
    if (id) query = query.eq('id', id);
    else if (numero) query = query.eq('numero', numero);
    const { data: conv, error: cErr } = await query.maybeSingle();

    if (!conv) {
      return NextResponse.json({ ok: false, error: 'Convenio no encontrado' }, { status: 404 });
    }

    // 1. Marcar convenio como Anulado
    await supabase.from('convenios_pago').update({ estado: 'Anulado' }).eq('id', conv.id);

    // 2. Marcar cuotas pendientes como Anuladas
    await supabase
      .from('convenios_cuotas')
      .update({ estado: 'Anulada' })
      .eq('convenio_id', conv.id)
      .eq('estado', 'Pendiente');

    // 3. Descongelar y restaurar deuda original en inmuebles y facturas asociadas
    if (conv.identidad) {
      const { data: inms } = await supabase
        .from('inmuebles')
        .select('id, inmueble, notas, deuda_congelada_bs, meses_deuda, deuda_mmv, mmv_mes')
        .eq('identidad', conv.identidad);

      if (inms && inms.length > 0) {
        for (const inm of inms) {
          const mPrev = String(inm.notas || '').match(/\[PRE_CONV:(\d+):([\d.]+)\]/);
          const restoredMeses = mPrev ? parseInt(mPrev[1], 10) : Math.max(1, parseInt(String(inm.meses_deuda || 1)));
          const restoredMmv = mPrev
            ? parseFloat(mPrev[2])
            : (parseFloat(String(inm.deuda_mmv || 0)) || parseFloat(((parseFloat(String(inm.mmv_mes || 0)) || 0) * restoredMeses).toFixed(6)));
          const notasActuales = (inm.notas || '')
            .replace(/\[PRE_CONV:[^\]]*\]/gi, '')
            .replace(/Convenio de Pago[^\n;.]*/gi, '')
            .trim();
          await supabase
            .from('inmuebles')
            .update({
              deuda_congelada_bs: 0,
              meses_deuda: restoredMeses,
              deuda_mmv: restoredMmv,
              notas: notasActuales ? `${notasActuales} (Convenio ${conv.numero} Anulado)` : `Convenio ${conv.numero} Anulado`
            })
            .eq('id', inm.id);
        }
      }

      // Restaurar facturas refinanciadas de este contribuyente a Pendiente
      await supabase
        .from('facturas')
        .update({ estado: 'Pendiente' })
        .eq('identidad', conv.identidad)
        .eq('estado', 'Refinanciado');
    }

    // 4. Auditoria
    try {
      await supabase.from('auditoria').insert({
        accion: 'Convenio de Pago Anulado',
        modulo: 'CONVENIO',
        usuario: 'ADMIN',
        detalles: {
          id: conv.id,
          numero: conv.numero,
          identidad: conv.identidad,
          monto_total: conv.monto_total
        }
      });
    } catch (_) {}

    return NextResponse.json({ ok: true, message: `Convenio ${conv.numero} desactivado exitosamente.` });
  } catch (err: any) {
    console.error('API convenios DELETE error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
