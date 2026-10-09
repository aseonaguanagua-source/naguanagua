const fs = require('fs');

// The identities from the PDF (sample)
const targets = [
  '000792070', // CENTROS COMERCIALES INDEPENDIENTES
  '500858590', // ADG GLOBALMINDT MOTOR
  '504891479'  // MADERA GANGA II
];

const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');

// The old tables usually have "taxpayers" or "sed_inmuebles" or "sed_empresas"
// Let's just do a regex search for the first target to see what it looks like.
const lines = sql.split('\n');
for (const line of lines) {
  if (line.includes('000792070')) {
    console.log(line.substring(0, 500)); // just print first 500 chars of the insert
  }
}
