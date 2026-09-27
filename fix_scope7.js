const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

// Remove tasaActual from line 70
c = c.replace(/const tasaActual = useTasaHistorica && selectedUcdDate && ucdManualRate > 0 \? ucdManualRate : tcmmvGlobal;\n/g, '');

// Fix in useMemo
c = c.replace(/calcularMensualidad\(inm\.clasificacion \|\| '', inm\.actividad_principal \|\| '', parseInt\(inm\.cant_inmuebles \|\| 1\), tasaActual\)/g,
  `calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0))`);


fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
