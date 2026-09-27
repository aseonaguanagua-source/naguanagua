const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/const calculatedTotalBs = sumBase \+ sumIVA \+ sumMulta;\n    const realMontoRetencionIVA = sumIVA \* \(retencionIVA \/ 100\);\n    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;/g,
  `const calculatedTotalBs = sumBase + sumIVA + sumMulta;
    const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);
    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;`); // just leaving it as is in handlePayment

// I need to add those to component scope for JSX
c = c.replace(/const \[sumMulta, setSumMulta\] = useState\(0\);/g,
  `const [sumMulta, setSumMulta] = useState(0);
  const calculatedTotalBs = sumBase + sumIVA + sumMulta;
  const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);`);

// And I need to fix `tasaActual` inside useMemo. What is `tasaActual`?
// It was defined as `const tasaActual = useTasaHistorica && selectedUcdDate && ucdManualRate > 0 ? ucdManualRate : tcmmvGlobal;`
// Let's move that definition ABOVE the useMemo!
c = c.replace(/  const tasaActual = useTasaHistorica && selectedUcdDate && ucdManualRate > 0 \? ucdManualRate : tcmmvGlobal;/g, '');
c = c.replace(/const \[sumMulta, setSumMulta\] = useState\(0\);\n  const calculatedTotalBs = sumBase \+ sumIVA \+ sumMulta;\n  const realMontoRetencionIVA = sumIVA \* \(retencionIVA \/ 100\);/g,
  `const [sumMulta, setSumMulta] = useState(0);
  const tasaActual = useTasaHistorica && selectedUcdDate && ucdManualRate > 0 ? ucdManualRate : tcmmvGlobal;
  const calculatedTotalBs = sumBase + sumIVA + sumMulta;
  const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);`);


fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
