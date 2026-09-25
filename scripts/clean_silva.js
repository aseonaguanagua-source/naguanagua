/**
 * FASE M6: Limpiar TODAS las referencias a Municipio Silva
 * Reemplazar por referencias a Naguanagua
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src';

// Mapeo de reemplazos (orden importa — más específicos primero)
const replacements = [
  // URLs y dominios
  ['aseosilvaad.globalrecca.com', 'aseonaguanaguaad.globalrecca.com'],
  ['aseosilva.globalrecca.com', 'aseonaguanagua.globalrecca.com'],
  ['aseodesilva.sirid.net', 'aseonaguanagua.sirid.net'],
  
  // Emails
  ['aseo.municipiosilva@globalgreenca.com', 'isma.naguanagua@globalgreenca.com'],
  ['aseodesilva@sirid.net', 'isma.naguanagua@sirid.net'],
  
  // Redes sociales
  ['@ismamunicipiosilva', '@ismanaguanagua'],
  ['@alcaldiadesilvaoficial', '@alcaldianaguanagua'],
  
  // Nombres institucionales
  ['INSTITUTO DE AMBIENTE DEL MUNICIPIO SILVA (Instituto de Aseo) / ALCALD&Iacute;A DEL MUNICIPIO SILVA', 'INSTITUTO DE SANEAMIENTO AMBIENTAL (ISMA) / ALCALDÍA DE NAGUANAGUA'],
  ['Instituto de Aseo Aseo Urbano', 'ISMA Naguanagua'],
  ['Instituto de Aseo (MUNICIPIO SILVA)', 'ISMA Naguanagua'],
  ['REPORTE DE MOROSOS — Instituto de Aseo (MUNICIPIO SILVA)', 'REPORTE DE MOROSOS — ISMA Naguanagua'],
  ['COMERCIANTES, CONTRIBUYENTES Y COMUNIDAD EN GENERAL DEL MUNICIPIO SILVA', 'COMERCIANTES, CONTRIBUYENTES Y COMUNIDAD EN GENERAL DE NAGUANAGUA'],
  
  // Títulos
  ['Global Rec Mun Silva', 'ISMA Naguanagua'],
  ['SiRID - SILVA', 'ISMA - NAGUANAGUA'],
  
  // Direcciones
  ['TUCACAS MUNICIPIO SILVA, FALCÓN', 'NAGUANAGUA, CARABOBO'],
  ['Tucacas Municipio Silva', 'Naguanagua, Carabobo'],
  
  // Correo sender
  ["from: 'Global Rec <aseo.municipiosilva@globalgreenca.com>'", "from: 'ISMA Naguanagua <isma.naguanagua@globalgreenca.com>'"],
  ["from: 'Instituto de Aseo Aseo Urbano <aseo.municipiosilva@globalgreenca.com>'", "from: 'ISMA Naguanagua <isma.naguanagua@globalgreenca.com>'"],
];

// Archivos a procesar
const files = execSync(`find ${BASE} -type f \\( -name "*.tsx" -o -name "*.ts" \\)`, { encoding: 'utf8' })
  .split('\n')
  .filter(f => f.trim());

let totalChanges = 0;
const changedFiles = [];

for (const filePath of files) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch { continue; }
  
  let modified = content;
  let fileChanges = 0;
  
  for (const [from, to] of replacements) {
    const count = (modified.split(from).length - 1);
    if (count > 0) {
      modified = modified.split(from).join(to);
      fileChanges += count;
    }
  }
  
  if (fileChanges > 0) {
    fs.writeFileSync(filePath, modified, 'utf8');
    totalChanges += fileChanges;
    const rel = path.relative(BASE, filePath);
    changedFiles.push(`  ✅ ${rel} (${fileChanges} cambios)`);
  }
}

console.log('🧹 FASE M6: Limpieza de referencias a Municipio Silva\n');
console.log('Archivos modificados:');
changedFiles.forEach(f => console.log(f));
console.log(`\nTotal: ${totalChanges} reemplazos en ${changedFiles.length} archivos`);
