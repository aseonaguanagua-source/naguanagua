const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/Reporte  inmuebles inscritos.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  if (row.includes('URB016127')) {
    console.log("Found URB016127:", row);
  }
}
