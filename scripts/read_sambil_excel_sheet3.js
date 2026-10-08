const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[2]; // Hoja 3 - Detalle por Unidad
console.log("SheetName:", sheetName);
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Total rows in Hoja 3:", data.length);
for (let i = 0; i < Math.min(20, data.length); i++) {
  console.log(data[i]);
}
