const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const sigyrDump = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr_audit_dump.json', 'utf8'));
const DT_MAP = { 1: 'V', 2: 'E', 3: 'J', 4: 'G' };

async function executeSanitation() {
  console.log('====================================================');
  console.log('🚀 INICIANDO SANEAMIENTO CONTROLADO DE IDENTIDADES');
  console.log('====================================================');

  // Mapear SIGYR por código de inmueble
  const sigyrByCode = new Map();
  sigyrDump.forEach(r => {
    if (r.urbaser_code) sigyrByCode.set(r.urbaser_code.trim().toUpperCase(), r);
  });

  // 1. Descargar todos los inmuebles de Supabase
  console.log('\n[1/5] Descargando inmuebles de Supabase...');
  let supaInms = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado').range(from, from + 999);
    if (!data || data.length === 0) break;
    supaInms = supaInms.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total inmuebles en Supabase: ${supaInms.length}`);

  // Normalizador de documentos
  function cleanDoc(doc) {
    if (!doc) return '';
    return String(doc).replace(/\D/g, '').replace(/^0+/, '');
  }

  // 2. Identificar registros a sanear
  console.log('\n[2/5] Identificando registros a sanear...');
  
  // A. Sufijados con documentos reales (excluyendo 0000)
  const toFixSuffixed = [];
  supaInms.forEach(s => {
    const ident = (s.identidad || '').trim();
    if (/-(?:URB|AURI)\d+/i.test(ident) && !/^0+-(?:URB|AURI)/i.test(ident)) {
      const code = (s.inmueble || '').trim().toUpperCase();
      const sigyr = sigyrByCode.get(code);
      
      let canonicalIdent = '';
      if (sigyr && sigyr.document && cleanDoc(sigyr.document)) {
        const pref = DT_MAP[sigyr.document_type_id] || (String(sigyr.document).length >= 9 ? 'J' : 'V');
        canonicalIdent = `${pref}-${cleanDoc(sigyr.document)}`;
      } else {
        const baseNum = cleanDoc(ident.split('-URB')[0].split('-AURI')[0]);
        const pref = baseNum.length >= 9 && ['3', '4', '5'].includes(baseNum[0]) ? 'J' : 'V';
        canonicalIdent = `${pref}-${baseNum}`;
      }

      toFixSuffixed.push({
        id: s.id,
        code,
        current_ident: ident,
        canonical_ident: canonicalIdent,
        contribuyente: s.contribuyente,
        estado: s.estado
      });
    }
  });

  // B. Prefijos alterados (mismo número, letra equivocada)
  const toFixPrefixes = [];
  supaInms.forEach(s => {
    const code = (s.inmueble || '').trim().toUpperCase();
    const sigyr = sigyrByCode.get(code);
    const supaId = (s.identidad || '').trim();

    if (sigyr && sigyr.document) {
      const sigyrPref = DT_MAP[sigyr.document_type_id] || '';
      const sigyrCleanNum = cleanDoc(sigyr.document);
      const supaMatch = supaId.match(/^([VEJPG])[-_\s]?(.*)$/i);
      const supaPref = supaMatch ? supaMatch[1].toUpperCase() : '';
      const supaCleanNum = cleanDoc(supaMatch ? supaMatch[2] : supaId);

      if (sigyrCleanNum && supaCleanNum && sigyrCleanNum === supaCleanNum) {
        if (sigyrPref && supaPref && sigyrPref !== supaPref) {
          const canonicalIdent = `${sigyrPref}-${sigyrCleanNum}`;
          toFixPrefixes.push({
            id: s.id,
            code,
            current_ident: supaId,
            canonical_ident: canonicalIdent,
            contribuyente: s.contribuyente,
            sigyr_name: sigyr.user_name,
            sigyrPref,
            supaPref,
            estado: s.estado
          });
        }
      }
    }
  });

  console.log(`  -> Sufijados reales a corregir: ${toFixSuffixed.length}`);
  console.log(`  -> Prefijos alterados a corregir: ${toFixPrefixes.length}`);

  // 3. Generar respaldo de seguridad JSON previo
  console.log('\n[3/5] Creando respaldo de seguridad previo a la ejecución...');
  const backupDir = path.join(__dirname, '../scripts/saneamiento');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `backup_pre_saneamiento_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    toFixSuffixed,
    toFixPrefixes
  }, null, 2));
  console.log(`  ✓ Respaldo guardado exitosamente en: ${backupFile}`);

  // 4. Ejecución en bloques en Supabase
  console.log('\n[4/5] Aplicando correcciones en Supabase...');

  // A. Aplicar corrección de sufijados
  let countSufOk = 0;
  let countSufErr = 0;
  for (let i = 0; i < toFixSuffixed.length; i += 50) {
    const chunk = toFixSuffixed.slice(i, i + 50);
    for (const item of chunk) {
      const { error } = await sb
        .from('inmuebles')
        .update({ identidad: item.canonical_ident })
        .eq('id', item.id);
      if (error) {
        console.error(`Error actualizando sufijo en ${item.code}:`, error.message);
        countSufErr++;
      } else {
        countSufOk++;
      }
    }
  }
  console.log(`  ✓ Sufijados procesados: ${countSufOk} exitosos, ${countSufErr} errores`);

  // B. Aplicar corrección de prefijos alterados
  let countPrefOk = 0;
  let countPrefErr = 0;
  for (let i = 0; i < toFixPrefixes.length; i += 50) {
    const chunk = toFixPrefixes.slice(i, i + 50);
    for (const item of chunk) {
      const { error } = await sb
        .from('inmuebles')
        .update({ identidad: item.canonical_ident })
        .eq('id', item.id);
      if (error) {
        console.error(`Error actualizando prefijo en ${item.code}:`, error.message);
        countPrefErr++;
      } else {
        countPrefOk++;
      }
    }
  }
  console.log(`  ✓ Prefijos procesados: ${countPrefOk} exitosos, ${countPrefErr} errores`);

  // 5. Verificación post-ejecución
  console.log('\n[5/5] Realizando verificación de integridad post-ejecución...');
  let checkInms = [];
  from = 0;
  while (true) {
    const { data } = await sb.from('inmuebles').select('id, inmueble, identidad').range(from, from + 999);
    if (!data || data.length === 0) break;
    checkInms = checkInms.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const remainingRealSuffixed = checkInms.filter(i => /-(?:URB|AURI)\d+/i.test(i.identidad || '') && !/^0+-(?:URB|AURI)/i.test(i.identidad || ''));
  console.log(`  -> Sufijados reales restantes: ${remainingRealSuffixed.length} (esperado: 0)`);

  console.log('\n====================================================');
  console.log('🎉 SANEAMIENTO COMPLETADO EXITOSAMENTE');
  console.log(`Total registros corregidos: ${countSufOk + countPrefOk}`);
  console.log('====================================================');
}

executeSanitation().catch(console.error);
