const fs = require('fs');

const data = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/Doc de tarifas,servicios, etc.txt', 'utf-8');
const lines = data.split('\n').map(l => l.trim()).filter(l => l !== '');

const tablaA = [
  { tipo: 'Viviendas en zonas populares', zona: 'A', fo: 0.5 },
  { tipo: 'Apartamentos', zona: 'A', fo: 0.91 },
  { tipo: 'Casas', zona: 'A', fo: 0.8 },
  { tipo: 'Quintas, Town House', zona: 'A', fo: 1.06 }
];

const tablaB = [];
let capture = false;
let currentAct = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('TABLA "B"')) {
    capture = true;
  }
  if (capture && line.includes('TABLA "C"')) {
    break;
  }

  if (capture) {
    if (line === 'ALTA' || line === 'MEDIA' || line === 'BAJA') {
      let valLine = lines[i+1];
      if (valLine && /^[0-9,]+$/.test(valLine)) {
        let val = parseFloat(valLine.replace(',', '.'));
        let entry = tablaB.find(t => t.label === currentAct);
        if (!entry) {
          entry = { label: currentAct, factores: [0, 0, 0] };
          tablaB.push(entry);
        }
        if (line === 'ALTA') entry.factores[2] = val;
        if (line === 'MEDIA') entry.factores[1] = val;
        if (line === 'BAJA') entry.factores[0] = val;
      }
    } else if (!/^[0-9,]+$/.test(line) && line !== 'DESCRIPCION DE ACTIVIDAD' && line !== 'GENERACIÓN' && line !== 'TOTAL F.O.' && !line.includes('RÉGIMEN TARIFARIO')) {
      if (line.length > 3) currentAct = line;
    }
  }
}

const content = `export const ordenanzaData = {
  clasificaciones: ['Residencial', 'Comercial/Institucional', 'Industrial', 'Otros'],
  tiposResidenciales: [
    { label: 'Tipo I: Viviendas en zonas populares', factor: 0.50 },
    { label: 'Tipo II: Casas', factor: 0.80 },
    { label: 'Tipo III: Apartamentos', factor: 0.91 },
    { label: 'Tipo IV: Penthouse, Town House, Quintas, Villas', factor: 1.06 }
  ],
  zonasResidenciales: [
    { label: 'ZONA A', factor: 1.0 },
    { label: 'ZONA B', factor: 0.8 },
    { label: 'ZONA C', factor: 0.6 },
    { label: 'ZONA D', factor: 0.4 }
  ],
  nivelesMetraje: [
    'Generación Baja',
    'Generación Media',
    'Generación Alta'
  ],
  actividadesComerciales: ${JSON.stringify(tablaB, null, 4)}
};
`;

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/data/ordenanza.ts', content);
console.log(`Extraídas ${tablaB.length} actividades comerciales de la Ordenanza de Naguanagua.`);
