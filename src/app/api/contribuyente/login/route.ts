import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIdentidadVariants, isFictitiousEmail } from "@/lib/formatters";
import { PORTAL_EN_MANTENIMIENTO, MENSAJE_MANTENIMIENTO_PORTAL } from "@/lib/portalConfig";

export async function POST(request: Request) {
  if (PORTAL_EN_MANTENIMIENTO) {
    return NextResponse.json({ error: MENSAJE_MANTENIMIENTO_PORTAL, mantenimiento: true }, { status: 503 });
  }
  try {
    const { identidad, clave, primerIngreso } = await request.json();

    if (!identidad || identidad.length < 2) {
      return NextResponse.json({ error: "Identidad requerida" }, { status: 400 });
    }

    const variantes = getIdentidadVariants(identidad);
    const orFilter = variantes.map(v => `identidad.eq.${v}`).join(',');

    // Buscar en inmuebles
    const { data: records, error } = await supabase
      .from("inmuebles")
      .select("contribuyente, cod_cont, clave_portal, identidad, correo_electronico, telefono")
      .or(orFilter)
      .limit(1);

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
    }

    // También buscar en contribuyentes
    const { data: contribRecs } = await supabase
      .from("contribuyentes")
      .select("nombre, identidad, email, telefono")
      .or(orFilter)
      .limit(1);

    const contribRec = contribRecs && contribRecs.length > 0 ? contribRecs[0] : null;

    if ((!records || records.length === 0) && !contribRec) {
      return NextResponse.json(
        { error: "Usuario no registrado. Verifique el tipo y número de cédula o RIF ingresado." },
        { status: 404 }
      );
    }

    const user = records && records.length > 0 ? records[0] : {
      contribuyente: contribRec?.nombre,
      cod_cont: contribRec?.identidad,
      clave_portal: null,
      identidad: contribRec?.identidad,
      correo_electronico: contribRec?.email,
      telefono: contribRec?.telefono
    };

    // Si el usuario viene por botón "Primer Ingreso" o no tiene clave asignada
    if (primerIngreso || !user.clave_portal) {
      return NextResponse.json({
        status: "setup_required",
        nombre: user.contribuyente,
        codigo: user.cod_cont || user.identidad,
        identidad: user.identidad,
        message: "Primer ingreso: por favor actualice su correo, teléfono y configure su contraseña."
      });
    }

    // Verificar contraseña
    if (user.clave_portal === clave) {
      const email = user.correo_electronico || contribRec?.email;
      const phone = user.telefono || contribRec?.telefono;
      const hasValidEmail = email && !isFictitiousEmail(email);
      const hasValidPhone = phone && String(phone).replace(/\D/g, '').length >= 7;

      // Si le falta correo o teléfono válido, exigir actualización antes de avanzar
      if (!hasValidEmail || !hasValidPhone) {
        return NextResponse.json({
          status: "setup_required",
          nombre: user.contribuyente,
          codigo: user.cod_cont || user.identidad,
          identidad: user.identidad,
          correo: hasValidEmail ? email : '',
          telefono: hasValidPhone ? phone : '',
          message: "Para continuar, debe actualizar su correo electrónico y número de teléfono."
        });
      }

      return NextResponse.json({
        status: "success",
        nombre: user.contribuyente,
        codigo: user.cod_cont || user.identidad,
        identidad: user.identidad
      });
    } else {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }

  } catch {
    return NextResponse.json({ error: "Error en servidor" }, { status: 500 });
  }
}