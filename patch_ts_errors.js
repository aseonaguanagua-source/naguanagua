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

// 1. caja/page.tsx global getFAR
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
if (!c.includes('export default function CajaDashboard() {\\n  const getFAR')) {
  c = c.replace(
    "export default function CajaDashboard() {",
    getFarFunc + "\\n\\nexport default function CajaDashboard() {"
  );
}
// Remove the inner one
c = c.replace(/      const getFAR = \\(actividad: string\\) => {[\\s\\S]*?      };\n/, "");

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);

// 2. cobro-movil/page.tsx Add meses_deuda to Inmueble
let cm = fs.readFileSync('src/app/cobro-movil/page.tsx', 'utf8');
if (!cm.includes('meses_deuda?: string | number;')) {
  cm = cm.replace(
    "multa_bs?: string | number;",
    "multa_bs?: string | number;\\n  meses_deuda?: string | number;"
  );
}
fs.writeFileSync('src/app/cobro-movil/page.tsx', cm);
