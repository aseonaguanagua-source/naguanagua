const xlsx = require('xlsx');

const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
const sheetName = workbook.SheetNames[2]; // Hoja 3 (Detalle por Unidad)
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

for (let i = 6; i < 16; i++) {
  const row = data[i];
  if (!row || row.length < 12 || !row[0].startsWith('URB')) continue;
  console.log(`${row[0]} | RIF: ${row[1]} | Razón Social: ${row[2]}`);
}
