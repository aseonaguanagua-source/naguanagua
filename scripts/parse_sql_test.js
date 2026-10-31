const fs = require('fs');
const path = require('path');

const sqlPath = process.env.SQL_DUMP_PATH || path.resolve(__dirname, '../../documentos/filtered_naguanagua_data.sql');

if (!fs.existsSync(sqlPath)) {
  console.error(`Error: No se encontró el archivo SQL en ${sqlPath}`);
  process.exit(1);
}

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

function parseSqlValues(tableName) {
  const records = [];
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  const regex = new RegExp(`INSERT INTO public\\."${safeTable}".*?VALUES\\s*([\\s\\S]*?);`, 'g');
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    const valuesString = match[1];
    
    let inString = false;
    let currentTuple = [];
    let currentVal = '';
    
    for (let i = 0; i < valuesString.length; i++) {
      const char = valuesString[i];
      
      if (char === '\\' && inString && i + 1 < valuesString.length) {
        currentVal += char + valuesString[i + 1];
        i++;
        continue;
      }

      if (char === "'" && !inString) {
        inString = true;
      } else if (char === "'" && inString) {
        if (valuesString[i + 1] === "'") {
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
        while (i + 1 < valuesString.length && valuesString[i + 1] !== '(') {
          i++;
        }
        if (i + 1 < valuesString.length && valuesString[i + 1] === '(') {
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
