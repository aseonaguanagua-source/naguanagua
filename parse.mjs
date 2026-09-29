import fs from 'fs';
let code = fs.readFileSync('src/data/ordenanza.ts', 'utf8');
code = code.replace(/export const ordenanzaData: OrdenanzaType =/g, 'export const ordenanzaData =');
code = code.replace(/as any\[\]/g, '');
code = code.replace(/export interface .*{[\s\S]*?}/g, '');
fs.writeFileSync('ordenanza_es.mjs', code);
