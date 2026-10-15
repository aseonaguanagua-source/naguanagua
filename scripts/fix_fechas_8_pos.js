require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const targetUpdates = [
  { ref: '00569769', id: '94e2daec-1a06-4e58-96f3-4d6cbba667dc', fechaReal: '2026-10-09', hora: '14:43:23' },
  { ref: '00568821', id: 'e0e92fbe-17ad-4c95-9f9b-aee1f448d92d', fechaReal: '2026-10-09', hora: '15:04:50' },
  { ref: '00542585', id: 'c6be947f-a94b-48db-b6c0-11e258082b27', fechaReal: '2026-10-06', hora: '15:11:56' },
  { ref: '00551185', id: 'f4fdb473-c8ef-4b9a-8e4f-005e82eb00b8', fechaReal: '2026-10-06', hora: '15:20:36' },
  { ref: '00294386', id: '42306afa-c7c2-4d09-9211-8c0388e4fe45', fechaReal: '2026-10-08', hora: '14:28:38' },
  { ref: '00915586', id: '3e4bdace-9c1c-49fb-8557-6a45e8c2c77f', fechaReal: '2026-10-09', hora: '16:44:47' },
  { ref: '00000410', id: 'c67babc6-8485-42ed-b3c4-d7ee28ce0df8', fechaReal: '2026-10-08', hora: '15:48:44' },
  { ref: '00004143', id: 'd67a9532-a44a-45a9-8161-f40ac3f5fcd5', fechaReal: '2026-10-06', hora: '15:37:06' },
];

(async () => {
  console.log('Iniciando corrección de fechas para los 8 pagos POS...');
  for (const item of targetUpdates) {
    const { data: row, error: fetchErr } = await sb.from('pagos_reportados').select('*').eq('id', item.id).single();
    if (fetchErr || !row) {
      console.error('Error buscando pago id:', item.id, fetchErr);
      continue;
    }

    const newIsoCreatedAt = item.fechaReal + 'T' + item.hora + '.000-04:00';
    let det = typeof row.detalles === 'string' ? JSON.parse(row.detalles) : (row.detalles || {});
    
    // Actualizar fechas en detalles
    det.fecha_transaccion = item.fechaReal;
    det.fecha_banco = item.fechaReal;
    det.fecha_ingreso_caja = item.fechaReal;
    if (Array.isArray(det.recibo_caja)) {
      det.recibo_caja = det.recibo_caja.map(rc => ({
        ...rc,
        fechaEmision: item.fechaReal,
        fechaTransaccion: item.fechaReal,
        fechaIngresoCaja: item.fechaReal,
      }));
    }
    if (Array.isArray(det.pagos_agregados)) {
      det.pagos_agregados = det.pagos_agregados.map(pa => ({
        ...pa,
        fecha: item.fechaReal,
        fechaTransaccion: item.fechaReal,
        fechaIngresoCaja: item.fechaReal,
      }));
    }

    det.correcciones_reporte = det.correcciones_reporte || [];
    det.correcciones_reporte.push({
      motivo: 'Ajuste a fecha real según Reporte de Corrección de Fechas - Pagos por Punto de Venta',
      fecha_anterior: row.created_at,
      fecha_nueva: newIsoCreatedAt,
      fecha_ajuste: new Date().toISOString()
    });

    const { error: updErr } = await sb.from('pagos_reportados').update({
      created_at: newIsoCreatedAt,
      detalles: det
    }).eq('id', item.id);

    if (updErr) {
      console.error('Error actualizando pago:', item.ref, updErr.message);
    } else {
      console.log('✓ Pago ref ' + item.ref + ' actualizado con éxito a ' + item.fechaReal);
    }
  }
  console.log('Finalizada la corrección de fechas de las 8 transacciones.');
})();
