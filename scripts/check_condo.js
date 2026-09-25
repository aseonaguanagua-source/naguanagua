const xlsx = require('xlsx');
const path = require('path');
const file = path.join('/Users/davidzara/Documents/naguanagua_zero/bd naguanagua', 'Reporte_Contribuyentes.xlsx');
const wb = xlsx.readFile(file);
const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const rows = data.filter(r => r['Código'] === 'URB025805' || r['Condominio'] === 'URB025805');
console.log(rows);
