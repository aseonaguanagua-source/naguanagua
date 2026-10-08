const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
for (const sheetName of workbook.SheetNames) {
  console.log(`\n--- Sheet: ${sheetName} ---`);
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  for (let i = 0; i < Math.min(10, data.length); i++) {
    console.log(`Row ${i}:`, data[i]);
  }
}
