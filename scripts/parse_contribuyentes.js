const xlsx = require('xlsx');

const filePath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/Contribuyentes - 20260921214151.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {range: 3});

console.log("Total rows in Contribuyentes:", data.length);
if (data.length > 0) {
  console.log("Columns:", Object.keys(data[0]));
}

const sambilUnits = data.filter(r => {
  const jsonStr = JSON.stringify(r).toUpperCase();
  return jsonStr.includes('URB016119') || jsonStr.includes('SAMBIL');
});

console.log(`Found ${sambilUnits.length} Sambil rows in Contribuyentes`);

if (sambilUnits.length > 0) {
  const fs = require('fs');
  fs.writeFileSync('scratch/sambil_contribuyentes.json', JSON.stringify(sambilUnits, null, 2));
}
