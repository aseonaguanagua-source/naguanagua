import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const [usdRes, eurRes] = await Promise.all([
      fetch("https://ve.dolarapi.com/v1/dolares/oficial", { cache: "no-store" }),
      fetch("https://ve.dolarapi.com/v1/euros/oficial", { cache: "no-store" })
    ]);
    if (!usdRes.ok || !eurRes.ok) throw new Error("Error obteniendo tasas");
    const eurData = await eurRes.json();
    const usdData = await usdRes.json();
    const tcmmv = parseFloat(eurData?.promedio) || 0;
    const tasa_usd = parseFloat(usdData?.promedio) || 0;
    if (tcmmv <= 0) return NextResponse.json({ error: "Tasa invalida", tcmmv }, { status: 422 });

    const ahora = new Date();
    const semana = getISOWeek(ahora);
    const anio = ahora.getFullYear();
    const fechaRegistro = ahora.toISOString();

    const { data: existing } = await supabase.from("ucd_historial").select("id").eq("semana", semana).eq("anio", anio).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, msg: `UCD semana ${semana}/${anio} ya existe.`, semana, anio });
    }

    const { error: insertError } = await supabase.from("ucd_historial").insert([{
      semana, anio, tcmmv, tasa_usd, fecha_registro: fechaRegistro, origen: "cron-semanal"
    }]);

    if (insertError) {
      await supabase.from("sistema_config").upsert([{
        clave: `ucd_semana_${anio}_${semana}`,
        valor: String(tcmmv),
        descripcion: `UCD Semana ${semana} del ${anio} - ${fechaRegistro}`,
        updated_at: fechaRegistro
      }], { onConflict: "clave" });
    }

    return NextResponse.json({ ok: true, semana, anio, tcmmv, tasa_usd, fecha_registro: fechaRegistro });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
