import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { ordenanzaData } from './src/data/ordenanza';
import fs from 'fs';

dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const economicActivitiesBase = JSON.parse(fs.readFileSync('./src/data/economicActivitiesBase.json', 'utf8'));

// Copiado de AppContext.tsx
const calcularMmvMes = (localOrData: any, config: any) => {
  let mmv = 0;
  const clasificacion = localOrData.uso || localOrData.Clasificacion || localOrData.clasificacion || 'Residencial';
  
  if (clasificacion.toLowerCase().includes('residencial')) {
    const tipo = localOrData.tipoResidencia || localOrData.TipoResidencia || localOrData.tipo_residencia || localOrData.actividad_principal || '';
    const tarifa = config.tiposResidenciales?.find((t: any) => t.label.toLowerCase() === tipo.toLowerCase())
      || config.tiposResidenciales?.find((t: any) => tipo.toLowerCase().includes(t.label.toLowerCase()));
    
    if (tarifa) mmv = tarifa.factor;
    else {
      // Fallback
      if (tipo.toLowerCase().includes('apartamento')) mmv = 0.91;
      else if (tipo.toLowerCase().includes('quinta') || tipo.toLowerCase().includes('villa') || tipo.toLowerCase().includes('town house')) mmv = 1.06;
      else if (tipo.toLowerCase().includes('casa')) mmv = 0.618;
    }
  } else {
    // Es Comercial
    const act = localOrData.actividad || localOrData.ActividadComercial || localOrData.actividad_principal || '';
    
    // Primero, si tiene un string largo con el nombre, buscar en ordenanzaData (el padre)
    const tarifaPadre = config.actividadesComerciales?.find((t: any) => t.label.toLowerCase() === act.toLowerCase())
      || config.actividadesComerciales?.find((t: any) => act.toLowerCase().includes(t.label.toLowerCase()))
      || config.actividadesIndustriales?.find((t: any) => t.label.toLowerCase() === act.toLowerCase())
      || config.actividadesIndustriales?.find((t: any) => act.toLowerCase().includes(t.label.toLowerCase()));
      
    // Encontrar el FO del padre (considerando nivel si aplica)
    const nivel = localOrData.nivel || localOrData.NivelMetraje || localOrData.nivel_metraje || '';
    let foPadre = 0;
    if (tarifaPadre) {
      if (typeof tarifaPadre.factor === 'number') {
        foPadre = tarifaPadre.factor;
      } else if (Array.isArray(tarifaPadre.factor)) {
        const index = config.nivelesMetraje?.findIndex((n: string) => n.toLowerCase() === nivel.toLowerCase()) || 0;
        foPadre = tarifaPadre.factor[Math.max(0, index)] || tarifaPadre.factor[0];
      }
    } else {
      // Si no encontró el nombre, intentemos buscar por actividad_economica_id en economicActivitiesBase si es un solo código
      if (localOrData.actividad_economica_id && !localOrData.actividad_economica_id.includes(',')) {
         const found = economicActivitiesBase.find((e: any) => e.codigo === localOrData.actividad_economica_id);
         if (found) foPadre = found.monto_mensual_f_o;
      }
    }

    mmv += foPadre;

    // Procesar nietos (actividades secundarias)
    const actIdsStr = localOrData.actividad_economica_id || '';
    const codeList = actIdsStr.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    
    if (codeList.length > 1) {
      // El primero es el padre, asumimos que su FO ya se calculó arriba en `foPadre`
      // Los siguientes son nietos
      for (let i = 1; i < codeList.length; i++) {
        const nietoCode = codeList[i];
        const nietoData = economicActivitiesBase.find((e: any) => e.codigo === nietoCode);
        if (nietoData && nietoData.monto_mensual_f_o) {
          mmv += nietoData.monto_mensual_f_o;
        }
      }
    }
    
    // Si todavía mmv es 0, usamos un fallback de 2.0 que es el mínimo general para comerciales
    if (mmv === 0) mmv = 2.0; 
  }

  return parseFloat(mmv.toFixed(4));
};

async function run() {
  console.log("Fetching ALL inmuebles...");
  let allInms: any[] = [];
  let from = 0;
  let to = 999;
  
  while (true) {
    const { data, error } = await supabase.from('inmuebles').select('*').range(from, to);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allInms = allInms.concat(data);
    from += 1000;
    to += 1000;
  }
  
  console.log(`Loaded ${allInms.length} properties.`);
  
  let updates = 0;
  
  for (const i of allInms) {
    const currentMmv = parseFloat(i.mmv_mes || '0');
    const newMmv = calcularMmvMes(i, ordenanzaData);
    
    if (newMmv > 0 && Math.abs(currentMmv - newMmv) > 0.001) {
      await supabase.from('inmuebles').update({ mmv_mes: newMmv }).eq('id', i.id);
      updates++;
      if (updates % 100 === 0) console.log(`Updated ${updates} properties...`);
    }
  }
  
  console.log(`Finished updating. Total properties updated: ${updates}`);
}

run();
