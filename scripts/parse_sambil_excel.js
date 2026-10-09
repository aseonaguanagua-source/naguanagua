const xlsx = require('xlsx');

const filePath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/EXCEL_MASTER_HIJOS_CONDOMINIOS.xlsx';
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

const sambilUnits = data.filter(r => r.condominio_padre === 'URB016119' || r.inmueble === 'URB016119');
console.log(`Found ${sambilUnits.length} Sambil rows in EXCEL_MASTER_HIJOS_CONDOMINIOS`);

if (sambilUnits.length > 0) {
  console.log(sambilUnits[0]);
  const fs = require('fs');
  fs.writeFileSync('scratch/sambil_master_excel.json', JSON.stringify(sambilUnits, null, 2));
}
