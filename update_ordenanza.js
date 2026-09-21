const fs = require('fs');
const lines = fs.readFileSync('ocr.txt', 'utf8').split('\n').filter(l => l.trim().length > 0);
let activities = [];

let currentLabel = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (/^[0-9]+\s+[0-9]+/.test(line) || /^0\s+50/.test(line) || /^0\s+20/.test(line) || /^0\s+10/.test(line)) {
    const parts = line.split(/\s+/);
    let factors = [];
    for(let j=0; j<parts.length; j++) {
      if(parts[j].includes(',')) {
        factors.push(parseFloat(parts[j].replace(',', '.')));
      }
    }
    if (factors.length === 4) {
      activities.push({ label: currentLabel, factores: factors });
    } else {
      console.log('Error parsing factors for:', currentLabel, line, factors);
    }
  } else {
    if(i > 0 && !(/^[0-9]+\s+[0-9]+/.test(lines[i-1]))) {
      currentLabel += ' ' + line;
    } else {
      currentLabel = line;
    }
  }
}

let outputStr = 'export const ordenanzaData = {\n';
outputStr += '  clasificaciones: [\'Residencial\', \'Comercial/Institucional\', \'Mixto\', \'Industrial\', \'Otros\'],\n';
outputStr += '  tiposResidenciales: [\n';
outputStr += '    { label: \'Tipo I: Viviendas en zonas populares\', factor: 0.50 },\n';
outputStr += '    { label: \'Tipo II: Apartamentos\', factor: 3.00 },\n';
outputStr += '    { label: \'Tipo III: Casas\', factor: 2.50 },\n';
outputStr += '    { label: \'Tipo IV: Penthouse, Town House, Quintas, Villas\', factor: 5.00 }\n';
outputStr += '  ],\n';
outputStr += '  nivelesMetraje: [\n';
outputStr += '    \'0 - 50 m²\',\n';
outputStr += '    \'51 - 100 m²\',\n';
outputStr += '    \'101 - 200 m²\',\n';
outputStr += '    \'Mayor a 201 m²\'\n';
outputStr += '  ],\n';

let comerciales = activities.filter(a => !a.label.match(/Fábrica|Industria|Trituradora/i));
let industriales = activities.filter(a => a.label.match(/Fábrica|Industria|Trituradora/i));

outputStr += '  actividadesComerciales: [\n';
outputStr += comerciales.map(a => `    { label: '${a.label.replace(/'/g, "\\'")}', factores: [${a.factores.join(', ')}] }`).join(',\n');
outputStr += '\n  ],\n';
outputStr += '  actividadesIndustriales: [\n';
outputStr += industriales.map(a => `    { label: '${a.label.replace(/'/g, "\\'")}', factores: [${a.factores.join(', ')}] }`).join(',\n');
outputStr += '\n  ]\n';
outputStr += '};\n';

fs.writeFileSync('src/data/ordenanza.ts', outputStr);
console.log('Successfully wrote', comerciales.length + industriales.length, 'activities to ordenanza.ts');
