const fs = require('fs');
let code = fs.readFileSync('src/data/ordenanza.ts', 'utf8');

// Strip export and types to make it valid JS
code = code.replace(/export const ordenanzaData: OrdenanzaType =/g, 'const ordenanzaData =');
code = code.replace(/export interface .*{[\s\S]*?}/g, '');
code += '\nmodule.exports = { ordenanzaData };';

fs.writeFileSync('ordenanza_js.js', code);
