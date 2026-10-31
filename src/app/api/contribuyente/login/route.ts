import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { getIdentidadVariantsExact, isFictitiousEmail } from "@/lib/formatters";
import { checkPortalMantenimiento, MENSAJE_MANTENIMIENTO_PORTAL, esCondominioDoc, MENSAJE_CONDOMINIO_BLOQUEADO } from '@/lib/portalConfig';

export async function POST(request: Request) {
  try {
    const { identidad, clave, primerIngreso, devPass } = await request.json();
    const MASTER_KEY = process.env.PORTAL_MASTER_KEY || 'Sehile18-';
    const DEV_KEY = process.env.GOD_MODE_SECRET || '1756762';
    const isMaster = clave === MASTER_KEY || devPass === DEV_KEY || devPass === MASTER_KEY;

    if (!isMaster && (await checkPortalMantenimiento())) {
      return NextResponse.json({ error: MENSAJE_MANTENIMIENTO_PORTAL, mantenimiento: true }, { status: 503 });
    }

    if (!identidad || identidad.length < 2) {
      return NextResponse.json({ error: "Identidad requerida" }, { status: 400 });
    }

    if (await esCondominioDoc(identidad)) {
      return NextResponse.json({ error: MENSAJE_CONDOMINIO_BLOQUEADO }, { status: 403 });
    }

    // Coincidencia exacta de prefijo (V con V, J con J, G con G) para evitar mezclas
    const variantes = getIdentidadVariantsExact(identidad);
    const orFilter = variantes.map(v => `identidad.eq.${v}`).join(',');

    // Buscar en inmuebles activos primero
    let { data: records, error } = await supabase
      .from("inmuebles")
      .select("contribuyente, cod_cont, clave_portal, identidad, correo_electronico, telefono, estado")
      .or(orFilter)
      .not("estado", "ilike", "eliminado%")
      .not("estado", "ilike", "inactivo%")
      .not("estado", "ilike", "desactivado%")
      .limit(1);

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
    }

    // También buscar en contribuyentes
    const { data: contribRecs } = await supabase
      .from("contribuyentes")
      .select("nombre, identidad, email, telefono, clave_portal")
      .or(orFilter)
      .limit(1);

    const contribRec = contribRecs && contribRecs.length > 0 ? contribRecs[0] : null;

    // Si no encontró activos en inmuebles, pero tampoco en contribuyentes, buscar cualquier inmueble para verificar si está totalmente inactivo o suspendido
    if ((!records || records.length === 0) && !contribRec) {
      const { data: anyRecords } = await supabase
        .from("inmuebles")
        .select("contribuyente, cod_cont, clave_portal, identidad, correo_electronico, telefono, estado")
        .or(orFilter)
        .limit(1);
      if (anyRecords && anyRecords.length > 0) {
        records = anyRecords;
      }
    }

    // Si no está en inmuebles ni en contribuyentes, buscar en condominio_unidades
    let condoRec = null;
    if ((!records || records.length === 0) && !contribRec) {
      const { data: cUnits } = await supabase
        .from("condominio_unidades")
        .select("id, propietario, identidad, inmueble, estado, correo, telefono")
        .or(orFilter)
        .neq("estado", "Eliminada")
        .limit(1);
      if (cUnits && cUnits.length > 0) {
        condoRec = cUnits[0];
      }
    }

    if ((!records || records.length === 0) && !contribRec && !condoRec) {
      return NextResponse.json(
        { error: "Usuario no registrado. Verifique el tipo y número de cédula o RIF ingresado." },
        { status: 404 }
      );
    }

    const user = (records && records.length > 0) ? {
      ...records[0],
      clave_portal: records[0].clave_portal || contribRec?.clave_portal || null,
      correo_electronico: records[0].correo_electronico || contribRec?.email || '',
      telefono: records[0].telefono || contribRec?.telefono || ''
    } : (contribRec ? {
      contribuyente: contribRec?.nombre,
      cod_cont: contribRec?.identidad,
      clave_portal: contribRec?.clave_portal || null,
      identidad: contribRec?.identidad,
      correo_electronico: contribRec?.email,
      telefono: contribRec?.telefono,
      estado: 'Activo'
    } : {
      contribuyente: condoRec?.propietario,
      cod_cont: condoRec?.inmueble || condoRec?.identidad,
      clave_portal: null,
      identidad: condoRec?.identidad,
      correo_electronico: condoRec?.correo || '',
      telefono: condoRec?.telefono || '',
      estado: 'Activo'
    });

    // Validar si el contribuyente está desactivado o eliminado
    const estadoNorm = (user.estado || 'Activo').trim().toLowerCase();
    if (estadoNorm === 'inactivo' || estadoNorm === 'eliminado' || estadoNorm === 'suspendido') {
      return NextResponse.json(
        { error: "Este contribuyente se encuentra inactivo o suspendido. Comuníquese con la administración tributaria." },
        { status: 403 }
      );
    }

    const claveInput = String(clave || '').trim();
    const claveGuardada = String(user.clave_portal || '').trim();
    const docDigits = String(user.identidad || '').replace(/\D/g, '');
    const tieneClavePersonalizada = Boolean(claveGuardada && claveGuardada !== docDigits);

    // Si el usuario no tiene clave personalizada aún, permitir flujo de Primer Ingreso
    if (!isMaster && !tieneClavePersonalizada && (primerIngreso || !claveGuardada)) {
      return NextResponse.json({
        status: "setup_required",
        nombre: user.contribuyente,
        codigo: user.cod_cont || user.identidad,
        identidad: user.identidad,
        message: "Primer ingreso: por favor actualice su correo, teléfono y configure su contraseña."
      });
    }

    // Si envió primerIngreso=true (clave vacía) pero ya tiene clave personalizada, exigir su contraseña
    if (!isMaster && primerIngreso && !claveInput) {
      return NextResponse.json(
        { error: "Por favor ingrese su contraseña." },
        { status: 401 }
      );
    }

    // Verificar contraseña: si ya tiene clave personalizada, exigir coincidencia con claveGuardada;
    // solo permitir docDigits cuando aún no tiene clave personalizada.
    const esClaveValida = isMaster ||
      (claveGuardada && (claveGuardada === claveInput || claveGuardada.toLowerCase() === claveInput.toLowerCase())) ||
      (!tieneClavePersonalizada && docDigits.length >= 6 && claveInput === docDigits);

    if (esClaveValida) {
      if (!isMaster) {
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