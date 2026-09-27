const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/const tasaActualUse = \(customBcvRate && !isNaN\(parseFloat\(customBcvRate\)\)\) \? parseFloat\(customBcvRate\) : \(tcmmv \|\| 0\);/g, '');

c = c.replace(/calcularMensualidad\(inm\.clasificacion \|\| '', inm\.actividad_principal \|\| '', parseInt\(inm\.cant_inmuebles \|\| 1\), tasaActualUse\)/g,
  `calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActual)`);

// ensure tasaActual is defined right below setSumMulta
c = c.replace(/const \[sumMulta, setSumMulta\] = useState\(0\);\n  const calculatedTotalBs/g,
  `const [sumMulta, setSumMulta] = useState(0);
  const tasaActual = useTasaHistorica && selectedUcdDate && ucdManualRate > 0 ? ucdManualRate : tcmmvGlobal;
  const calculatedTotalBs`);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
