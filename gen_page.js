const fs = require('fs');
const src = String.raw`C:\Users\david\globaltucacas\src\conciliacion_full.tsx`;
const dst = String.raw`C:\Users\david\Desktop\tucacas\global_green_tucacas\src\app\(admin)\admin\caja\conciliacion\page.tsx`;
const content = fs.readFileSync(src, 'utf8');
fs.writeFileSync(dst, content, 'utf8');
console.log('Copiado OK:', dst, content.length, 'bytes');
