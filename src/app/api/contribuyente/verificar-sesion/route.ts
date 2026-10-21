import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { getIdentidadVariantsExact } from "@/lib/formatters";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ bloqueado: false });
  } catch (err: any) {
    return NextResponse.json({ bloqueado: false });
  }
}
