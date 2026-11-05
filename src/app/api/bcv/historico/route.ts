import { NextResponse } from 'next/server';
import { getTasaBCV } from '@/services/bcv';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/bcv/historico?fecha=YYYY-MM-DD
 * Tasa oficial BCV del Euro vigente para una fecha: la publicada con "fecha valor"
 * igual o anterior a la fecha pedida (fines de semana y feriados toman la del último día hábil).
 * Fuente: histórico oficial de DolarAPI (replica las publicaciones del BCV) + BCV directo.
 */
export const dynamic = 'force-dynamic';

type Reg = { fecha: string; promedio: number };

let cache: { at: number; data: Reg[] } | null = null;

async function historico(): Promise<Reg[]> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
  const res = await fetch('https://ve.dolarapi.com/v1/historicos/euros/oficial', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Histórico no disponible (${res.status})`);
  const json = await res.json();
  const data: Reg[] = (Array.isArray(json) ? json : [])
    .filter((r: any) => r && r.fecha && Number(r.promedio) > 0 && (!r.fuente || r.fuente === 'oficial'))
    .map((r: any) => {
      let prom = Number(r.promedio);
      // Corrección si DolarAPI parseó el punto de miles del BCV como decimal para tasas >= 1.000 Bs (ej. 1.006 -> 1006)
      if (prom > 0 && prom < 10 && String(r.fecha).slice(0, 10) >= '2026-11-01') {
        prom = prom * 1000;
      }
      return { fecha: String(r.fecha).slice(0, 10), promedio: prom };
    })
    .sort((a: Reg, b: Reg) => a.fecha.localeCompare(b.fecha));

  // Integrar la tasa oficial exacta de hoy desde BCV / sistema_config para no perder decimales cuando BCV >= 1.000
  try {
    const { data: cfg } = await supabaseAdmin
      .from('sistema_config')
      .select('id, valor')
      .in('id', ['tasa_bcv_diaria', 'tasa_bcv_diaria_fecha']);
    const diariaVal = parseFloat(String(cfg?.find((c: any) => c.id === 'tasa_bcv_diaria')?.valor || 0)) || 0;
    const diariaFecha = String(cfg?.find((c: any) => c.id === 'tasa_bcv_diaria_fecha')?.valor || '').trim();
    if (diariaVal > 10 && /^\d{4}-\d{2}-\d{2}$/.test(diariaFecha)) {
      const idx = data.findIndex(d => d.fecha === diariaFecha);
      if (idx >= 0) data[idx].promedio = diariaVal;
      else data.push({ fecha: diariaFecha, promedio: diariaVal });
      data.sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
  } catch (_) {}

  cache = { at: Date.now(), data };
  return data;
}

export async function GET(req: Request) {
  const fecha = new URL(req.url).searchParams.get('fecha') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ success: false, error: 'Fecha inválida (use AAAA-MM-DD)' }, { status: 400 });
  }
  try {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    if (fecha >= todayStr) {
      const liveBcv = await getTasaBCV(false);
      if (liveBcv?.success && Number(liveBcv.tcmmv) > 10) {
        return NextResponse.json({
          success: true,
          fecha_solicitada: fecha,
          fecha_valor: todayStr,
          euro: Number(liveBcv.tcmmv),
        });
      }
    }

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
