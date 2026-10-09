const xlsx = require('xlsx');

function run() {
  const file = '/Users/davidzara/Downloads/DATA NAGUANAGUA.xlsx';
  const wb = xlsx.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // Condominio WTC is URB018483. Let's see if children reference it.
  // The columns: id, codigo, identidad, nombre, direccion, telefono, actividad_principal, ...
  const wtcRows = data.filter(r => String(r[4]).includes('URB018483') || String(r[2]) === 'J-312070412' || String(r[3]).includes('WORLD TRADE CENTER'));
  console.log("Found rows:", wtcRows.length);
  // wtcRows.forEach(r => console.log(r[3]));
}
run();
