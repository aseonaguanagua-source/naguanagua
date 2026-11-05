import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Lectura de la bitácora de auditoría para el panel admin.
 * La tabla `auditoria` tiene RLS que impide leerla con la clave pública, por eso se lee aquí
 * con la clave de servicio. Fechas en hora de Venezuela (UTC-4).
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const desde = sp.get('desde') || '';
    const hasta = sp.get('hasta') || '';
    const usuario = sp.get('usuario') || '';
    const categoria = sp.get('categoria') || '';
    const accion = sp.get('accion') || '';
    const searchQ = (sp.get('q') || '').trim();
    const soloConteo = sp.get('count') === '1';
    const limit = Math.min(parseInt(sp.get('limit') || '2000') || 2000, 5000);
    const verModoDios = sp.get('modo_dios') === '1' || categoria === 'MODO_DIOS';

    const buildQuery = (isCount = false) => {
      let q = isCount
        ? supabaseAdmin.from('auditoria').select('id', { count: 'exact', head: true })
        : supabaseAdmin.from('auditoria').select('*').order('created_at', { ascending: false });
      if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte('created_at', `${desde}T00:00:00-04:00`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) q = q.lte('created_at', `${hasta}T23:59:59.999-04:00`);
      if (usuario) q = q.eq('usuario', usuario);
      if (categoria && categoria !== 'TODAS') q = q.eq('categoria', categoria);
      if (accion) q = q.eq('accion', accion);
      if (verModoDios) {
        q = q.ilike('accion', 'MODO DIOS%');
      } else {
        q = q.not('accion', 'ilike', 'MODO DIOS%');
      }
      if (searchQ) {
        const safe = searchQ.replace(/[,()]/g, ' ').trim();
        if (safe) {
          q = q.or(
            [
              `usuario.ilike.%${safe}%`,
              `accion.ilike.%${safe}%`,
              `modulo.ilike.%${safe}%`,
              `detalles->>texto.ilike.%${safe}%`,
              `detalles->>identidad.ilike.%${safe}%`,
              `detalles->>inmueble.ilike.%${safe}%`,
              `detalles->>contribuyente.ilike.%${safe}%`,
              `detalles->>referencia.ilike.%${safe}%`,
              `detalles->>motivo.ilike.%${safe}%`,
              `detalles->>nota.ilike.%${safe}%`,
              `detalles->>_ip.ilike.%${safe}%`
            ].join(',')
          );
        }
      }
      return q;
    };

    if (soloConteo) {
      const { count, error } = await buildQuery(true);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ count: count || 0 });
    }

    const pageSize = 1000;
    const allRows: any[] = [];
    for (let offset = 0; offset < limit; offset += pageSize) {
      const end = Math.min(offset + pageSize - 1, limit - 1);
      const { data, error } = await buildQuery(false).range(offset, end);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const batch = (data || []).filter((r: any) => verModoDios || r?.detalles?._categoria !== 'MODO_DIOS');
      allRows.push(...batch);
      if (!data || data.length < pageSize) break;
    }

    return NextResponse.json({ data: allRows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
