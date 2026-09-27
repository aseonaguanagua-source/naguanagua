const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `        const emision = r.emision ? new Date(r.emision) : new Date();
        const isCurrentMonth = emision.getMonth() === new Date().getMonth() && emision.getFullYear() === new Date().getFullYear();
        const montoMulta = isCurrentMonth ? 0 : baseMonto * (esRes ? 0.10 : 0.12);`;

const replace1 = `        const emision = r.emision ? new Date(r.emision) : new Date();
        const today = new Date();
        const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
        const montoMulta = monthsDiff > 1 ? baseMonto * (esRes ? 0.10 : 0.12) : 0;`;

const target2 = `          const emision = f && f.emision ? new Date(f.emision) : new Date();
          const isCurrentMonth = emision.getMonth() === new Date().getMonth() && emision.getFullYear() === new Date().getFullYear();
          if (!isCurrentMonth) {
            smulta += bm * (esRes ? 0.10 : 0.12);
          }`;

const replace2 = `          const emision = f && f.emision ? new Date(f.emision) : new Date();
          const today = new Date();
          const monthsDiff = (today.getFullYear() - emision.getFullYear()) * 12 + (today.getMonth() - emision.getMonth());
          if (monthsDiff > 1) {
            smulta += bm * (esRes ? 0.10 : 0.12);
          }`;

let changed = false;
if (content.includes(target1)) {
  content = content.replace(target1, replace1);
  changed = true;
} else { console.log('Target 1 not found'); }

if (content.includes(target2)) {
  content = content.replace(target2, replace2);
  changed = true;
} else { console.log('Target 2 not found'); }

if(changed) fs.writeFileSync(file, content);
console.log('Done script');
