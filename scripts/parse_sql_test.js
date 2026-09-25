const fs = require('fs');

const sqlContent = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql', 'utf8');

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
          i++; // skip next quote
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
         
         // fast forward to next tuple
         while(i + 1 < valuesString.length && valuesString[i+1] !== '(') {
           i++;
         }
         if (i + 1 < valuesString.length && valuesString[i+1] === '(') {
           i++; // eat the '('
         }
      } else if (char === '(' && !inString && currentTuple.length === 0 && currentVal.trim() === '') {
         // Start of tuple
      } else {
         currentVal += char;
      }
    }
  }
  return records;
}

const users = parseSqlValues('users');
console.log('Parsed users:', users.length);
if (users.length > 0) {
  console.log('First user:', users[0]);
}

const properties = parseSqlValues('properties');
console.log('Parsed properties:', properties.length);
if (properties.length > 0) {
  console.log('First property:', properties[0]);
}
