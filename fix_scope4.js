const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/const \[sumMulta, setSumMulta\] = useState\(0\);/g,
  `const [sumMulta, setSumMulta] = useState(0);
  const calculatedTotalBs = sumBase + sumIVA + sumMulta;
  const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);`);

// And remove it from handlePayment
c = c.replace(/    const calculatedTotalBs = sumBase \+ sumIVA \+ sumMulta;\n    const realMontoRetencionIVA = sumIVA \* \(retencionIVA \/ 100\);\n    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;\n    const reqRef = \['Transferencia'\]\.includes\(paymentMethod\);/g,
  `    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;
    const reqRef = ['Transferencia'].includes(paymentMethod);`);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
