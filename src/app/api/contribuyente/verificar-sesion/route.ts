import { NextResponse } from "next/server";
import { esCondominioDoc, MENSAJE_CONDOMINIO_BLOQUEADO } from "@/lib/portalConfig";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const doc = searchParams.get('doc');
    if (doc) {
      const bloqueado = await esCondominioDoc(doc);
      if (bloqueado) {
        return NextResponse.json({
          bloqueado: true,
          error: MENSAJE_CONDOMINIO_BLOQUEADO
        });
      }
    }
    return NextResponse.json({ bloqueado: false });
  } catch (err: any) {
    return NextResponse.json({ bloqueado: false });
  }
}

