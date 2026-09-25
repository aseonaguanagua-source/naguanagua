const xlsx = require('xlsx');
const path = require('path');

try {
  const filePath = path.join('/Users/davidzara/Documents/naguanagua_zero', 'DATA NAGUANAGUA.xlsx');
  const workbook = xlsx.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(firstSheet);
  
  let hyphens = 0;
  let sampleHyphen = null;
  
  data.forEach(r => {
    if(r['Código'] && r['Código'].includes('-')) {
      hyphens++;
      sampleHyphen = sampleHyphen || r;
    }
  });
  
  console.log("Hyphens in Código:", hyphens);
  console.log("Sample Hyphen:", sampleHyphen);
  
} catch (e) {
  console.error("Error reading excel:", e);
}
