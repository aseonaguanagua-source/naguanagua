const fs = require('fs');

const getFarFunc = `const getFAR = (actividad: string) => {
  const act = (actividad || "").toLowerCase();
  if (act.includes("quinta (a)")) return 0.020366;
  if (act.includes("apartamento (a)")) return 0.023723;
  if (act.includes("quinta (b)")) return 0.016298;
  if (act.includes("apartamento (b)")) return 0.018985;
  if (act.includes("casa (c)")) return 0.014;
  if (act.includes("apartamento (c)")) return 0.028839;
  if (act.includes("casa (d)")) return 0.02673;
  return 0.02673;
};`;

const filesToPatch = [
  'src/app/(admin)/admin/estado-cuenta/page.tsx',
  'src/app/portal/(dashboard)/estado-cuenta/page.tsx'
];

for (const file of filesToPatch) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes('const getFAR')) {
      content = content.replace(
        "export default function EstadoCuenta() {",
        "export default function EstadoCuenta() {\n  " + getFarFunc + "\n"
      );
  }

  // Find RECIB- logic block 1
  content = content.replace(
    /let totalDeudaMMV = 0;\n\s*let totalCongelada = 0;\n\s*userInmsForCalc\.forEach\(\(inm: any\) => {\n\s*totalDeudaMMV \+= parseFloat\(inm\.deuda_mmv \|\| 0\);\n\s*totalCongelada \+= parseFloat\(inm\.deuda_congelada_bs \|\| 0\);\n\s*}\);\n\s*if \(totalDeudaMMV > 0 \|\| totalCongelada > 0\) montoNumerico = parseFloat\(\(\(totalDeudaMMV \* tcmmv\) \+ totalCongelada\)\.toFixed\(2\)\);/g,
    `let totalDeudaMMV = 0;
          let totalCongelada = 0;
          let totalMulta = 0;
          userInmsForCalc.forEach((inm: any) => {
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
          });
          if (totalDeudaMMV > 0 || totalCongelada > 0 || totalMulta > 0) montoNumerico = parseFloat(((totalDeudaMMV * tcmmv) + totalCongelada + totalMulta).toFixed(2));`
  );

  // Find RECIB- logic block 2 (userInmsForAll)
  content = content.replace(
    /let deuda = 0;\n\s*let congelada = 0;\n\s*userInmsForAll\.forEach\(\(inm: any\) => { deuda \+= parseFloat\(inm\.deuda_mmv \|\| 0\); congelada \+= parseFloat\(inm\.deuda_congelada_bs \|\| 0\); }\);\n\s*if \(deuda > 0 \|\| congelada > 0\) mF = parseFloat\(\(\(deuda \* tcmmv\) \+ congelada\)\.toFixed\(2\)\);/g,
    `let deuda = 0;
                let congelada = 0;
                let multa = 0;
                userInmsForAll.forEach((inm: any) => { 
                  const d = parseFloat(inm.deuda_mmv || 0);
                  const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
                  if (d > 0) {
                    if (esRes) deuda += d * getFAR(inm.actividad_principal || '');
                    else deuda += d;
                  }
                  congelada += parseFloat(inm.deuda_congelada_bs || 0); 
                  multa += parseFloat(inm.multa_bs || 0);
                });
                if (deuda > 0 || congelada > 0 || multa > 0) mF = parseFloat(((deuda * tcmmv) + congelada + multa).toFixed(2));`
  );

  // In portal/estado-cuenta, the variables are userInms and userInms (not userInmsForCalc / userInmsForAll)
  // Let's also patch portal/estado-cuenta specifically
  content = content.replace(
    /let totalDeudaMMV = 0;\n\s*let totalCongelada = 0;\n\s*inmsToUse\.forEach\(\(inm: any\) => {\n\s*totalDeudaMMV \+= parseFloat\(inm\.deuda_mmv \|\| 0\);\n\s*totalCongelada \+= parseFloat\(inm\.deuda_congelada_bs \|\| 0\);\n\s*}\);\n\s*if \(totalDeudaMMV > 0 \|\| totalCongelada > 0\) montoNumerico = parseFloat\(\(\(totalDeudaMMV \* tcmmv\) \+ totalCongelada\)\.toFixed\(2\)\);/g,
    `let totalDeudaMMV = 0;
          let totalCongelada = 0;
          let totalMulta = 0;
          inmsToUse.forEach((inm: any) => {
            const d = parseFloat(inm.deuda_mmv || 0);
            const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
            if (d > 0) {
              if (esRes) totalDeudaMMV += d * getFAR(inm.actividad_principal || '');
              else totalDeudaMMV += d;
            }
            totalCongelada += parseFloat(inm.deuda_congelada_bs || 0);
            totalMulta += parseFloat(inm.multa_bs || 0);
          });
          if (totalDeudaMMV > 0 || totalCongelada > 0 || totalMulta > 0) montoNumerico = parseFloat(((totalDeudaMMV * tcmmv) + totalCongelada + totalMulta).toFixed(2));`
  );

  content = content.replace(
    /let deuda = 0;\n\s*let congelada = 0;\n\s*userInms\.forEach\(\(inm: any\) => { deuda \+= parseFloat\(inm\.deuda_mmv \|\| 0\); congelada \+= parseFloat\(inm\.deuda_congelada_bs \|\| 0\); }\);\n\s*if \(deuda > 0 \|\| congelada > 0\) mF = parseFloat\(\(\(deuda \* tcmmv\) \+ congelada\)\.toFixed\(2\)\);/g,
    `let deuda = 0;
                let congelada = 0;
                let multa = 0;
                userInms.forEach((inm: any) => { 
                  const d = parseFloat(inm.deuda_mmv || 0);
                  const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
                  if (d > 0) {
                    if (esRes) deuda += d * getFAR(inm.actividad_principal || '');
                    else deuda += d;
                  }
                  congelada += parseFloat(inm.deuda_congelada_bs || 0); 
                  multa += parseFloat(inm.multa_bs || 0);
                });
                if (deuda > 0 || congelada > 0 || multa > 0) mF = parseFloat(((deuda * tcmmv) + congelada + multa).toFixed(2));`
  );

  fs.writeFileSync(file, content);
}
