const xlsx = require('xlsx');

function run() {
  const file = '/Users/davidzara/Downloads/DATA NAGUANAGUA.xlsx';
  const wb = xlsx.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log("Headers:", data[0]);
  console.log("First row:", data[1]);
}
run();
