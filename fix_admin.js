const fs = require('fs');

const file = 'src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('getFAR')) {
  content = content.replace("import { supabase } from '@/lib/supabase';", "import { supabase } from '@/lib/supabase';\nimport { getFAR } from '@/lib/calculos';");
}

const target = `        if (f.referencia?.startsWith('CM-') && tcmmv && tcmmv > 0) {
          const cant = parseFloat(inm.cant_inmuebles || 1);
          const mmv = parseFloat(inm.mmv_mes || 0);
          if (mmv > 0) baseMonto = parseFloat((cant * mmv * tcmmv).toFixed(2));
        }`;

const replacement = `        if (f.referencia?.startsWith('CM-') && tcmmv && tcmmv > 0) {
          const cant = parseFloat(inm.cant_inmuebles || 1);
          const mmv = parseFloat(inm.mmv_mes || 0);
          if (mmv > 0) {
            const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
            const ucdMult = esRes ? (57 * getFAR(inm.actividad_principal || '')) : (57 * 0.128);
            baseMonto = parseFloat((cant * mmv * ucdMult * tcmmv).toFixed(2));
          }
        }`;

if(content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log("Fixed target 1");
} else {
  console.log("Target 1 not found");
}

