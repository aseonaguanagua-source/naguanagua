const xlsx = require('xlsx');
const path = require('path');

try {
  const dir = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua';
  const reportes = ['Reporte_Condominios_y_Hijos.xlsx', 'Reporte_Contribuyentes.xlsx'];
  
  for(let file of reportes) {
    console.log(`\n--- Reading ${file} ---`);
    const filePath = path.join(dir, file);
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log("Headers:");
    console.log(data[0]);
    console.log("Sample Data:");
    console.log(data[1]);
  }
} catch (e) {
  console.error("Error reading excel:", e);
}
