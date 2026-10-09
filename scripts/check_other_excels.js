const xlsx = require('xlsx');

function checkFile(file) {
  try {
    const wb = xlsx.readFile(file);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    const wtcRows = data.filter(r => {
      return r.some(cell => String(cell).includes('URB018483') || String(cell).includes('312070412'));
    });
    
    if (wtcRows.length > 0) {
      console.log(`WTC found in ${file}!`);
      wtcRows.forEach(r => console.log(r));
    }
  } catch (e) {
    // console.log("Error reading", file, e.message);
  }
}

checkFile('/Users/davidzara/Downloads/DATA NAGUANAGUA.xlsx');
checkFile('/Users/davidzara/Downloads/Reporte  inmuebles inscritos 1-1 (1).xlsx');
checkFile('/Users/davidzara/Downloads/Record de deudas - 20261004174131.xlsx');
checkFile('/Users/davidzara/Downloads/Contribuyentes - 20260921213903.xlsx');
checkFile('/Users/davidzara/Downloads/Contribuyentes_1791508634087.xlsx');

