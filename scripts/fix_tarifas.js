const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/tarifas/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace('a.factores.map((factor, fIdx) =>', 'a.factores.map((factor: any, fIdx: number) =>');

fs.writeFileSync(path, c, 'utf8');
