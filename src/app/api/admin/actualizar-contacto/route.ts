import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getIdentidadVariants } from '@/lib/formatters';

export async function POST(request: Request) {
  try {
    const { identidad, email, telefono, inmueble_ids, nombre } = await request.json();

    const cleanEmail = (email || '').toString().trim().toLowerCase();
    const cleanPhone = (telefono || '').toString().trim();
    const cleanIdent = (identidad || '').toString().trim();

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
    }

    const variants = getIdentidadVariants(cleanIdent);
    if (cleanIdent && !variants.includes(cleanIdent)) {
      variants.push(cleanIdent);
    }
    const cleanNoHyphen = cleanIdent.replace(/-/g, '');
    if (cleanNoHyphen && !variants.includes(cleanNoHyphen)) {
      variants.push(cleanNoHyphen);
    }

    // 1. Actualizar tabla inmuebles por IDs específicos de la consulta
    if (Array.isArray(inmueble_ids) && inmueble_ids.length > 0) {
      const validIds = inmueble_ids.filter(Boolean);
      if (validIds.length > 0) {
        const updatePayload: any = { correo_electronico: cleanEmail };
        if (cleanPhone) updatePayload.telefono = cleanPhone;
        await supabaseAdmin
          .from('inmuebles')
          .update(updatePayload)
          .in('id', validIds);
      }
    }

    // 2. Actualizar todos los inmuebles que coincidan con la cédula/RIF
    if (variants.length > 0) {
      const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');
      const updatePayload: any = { correo_electronico: cleanEmail };
      if (cleanPhone) updatePayload.telefono = cleanPhone;

      await supabaseAdmin
        .from('inmuebles')
        .update(updatePayload)
        .or(orFilter);
    }

    // 3. Actualizar o insertar en tabla contribuyentes
    let contribUpdated = false;
    if (variants.length > 0) {
      const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');
      const { data: existingContrib } = await supabaseAdmin
        .from('contribuyentes')
        .select('id, identidad')
        .or(orFilter)
        .limit(1)
        .maybeSingle();

      if (existingContrib) {
        const updatePayload: any = { email: cleanEmail };
        if (cleanPhone) updatePayload.telefono = cleanPhone;

        const { error: cErr } = await supabaseAdmin
          .from('contribuyentes')
          .update(updatePayload)
          .eq('id', existingContrib.id);

        if (!cErr) contribUpdated = true;
      } else {
        // Si no existe en la tabla contribuyentes, crearlo para asegurar persistencia permanente
        const { error: iErr } = await supabaseAdmin
          .from('contribuyentes')
          .insert([{
            identidad: cleanIdent,
            nombre: nombre || 'Contribuyente',
            email: cleanEmail,
            telefono: cleanPhone || null
          }]);

        if (!iErr) contribUpdated = true;
      }
    }

    return NextResponse.json({
      ok: true,
      email: cleanEmail,
      telefono: cleanPhone,
      identidad: cleanIdent,
      contribUpdated
    });
  } catch (err: any) {
    console.error('[actualizar-contacto error]', err);
    return NextResponse.json({ error: err.message || 'Error en el servidor' }, { status: 500 });
  }
}
