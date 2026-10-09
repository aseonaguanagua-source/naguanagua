const { calcularMensualidad } = require('./src/lib/calculos.ts');
// I can't require TS. But I can read the source of bcv
const fs = require('fs');
console.log(fs.readFileSync('src/app/api/bcv/route.ts', 'utf8'));
