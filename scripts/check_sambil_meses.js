const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[2]; // Hoja 3
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

let maxMeses = 0;
let minMeses = 999;
let totalDeuda = 0;

for (let i = 8; i < data.length; i++) { // Skip headers
  const row = data[i];
  if (!row || row.length < 12 || !row[0].startsWith('URB')) continue;
  
  const meses = row[6];
  if (typeof meses === 'number') {
    if (meses > maxMeses) maxMeses = meses;
    if (meses < minMeses) minMeses = meses;
  }
}
console.log(`Max Meses: ${maxMeses}`);
console.log(`Min Meses: ${minMeses}`);
