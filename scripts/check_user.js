const xlsx = require('xlsx');
const path = require('path');

const dir = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua';
const wb = xlsx.readFile(path.join(dir, 'Contribuyentes - 20260921214151.xlsx'));
const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

for (const r of data) {
  if(r['C.I. / RIF'] === 'V-11814405' || r['C.I. / RIF'] === 'J-11814405') {
    console.log("Found in 20260921214151:", r);
  }
}

const wb2 = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx');
const data2 = xlsx.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]]);

for (const r of data2) {
  if(r['Documento'] === 'V-11814405' || r['Documento'] === 'J-11814405') {
    console.log("Found in DATA:", r);
  }
}
