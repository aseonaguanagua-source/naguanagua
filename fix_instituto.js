const fs = require('fs');

// Update Base64
let base64 = fs.readFileSync('src/lib/logosBase64.ts', 'utf8');
const institutoPng = fs.readFileSync('logos/INSTITUTO.png').toString('base64');
base64 = base64.replace(/instituto: 'data:image\/jpeg;base64,[^']+'/, `instituto: 'data:image/png;base64,\${institutoPng}'`);
fs.writeFileSync('src/lib/logosBase64.ts', base64, 'utf8');

// Update page.tsx
let page = fs.readFileSync('src/app/page.tsx', 'utf8');
page = page.replace('className="footer-logo rounded"', 'className="footer-logo"');
fs.writeFileSync('src/app/page.tsx', page, 'utf8');

console.log("Fixed transparent PNG");
