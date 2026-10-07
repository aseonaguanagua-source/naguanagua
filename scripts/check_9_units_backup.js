const fs = require('fs');

const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_cruce_sigyr_2026-10-06T21-35-01-443Z.json';
const resp = JSON.parse(fs.readFileSync(path, 'utf8'));

// Check what those 9 units are in the backup
const missing = ['URB015608', 'URB015607', 'URB017120', 'URB016581', 'URB016647', 'URB016633', 'URB016632', 'URB016631', 'URB016503'];

const found = resp.inmuebles.filter(i => missing.includes(i.inmueble));
console.log("Inmuebles in backup:");
found.forEach(i => console.log(i.inmueble, i.direccion));

console.log("Condominio unidades in backup:");
const foundUnidades = resp.condominio_unidades.filter(i => missing.includes(i.inmueble));
foundUnidades.forEach(i => console.log(i.inmueble, i.condominio_id));

