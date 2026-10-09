const fs = require('fs');
const prefix = '/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/scratch/';

try {
  const bkp = JSON.parse(fs.readFileSync(prefix + 'backup_mmv_mes_comerciales.json'));
  const sambilUnits = bkp.filter(x => x.inmueble.startsWith('URB016119') || x.direccion?.includes('SAMBIL'));
  console.log(`Found ${sambilUnits.length} Sambil units in backup_mmv_mes_comerciales.json`);
} catch (e) {
  console.log("Could not read backup_mmv_mes_comerciales.json");
}

try {
  const com = JSON.parse(fs.readFileSync(prefix + 'comerciales.json'));
  const sambilCom = com.filter(x => x.inmueble.startsWith('URB016119') || x.direccion?.includes('SAMBIL'));
  console.log(`Found ${sambilCom.length} Sambil units in comerciales.json`);
} catch (e) {
  console.log("Could not read comerciales.json");
}

// Let's also check backup_facturas_conciliadas.json
try {
  const fac = JSON.parse(fs.readFileSync(prefix + 'backup_facturas_conciliadas.json'));
  console.log("Keys in fac:", Object.keys(fac).length);
} catch (e) {
  console.log("Could not read backup_facturas_conciliadas.json");
}
