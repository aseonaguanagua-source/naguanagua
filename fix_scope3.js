const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/const tasaActual = useTasaHistorica && selectedUcdDate && ucdManualRate > 0 \? ucdManualRate : tcmmvGlobal;\n  const calculatedTotalBs = sumBase \+ sumIVA \+ sumMulta;\n  const realMontoRetencionIVA = sumIVA \* \(retencionIVA \/ 100\);\n/g, '');

c = c.replace(/    let sb = 0, siva = 0, smulta = 0;\n    selectedRecibos\.forEach\(ref => \{/g,
  `    let sb = 0, siva = 0, smulta = 0;
    const tasaActualUse = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);
    selectedRecibos.forEach(ref => {`);

c = c.replace(/calcularMensualidad\(inm\.clasificacion \|\| '', inm\.actividad_principal \|\| '', parseInt\(inm\.cant_inmuebles \|\| 1\), tasaActual\)/g,
  `calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActualUse)`);


// Also fix handlePayment which uses tasaActual
c = c.replace(/    const reqRef = \['Transferencia'\]\.includes\(paymentMethod\);/g,
  `    const calculatedTotalBs = sumBase + sumIVA + sumMulta;
    const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);
    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;
    const reqRef = ['Transferencia'].includes(paymentMethod);`);


fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
