const fs = require('fs');
let content = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

const getFarFunc = `      const getFAR = (actividad: string) => {
        const act = (actividad || "").toLowerCase();
        if (act.includes("quinta (a)")) return 0.020366;
        if (act.includes("apartamento (a)")) return 0.023723;
        if (act.includes("quinta (b)")) return 0.016298;
        if (act.includes("apartamento (b)")) return 0.018985;
        if (act.includes("casa (c)")) return 0.014;
        if (act.includes("apartamento (c)")) return 0.028839;
        if (act.includes("casa (d)")) return 0.02673;
        return 0.02673;
      };
`;

content = content.replace(getFarFunc, '');
content = content.replace(
  "    // RECIB- = deuda acumulada de N meses → usar deuda_mmv del inmueble × tasa actual",
  getFarFunc + "\n    // RECIB- = deuda acumulada de N meses → usar deuda_mmv del inmueble × tasa actual"
);

content = content.replace(
  /      let totalDeudaMMV = 0;\n      let totalMulta = 0;\n      let totalCongelada = 0;\n      userInms.forEach\(\(inm: any\) => {\n        totalDeudaMMV \+= parseFloat\(inm.deuda_mmv \|\| 0\);\n        totalCongelada \+= parseFloat\(inm.deuda_congelada_bs \|\| 0\);\n        totalMulta \+= parseFloat\(inm.multa_bs \|\| 0\);\n      }\);/g,
  `      let totalDeudaMMV = 0;
      let totalMulta = 0;
      let totalCongelada = 0;
      userInms.forEach((inm: any) => {
        const deuda = parseFloat(inm.deuda_mmv || 0);
        const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
        if (deuda > 0) {
          if (esRes) {
            totalDeudaMMV += deuda * getFAR(inm.actividad_principal || '');
          } else {
            totalDeudaMMV += deuda;
          }
        }
        totalCongelada += parseFloat(inm.deuda_congelada_bs || 0);
        totalMulta += parseFloat(inm.multa_bs || 0);
      });`
);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', content);
