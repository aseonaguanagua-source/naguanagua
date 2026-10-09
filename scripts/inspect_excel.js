const xlsx = require('xlsx');
const path = require('path');

const file = './scripts/Record de deudas - 20260924180506 (1).xlsx';
const wb = xlsx.readFile(file);
console.log('Sheets:', wb.SheetNames);
if (wb.SheetNames.length > 1) {
  const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1 });
  for (let i = 0; i < 15 && i < data.length; i++) {
    console.log(`Row ${i}:`, data[i]);
  }
}
