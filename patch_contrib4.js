const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');

// Replace in calculateFactorForRow - Part 1
c = c.replace(/const iva = esRes \? 0 : baseMonto \* 0\.16;\n                const multa = baseMonto \* 0\.12;\n                const totalItem = baseMonto \+ iva \+ multa;/g, 
  `const iva = esRes ? 0 : baseMonto * 0.16;
                const porcentajeMultaStr = esRes ? '10%' : '12%';
                const multa = baseMonto * (esRes ? 0.10 : 0.12);
                const totalItem = baseMonto + iva + multa;`);

// Replace leyenda string Part 1
c = c.replace(/leyenda: \`\$\{actividad\} \(Base\+IVA\+Multa\)\`/g, 
  `leyenda: \`\${actividad} | Base: \${baseMonto.toFixed(2)} | IVA: \${iva.toFixed(2)} | Multa (\${porcentajeMultaStr}): \${multa.toFixed(2)}\``);

// Replace deudaInmuebleBs calculation
c = c.replace(/const totalUnMes = baseUnMes \+ iva \+ \(baseUnMes \* 0\.12\);/g, 
  `const multa = baseUnMes * (esRes ? 0.10 : 0.12);
                    const totalUnMes = baseUnMes + iva + multa;`);

fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', c);
