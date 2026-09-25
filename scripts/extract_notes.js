const fs = require('fs');

const sqlContent = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql', 'utf8');

function cleanString(str) {
  if (!str || str === 'NULL') return '';
  return str.replace(/^'(.*)'$/, '$1').trim();
}

function parseSqlValues(tableName) {
  const records = [];
  const regex = new RegExp(`INSERT INTO public."${tableName}".*?VALUES\\s*([\\s\\S]*?);`, 'g');
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    const valuesString = match[1];
    let inString = false;
    let currentTuple = [];
    let currentVal = '';
    for (let i = 0; i < valuesString.length; i++) {
      const char = valuesString[i];
      if (char === "'" && !inString) {
        inString = true;
      } else if (char === "'" && inString) {
        if (valuesString[i+1] === "'") {
          currentVal += "'";
          i++;
        } else {
          inString = false;
        }
      } else if (char === ',' && !inString) {
         currentTuple.push(currentVal.trim());
         currentVal = '';
      } else if (char === ')' && !inString) {
         currentTuple.push(currentVal.trim());
         records.push(currentTuple);
         currentTuple = [];
         currentVal = '';
         while(i + 1 < valuesString.length && valuesString[i+1] !== '(') i++;
         if (i + 1 < valuesString.length && valuesString[i+1] === '(') i++;
      } else if (char === '(' && !inString && currentTuple.length === 0 && currentVal.trim() === '') {
      } else {
         currentVal += char;
      }
    }
  }
  return records;
}

const rawDocTypes = parseSqlValues('document_types');
const docTypeMap = new Map();
if (rawDocTypes.length === 0) {
  docTypeMap.set('1', 'V');
  docTypeMap.set('2', 'J');
  docTypeMap.set('3', 'E');
  docTypeMap.set('4', 'G');
  docTypeMap.set('5', 'P');
  docTypeMap.set('6', 'C');
} else {
  rawDocTypes.forEach(r => docTypeMap.set(cleanString(r[0]), cleanString(r[1])));
}

const oldUsers = parseSqlValues('users');
const notasMap = {};
let count = 0;

oldUsers.forEach(u => {
  if (!u || u.length < 23) return;
  const docTypeId = cleanString(u[8]);
  const docNum = cleanString(u[9]);
  const prefix = docTypeMap.get(docTypeId) || 'V';
  const cleanPrefix = prefix.replace(/[^A-Za-z]/g, '').toUpperCase();
  const identidadCompleta = `${cleanPrefix}-${docNum}`;
  
  const nota = cleanString(u[22]);
  if (nota && nota !== '') {
    notasMap[identidadCompleta] = nota;
    count++;
  }
});

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/scripts/notas_extraidas.json', JSON.stringify(notasMap, null, 2));
console.log(`Se extrajeron ${count} notas de la base de datos vieja.`);
