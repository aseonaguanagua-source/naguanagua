const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function loadNdjson(file) {
  const map = new Map();
  const fileStream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    map.set(obj.id, obj);
  }
  return map;
}

async function rebuild() {
  const ecoMap = await loadNdjson('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/economic_activities.ndjson');
  const userMap = await loadNdjson('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/users.ndjson');
  const propMap = await loadNdjson('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/properties.ndjson');

  const contribuyentesToInsert = new Map();
  const inmueblesToInsert = new Map(); // using Map to deduplicate!

  for (const [propId, prop] of propMap.entries()) {
    const user = userMap.get(prop.user_id);
    if (!user) continue;

    if (!contribuyentesToInsert.has(user.document)) {
      contribuyentesToInsert.set(user.document, {
        identidad: user.document,
        nombre: user.business_name || user.name || 'Desconocido',
        email: user.email || '',
        telefono: user.phone || '',
        direccion: user.fiscal_address || '',
        observaciones: user.note || '',
        created_at: user.created_at || new Date().toISOString()
      });
    }

    let actividad_principal = '';
    const eco = ecoMap.get(prop.economic_activity_id);
    if (eco) actividad_principal = eco.name;
    
    if (prop.property_id) {
       const padre = propMap.get(prop.property_id);
       if (padre) {
          const catPadre = padre.urbaser_code && padre.urbaser_code !== 'SN' ? padre.urbaser_code : padre.catastral_id;
          actividad_principal = `[HIJO_DE:${catPadre}] [HIJO] ${actividad_principal || user.business_name || ''}`;
       }
    } else if (prop.condominium === '1') {
       actividad_principal = `[CONDOMINIO] ${user.business_name || ''}`;
    }

    let cant = parseInt(prop.quantity_houses) || 1;
    if (cant <= 0) cant = 1;

    let tipo = 'RESIDENCIAL';
    if (prop.property_type_id === '1') tipo = 'COMERCIAL';
    else if (prop.property_type_id === '3') tipo = 'INDUSTRIAL';
    else if (prop.property_type_id === '4') tipo = 'INSTITUCIONAL';

    let factorUcd = 0;
    if (tipo === 'RESIDENCIAL') {
       factorUcd = 0.02673;
    } else {
       if (eco && eco.size) factorUcd = parseFloat(eco.size);
    }
    
    if (factorUcd > 50) factorUcd = 5;
    const deudaBase = factorUcd * 57 * 2;

    const catID = prop.urbaser_code && prop.urbaser_code !== 'SN' ? prop.urbaser_code : prop.catastral_id;
    if (!catID || catID === 'SN' || catID === '') continue;

    inmueblesToInsert.set(catID, { // Deduplicate by catID
      inmueble: catID,
      identidad: user.document,
      tipo: tipo,
      actividad_principal: actividad_principal.substring(0, 250),
      direccion: prop.reference || '',
      cant_inmuebles: cant,
      mmv_mes: factorUcd,
      deuda_mmv: deudaBase,
      saldo_favor_bs: 0,
      estado: prop.registration_status === 'approved' ? 'Activo' : 'Inactivo',
      created_at: prop.created_at || new Date().toISOString()
    });
  }

  console.log('Inserting deduplicated inmuebles...');
  const inmsArr = Array.from(inmueblesToInsert.values());
  for (let i = 0; i < inmsArr.length; i += 500) {
    const chunk = inmsArr.slice(i, i + 500);
    const { error } = await supabase.from('inmuebles').upsert(chunk, { onConflict: 'inmueble' });
    if (error) console.error('Batch error:', error.message);
  }

  console.log('Done deduplicating and inserting!');
}
rebuild();
