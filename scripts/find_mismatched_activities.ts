import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = createClient(supabaseUrl, supabaseKey);

// We need to import the logic from calculos
import { buscarActividadOrdenanza } from '../src/lib/calculos';

async function getAllRows(table: string, select: string, filters: any[] = []) {
  let all: any[] = [];
  let step = 1000;
  for (let start = 0; ; start += step) {
    let q = sb.from(table).select(select).range(start, start + step - 1);
    for (const f of filters) q = (q as any)[f.method](...f.args);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < step) break;
  }
  return all;
}

async function run() {
  console.log('Fetching data...');
  const inmuebles = await getAllRows('inmuebles', 'inmueble, contribuyente, actividad_principal, tipo, clasificacion, estado, mmv_mes', [
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);

  const mismatchSet = new Set<string>();
  const mismatches: any[] = [];

  for (const inm of inmuebles) {
    const act = (inm.actividad_principal || '').trim();
    if (!act || act.toUpperCase() === 'N/A' || act.toUpperCase() === 'NINGUNA' || act.toUpperCase() === 'SIN ACTIVIDAD') continue;
    
    const isCom = (inm.tipo || '').toUpperCase().includes('COMERCIAL') || (inm.clasificacion || '').toUpperCase().includes('COMERCIAL') || (inm.tipo || '').toUpperCase().includes('INDUSTRIAL');
    
    if (isCom) {
      const found = buscarActividadOrdenanza(act);
      if (!found) {
        if (!mismatchSet.has(act)) {
          mismatchSet.add(act);
          mismatches.push({
            actividad: act,
            inmueblesCount: 1,
            ejemplos: [inm.inmueble],
            tarifaGuardada: Number(inm.mmv_mes) || 0
          });
        } else {
          const m = mismatches.find(x => x.actividad === act);
          m.inmueblesCount++;
          if (m.ejemplos.length < 3) m.ejemplos.push(inm.inmueble);
        }
      }
    }
  }

  mismatches.sort((a, b) => b.inmueblesCount - a.inmueblesCount);

  let md = `# Actividades Comerciales No Reconocidas\n\n`;
  md += `El siguiente listado contiene las actividades económicas registradas en la base de datos que **no coinciden** con ninguna de las actividades definidas en la Ordenanza Municipal de Naguanagua. Estas actividades podrían estar usando la tarifa de contingencia (1.98) por defecto, causando diferencias en los cálculos.\n\n`;
  
  md += `| Actividad en Base de Datos | Cant. Locales | Tarifa Guardada | Inmuebles Ejemplo |\n`;
  md += `|---|---|---|---|\n`;
  
  for (const m of mismatches) {
    md += `| ${m.actividad} | ${m.inmueblesCount} | ${m.tarifaGuardada} | ${m.ejemplos.join(', ')} |\n`;
  }

  const fs = require('fs');
  fs.writeFileSync('/Users/davidzara/.gemini/antigravity-ide/brain/6a066753-1797-4184-82b0-cb4743aaa35f/Actividades_No_Reconocidas.md', md);
  console.log('Report generated.');
}

run().catch(console.error);
