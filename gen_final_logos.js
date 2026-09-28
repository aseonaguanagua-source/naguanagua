const fs = require('fs');

let existing = fs.readFileSync('src/lib/logosBase64.ts', 'utf8');

function extractBase64(key) {
  const regex = new RegExp(key + ":\\s*'([^']+)'");
  const match = existing.match(regex);
  return match ? match[1] : '';
}

const globalGreen = extractBase64('global_green');
const globalRec = extractBase64('global_rec');
const basuraCero = extractBase64('basura_cero');

const iamec = fs.readFileSync('logos/IAMEC.png').toString('base64');
const alcaldia = fs.readFileSync('logos/NAGUANAGUATEQUIERO.png').toString('base64');
const instituto = fs.readFileSync('logos/INSTITUTO.jpg').toString('base64');

const content = `// Este archivo contiene los logos en formato base64 para uso en PDF o Excel
export const logos = {
  iamec: 'data:image/png;base64,${iamec}',
  alcaldia: 'data:image/png;base64,${alcaldia}',
  instituto: 'data:image/jpeg;base64,${instituto}',
  global_green: '${globalGreen}',
  global_rec: '${globalRec}',
  basura_cero: '${basuraCero}'
};
`;

fs.writeFileSync('src/lib/logosBase64.ts', content, 'utf8');
console.log("Logos generated correctly with kept old logos");
