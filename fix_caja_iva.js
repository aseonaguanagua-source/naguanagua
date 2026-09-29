const fs = require('fs');

let file = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

file = file.replace("if (user.Clasificacion === 'Residencial') {", "if ((user.Clasificacion || '').toLowerCase().includes('residencial')) {");

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', file, 'utf8');
console.log("Fixed caja iva check");
