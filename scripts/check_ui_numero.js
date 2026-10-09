const fs = require('fs');
const code = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/dashboard/condominios/CondominioPanel.tsx', 'utf8');
const lines = code.split('\n');
const match = lines.filter(l => l.includes('numero') || l.includes('eliminado') || l.includes('Eliminada') || l.includes('estado de cuenta'));
console.log(match);
