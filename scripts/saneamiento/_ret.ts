import { createClient } from '@supabase/supabase-js'; import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local', quiet: true } as any);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const r = await sb.from('pagos_reportados').select('id,identidad,created_at,detalles').not('detalles->factura_digital->retencion', 'is', null).limit(500);
  if (r.error) return console.log(r.error.message);
  const rows = r.data.map((x: any) => ({ id: x.id, idn: x.identidad, fac: x.detalles?.factura_digital?.numeroDocumento || x.detalles?.factura_digital?.numero, env: x.detalles?.factura_digital?.retencion?.datos_enviados_at, a: x.detalles?.factura_digital?.retencion?.datos_enviados_a, est: x.detalles?.factura_digital?.retencion?.estado }));
  const antes = rows.filter(x => x.env && x.env < '2026-10-13T01:42:00Z');
  console.log('con retención', rows.length, 'datos enviados antes del arreglo', antes.length); console.table(antes);
})();
