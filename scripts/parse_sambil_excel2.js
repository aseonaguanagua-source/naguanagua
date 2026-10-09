const xlsx = require('xlsx');

const filePath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/EXCEL_MASTER_HIJOS_CONDOMINIOS.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

console.log("Total rows in EXCEL_MASTER_HIJOS_CONDOMINIOS:", data.length);
if (data.length > 0) {
  console.log("Columns:", Object.keys(data[0]));
}

const sambilUnits = data.filter(r => {
  const jsonStr = JSON.stringify(r).toUpperCase();
  return jsonStr.includes('URB016119') || jsonStr.includes('SAMBIL');
});

console.log(`Found ${sambilUnits.length} Sambil rows containing URB016119 or SAMBIL`);

if (sambilUnits.length > 0) {
  console.log(sambilUnits[0]);
  const fs = require('fs');
  fs.writeFileSync('scratch/sambil_master_excel.json', JSON.stringify(sambilUnits, null, 2));
}
