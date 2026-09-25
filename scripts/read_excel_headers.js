const xlsx = require('xlsx');
const path = require('path');

try {
  const filePath = path.join('/Users/davidzara/Documents/naguanagua_zero', 'DATA NAGUANAGUA.xlsx');
  const workbook = xlsx.readFile(filePath);
  console.log("Sheet names:", workbook.SheetNames);
  
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(firstSheet, { header: 1 });
  
  console.log("\nFirst row (headers):");
  console.log(JSON.stringify(data[0], null, 2));
  
  console.log("\nSecond row (data sample):");
  console.log(JSON.stringify(data[1], null, 2));
} catch (e) {
  console.error("Error reading excel:", e);
}
