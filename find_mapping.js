const fs = require('fs');
const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');

const lines = sql.split('\n');
let currentTable = '';
for (const line of lines) {
  if (line.startsWith('INSERT INTO') || line.startsWith('COPY')) {
    currentTable = line.substring(0, 80);
  }
  if (line.includes('13092') || line.includes('43213')) {
    console.log(currentTable);
    console.log(line.substring(0, 100));
  }
}
