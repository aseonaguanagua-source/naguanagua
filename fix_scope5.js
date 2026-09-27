const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;\n    const reqRef = \['Transferencia'\]\.includes\(paymentMethod\);/g,
  `    const reqRef = ['Transferencia'].includes(paymentMethod);`);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
