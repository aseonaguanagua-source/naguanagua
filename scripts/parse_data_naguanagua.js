const xlsx = require('xlsx');

const filePath = '/Users/davidzara/Documents/naguanagua_zero/DATA NAGUANAGUA.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

console.log("Total rows in DATA NAGUANAGUA.xlsx:", data.length);
if (data.length > 0) {
  console.log("Columns:", Object.keys(data[0]));
}

const sambilUnits = data.filter(r => {
  const jsonStr = JSON.stringify(r).toUpperCase();
  return jsonStr.includes('URB016119') || jsonStr.includes('SAMBIL');
});

console.log(`Found ${sambilUnits.length} Sambil rows in DATA NAGUANAGUA.xlsx`);

if (sambilUnits.length > 0) {
  console.log("Sample missing unit (if any):");
  const fs = require('fs');
  fs.writeFileSync('scratch/sambil_data_nagua.json', JSON.stringify(sambilUnits, null, 2));
}
