const fs = require('fs');

const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
if (!fs.existsSync(sqlPath)) {
  console.log("SQL file not found.");
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

console.log("Extracting sed_inmuebles...");
const inmueblesMatch = [...sql.matchAll(/INSERT INTO\s+(?:public\.)?sed_inmuebles\s+\(([^)]+)\)\s+VALUES\s*\(([^)]+)\);/gi)];
console.log(`Found ${inmueblesMatch.length} inmuebles inserts. If 0, trying multi-value insert...`);

let inmuebles = {};
// Since pg_dump usually does COPY or multi-value INSERTs:
// INSERT INTO public.sed_inmuebles (...) VALUES (...), (...);
const multiInmueblesMatch = sql.match(/INSERT INTO\s+(?:public\.)?sed_inmuebles\s+\(([^)]+)\)\s+VALUES\s*([\s\S]*?);/i);

if (multiInmueblesMatch) {
  const cols = multiInmueblesMatch[1].split(',').map(c => c.trim().replace(/"/g, ''));
  const valsString = multiInmueblesMatch[2];
  
  // A crude parser for values: (val1, val2), (val3, val4)
  const regex = /\((.*?)\)/g;
  let m;
  while ((m = regex.exec(valsString)) !== null) {
    // split by comma but ignore commas inside quotes
    const vals = m[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
    let obj = {};
    cols.forEach((col, i) => {
      obj[col] = vals[i];
    });
    if (obj.inmueble) {
      inmuebles[obj.id] = obj.inmueble;
    }
  }
}
console.log(`Parsed ${Object.keys(inmuebles).length} inmuebles.`);

// Now parse sed_inmuebles_actividades_eco
console.log("Extracting sed_inmuebles_actividades_eco...");
let actividadesEco = [];
const multiActEcoMatch = sql.match(/INSERT INTO\s+(?:public\.)?sed_inmuebles_actividades_eco\s+\(([^)]+)\)\s+VALUES\s*([\s\S]*?);/i);
if (multiActEcoMatch) {
  const cols = multiActEcoMatch[1].split(',').map(c => c.trim().replace(/"/g, ''));
  const valsString = multiActEcoMatch[2];
  
  const regex = /\((.*?)\)/g;
  let m;
  while ((m = regex.exec(valsString)) !== null) {
    const vals = m[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
    let obj = {};
    cols.forEach((col, i) => {
      obj[col] = vals[i];
    });
    actividadesEco.push(obj);
  }
}
console.log(`Parsed ${actividadesEco.length} actividades eco.`);

// Now parse sed_actividades_economicas
console.log("Extracting sed_actividades_economicas...");
let actEconomicasDict = {};
const multiActMatch = sql.match(/INSERT INTO\s+(?:public\.)?sed_actividades_economicas\s+\(([^)]+)\)\s+VALUES\s*([\s\S]*?);/i);
if (multiActMatch) {
  const cols = multiActMatch[1].split(',').map(c => c.trim().replace(/"/g, ''));
  const valsString = multiActMatch[2];
  
  const regex = /\((.*?)\)/g;
  let m;
  while ((m = regex.exec(valsString)) !== null) {
    const vals = m[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
    let obj = {};
    cols.forEach((col, i) => {
      obj[col] = vals[i];
    });
    actEconomicasDict[obj.id] = obj.actividad;
  }
}
console.log(`Parsed ${Object.keys(actEconomicasDict).length} cat_actividades.`);

// Now find SAMBIL units
const sambilPrefix = 'URB016119';
const sambilInmIds = Object.keys(inmuebles).filter(id => inmuebles[id].startsWith(sambilPrefix));
console.log(`Found ${sambilInmIds.length} Sambil units in old DB.`);

let sambilData = {};
sambilInmIds.forEach(id => {
  const code = inmuebles[id];
  const acts = actividadesEco.filter(ae => ae.inmuebles_id === id || ae.inmueble_id === id);
  const actNames = acts.map(a => actEconomicasDict[a.actividades_economicas_id || a.actividad_economica_id] || 'UNKNOWN');
  
  sambilData[code] = actNames;
});

// Output a sample
const codes = Object.keys(sambilData);
console.log("Sample Sambil Units with Activities:");
for (let i = 0; i < Math.min(10, codes.length); i++) {
  console.log(`${codes[i]}: ${sambilData[codes[i]].join(' | ')}`);
}

fs.writeFileSync('scratch/sambil_activities_old.json', JSON.stringify(sambilData, null, 2));
console.log("Saved all to scratch/sambil_activities_old.json");

