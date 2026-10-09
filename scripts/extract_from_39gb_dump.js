const fs = require('fs');
const readline = require('readline');

const dumpPath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/sigyr_prod_20260826.sql';

async function processDump() {
  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let sed_inmuebles = {}; 
  let sed_inmuebles_act = {};
  let sed_act = {};

  let currentTable = null;
  let lineCount = 0;

  for await (const line of rl) {
    lineCount++;
    if (lineCount % 1000000 === 0) console.log(`Processed ${lineCount} lines...`);

    if (line.includes('COPY public.sed_inmuebles ')) {
      currentTable = 'inmuebles';
      continue;
    } else if (line.includes('COPY public.sed_inmuebles_actividades_eco ')) {
      currentTable = 'inmuebles_act';
      continue;
    } else if (line.includes('COPY public.sed_actividades_economicas ')) {
      currentTable = 'actividades';
      continue;
    } else if (line.startsWith('\\.')) {
      currentTable = null;
    } else if (line.startsWith('INSERT INTO public.')) {
      // In case it's INSERTs instead of COPY
      if (line.includes('sed_inmuebles (')) currentTable = 'inmuebles_insert';
      else if (line.includes('sed_inmuebles_actividades_eco')) currentTable = 'inmuebles_act_insert';
      else if (line.includes('sed_actividades_economicas')) currentTable = 'actividades_insert';
    }

    if (currentTable === 'inmuebles') {
      const parts = line.split('\t');
      // pg_dump COPY format is tab-separated
      if (parts.length > 20) {
        const id = parts[0];
        const inmueble = parts[10];
        const padre_id = parts[22];
        if (padre_id === '21000' || inmueble.startsWith('URB016') || inmueble.startsWith('URB033') || inmueble.startsWith('URB035')) {
          sed_inmuebles[id] = { inmueble, padre_id };
        }
      }
    } else if (currentTable === 'inmuebles_act') {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const inmId = parts[2];
        const actId = parts[1];
        if (!sed_inmuebles_act[inmId]) sed_inmuebles_act[inmId] = [];
        sed_inmuebles_act[inmId].push(actId);
      }
    } else if (currentTable === 'actividades') {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const id = parts[0];
        const act = parts[3];
        sed_act[id] = act;
      }
    } else if (currentTable === 'inmuebles_insert' || currentTable === 'inmuebles_act_insert' || currentTable === 'actividades_insert') {
      // Extract from multi-value insert if present
      if (line.trim().startsWith('(')) {
        const vals = line.trim().replace(/,\s*$/, '').replace(/^\(|\)$/g, '').split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ''));
        if (currentTable === 'inmuebles_insert' && vals.length >= 23) {
          sed_inmuebles[vals[0]] = { inmueble: vals[10], padre_id: vals[22] };
        } else if (currentTable === 'inmuebles_act_insert' && vals.length >= 3) {
          const inmId = vals[2];
          if (!sed_inmuebles_act[inmId]) sed_inmuebles_act[inmId] = [];
          sed_inmuebles_act[inmId].push(vals[1]);
        } else if (currentTable === 'actividades_insert' && vals.length >= 4) {
          sed_act[vals[0]] = vals[3];
        }
      }
    }
  }

  console.log(`Finished reading. Found ${Object.keys(sed_inmuebles).length} relevant inmuebles.`);

  const sambilChildren = Object.values(sed_inmuebles).filter(x => x.padre_id === '21000' || x.inmueble === 'URB016119');
  console.log(`Of those, ${sambilChildren.length} belong to Sambil.`);

  let results = {};
  for (const id in sed_inmuebles) {
    const code = sed_inmuebles[id].inmueble;
    const aecoList = sed_inmuebles_act[id] || [];
    const actNames = aecoList.map(aId => sed_act[aId] || `UNKNOWN_ACT_${aId}`);
    results[code] = actNames;
  }

  fs.writeFileSync('scratch/sambil_activities_39gb.json', JSON.stringify(results, null, 2));
  console.log("Saved to scratch/sambil_activities_39gb.json");
}

processDump().catch(console.error);
