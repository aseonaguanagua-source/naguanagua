const fs = require('fs');
const path = './src/data/ordenanza.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace('export const ordenanzaData =', 'const ordenanzaData =');
content += '\nmodule.exports = { ordenanzaData };';
fs.writeFileSync('./ordenanza_mock.js', content);
