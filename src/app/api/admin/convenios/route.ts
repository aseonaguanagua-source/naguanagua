import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('convenios_pago')
      .select('*, convenios_cuotas(*)')
      .order('created_at', { ascending: false });

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

    // 1. Insertar en convenios_pago
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

    // 2. Insertar cuotas en convenios_cuotas
    if (Array.isArray(listaCuotas) && listaCuotas.length > 0) {
      const cuotasPayload = listaCuotas.map((c: any) => ({
        id: crypto.randomUUID(),
        convenio_id: finalConvId,
        fecha: c.fecha,
        monto: parseFloat(c.monto) || 0,
        estado: 'Pendiente'
      }));

      const { error: cuotasErr } = await supabase.from('convenios_cuotas').insert(cuotasPayload);
      if (cuotasErr) {
        console.error('Error insertando en convenios_cuotas:', cuotasErr);
      }
    }

    // 3. Actualizar inmuebles
    if (Array.isArray(inmueblesUpdates) && inmueblesUpdates.length > 0) {
      for (const upd of inmueblesUpdates) {
        if (!upd.id) continue;
        await supabase
          .from('inmuebles')
          .update({
            deuda_mmv: 0,
            meses_deuda: 0,
            deuda_congelada_bs: upd.deuda_congelada_bs,
            notas: `Convenio de Pago ${finalNro} (${cuotas} cuotas por Bs. ${montoTotal})`
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
          tasa_bcv: tasaAplicada
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
