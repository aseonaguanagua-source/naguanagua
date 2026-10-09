const fs = require('fs');

const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');
const lines = sql.split('\n');

let inmuebles = {}; 
let actEco = {}; 
let actividades = {}; 

let currentTable = null;

for (const line of lines) {
  if (line.includes('INSERT INTO public.sed_inmuebles ') || line.includes('INSERT INTO "public"."sed_inmuebles"') || line.includes('INSERT INTO `sed_inmuebles`') || line.includes('sed_inmuebles')) {
    if (line.includes('VALUES')) currentTable = 'inmuebles';
  }
  else if (line.includes('sed_inmuebles_actividades_eco')) {
    if (line.includes('VALUES')) currentTable = 'actividades_eco';
  }
  else if (line.includes('sed_actividades_economicas')) {
    if (line.includes('VALUES')) currentTable = 'actividades';
  }
  else if (line.trim().endsWith(';')) {
    // End of statement
  }

  // Some pg dumps put VALUES and then rows.
  // Actually, we can just guess the table by the structure!
  if (line.trim().match(/^\(\d+,\s*\d+,/)) {
    const vals = line.trim().replace(/,\s*$/, '').replace(/^\(|\)$/g, '').split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
    
    // sed_inmuebles usually has many columns (like 50+)
    if (vals.length >= 23 && vals[10].startsWith('URB')) {
      const id = vals[0];
      const inmueble = vals[10];
      const padre_id = vals[22];
      inmuebles[id] = { inmueble, padre_id };
    }
    // sed_inmuebles_actividades_eco usually has fewer columns and links to inmuebles
    else if (vals.length >= 3 && vals.length < 20) {
      // id, actividades_economicas_id, inmuebles_id
      const actId = vals[1];
      const inmId = vals[2];
      if (actId !== 'NULL' && inmId !== 'NULL') {
        if (!actEco[inmId]) actEco[inmId] = [];
        actEco[inmId].push(actId);
      }
    }
  }

  // sed_actividades_economicas has string as 4th element usually
  if (line.trim().match(/^\(\d+,\s*(?:\d+|NULL),\s*(?:\d+|NULL),\s*'/)) {
    const vals = line.trim().replace(/,\s*$/, '').replace(/^\(|\)$/g, '').split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
    if (vals.length >= 4) {
      const id = vals[0];
      const act = vals[3];
      actividades[id] = act;
    }
  }
}

const sambilChildrenIds = Object.keys(inmuebles).filter(k => inmuebles[k].padre_id === '21000' || inmuebles[k].inmueble === 'URB016119');

let results = {};
for (const id of sambilChildrenIds) {
  const code = inmuebles[id].inmueble;
  const aecoList = actEco[id] || [];
  const actNames = aecoList.map(aId => actividades[aId] || `UNKNOWN_ACT_${aId}`);
  results[code] = actNames;
}

fs.writeFileSync('scratch/sambil_activities_extracted.json', JSON.stringify(results, null, 2));
console.log(`Saved ${Object.keys(results).length} records to sambil_activities_extracted.json`);
