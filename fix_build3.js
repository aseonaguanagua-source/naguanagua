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

let ec = fs.readFileSync('src/app/(admin)/admin/estado-cuenta/page.tsx', 'utf8');
if (!ec.includes('const getFAR')) {
  ec = ec.replace(
    "export default function EstadoCuentaPage() {",
    getFarFunc + "\n\nexport default function EstadoCuentaPage() {"
  );
  fs.writeFileSync('src/app/(admin)/admin/estado-cuenta/page.tsx', ec);
}

