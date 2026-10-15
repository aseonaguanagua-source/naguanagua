import fs from 'fs';
import path from 'path';

const file = 'src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('const formatLocalNumberInput')) {
  const helpers = `
const parseLocalFloat = (val: string) => {
  if (!val) return 0;
  return parseFloat(val.replace(/\\./g, '').replace(',', '.')) || 0;
};
const formatLocalNumberInput = (val: string) => {
  if (!val) return '';
  let clean = val.replace(/[^0-9,]/g, '');
  const parts = clean.split(',');
  let intPart = parts[0];
  intPart = intPart.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
  if (parts.length > 1) {
    return intPart + ',' + parts[1].substring(0, 2);
  }
  return intPart;
};
`;
  content = content.replace("function CajaPageContent() {", helpers + "\nfunction CajaPageContent() {");
}

// Replaces for montoAbonoCondo
content = content.replace(/parseFloat\(montoAbonoCondo\)/g, "parseLocalFloat(montoAbonoCondo)");
// Exception: in setMontoAbonoCondo(e.target.value) we need to wrap it.
content = content.replace(/setMontoAbonoCondo\(e\.target\.value\)/g, "setMontoAbonoCondo(formatLocalNumberInput(e.target.value))");

// Replaces for montoDebito
// It currently has: parseFloat(montoDebito) and parseFloat(montoDebito.replace(',', '.'))
content = content.replace(/parseFloat\(montoDebito\.replace\([^)]+\)\)/g, "parseLocalFloat(montoDebito)");
content = content.replace(/parseFloat\(montoDebito\)/g, "parseLocalFloat(montoDebito)");
// Exception for onChange of montoDebito:
// const val = e.target.value.replace(/[^0-9,.]/g, '');
// setMontoDebito(val);
content = content.replace(/const val = e.target.value.replace\(\/[^0-9,.]\/g, ''\);\s*setMontoDebito\(val\);/g, "setMontoDebito(formatLocalNumberInput(e.target.value));");

// In the onBlur of montoDebito it does:
// let p = parseFloat(e.target.value.replace(',', '.'));
// if(!isNaN(p)) setMontoDebito(p.toFixed(2).replace('.', ','));
content = content.replace(/onBlur=\{e => \{\s*let p = parseFloat\([^)]+\);\s*if\(!isNaN\(p\)\) setMontoDebito\(p.toFixed\(2\).replace\('.', ','\)\);\s*\}\}/g, 
  "onBlur={e => { const p = parseLocalFloat(e.target.value); if (p > 0) setMontoDebito(formatLocalNumberInput(p.toFixed(2).replace('.', ','))); }}");

// also for montoTransferido?
content = content.replace(/parseFloat\(montoTransferido\.replace\([^)]+\)\)/g, "parseLocalFloat(montoTransferido)");
content = content.replace(/parseFloat\(montoTransferido\)/g, "parseLocalFloat(montoTransferido)");
content = content.replace(/const val = e.target.value.replace\(\/[^0-9,.]\/g, ''\);\s*setMontoTransferido\(val\);/g, "setMontoTransferido(formatLocalNumberInput(e.target.value));");
content = content.replace(/onBlur=\{e => \{\s*let p = parseFloat\([^)]+\);\s*if\(!isNaN\(p\)\) setMontoTransferido\(p.toFixed\(2\).replace\('.', ','\)\);\s*\}\}/g, 
  "onBlur={e => { const p = parseLocalFloat(e.target.value); if (p > 0) setMontoTransferido(formatLocalNumberInput(p.toFixed(2).replace('.', ','))); }}");


fs.writeFileSync(file, content);
console.log("Done fixing inputs in CajaPage.");
