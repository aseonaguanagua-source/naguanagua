// Reporte de MULTAS por mes: qué meses de multa (mora) debe cada usuario,
// separado en (1) unidades DENTRO de condominio y (2) contribuyentes individuales.
// Usa exactamente las mismas reglas de cobro que Caja y la Caja de Condominios.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from '@/lib/adminSession';
import { generarReporteMultas } from '@/lib/reporteMultas';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const tok = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!tok || !verifySession(tok)) return NextResponse.json({ error: 'Sesión requerida' }, { status: 401 });
  try {
    return NextResponse.json(await generarReporteMultas());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
