const fs = require('fs');
const content = fs.readFileSync('src/lib/condominios/motor.ts', 'utf8');
console.log(content.match(/.*tasa.*/g).slice(0, 10));
