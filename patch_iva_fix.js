const fs = require('fs');

function fixIva(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  c = c.replace(/const totalUnMes = baseUnMes \+ \(baseUnMes \* 0\.16\) \+ \(baseUnMes \* 0\.12\);/g, `const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');\n                      const iva = esRes ? 0 : (baseUnMes * 0.16);\n                      const totalUnMes = baseUnMes + iva + (baseUnMes * 0.12);`);
  fs.writeFileSync(filePath, c);
}

fixIva('src/app/(admin)/admin/contribuyentes/page.tsx');

let cCaja = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
cCaja = cCaja.replace(/const montoIVA = baseMonto \* 0\.16;/g, `const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');\n        const montoIVA = esRes ? 0 : baseMonto * 0.16;`);
cCaja = cCaja.replace(/const totalConIva = totalBase \+ \(totalBase \* 0\.16\);/g, `const esRes = (targetInms[0]?.clasificacion || '').toLowerCase().includes('residencial');\n      const totalConIva = totalBase + (esRes ? 0 : (totalBase * 0.16));`);
fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', cCaja);

let cContr2 = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');
cContr2 = cContr2.replace(/const iva = baseMonto \* 0\.16;/g, `const iva = esRes ? 0 : baseMonto * 0.16;`);
fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', cContr2);

