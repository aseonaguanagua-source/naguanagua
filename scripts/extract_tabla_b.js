const fs = require('fs');

const data = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/Doc de tarifas,servicios, etc.txt', 'utf-8');
const lines = data.split('\n').map(l => l.trim()).filter(l => l !== '');

let inTablaA = false;
let inTablaB = false;

const tablaA = [];
const tablaB = [];

let currentActividad = '';
let currentGen = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('TABLA "A"')) {
    inTablaA = true; inTablaB = false; continue;
  }
  if (line.includes('TABLA "B"')) {
    inTablaA = false; inTablaB = true; continue;
  }
  if (line.includes('TABLA "C"')) {
    inTablaA = false; inTablaB = false; break;
  }

  if (inTablaA) {
    // We'll skip Tabla A parsing here for simplicity or just grab it
  }

  if (inTablaB) {
    if (line === 'ALTA' || line === 'MEDIA' || line === 'BAJA') {
      currentGen = line;
      let val = lines[i+1];
      if(val) {
         if (!tablaB.find(t => t.actividad === currentActividad)) {
             tablaB.push({ actividad: currentActividad, alta: 0, media: 0, baja: 0 });
         }
         let entry = tablaB.find(t => t.actividad === currentActividad);
         if (line === 'ALTA') entry.alta = parseFloat(val.replace(',', '.'));
         if (line === 'MEDIA') entry.media = parseFloat(val.replace(',', '.'));
         if (line === 'BAJA') entry.baja = parseFloat(val.replace(',', '.'));
      }
    } else if (line.match(/^[0-9,.]+$/)) {
      // It's a value, skip
    } else if (line !== 'DESCRIPCION DE ACTIVIDAD' && line !== 'GENERACIÓN' && line !== 'TOTAL F.O.') {
      // It's a new actividad if it doesn't match ALTA/MEDIA/BAJA
      currentActividad = line;
    }
  }
}

console.log(JSON.stringify(tablaB, null, 2));
