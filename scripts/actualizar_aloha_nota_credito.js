const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const pagoId = 'c9fd2690-ef81-4bc2-86aa-538b4468f35c';
  const { data: pago, error: err } = await sb.from('pagos_reportados').select('*').eq('id', pagoId).single();
  if (err || !pago) {
    console.error('Error buscando pago:', err);
    return;
  }

  let det = pago.detalles;
  if (typeof det === 'string') {
    try { det = JSON.parse(det); } catch(e) { det = {}; }
  }

  // Actualizar detalles
  det.tipo = 'Nota de Credito';
  det.es_nota_credito = true;
  det.es_saldo_a_favor = true;
  det.saldo_favor_usado = 176699.08;
  det.nota_credito_usada = 176699.08;
  det.banco_destino = 'Nota de Credito';
  det.banco_receptor = 'Nota de Credito';
  det.observaciones = (det.observaciones ? det.observaciones + ' ' : '') + '[Ajustado a Nota de Crédito por solicitud administrativa]';

  if (Array.isArray(det.formasPago)) {
    det.formasPago = det.formasPago.map(fp => ({
      ...fp,
      forma: '05',
      descripcion: 'Nota de Credito'
    }));
  } else {
    det.formasPago = [{
      fecha: pago.created_at,
      forma: '05',
      monto: pago.monto,
      descripcion: 'Nota de Credito'
    }];
  }

  if (Array.isArray(det.recibo_caja)) {
    det.recibo_caja = det.recibo_caja.map(rc => ({
      ...rc,
      formaPago: 'NOTA DE CREDITO',
      banco: 'Nota de Credito'
    }));
  }

  const payload = {
    tipo: 'Nota de Credito',
    banco: 'Nota de Credito',
    detalles: det
  };

  const { error: updErr } = await sb.from('pagos_reportados').update(payload).eq('id', pagoId);
  if (updErr) {
    console.error('Error actualizando pago:', updErr);
    return;
  }

  console.log('¡Pago de Aloha actualizado a Nota de Credito con éxito!');

  // Registrar en auditoría
  await sb.from('auditoria').insert({
    accion: 'Ajuste de pago a Nota de Crédito',
    usuario: 'Administrador',
    detalles: {
      pagoId,
      contribuyente: 'ALOHA MARKET TAZAJAL C.A',
      identidad: 'J-506048493',
      monto: pago.monto,
      anterior: { tipo: pago.tipo, banco: pago.banco },
      nuevo: { tipo: 'Nota de Credito', banco: 'Nota de Credito' },
      motivo: 'Pago realizado con nota de crédito/saldo a favor, no transferencia bancaria'
    }
  });

  console.log('Auditoría registrada exitosamente.');
}

main().catch(console.error);
