const fs = require('fs');
let content = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');

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

if (!content.includes('const getFAR')) {
    content = content.replace(
      "const getMontoActual = (f: any) => {",
      getFarFunc + "\n\n  const getMontoActual = (f: any) => {"
    );
}

// 1. Line 2464
content = content.replace(
  "return sum + (parseFloat(inm.deuda_congelada_bs || 0) + (parseFloat(inm.deuda_mmv || 0) * tcmmv));",
  `const deuda = parseFloat(inm.deuda_mmv || 0);
                      const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
                      const multa = parseFloat(inm.multa_bs || 0);
                      const congelada = parseFloat(inm.deuda_congelada_bs || 0);
                      let calcDeuda = 0;
                      if (deuda > 0) {
                        if (esRes) {
                          calcDeuda = deuda * getFAR(inm.actividad_principal || '') * tcmmv;
                        } else {
                          calcDeuda = deuda * tcmmv;
                        }
                      }
                      return sum + congelada + calcDeuda + multa;`
);

// 2. Line 2530
content = content.replace(
  "{(parseFloat(inm.deuda_congelada_bs || 0) + (parseFloat(inm.deuda_mmv || 0) * tcmmv)).toFixed(2)} Bs",
  `{(
                                      parseFloat(inm.deuda_congelada_bs || 0) + 
                                      parseFloat(inm.multa_bs || 0) + 
                                      (parseFloat(inm.deuda_mmv || 0) > 0 ? (
                                        ((inm.clasificacion || '').toLowerCase().includes('residencial') ? 
                                          parseFloat(inm.deuda_mmv || 0) * getFAR(inm.actividad_principal || '') * tcmmv 
                                          : parseFloat(inm.deuda_mmv || 0) * tcmmv
                                        )
                                      ) : 0)
                                    ).toFixed(2)} Bs`
);

fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', content);
