const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[2]; 
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

let totalAseo = 0;
let totalIva = 0;
let totalTotal = 0;
let totalMontoMensual = 0;

for (let i = 6; i < data.length; i++) {
  const row = data[i];
  if (row && row.length >= 12 && typeof row[0] === 'string' && row[0].startsWith('URB')) {
    totalAseo += parseFloat(row[7]) || 0;
    totalIva += parseFloat(row[8]) || 0;
    totalTotal += parseFloat(row[11]) || 0;
    totalMontoMensual += parseFloat(row[5]) || 0;
  }
}
console.log(`Excel Sums for 225 units:`);
console.log(`Total Aseo: ${totalAseo}`);
console.log(`Total IVA: ${totalIva}`);
console.log(`Total Deuda Total: ${totalTotal}`);
console.log(`Total Monto Mensual: ${totalMontoMensual}`);
