import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { calcularEstado } from '@/lib/condominios/servicio';
import * as fs from 'fs';

async function run() {
  const { data: condo } = await sb.from('condominios').select('*').eq('codigo', 'URB016119').single();
  const { data: unidades } = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  const d = await calcularEstado(condo.id, unidades, []);
  
  // d.renglones contains the calculated debt per unit
  const calculated = new Map();
  for (const r of d.renglones) {
    calculated.set(r.clave, r); // r.clave is the unit ID
  }

  // We need mapping from ID to Inmueble
  const { data: cUnits } = await sb.from('condominio_unidades').select('id, inmueble').eq('condominio_id', condo.id);
  const idToInmueble = new Map(cUnits.map(u => [u.id, u.inmueble]));

  // Load old excel data
  let oldData = [];
  try {
    oldData = JSON.parse(fs.readFileSync('scratch/sambil_master_excel.json', 'utf8'));
  } catch (e) {
    // maybe it is sambil_data_nagua.json
    oldData = JSON.parse(fs.readFileSync('scratch/sambil_data_nagua.json', 'utf8'));
  }

  let totalVariations = 0;

  for (const row of oldData) {
    const inmueble = row['Código'];
    // Find unit ID
    let unitId = null;
    for (const [id, inm] of idToInmueble.entries()) {
      if (inm === inmueble) { unitId = id; break; }
    }
    if (!unitId) continue;

    const calc = calculated.get(unitId);
    if (!calc) continue;

    // Excel values
    // In sambil_data_nagua.json, 'MensualBs' is 'Deuda Mensual'
    // Let's print keys if we don't know them
    const tarifaOldStr = String(row['Mensualidad'] || row['Mensual Bs'] || row['Deuda Mensual'] || '0').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const ivaOldStr = String(row['IVA Bs'] || row['IVA'] || '0').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    
    const tarifaOld = Math.round(Number(tarifaOldStr) * 100) / 100;
    const ivaOld = Math.round(Number(ivaOldStr) * 100) / 100;

    const tarifaNew = Math.round(calc.montoBs * 100) / 100;
    const ivaNew = Math.round(calc.ivaBs * 100) / 100;

    const diffTarifa = Math.abs(tarifaNew - tarifaOld);
    const diffIva = Math.abs(ivaNew - ivaOld);

    if (diffTarifa > 1 || diffIva > 1) { // 1 Bs tolerance due to roundings
      console.log(`Variación en ${inmueble}:`);
      console.log(`  Tarifa: Viejo=${tarifaOld} | Nuevo=${tarifaNew} | Diff=${diffTarifa}`);
      console.log(`  IVA: Viejo=${ivaOld} | Nuevo=${ivaNew} | Diff=${diffIva}`);
      totalVariations++;
    }
  }

  console.log(`Total variaciones encontradas: ${totalVariations}`);
}

run().catch(console.error);
