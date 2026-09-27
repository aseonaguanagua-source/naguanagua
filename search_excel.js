const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

const dir = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));

files.forEach(f => {
  console.log('Searching in:', f);
  const wb = xlsx.readFile(path.join(dir, f));
  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(ws, { raw: false });
    const matches = data.filter(row => JSON.stringify(row).includes('19109082'));
    if (matches.length > 0) {
      console.log('FOUND IN', f, 'SHEET:', sheetName);
      console.log(matches);
    }
  });
});
