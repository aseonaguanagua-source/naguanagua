import { NextResponse } from 'next/server';

/**
 * GET /api/bcv/historico?fecha=YYYY-MM-DD
 * Tasa oficial BCV del Euro vigente para una fecha: la publicada con "fecha valor"
 * igual o anterior a la fecha pedida (fines de semana y feriados toman la del último día hábil).
 * Fuente: histórico oficial de DolarAPI (replica las publicaciones del BCV).
 */
export const dynamic = 'force-dynamic';

type Reg = { fecha: string; promedio: number };

let cache: { at: number; data: Reg[] } | null = null;

async function historico(): Promise<Reg[]> {
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
  const res = await fetch('https://ve.dolarapi.com/v1/historicos/euros/oficial', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Histórico no disponible (${res.status})`);
  const json = await res.json();
  const data: Reg[] = (Array.isArray(json) ? json : [])
    .filter((r: any) => r && r.fecha && Number(r.promedio) > 0 && (!r.fuente || r.fuente === 'oficial'))
    .map((r: any) => ({ fecha: String(r.fecha).slice(0, 10), promedio: Number(r.promedio) }))
    .sort((a: Reg, b: Reg) => a.fecha.localeCompare(b.fecha));
  cache = { at: Date.now(), data };
  return data;
}

export async function GET(req: Request) {
  const fecha = new URL(req.url).searchParams.get('fecha') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ success: false, error: 'Fecha inválida (use AAAA-MM-DD)' }, { status: 400 });
  }
  try {
    const data = await historico();
    let reg: Reg | null = null;
    for (const r of data) {
      if (r.fecha <= fecha) reg = r;
      else break;
    }
    if (!reg) return NextResponse.json({ success: false, error: 'No hay tasa publicada para esa fecha' }, { status: 404 });
    return NextResponse.json({ success: true, fecha_solicitada: fecha, fecha_valor: reg.fecha, euro: reg.promedio });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Error consultando la tasa' }, { status: 502 });
  }
}
