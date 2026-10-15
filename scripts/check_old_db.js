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

const oldUsers = parseSqlValues('users');
const oldProperties = parseSqlValues('properties');

const userMap = new Map();
oldUsers.forEach(u => {
  userMap.set(cleanString(u[0]), {
    id: cleanString(u[0]),
    nombre: cleanString(u[1]),
    documento: cleanString(u[9]),
    email: cleanString(u[3]),
    telefono: cleanString(u[7]),
    direccion: cleanString(u[19])
  });
});

const oldProp = oldProperties.find(p => cleanString(p[10]) === 'URB001833');
if (oldProp) {
    console.log("OLD PROPERTY URB001833:", oldProp);
    console.log("OLD USER:", userMap.get(cleanString(oldProp[1])));
} else {
    console.log("URB001833 not found in old DB");
}
