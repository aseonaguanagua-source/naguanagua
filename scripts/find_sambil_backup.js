const fs = require('fs');

const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_cruce_sigyr_2026-10-06T21-35-01-443Z.json';
if (fs.existsSync(path)) {
  const resp = JSON.parse(fs.readFileSync(path, 'utf8'));
  
  // Find all units belonging to Sambil
  // Wait, the backup might not have "condominio_id". It has "inmuebles".
  // But wait, there is a `cruce_aplicado_detalle.json`!
  const det = JSON.parse(fs.readFileSync('/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/scratch/cruce_aplicado_detalle.json', 'utf8'));
  console.log(Object.keys(det));
} else {
  console.log("No backup found");
}
