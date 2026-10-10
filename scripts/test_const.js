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

const u = oldUsers.find(x => x[1].includes('CONSTANTINO') || x[9].includes('84584244'));
const us = oldUsers.filter(x => x[9].includes('84584244'));
console.log("Users with 84584244:", us.map(x => ({ id: x[0], name: x[1], doc: x[9] })));

const regexP = new RegExp(`INSERT INTO public."properties".*?VALUES\\s*([\\s\\S]*?);`, 'g');
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

const p = oldProps.filter(x => x[10] === "'URB006023'" || x[1] === us[0][0]);
console.log("URB006023 owner user_id:", p.map(x => ({ prop: x[10], user_id: x[1] })));

