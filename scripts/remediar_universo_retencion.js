const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const p1Id = '67d2ffe2-af83-4097-ac59-777099c6eb60'; // Transfer 1: 40643.68
  const p2Id = 'ddb4bacb-d4c0-4a46-af64-a955e7165265'; // Transfer 2: 4689.67

  const { data: p1 } = await supabase.from('pagos_reportados').select('*').eq('id', p1Id).single();
  const { data: p2 } = await supabase.from('pagos_reportados').select('*').eq('id', p2Id).single();

  if (!p1 || !p2) {
    console.error('No se encontraron ambos pagos');
    return;
  }

  const d1 = typeof p1.detalles === 'string' ? JSON.parse(p1.detalles) : (p1.detalles || {});
  const d2 = typeof p2.detalles === 'string' ? JSON.parse(p2.detalles) : (p2.detalles || {});

  // Vincular p1 como pago secundario / adicional de p2
  d1.pago_principal_id = p2Id;
  d1.es_pago_adicional = true;
  await supabase.from('pagos_reportados').update({ detalles: d1 }).eq('id', p1Id);
  console.log('Pago 1 (40.643,68) vinculado como secundario a Pago 2');

  // En p2, consolidar datos de retención y pagos múltiples
  d2.pagos_vinculados_ids = [p1Id];
  d2.es_pago_multiple = true;
  d2.es_retencion = true;
  d2.agente_retencion = true;
  d2.monto_retencion_iva = 5230.77;
  d2.retencion_iva = 5230.77;
  d2.porcentaje_retencion = 75;
  d2.monto_neto_factura = 45333.35;
  d2.monto_factura = 50564.12;
  d2.formasPago = [
    {
      fecha: '2026-10-07T16:00:00.000Z',
      forma: '03',
      monto: 40643.68,
      descripcion: 'Transferencia Banesco 26997275',
      banco: 'BANESCO',
      referencia: '26997275'
    },
    {
      fecha: '2026-10-07T16:00:00.000Z',
      forma: '03',
      monto: 4689.67,
      descripcion: 'Transferencia Banesco 27002562',
      banco: 'BANESCO',
      referencia: '27002562'
    },
    {
      fecha: '2026-10-21T18:06:00.000Z',
      forma: '99',
      monto: 5230.77,
      descripcion: 'Retención IVA 75%'
    }
  ];

  await supabase.from('pagos_reportados').update({ detalles: d2 }).eq('id', p2Id);
  console.log('Pago 2 (4.689,67) actualizado como pago principal con 75% retención y dos transferencias');
}

main();
