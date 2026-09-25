const xlsx = require('xlsx');
const wb = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx');
const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
console.log(Object.keys(data[0]));
console.log(data[0]);
