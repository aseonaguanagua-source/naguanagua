const fs = require('fs');
let path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/store/AppContext.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace('let allInmuebles: any[] = [];', 'let allInmuebles: any[] = [];\n      let apiCondominios: any[] = [];');
c = c.replace('allInmuebles = jsonResponse.inmuebles || [];', 'allInmuebles = jsonResponse.inmuebles || [];\n        apiCondominios = jsonResponse.condominios || [];');

const startIdx = c.indexOf('// --- Generar Condominios Dinámicamente ---');
const endIdx = c.indexOf('setCondominios(dbCondominiosList);') + 'setCondominios(dbCondominiosList);'.length;

if (startIdx !== -1 && endIdx !== -1) {
    const toReplace = c.substring(startIdx, endIdx);
    c = c.replace(toReplace, 'setCondominios(apiCondominios);');
}

fs.writeFileSync(path, c, 'utf8');
