import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariantsExact, isFictitiousEmail, formatPhoneNumber } from '@/lib/formatters';
import { checkPortalMantenimiento, MENSAJE_MANTENIMIENTO_PORTAL } from '@/lib/portalConfig';

export async function POST(request: Request) {
  try {
    const { identidad, correo, telefono, clave, devPass } = await request.json();

    if (devPass !== '1756762' && (await checkPortalMantenimiento())) {
      return NextResponse.json({ error: MENSAJE_MANTENIMIENTO_PORTAL, mantenimiento: true }, { status: 503 });
    }
    
    if (!identidad || !correo || !telefono || !clave) {
      return NextResponse.json({ error: 'Todos los campos son obligatorios: Correo, Teléfono y Contraseña.' }, { status: 400 });
    }

    const cleanEmail = correo.trim().toLowerCase();
    const cleanPhone = formatPhoneNumber(telefono);

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return NextResponse.json({ error: 'Ingrese un correo electrónico válido.' }, { status: 400 });
    }

    if (isFictitiousEmail(cleanEmail)) {
      return NextResponse.json({ error: 'No se permiten correos ficticios o de prueba.' }, { status: 400 });
    }

    if (!cleanPhone || cleanPhone.length < 7) {
      return NextResponse.json({ error: 'Ingrese un número telefónico válido (mínimo 7 dígitos).' }, { status: 400 });
    }

    if (clave.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    const userVariants = getIdentidadVariantsExact(identidad);
    const orFilter = userVariants.map(v => `identidad.eq.${v}`).join(',');

    // 1. Actualizar todos los inmuebles de este contribuyente
    const { data, error } = await supabase
      .from('inmuebles')
      .update({ 
        clave_portal: clave,
        correo_electronico: cleanEmail,
        telefono: cleanPhone
      })
      .or(orFilter)
      .select('contribuyente, cod_cont, identidad');

    if (error) {
      console.error("Supabase Error en setup inmuebles:", error);
      return NextResponse.json({ error: 'Error al actualizar base de datos' }, { status: 500 });
    }

    // 2. Actualizar también la tabla de contribuyentes
    await supabase
      .from('contribuyentes')
      .update({
        email: cleanEmail,
        telefono: cleanPhone,
        clave_portal: clave
      })
      .or(orFilter);

    // 3. Actualizar también en condominio_unidades si existe
    await supabase
      .from('condominio_unidades')
      .update({
        correo: cleanEmail,
        telefono: cleanPhone
      })
      .or(orFilter);

    if (data && data.length > 0) {
      return NextResponse.json({ 
        status: 'success',
        nombre: data[0].contribuyente, 
        codigo: data[0].cod_cont,
        identidad: data[0].identidad
      });
    } else {
      // Si no encontró en inmuebles, verificar si existe en contribuyentes
      const { data: contribData } = await supabase
        .from('contribuyentes')
        .select('nombre, identidad')
        .or(orFilter)
        .limit(1);

      if (contribData && contribData.length > 0) {
        return NextResponse.json({
          status: 'success',
          nombre: contribData[0].nombre,
          codigo: contribData[0].identidad,
          identidad: contribData[0].identidad
        });
      }

      // O en condominio_unidades
      const { data: condoData } = await supabase
        .from('condominio_unidades')
        .select('propietario, identidad, inmueble')
        .or(orFilter)
        .limit(1);

      if (condoData && condoData.length > 0) {
        return NextResponse.json({
          status: 'success',
          nombre: condoData[0].propietario,
          codigo: condoData[0].inmueble || condoData[0].identidad,
          identidad: condoData[0].identidad
        });
      }

      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}
