// Condominios que pagaron (modo CONDOMINIO) y siguen con aseo_pendiente_desde <= 09/2026: ¿siguen debiendo?
import { config } from 'dotenv';
config({ path: '.env.local' });
(async () => {
  const { cargarCondominio, calcularEstado } = await import('../../src/lib/condominios/servicio');
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const cod of process.argv.slice(2)) {
    const d: any = await cargarCondominio(cod);
    const e = calcularEstado(d.condo, d.unidades, 980, new Date(), d.multas);
    const { data: pg } = await sb.from('pagos_reportados').select('id, monto, created_at, detalles').eq('estado', 'Aprobado').ilike('grupo_pago', '%').limit(1);
    void pg;
    const uniPend = d.unidades.filter((u: any) => u.estado !== 'Eliminada' && u.aseo_pendiente_desde && u.aseo_pendiente_desde <= '2026-09-01').length;
    console.log(cod, d.condo.modalidad, 'condo desde', d.condo.aseo_pendiente_desde, 'unid pend', uniPend, '/', d.unidades.filter((u: any) => u.estado !== 'Eliminada').length, 'deuda Bs', Math.round(e.totales.totalBs), 'meses', e.totales.mesesMax);
  }
})();
