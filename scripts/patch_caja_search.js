const fs = require('fs');
let path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
    '.or(`identidad.eq.${cleanFullDoc},identidad.eq.${idLimpioSearch},inmueble.ilike.${docNumber}`)',
    '.or(`identidad.eq.${cleanFullDoc},identidad.eq.${idLimpioSearch},inmueble.ilike.%${docNumber}%,contribuyente.ilike.%${docNumber}%`)'
);

fs.writeFileSync(path, c, 'utf8');
