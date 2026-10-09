const fs = require('fs');
const dumpPath = '/Users/davidzara/Documents/naguanagua_zero/respaldo_copias_HMR_1791307777623.json';

try {
  const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  console.log("Length of dump:", data.length);
  
  if (Array.isArray(data)) {
    const sambilUnits = data.filter(x => 
      (x.direccion && x.direccion.includes('SAMBIL')) || 
      x.inmueble === 'URB016119' || 
      x.condominio_padre_id === 'URB016119'
    );
    console.log(`Found ${sambilUnits.length} Sambil units in dump!`);
    fs.writeFileSync('scratch/sambil_old_dump.json', JSON.stringify(sambilUnits, null, 2));
    console.log("Saved to scratch/sambil_old_dump.json");
    
    // Check what the first one looks like
    if(sambilUnits.length > 0) {
      console.log("Sample:", { inmueble: sambilUnits[0].inmueble, actividad: sambilUnits[0].actividad_principal || sambilUnits[0].actividad });
    }
  }
} catch (e) {
  console.log("Error reading dump", e);
}
