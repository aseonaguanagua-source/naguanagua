const fs = require('fs');
const dumpPath = '/Users/davidzara/Documents/naguanagua_zero/respaldo_copias_HMR_1791307777623.json';

try {
  const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  console.log("Keys in dump:", Object.keys(data));
  
  if (data.inmuebles) {
    const sambilUnits = data.inmuebles.filter(x => x.direccion?.includes('SAMBIL') || x.inmueble === 'URB016119' || x.condominio_padre_id === 'URB016119');
    console.log(`Found ${sambilUnits.length} Sambil units in dump!`);
    fs.writeFileSync('scratch/sambil_old_dump.json', JSON.stringify(sambilUnits, null, 2));
    console.log("Saved to scratch/sambil_old_dump.json");
  }
} catch (e) {
  console.log("Error reading dump", e);
}
