import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import { getFO, getFAR } from './src/lib/calculos';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('identidad, actividad_principal, clasificacion')
    .ilike('actividad_principal', '%desocupado%');
    
  if (error) {
    console.error(error);
    return;
  }
  
  let md = `# Escaneo de Inmuebles y Locales Desocupados\n\n`;
  md += `| Identidad | Clasificación | Actividad Principal | F.O. (Sistema) | Cálculo Base (Bs) | IVA (Bs) | Total Mensual |\n`;
  md += `|-----------|---------------|---------------------|----------------|-------------------|----------|---------------|\n`;
  
  let tcmmv = 976.90; // Approx rate for now
  
  const map = new Map();
  
  data.forEach(inm => {
    const act = (inm.actividad_principal || '').trim();
    if (!map.has(act)) {
      const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
      const fo = getFO(act, esRes);
      const far = esRes ? getFAR(act) : 1;
      
      const ucd = 57 * tcmmv;
      const baseCalculada = esRes 
        ? fo * ucd * far 
        : fo * ucd * 0.1280;
        
      const iva = esRes ? 0 : baseCalculada * 0.16;
      const total = baseCalculada + iva;
      
      map.set(act, { fo, baseCalculada, iva, total, clasificacion: inm.clasificacion, count: 0 });
    }
    map.get(act).count++;
  });
  
  for (const [act, info] of map.entries()) {
    md += `| ${act} (${info.count} usuarios) | ${info.clasificacion} | ${act} | ${info.fo} | ${info.baseCalculada.toFixed(2)} | ${info.iva.toFixed(2)} | ${info.total.toFixed(2)} |\n`;
  }

  fs.writeFileSync('reporte_desocupados.md', md);
  console.log("Done");
}

run();
