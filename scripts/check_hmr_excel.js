const xlsx = require('xlsx');

function checkFile(file) {
  try {
    const wb = xlsx.readFile(file);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    const hmrRows = data.filter(r => {
      return r.some(cell => String(cell).toLowerCase().includes('hmr') || String(cell).toLowerCase().includes('hesperia'));
    });
    
    if (hmrRows.length > 0) {
      console.log(`HMR found in ${file}!`);
      hmrRows.forEach(r => console.log(r));
    }
  } catch (e) {
    // console.log("Error reading", file, e.message);
  }
}

checkFile('/Users/davidzara/Downloads/DATA NAGUANAGUA.xlsx');
