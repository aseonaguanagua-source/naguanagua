const xlsx = require('xlsx');

const filePath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/Record de deudas - 20260924180506.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

console.log("Total rows in Record de deudas:", data.length);
if (data.length > 0) {
  console.log("Columns:", Object.keys(data[0]));
}

const sambilUnits = data.filter(r => {
  const jsonStr = JSON.stringify(r).toUpperCase();
  return jsonStr.includes('URB016119') || jsonStr.includes('SAMBIL');
});

console.log(`Found ${sambilUnits.length} Sambil rows in Record de deudas`);

if (sambilUnits.length > 0) {
  const fs = require('fs');
  fs.writeFileSync('scratch/sambil_record_deudas.json', JSON.stringify(sambilUnits, null, 2));
}
