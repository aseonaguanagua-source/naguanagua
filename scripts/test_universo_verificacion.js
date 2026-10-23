const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
  // 1. Simular lo que devuelve listar para J-501249490
  const url = 'http://localhost:3000/api/admin/factura-digital/listar?query=J-501249490';
  console.log('Probando verificación de pagos para J-501249490...');

  const { data: pagos } = await supabase
    .from('pagos_reportados')
    .select('*')
    .ilike('identidad', '%501249490%')
    .order('created_at', { ascending: false });

  console.log('Total pagos en DB:', pagos.length);
  for (const p of pagos) {
    const d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles;
    console.log({
      id: p.id,
      ref: p.referencia,
      monto: p.monto,
      pago_principal: d?.pago_principal_id,
      es_adicional: d?.es_pago_adicional,
      es_retencion: d?.es_retencion,
      monto_retencion: d?.monto_retencion_iva,
      monto_factura: d?.monto_factura,
      formasPagoCount: d?.formasPago?.length
    });
  }
}

test();
