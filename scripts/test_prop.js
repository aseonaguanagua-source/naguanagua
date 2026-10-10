const fs = require('fs');

const sqlContent = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql', 'utf8');
const regex = new RegExp(`INSERT INTO public."users".*?VALUES\\s*([\\s\\S]*?);`, 'g');
let oldUsers = [];
let match;
while ((match = regex.exec(sqlContent)) !== null) {
  let inString = false, currentTuple = [], currentVal = '';
  const valuesString = match[1];
  for (let i = 0; i < valuesString.length; i++) {
    const char = valuesString[i];
    if (char === "'" && !inString) inString = true;
    else if (char === "'" && inString) {
      if (valuesString[i+1] === "'") { currentVal += "'"; i++; }
      else inString = false;
    } else if (char === ',' && !inString) {
      currentTuple.push(currentVal.trim()); currentVal = '';
    } else if (char === ')' && !inString) {
      currentTuple.push(currentVal.trim()); oldUsers.push(currentTuple);
      currentTuple = []; currentVal = '';
      while(i + 1 < valuesString.length && valuesString[i+1] !== '(') i++;
      if (i + 1 < valuesString.length && valuesString[i+1] === '(') i++;
    } else if (char === '(' && !inString && currentTuple.length === 0 && currentVal.trim() === '') {}
    else currentVal += char;
  }
}

const u = oldUsers.find(x => x[9] === "'15496661'" || x[9] === "'V-15496661'");
console.log("User in dump:", u ? { id: u[0], doc: u[9], name: u[1] } : "Not found");
if (u) {
  const userId = u[0];
  const regexP = new RegExp(`INSERT INTO public."properties".*?VALUES\\s*([\\s\\S]*?);`, 'g');
  let matchP;
  let oldProps = [];
  while ((matchP = regexP.exec(sqlContent)) !== null) {
    let inString = false, currentTuple = [], currentVal = '';
    const valuesString = matchP[1];
    for (let i = 0; i < valuesString.length; i++) {
      const char = valuesString[i];
      if (char === "'" && !inString) inString = true;
      else if (char === "'" && inString) {
        if (valuesString[i+1] === "'") { currentVal += "'"; i++; }
        else inString = false;
      } else if (char === ',' && !inString) {
        currentTuple.push(currentVal.trim()); currentVal = '';
      } else if (char === ')' && !inString) {
        currentTuple.push(currentVal.trim()); oldProps.push(currentTuple);
        currentTuple = []; currentVal = '';
        while(i + 1 < valuesString.length && valuesString[i+1] !== '(') i++;
        if (i + 1 < valuesString.length && valuesString[i+1] === '(') i++;
      } else if (char === '(' && !inString && currentTuple.length === 0 && currentVal.trim() === '') {}
      else currentVal += char;
    }
  }
  
  const props = oldProps.filter(p => p[1] === userId);
  console.log("Properties for user in dump:", props.map(p => ({ propId: p[0], userId: p[1], code: p[10] })));
}

