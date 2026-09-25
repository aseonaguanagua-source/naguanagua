const xlsx = require('xlsx');
const path = require('path');
const file = path.join('/Users/davidzara/Documents/naguanagua_zero/bd naguanagua', 'Contribuyentes - 20260921213903.xlsx');
const wb = xlsx.readFile(file);
const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

console.log(data[0]);
console.log(data[1]);
