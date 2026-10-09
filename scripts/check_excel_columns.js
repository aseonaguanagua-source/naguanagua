const xlsx = require('xlsx');
const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx'));
for (const f of files) {
  try {
    const wb = xlsx.readFile(f);
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    // Convert sheet to json but keep raw arrays to see the exact structure
    const data = xlsx.utils.sheet_to_json(ws, { header: 1 });
    console.log(`\n=== File: ${f} ===`);
    // Find the first row that actually has headers
    let headerRow = null;
    for(let i=0; i<20; i++) {
       if (data[i] && data[i].length > 3) {
          headerRow = data[i];
          break;
       }
    }
    if (headerRow) {
      console.log('Headers:', headerRow);
    } else {
      console.log('No clear headers found in first 20 rows');
    }
  } catch(e) {}
}
