const fs = require('fs');

let base64 = fs.readFileSync('src/lib/logosBase64.ts', 'utf8');
const institutoPng = fs.readFileSync('logos/INSTITUTO.png').toString('base64');
base64 = base64.replace(/instituto:\s*'data:image\/png;base64,\$\{institutoPng\}'/, "instituto: 'data:image/png;base64," + institutoPng + "'");
fs.writeFileSync('src/lib/logosBase64.ts', base64, 'utf8');

console.log("Fixed base64");
