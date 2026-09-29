const fs = require('fs');

let file = fs.readFileSync('src/lib/calculos.ts', 'utf8');

file = file.replace('act.includes("quinta (a)") || act.includes("quinta (b)")', 'act.includes("quinta (zona a)") || act.includes("quinta (zona b)")');
file = file.replace('act.includes("apartamento (a)") || act.includes("apartamento (b)")', 'act.includes("apartamento (zona a)") || act.includes("apartamento (zona b)")');
file = file.replace('act.includes("casa (c)")', 'act.includes("casa (zona c)")');
file = file.replace('act.includes("apartamento (c)")', 'act.includes("apartamento (zona c)")');
file = file.replace('act.includes("casa (d)")', 'act.includes("casa (zona d)")');

file = file.replace('act.includes("quinta (a)")', 'act.includes("quinta (zona a)")');
file = file.replace('act.includes("apartamento (a)")', 'act.includes("apartamento (zona a)")');
file = file.replace('act.includes("quinta (b)")', 'act.includes("quinta (zona b)")');
file = file.replace('act.includes("apartamento (b)")', 'act.includes("apartamento (zona b)")');
file = file.replace('act.includes("casa (c)")', 'act.includes("casa (zona c)")');
file = file.replace('act.includes("apartamento (c)")', 'act.includes("apartamento (zona c)")');
file = file.replace('act.includes("casa (d)")', 'act.includes("casa (zona d)")');

fs.writeFileSync('src/lib/calculos.ts', file, 'utf8');
console.log("Fixed calculos strings");
