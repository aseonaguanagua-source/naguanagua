const fs = require('fs');

const file = 'src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Patch confirmPayload setting (around line 1431)
content = content.replace(
  /montoReal, finalTotal, saldoAFavorNuevo, esAbono, descuentoSaldoFavor,\s*reqRef,/g,
  "montoReal, finalTotal, saldoAFavorNuevo, esAbono, descuentoSaldoFavor, reqRef, realMontoRetencionIVA, comprobanteRetencion,"
);

// Patch handleConfirmAndPay arguments (around line 1443)
content = content.replace(
  /const { montoReal, finalTotal, saldoAFavorNuevo, esAbono, descuentoSaldoFavor, reqRef } = confirmPayload;/g,
  "const { montoReal, finalTotal, saldoAFavorNuevo, esAbono, descuentoSaldoFavor, reqRef, realMontoRetencionIVA, comprobanteRetencion } = confirmPayload;"
);

// Insert Retention after Aprobado payment (around line 1668, after `ultimoPagoIdRef.current = pagoId;`)
const retencionInsertAprobado = `
        // ── GENERAR COMPROBANTE DE RETENCIÓN DE IVA COMO NOTA DE CRÉDITO ──
        if (realMontoRetencionIVA > 0) {
          const pagoRetId = crypto.randomUUID();
          await supabase.from('pagos_reportados').insert({
            id: pagoRetId,
            identidad: foundUser.Identidad,
            monto: realMontoRetencionIVA,
            banco: 'N/A',
            referencia: comprobanteRetencion || 'RET-' + Date.now().toString().slice(-6),
            tipo: 'Retencion de IVA',
            estado: 'Aprobado',
            created_at: fechaUTC,
            detalles: JSON.stringify({
              cajero: cajero_id,
              es_abono: false,
              pago_vinculado: pagoId,
              nota: 'Generado automáticamente por retención de agente.'
            })
          });
        }
`;
content = content.replace(
  /ultimoPagoIdRef\.current = pagoId;/g,
  `ultimoPagoIdRef.current = pagoId;${retencionInsertAprobado}`
);

// Insert Retention after Por Verificar payment (around line 2325, after `ultimoPagoIdRef.current = pagoIdT;`)
const retencionInsertVerificar = `
        // ── GENERAR COMPROBANTE DE RETENCIÓN DE IVA COMO NOTA DE CRÉDITO ──
        if (realMontoRetencionIVA > 0) {
          const pagoRetId = crypto.randomUUID();
          await supabase.from('pagos_reportados').insert({
            id: pagoRetId,
            identidad: foundUser.Identidad,
            monto: realMontoRetencionIVA,
            banco: 'N/A',
            referencia: comprobanteRetencion || 'RET-' + Date.now().toString().slice(-6),
            tipo: 'Retencion de IVA',
            estado: 'Aprobado', // Siempre Aprobado porque es un descuento matemático directo
            created_at: fechaUTC,
            detalles: JSON.stringify({
              cajero: cajero_id,
              es_abono: false,
              pago_vinculado: pagoIdT,
              nota: 'Generado automáticamente por retención de agente.'
            })
          });
        }
`;
content = content.replace(
  /ultimoPagoIdRef\.current = pagoIdT;/g,
  `ultimoPagoIdRef.current = pagoIdT;${retencionInsertVerificar}`
);

fs.writeFileSync(file, content);
console.log("Patched admin/caja/page.tsx");
