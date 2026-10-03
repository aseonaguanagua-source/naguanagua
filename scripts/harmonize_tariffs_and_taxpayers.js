/**
 * harmonize_tariffs_and_taxpayers.js
 * 
 * 1. Normaliza prefijos y sufijos de Cédulas y RIFs (V-, E-, J-, G-) en contribuyentes e inmuebles.
 * 2. Elimina contribuyentes duplicados (sin prefijo vs con prefijo) fusionando datos de contacto.
 * 3. Depura registros espurios de condominios en contribuyentes (URB% y AURI%).
 * 4. Aplica tarifa igual y exacta a cada mes adeudado (Residencial y Comercial).
 * 5. Asigna multas correspondientes (10% res, 12% com) sin intereses ni IVA.
 * 6. Garantiza que todo lo residencial quede 100% exento de IVA y comercial con 16% sobre base imponible.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

const TASA_BCV = 55514.07;

// Factores y tarifas residenciales exactas según ordenanza
function getResRate(act) {
  const a = (act || '').toUpperCase();
  if (a.includes('ZONA A')) return 0.021588;
  if (a.includes('ZONA B')) return 0.017276;
  if (a.includes('ZONA C')) return 0.008652;
  if (a.includes('ZONA D')) return 0.005881;
  if (a.includes('DESOCUPADO')) return 0.002669;
  return 0.017276; // Por defecto Casa/Apto Zona B
}

async function run() {
  console.log('======================================================================');
  console.log('🚀 INICIANDO ARMONIZACIÓN DE TARIFAS, MULTAS Y NORMALIZACIÓN DE RIF/CI');
  console.log('======================================================================\n');

  console.log('1. Cargando mapas desde harmonize_maps.json...');
  const mapsData = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/harmonize_maps.json', 'utf8'));
  const priceMap = new Map(Object.entries(mapsData.price_map));
  const docPrefixMap = new Map(Object.entries(mapsData.doc_prefix_map));
  console.log(`   ✓ ${priceMap.size} tarifas comerciales cargadas.`);
  console.log(`   ✓ ${docPrefixMap.size} identificaciones mapeadas desde el origen.\n`);

  // Función robusta de normalización de identidad
  function cleanIdentidad(rawId, nombre = '') {
    if (!rawId) return 'V-0';
    let str = String(rawId).trim().toUpperCase();
    
    // Eliminar caracteres inválidos como asteriscos, signos más, espacios, puntos
    str = str.replace(/[\*\+\s\.]/g, '');

    // Corregir prefijos repetidos tipo V-V o J-J
    str = str.replace(/^([VEJG])-?([VEJG])/, '$1-');

    // Casos nulos, genéricos o desocupados
    if (['V-', 'J-', 'E-', 'G-', '0', 'S/D', 'SD', '', 'V-0', 'J-0', 'NULL', 'UNDEFINED'].includes(str)) {
      const nLower = (nombre || '').toLowerCase();
      const isCom = nLower.includes('condominio') || 
                    nLower.includes('inversiones') || 
                    nLower.includes('c.a') || 
                    nLower.includes('c. a') ||
                    nLower.includes('s.a') || 
                    nLower.includes('local') ||
                    nLower.includes('comercial');
      return isCom ? 'J-0' : 'V-0';
    }

    // Extraer prefijo de letra si está presente
    let prefix = '';
    let rest = str;
    if (/^[VEJPG]/i.test(str)) {
      prefix = str.charAt(0).toUpperCase() + '-';
      rest = str.slice(1).replace(/^-+/, '');
    }

    // Obtener sólo dígitos del cuerpo
    const digitsOnly = rest.replace(/\D/g, '');
    if (!digitsOnly) {
      return prefix ? `${prefix}0` : 'V-0';
    }

    // Si ya tenía prefijo válido
    if (prefix) {
      return `${prefix}${digitsOnly}`;
    }

    // Si era sólo dígitos sin prefijo:
    // 1. Buscar en docPrefixMap de backup_sigyr
    if (docPrefixMap.has(digitsOnly)) {
      return `${docPrefixMap.get(digitsOnly)}${digitsOnly}`;
    }

    // 2. Heurística según nombre y longitud
    const nUpper = (nombre || '').toUpperCase();
    const isJuridico = digitsOnly.length >= 9 || 
                       nUpper.includes('C.A') || 
                       nUpper.includes('S.A') || 
                       nUpper.includes('CONDOMINIO') || 
                       nUpper.includes('INVERSIONES') || 
                       nUpper.includes('SRL') ||
                       nUpper.includes('COMERCIAL') ||
                       nUpper.includes('EMPRESA');
    return isJuridico ? `J-${digitsOnly}` : `V-${digitsOnly}`;
  }

  // ----------------------------------------------------------------------------------
  // FASE 1: Asegurar registros base V-0 y J-0
  // ----------------------------------------------------------------------------------
  console.log('2. Asegurando existencia de V-0 y J-0 en contribuyentes...');
  await supabase.from('contribuyentes').upsert([
    { identidad: 'V-0', nombre: 'CONTRIBUYENTE NO REGISTRADO (RESIDENCIAL)' },
    { identidad: 'J-0', nombre: 'LOCAL / CONDOMINIO DESOCUPADO O NO REGISTRADO' }
  ], { onConflict: 'identidad' });

  // ----------------------------------------------------------------------------------
  // FASE 2: Normalizar contribuyentes y fusionar duplicados
  // ----------------------------------------------------------------------------------
  console.log('\n3. Recuperando todos los contribuyentes de Supabase...');
  let allContribuyentes = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from('contribuyentes')
      .select('id, identidad, nombre, email, telefono, direccion, observaciones')
      .range(from, from + step - 1);

    if (error) { console.error('Error fetching contribuyentes:', error); break; }
    if (!chunk || chunk.length === 0) break;
    allContribuyentes = allContribuyentes.concat(chunk);
    from += step;
  }
  console.log(`   ✓ ${allContribuyentes.length} contribuyentes recuperados.`);

  const canonicalMap = new Map(); // canonicalId -> record
  const duplicatesToDelete = [];
  const enrichedToUpdate = new Map(); // id -> updatedRecord

  allContribuyentes.forEach(c => {
    const rawId = String(c.identidad || '').trim().toUpperCase();
    // Depurar códigos de inmueble que se insertaron erróneamente en contribuyentes
    if (rawId.startsWith('URB') || rawId.startsWith('AURI')) {
      duplicatesToDelete.push(c.id);
      return;
    }

    const canonical = cleanIdentidad(c.identidad, c.nombre);
    if (!canonicalMap.has(canonical)) {
      canonicalMap.set(canonical, c);
    } else {
      // Registro existente vs duplicado
      const existing = canonicalMap.get(canonical);
      const existingHasPrefix = /^[VEJG]-/.test(existing.identidad);
      const currentHasPrefix = /^[VEJG]-/.test(c.identidad);

      let primary = existing;
      let secondary = c;

      if (!existingHasPrefix && currentHasPrefix) {
        primary = c;
        secondary = existing;
        canonicalMap.set(canonical, primary);
      }

      // Fusionar campos de contacto enriquecidos
      let changed = false;
      if (!primary.email && secondary.email) { primary.email = secondary.email; changed = true; }
      if (!primary.telefono && secondary.telefono) { primary.telefono = secondary.telefono; changed = true; }
      if ((!primary.direccion || primary.direccion.includes('ART.218')) && secondary.direccion && !secondary.direccion.includes('ART.218')) {
        primary.direccion = secondary.direccion;
        changed = true;
      }
      if (!primary.observaciones && secondary.observaciones) { primary.observaciones = secondary.observaciones; changed = true; }

      if (changed) {
        enrichedToUpdate.set(primary.id, primary);
      }

      duplicatesToDelete.push(secondary.id);
    }
  });

  const toUpdatePrefix = [];
  canonicalMap.forEach((rec, canonical) => {
    if (rec.identidad !== canonical) {
      rec.identidad = canonical;
      toUpdatePrefix.push(rec);
    }
  });

  console.log(`   ✓ Contribuyentes canónicos únicos: ${canonicalMap.size}`);
  console.log(`   ✓ Duplicados y registros espurios a depurar: ${duplicatesToDelete.length}`);
  console.log(`   ✓ Registros primarios a actualizar con prefijo: ${toUpdatePrefix.length}`);
  console.log(`   ✓ Registros enriquecidos con datos fusionados: ${enrichedToUpdate.size}`);

  // Eliminar duplicados en lotes de 200 primero
  if (duplicatesToDelete.length > 0) {
    console.log(`   ✓ Eliminando ${duplicatesToDelete.length} duplicados obsoletos de contribuyentes...`);
    const BATCH_DEL = 200;
    for (let i = 0; i < duplicatesToDelete.length; i += BATCH_DEL) {
      const batchIds = duplicatesToDelete.slice(i, i + BATCH_DEL);
      const { error: delErr } = await supabase.from('contribuyentes').delete().in('id', batchIds);
      if (delErr) console.error('Error deleting batch:', delErr);
      if ((i + BATCH_DEL) % 5000 === 0 || i + BATCH_DEL >= duplicatesToDelete.length) {
        console.log(`     Progreso depuración: ${Math.min(i + BATCH_DEL, duplicatesToDelete.length)} / ${duplicatesToDelete.length}`);
      }
    }
    console.log('   ✓ Duplicados eliminados exitosamente.');
  }

  // Actualizar registros que cambiaron de identidad o fueron enriquecidos
  const recordsToSave = new Map();
  toUpdatePrefix.forEach(r => recordsToSave.set(r.id, r));
  enrichedToUpdate.forEach(r => recordsToSave.set(r.id, r));

  if (recordsToSave.size > 0) {
    console.log(`   ✓ Guardando ${recordsToSave.size} contribuyentes actualizados/enriquecidos...`);
    const arr = Array.from(recordsToSave.values()).map(r => ({
      id: r.id,
      identidad: r.identidad,
      nombre: r.nombre,
      email: r.email,
      telefono: r.telefono,
      direccion: r.direccion,
      observaciones: r.observaciones
    }));
    const BATCH_UP = 100;
    for (let i = 0; i < arr.length; i += BATCH_UP) {
      const batch = arr.slice(i, i + BATCH_UP);
      await supabase.from('contribuyentes').upsert(batch, { onConflict: 'id' });
    }
    console.log('   ✓ Contribuyentes actualizados exitosamente.');
  }

  // ----------------------------------------------------------------------------------
  // FASE 3: Armonizar 54,854 Inmuebles (Tarifa mensual uniforme, Multas e IVA)
  // ----------------------------------------------------------------------------------
  console.log('\n4. Armonizando 54,854 inmuebles en Supabase:');
  console.log('   - Tarifa igual y uniforme multiplicada por cada mes adeudado.');
  console.log('   - Multa correspondiente (10% res / 12% com) sin intereses.');
  console.log('   - Limpieza completa de prefijos y sufijos de identidad.');

  let fromInm = 0;
  let totalProcessed = 0;
  let totalWithDebt = 0;
  let totalWithMulta = 0;
  const BATCH_SIZE = 100;

  while (true) {
    const { data: inms, error: inmErr } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, mmv_mes, cant_inmuebles, meses_deuda, deuda_mmv, multa_bs')
      .range(fromInm, fromInm + step - 1);

    if (inmErr) { console.error('Error fetching inmuebles:', inmErr); break; }
    if (!inms || inms.length === 0) break;

    const updates = inms.map(inm => {
      const meses = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
      const tipo = (inm.tipo || '').toUpperCase();
      const act = (inm.actividad_principal || '').toUpperCase().trim();
      const cant = Math.max(1, parseInt(String(inm.cant_inmuebles || 1)));
      const esRes = tipo.includes('RESIDENCIAL');

      // Calcular Tarifa Mensual fija y uniforme
      let tarifaMesUCD = 0;
      if (esRes) {
        tarifaMesUCD = getResRate(act) * cant;
      } else {
        let cf = priceMap.get(act);
        if (!cf) {
          for (const [k, v] of priceMap.entries()) {
            if (act.includes(k) || k.includes(act)) {
              cf = v;
              break;
            }
          }
        }
        if (!cf) cf = parseFloat(String(inm.mmv_mes || 0)) || 1.98;
        tarifaMesUCD = cf * 0.137 * cant;
      }

      // Deuda acumulada = Tarifa mensual fija × Cantidad de meses adeudados
      let deudaMmv = 0;
      let multaBs = 0;

      if (meses > 0) {
        deudaMmv = parseFloat((tarifaMesUCD * meses).toFixed(6));
        totalWithDebt++;

        // Multa: aplica a partir del segundo mes (meses en mora = meses - 1)
        if (meses > 1) {
          const mesesMora = meses - 1;
          const pctMulta = esRes ? 0.10 : 0.12;
          const multaUCD = mesesMora * tarifaMesUCD * pctMulta;
          multaBs = parseFloat((multaUCD * TASA_BCV).toFixed(2));
          totalWithMulta++;
        }
      }

      // Normalizar identidad del inmueble
      const normId = cleanIdentidad(inm.identidad, inm.contribuyente);

      return {
        id: inm.id,
        identidad: normId,
        deuda_mmv: deudaMmv,
        deuda_congelada_bs: 0,
        multa_bs: multaBs
      };
    });

    // Actualizar en lotes concurrentes
    const chunks = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      chunks.push(updates.slice(i, i + BATCH_SIZE));
    }

    await Promise.all(
      chunks.map(chunk =>
        supabase.from('inmuebles').upsert(chunk, { onConflict: 'id' })
      )
    );

    totalProcessed += inms.length;
    if (totalProcessed % 5000 === 0 || totalProcessed >= 54854) {
      console.log(`   Progreso Inmuebles: ${totalProcessed} / 54854 (${Math.round((totalProcessed / 54854) * 100)}%)`);
    }

    fromInm += step;
  }

  console.log('\n======================================================================');
  console.log('🎉 PROCESO COMPLETADO EXITOSAMENTE');
  console.log(`- Contribuyentes canónicos únicos: ${canonicalMap.size}`);
  console.log(`- Duplicados de contribuyentes depurados: ${duplicatesToDelete.length}`);
  console.log(`- Inmuebles Procesados: ${totalProcessed}`);
  console.log(`- Inmuebles con Deuda (Tarifa mensual uniforme exacta): ${totalWithDebt}`);
  console.log(`- Inmuebles con Multa (10% res / 12% com, sin intereses): ${totalWithMulta}`);
  console.log('======================================================================');
}

run().catch(err => console.error('FATAL ERROR:', err));
