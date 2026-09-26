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

// 1. admin/contribuyentes/page.tsx
let contri = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');
if (!contri.includes('const getFAR')) {
  contri = contri.replace(
    "export default function ContribuyentesDashboard() {",
    getFarFunc + "\n\nexport default function ContribuyentesDashboard() {"
  );
  fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', contri);
}

// 2. admin/estado-cuenta/page.tsx
let ec = fs.readFileSync('src/app/(admin)/admin/estado-cuenta/page.tsx', 'utf8');
if (!ec.includes('const getFAR')) {
  ec = ec.replace(
    "export default function EstadoCuenta() {",
    getFarFunc + "\n\nexport default function EstadoCuenta() {"
  );
  fs.writeFileSync('src/app/(admin)/admin/estado-cuenta/page.tsx', ec);
}

// 3. cobro-movil/page.tsx
let cobro = fs.readFileSync('src/app/cobro-movil/page.tsx', 'utf8');
if (!cobro.includes('multa_bs?: string | number;')) {
  cobro = cobro.replace(
    "deuda_congelada_bs?: string | number;",
    "deuda_congelada_bs?: string | number;\n  multa_bs?: string | number;"
  );
  fs.writeFileSync('src/app/cobro-movil/page.tsx', cobro);
}

