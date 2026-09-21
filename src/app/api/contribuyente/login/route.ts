import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { identidad, clave } = await request.json();

    if (!identidad || identidad.length < 2) {
      return NextResponse.json({ error: "Identidad requerida" }, { status: 400 });
    }

    // Normalizar: quitar guiones, uppercase -> "V12345678" o "191753720"
    const idNorm = identidad.replace(/-/g, "").toUpperCase().trim();
    // Solo agregar guion formateado si el primer caracter ES una letra (V, J, E, G, P, C)
    const primeraEsLetra = /^[A-Z]/.test(idNorm);
    const idFormateado = primeraEsLetra ? `${idNorm.charAt(0)}-${idNorm.slice(1)}` : null;
    // Armar todas las variantes a buscar (sin duplicados)
    const variantes = [idNorm, identidad.toUpperCase().trim()];
    if (idFormateado) variantes.push(idFormateado);
    const orFilter = [...new Set(variantes)].map(v => `identidad.eq.${v}`).join(',');

    // Buscar por todas las variantes de identidad
    const { data: records, error } = await supabase
      .from("inmuebles")
      .select("contribuyente, cod_cont, clave_portal, identidad")
      .or(orFilter)
      .limit(1);

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json(
        { error: "Usuario no registrado. Verifique el tipo y numero de cedula ingresado." },
        { status: 404 }
      );
    }

    const user = records[0];

    // Si no tiene clave_portal asignada, requiere setup inicial
    if (!user.clave_portal) {
      return NextResponse.json({
        status: "setup_required",
        nombre: user.contribuyente,
        codigo: user.cod_cont
      });
    }

    // Verificar contrasena
    if (user.clave_portal === clave) {
      return NextResponse.json({
        status: "success",
        nombre: user.contribuyente,
        codigo: user.cod_cont
      });
    } else {
      return NextResponse.json({ error: "Contrasena incorrecta" }, { status: 401 });
    }

  } catch {
    return NextResponse.json({ error: "Error en servidor" }, { status: 500 });
  }
}