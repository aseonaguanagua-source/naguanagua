import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getTasaBCV } from '@/services/bcv';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Tasa única para TODO el sistema (caja, cobro móvil, portal, estados de cuenta):
 * misma prioridad que AppContext → tasa manual (sistema_config.tasa_bcv_manual) > BCV oficial > tasa semanal.
 * Así ningún módulo calcula con una tasa distinta.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sync = searchParams.get('sync') === 'true';

  if (sync) {
    // @ts-expect-error - Next.js internal type mismatch
    revalidateTag('bcv-rate');
  }

  const [result, cfg] = await Promise.all([
    getTasaBCV(sync),
    supabaseAdmin.from('sistema_config').select('id, valor').in('id', ['tasa_bcv_manual', 'tasa_bcv_semanal']).then(r => r.data || [], () => []),
  ]);

  const manual = parseFloat(String((cfg as any[]).find(c => c.id === 'tasa_bcv_manual')?.valor || 0)) || 0;
  const semanal = parseFloat(String((cfg as any[]).find(c => c.id === 'tasa_bcv_semanal')?.valor || 0)) || 0;
  const bcv = (result as any)?.success !== false ? (parseFloat(String((result as any)?.tcmmv || 0)) || 0) : 0;
  const tcmmv = manual > 0 ? manual : (bcv > 0 ? bcv : semanal);

  if (tcmmv <= 0) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({
    ...(result as any),
    success: true,
    tcmmv,
    tcmmv_bcv: bcv,
    fuente_tasa: manual > 0 ? 'manual' : (bcv > 0 ? 'bcv' : 'semanal'),
  });
}
