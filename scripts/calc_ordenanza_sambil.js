const xlsx = require('xlsx');

// Mock of ordenanzaData to extract just what we need
const ordenanzaData = {
  actividadesComerciales: [
    { label: "INMUEBLES DESOCUPADOS", factores: [1.98, 1.98, 1.98] },
    { label: "INMUEBLES Y LOCALES DESOCUPADOS", factores: [1.98, 1.98, 1.98] },
    { label: "ABASTOS", factores: [2.39, 5.8, 9] },
    { label: "BODEGAS", factores: [1.54, 4.23, 6.61] },
    { label: "MINIMARKET", factores: [10.2, 15.3, 30.6] },
    { label: "VENTA DE EQUIPOS Y ARTICULOS ELECTRICOS", factores: [11.25, 23.35, 33.39] },
    // A lot of activities... let's just write a script that dynamically imports ordenanza from compiled TS or we just read the JSON.
  ]
};

// Instead of hardcoding, let's read the TS file by using ts-node or just parsing it?
// The compiled server code might not be accessible easily from plain node. Let's just read src/data/ordenanza.ts as text and parse the activities array.
const fs = require('fs');
const tsContent = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/data/ordenanza.ts', 'utf-8');

// Use regex or eval to get the actividadesComerciales
let actividades = [];
try {
  const match = tsContent.match(/actividadesComerciales:\s*(\[[\s\S]*?\])\s*,/);
  if (match) {
    // Dirty evaluate the array string (replacing some unquoted keys if necessary, but it looks like standard JSON or JS)
    // The snippet is valid JS array:
    actividades = eval(match[1]);
  }
} catch (e) {
  console.log("Error parsing actividades", e);
}

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[2]; 
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

let totalMmv = 0;
let matchCount = 0;
let unmatchCount = 0;

for (let i = 6; i < data.length; i++) {
  const row = data[i];
  if (row && row.length >= 12 && typeof row[0] === 'string' && row[0].startsWith('URB')) {
    let actividad = row[4] || 'N/A';
    actividad = actividad.toUpperCase().trim();
    
    if (actividad === 'N/A' || actividad === 'INMUEBLES DESOCUPADOS') {
      totalMmv += 1.98; // Default lowest
      matchCount++;
      continue;
    }

    const actMatch = actividades.find(a => a.label.toUpperCase().includes(actividad) || actividad.includes(a.label.toUpperCase()));
    if (actMatch) {
      totalMmv += actMatch.factores[0]; // Assume Generacion Baja
      matchCount++;
    } else {
      // If not found, assume base 1.98 or try to guess. Let's just use 1.98 for unmatched
      totalMmv += 1.98;
      unmatchCount++;
    }
  }
}

const TASA = 55927.2599;
const totalBs = totalMmv * TASA;
const totalBsConIva = totalBs * 1.16;

console.log(`Matched: ${matchCount}, Unmatched: ${unmatchCount}`);
console.log(`Total MMV Ordinance (Baja): ${totalMmv.toFixed(2)}`);
console.log(`Total Base Bs: ${totalBs.toFixed(2)}`);
console.log(`Total IVA Bs: ${totalBsConIva.toFixed(2)}`);
