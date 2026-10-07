const fs = require('fs');

const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_cruce_sigyr_2026-10-06T21-35-01-443Z.json';
const resp = JSON.parse(fs.readFileSync(path, 'utf8'));

const deleted = ['URB015608', 'URB015607', 'URB017120', 'URB016581', 'URB016647', 'URB016633', 'URB016632', 'URB016631', 'URB016503'];

const found = resp.inmuebles.filter(i => deleted.includes(i.inmueble));
console.log("Deleted units found in backup:");
found.forEach(i => {
  console.log(i.inmueble, i.actividad_principal, i.direccion, i.identidad);
});
