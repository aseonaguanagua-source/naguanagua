const fs = require('fs');
const xlsx = require('xlsx');

const file = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/Record de deudas - 20260924180506.xlsx';
const wb = xlsx.readFile(file);
console.log('Sheets:', wb.SheetNames);
if (wb.SheetNames.length > 1) {
  const ws = wb.Sheets[wb.SheetNames[1]];
  const data = xlsx.utils.sheet_to_json(ws, { raw: false, header: 1 });
  console.log('Sheet 2 Row 0:', data[0]);
}
