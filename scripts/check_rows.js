const xlsx = require('xlsx');
const path = require('path');
const file = path.join('/Users/davidzara/Documents/naguanagua_zero/bd naguanagua', 'Reporte_Contribuyentes.xlsx');
const wb = xlsx.readFile(file);
const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
console.log("Total rows:", data.length);
