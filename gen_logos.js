const fs = require('fs');

// Read existing to keep globalRec
let existing = fs.readFileSync('src/lib/logosBase64.ts', 'utf8');
let globalRecBase64 = "";
const match = existing.match(/globalRec:\s*'([^']+)'/);
if (match) {
  globalRecBase64 = match[1];
}

const iamec = fs.readFileSync('logos/IAMEC.png').toString('base64');
const naguanagua = fs.readFileSync('logos/NAGUANAGUATEQUIERO.png').toString('base64');
const instituto = fs.readFileSync('logos/INSTITUTO.jpg').toString('base64');

const content = `// Este archivo contiene los logos en formato base64 para uso en PDF o Excel
export const logos = {
  iamec: 'data:image/png;base64,${iamec}',
  alcaldia: 'data:image/png;base64,${naguanagua}',
  instituto: 'data:image/jpeg;base64,${instituto}',
  globalRec: '${globalRecBase64}'
};
`;
fs.writeFileSync('src/lib/logosBase64.ts', content, 'utf8');
console.log("Logos generated");
