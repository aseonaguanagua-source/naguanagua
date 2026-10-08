const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Total rows:", data.length);
console.log("First 10 rows:");
for (let i = 0; i < Math.min(10, data.length); i++) {
  console.log(data[i]);
}
