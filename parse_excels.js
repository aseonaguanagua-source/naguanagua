const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.xlsx')) {
      try {
        const wb = xlsx.readFile(fullPath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`\n--- FILE: ${f} ---`);
        for (let i = 0; i < Math.min(5, data.length); i++) {
          if (data[i] && data[i].length > 0) {
            console.log(`Row ${i}:`, data[i]);
          }
        }
      } catch (e) {
        console.log(`Error reading ${f}: ${e.message}`);
      }
    }
  }
}

scanDir('C:\\Users\\david\\.gemini\\antigravity-ide\\brain\\fd7b78ed-fedc-412a-86ff-0f7a9ed686ba\\scratch\\PARA DAVID HOY 10 DE SEPT');
