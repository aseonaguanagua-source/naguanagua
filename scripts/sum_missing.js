const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[2]; // Hoja 3
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

const missingIds = new Set([
  'URB035215', 'URB016271',
  'URB016308', 'URB016315',
  'URB035222', 'URB016148',
  'URB033586', 'URB016175',
  'URB016126', 'URB016288',
  'URB016314', 'URB016272',
  'URB016326'
]);

let missingTotalAseo = 0;
let missingTotal = 0;
for (let i = 6; i < data.length; i++) {
  const row = data[i];
  if (row && row.length >= 12 && typeof row[0] === 'string' && missingIds.has(row[0])) {
    missingTotalAseo += parseFloat(row[7]) || 0;
    missingTotal += parseFloat(row[11]) || 0;
  }
}

console.log(`Missing Total Aseo: ${missingTotalAseo}`);
console.log(`Missing Total Deuda: ${missingTotal}`);
