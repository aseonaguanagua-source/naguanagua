const fs = require('fs');
const content = fs.readFileSync('./src/data/ordenanza.ts', 'utf8');
// remove export const ordenanzaData = 
const jsonStr = content.replace('export const ordenanzaData = ', '').replace(/;/g, '');
// Wait, it's a TS file with javascript object, so we can just execute it.
fs.writeFileSync('./src/data/ordenanza_mock.js', content.replace('export const ordenanzaData =', 'const ordenanzaData =') + '\nmodule.exports = { ordenanzaData };');
