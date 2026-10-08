const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[2];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

const ids = new Set();
let duplicates = [];
for (let i = 6; i < data.length; i++) {
  const row = data[i];
  if (row && row.length >= 12 && typeof row[0] === 'string' && row[0].startsWith('URB')) {
    if (ids.has(row[0])) {
      duplicates.push(row[0]);
    } else {
      ids.add(row[0]);
    }
  }
}
console.log(`Found ${duplicates.length} duplicate rows in Excel.`);
if (duplicates.length > 0) console.log(duplicates);
