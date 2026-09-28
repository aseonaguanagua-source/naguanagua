const fs = require('fs');

const file1 = 'src/lib/excelExport.ts';
let content1 = fs.readFileSync(file1, 'utf8');
content1 = content1.replace(/addLogo\(logos\.basura_cero, 6, 0, 100, 100\);/g, '');
fs.writeFileSync(file1, content1, 'utf8');

const file2 = 'src/lib/montoRecaudadoExport.ts';
if (fs.existsSync(file2)) {
  let content2 = fs.readFileSync(file2, 'utf8');
  fs.writeFileSync(file2, content2, 'utf8');
}
console.log("Fixed excel logos");
