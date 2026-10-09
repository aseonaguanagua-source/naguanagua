const fs = require('fs');

try {
  const bkp = JSON.parse(fs.readFileSync('scratch/backup_mmv_mes_comerciales.json'));
  const sambilUnits = bkp.filter(x => x.inmueble.startsWith('URB016119') || x.direccion?.includes('SAMBIL'));
  console.log(`Found ${sambilUnits.length} Sambil units in backup_mmv_mes_comerciales.json`);
} catch (e) {
  console.log("Could not read backup_mmv_mes_comerciales.json");
}

try {
  const com = JSON.parse(fs.readFileSync('scratch/comerciales.json'));
  const sambilCom = com.filter(x => x.inmueble.startsWith('URB016119') || x.direccion?.includes('SAMBIL'));
  console.log(`Found ${sambilCom.length} Sambil units in comerciales.json`);
} catch (e) {
  console.log("Could not read comerciales.json");
}
