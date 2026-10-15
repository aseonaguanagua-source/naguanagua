const fs = require('fs');
const path = './src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = `
      if (!foundUser) {
        foundUser = {
          Identidad: activeInmFresh[0].identidad,
          Contribuyente: activeInmFresh[0].contribuyente,
          CodCont: activeInmFresh[0].identidad, // FALLBACK
          Telefono: activeInmFresh[0].telefono,
          Correo: activeInmFresh[0].correo_electronico,
          Direccion: activeInmFresh[0].direccion,
        };
      }
`;

// wait, I need to match exactly what is in the file.
// Let's use string replacement without exact spacing matching.
