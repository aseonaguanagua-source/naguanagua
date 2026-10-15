const fs = require('fs');
const path = './src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const target1 = `
          const principal = inmuebles[0];
          const an = actividadYNivelDeInmueble(principal);
          ActividadComercial = an.actividad;
`;
// Wait, I need to check exactly what it looks like.
