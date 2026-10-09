const fs = require('fs');

const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');
const lines = sql.split('\n');

let tables = new Set();
for(let line of lines) {
  const m = line.match(/INSERT INTO\s+([a-zA-Z0-9_".]+)/i);
  if(m) tables.add(m[1].replace(/"/g, ''));
}
console.log(Array.from(tables));
