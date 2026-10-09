const fs = require('fs');

const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');

// The columns for sed_inmuebles are known.
// INSERT INTO public.sed_inmuebles (id, contribuyente_id, condicion_inmueble_id, tipo_uso_id, zona_inmueble_id, urbanizacion_id, parroquia_id, cod_alcaldia, cod_catastro, nro_registro, inmueble, ...)
// The 11th value is `inmueble`. The 1st is `id`. The 23rd is `condominio_padre_id` (from observation: `21000` is the 23rd value in `URB016120`).

let inmuebles = {}; // id -> { inmueble, padre_id }

const lines = sql.split('\n');

let inInmuebles = false;
for (const line of lines) {
  if (line.includes('INSERT INTO public.sed_inmuebles')) {
    inInmuebles = true;
  }
  if (inInmuebles && line.startsWith('(')) {
    // line looks like: (21001, 21002, 1, 1, 10705, 0, 1, 'SN', '67508', 'SN', 'URB016120', '', NULL, '0', '0', ' F-29, F-31 HASTA F-35', 'NIVEL FERIA', 'URB...', '...', '...', NULL, 0, 21000, 0, FALSE, ...)
    const vals = line.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
    if (vals.length >= 23) {
      const id = vals[0].replace('(', '');
      const inmueble = vals[10];
      const padre_id = vals[22];
      inmuebles[id] = { inmueble, padre_id };
    }
  }
  if (inInmuebles && line.trim() === ');') {
    inInmuebles = false;
  }
}

console.log(`Parsed ${Object.keys(inmuebles).length} inmuebles.`);

const sambilChildrenIds = Object.keys(inmuebles).filter(k => inmuebles[k].padre_id === '21000' || inmuebles[k].inmueble === 'URB016119');
console.log(`Found ${sambilChildrenIds.length} Sambil units/parent.`);

// Now sed_inmuebles_actividades_eco
// INSERT INTO public.sed_inmuebles_actividades_eco (id, actividades_economicas_id, inmuebles_id, ...)
let actEco = {}; // inmuebles_id -> array of actividades_economicas_id
let inActEco = false;
for (const line of lines) {
  if (line.includes('INSERT INTO public.sed_inmuebles_actividades_eco')) {
    inActEco = true;
  }
  if (inActEco && line.startsWith('(')) {
    // (id, actividades_economicas_id, inmuebles_id) => (1, 105, 21001, ...)
    const vals = line.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim());
    const actId = vals[1];
    const inmId = vals[2];
    if (!actEco[inmId]) actEco[inmId] = [];
    actEco[inmId].push(actId);
  }
  if (inActEco && line.trim() === ');') {
    inActEco = false;
  }
}

// Now sed_actividades_economicas
// INSERT INTO public.sed_actividades_economicas (id, rubro_id, subrubro_id, actividad, ...)
// The 4th value is `actividad`.
let actividades = {}; // id -> nombre
let inAct = false;
for (const line of lines) {
  if (line.includes('INSERT INTO public.sed_actividades_economicas')) {
    inAct = true;
  }
  if (inAct && line.startsWith('(')) {
    const vals = line.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
    const id = vals[0].replace('(', '');
    const act = vals[3];
    actividades[id] = act;
  }
  if (inAct && line.trim() === ');') {
    inAct = false;
  }
}

let results = {};
for (const id of sambilChildrenIds) {
  const code = inmuebles[id].inmueble;
  const aecoList = actEco[id] || [];
  const actNames = aecoList.map(aId => actividades[aId] || `UNKNOWN_ACT_${aId}`);
  results[code] = actNames;
}

fs.writeFileSync('scratch/sambil_activities_extracted.json', JSON.stringify(results, null, 2));
console.log(`Saved ${Object.keys(results).length} records to sambil_activities_extracted.json`);
