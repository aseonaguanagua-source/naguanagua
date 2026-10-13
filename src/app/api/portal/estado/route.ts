import { NextResponse } from 'next/server';
import { checkPortalMantenimiento } from '@/lib/portalConfig';

export const dynamic = 'force-dynamic';

/** Estado GLOBAL del portal Soy Contribuyente (interruptor del Modo Desarrollador → system_config). */
export async function GET() {
  const mantenimiento = await checkPortalMantenimiento();
  return NextResponse.json({ mantenimiento }, { headers: { 'Cache-Control': 'no-store' } });
}
