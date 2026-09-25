const fs = require('fs');
let content = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', 'utf8');

content = content.replace(
  /const maxSaldoUsable = foundUser\?\.SaldoFavor \|\| 0;[\s\S]*?const finalTotal = Math\.max\(0, totalConImpuestos - descuentoSaldoFavor\);/m,
  `const totalConImpuestos = (totalBs + (totalBs * ivaPercent)) - montoRetencionIVA;
    const maxSaldoUsable = foundUser?.SaldoFavor || 0;
    // Cuando el método de pago ES Saldo a Favor, el checkbox no aplica
    // (evita doble deducción: una por descuento + otra por el método)
    const descuentoSaldoFavor = (paymentMethod !== 'Saldo a Favor' && useSaldoFavor)
      ? Math.min(totalConImpuestos, maxSaldoUsable)
      : 0;
    const finalTotal = Math.max(0, totalConImpuestos - descuentoSaldoFavor);`
);

content = content.replace(
  /if \(saldoDisponible < totalBs\) \{[\s\S]*?montoReal = totalBs;/m,
  `if (saldoDisponible < totalConImpuestos) {
        return alert(\`Saldo a Favor insuficiente. Disponible: Bs. \${formatBs(saldoDisponible)}. Deuda total: Bs. \${formatBs(totalConImpuestos)}.\\nUse otro método de pago o combínelo con el descuento de saldo parcial.\`);
      }
      montoReal = totalConImpuestos;`
);

content = content.replace(
  /tasa_bcv_aplicada: customBcvRate \? customBcvRate : undefined,\s*nota_cambio_tasa: justificacionBcv \? justificacionBcv : undefined/m,
  `tasa_bcv_aplicada: customBcvRate ? customBcvRate : undefined,
            nota_cambio_tasa: justificacionBcv ? justificacionBcv : undefined,
            monto_retencion_iva: montoRetencionIVA,
            iva_percent: ivaPercent,
            es_condominio: isCondominio,
            condominio_modo: condominioModo,
            condominio_hijos_pagados: condominioModo === 'Local' ? selectedHijos : []`
);

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', content);
