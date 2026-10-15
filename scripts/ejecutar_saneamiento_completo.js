const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const sigyrDump = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr_audit_dump.json', 'utf8'));
const DT_MAP = { 1: 'V', 2: 'E', 3: 'J', 4: 'G' };

function cleanDoc(doc) {
  if (!doc) return '';
  return String(doc).replace(/\D/g, '').replace(/^0+/, '');
}

async function runCompleteSanitation() {
  console.log('================================================================');
  console.log('🚀 EJECUTANDO SANEAMIENTO INTEGRAL CON INTEGRIDAD REFERENCIAL');
  console.log('================================================================');

  const sigyrByCode = new Map();
  sigyrDump.forEach(r => {
    if (r.urbaser_code) sigyrByCode.set(r.urbaser_code.trim().toUpperCase(), r);
  });

  // 1. Descargar todos los inmuebles de Supabase
  console.log('\n[1/4] Descargando inmuebles de Supabase...');
  let supaInms = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado').range(from, from + 999);
    if (!data || data.length === 0) break;
    supaInms = supaInms.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total inmuebles descargados: ${supaInms.length}`);

  // 2. Descargar todos los contribuyentes existentes
  console.log('\n[2/4] Descargando catálogo de contribuyentes...');
  let supaContribs = [];
  from = 0;
  while (true) {
    const { data } = await sb.from('contribuyentes').select('id, identidad, nombre, email, telefono, direccion').range(from, from + 999);
    if (!data || data.length === 0) break;
    supaContribs = supaContribs.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const contribMap = new Map();
  supaContribs.forEach(c => {
    if (c.identidad) contribMap.set(c.identidad.trim().toUpperCase(), c);
  });
  console.log(`Total contribuyentes existentes: ${contribMap.size}`);

  // Helper para asegurar que la identidad canónica existe en contribuyentes
  async function ensureCanonicalContribuyente(canonicalIdent, fallbackData) {
    const key = canonicalIdent.trim().toUpperCase();
    if (contribMap.has(key)) return true;

    // Buscar si existe datos de contacto en sigyr o en el registro actual
    const { error } = await sb.from('contribuyentes').upsert({
      identidad: canonicalIdent,
      nombre: fallbackData.nombre || 'Sin Nombre',
      email: fallbackData.email || '',
      telefono: fallbackData.telefono || '',
      direccion: fallbackData.direccion || ''
    }, { onConflict: 'identidad' });

    if (error) {
      console.error(`Error asegurando contribuyente ${canonicalIdent}:`, error.message);
      return false;
    }
    contribMap.set(key, { identidad: canonicalIdent, nombre: fallbackData.nombre });
    return true;
  }

  // 3. FASE A: SANEAMIENTO DE SUFIJADOS REALES RESTANTES
  console.log('\n[3/4] Procesando sufijados reales (-URB/-AURI)...');
  const remainingSuffixed = supaInms.filter(s => {
    const ident = (s.identidad || '').trim();
    return /-(?:URB|AURI)\d+/i.test(ident) && !/^0+-(?:URB|AURI)/i.test(ident);
  });
  console.log(`Sufijados reales a corregir: ${remainingSuffixed.length}`);

  let sufSuccess = 0;
  const oldFakeToClean = new Set();

  for (const s of remainingSuffixed) {
    const code = (s.inmueble || '').trim().toUpperCase();
    const sigyr = sigyrByCode.get(code);
    const oldIdent = s.identidad.trim();

    let canonicalIdent = '';
    if (sigyr && sigyr.document && cleanDoc(sigyr.document)) {
      const pref = DT_MAP[sigyr.document_type_id] || (String(sigyr.document).length >= 9 ? 'J' : 'V');
      canonicalIdent = `${pref}-${cleanDoc(sigyr.document)}`;
    } else {
      const baseNum = cleanDoc(oldIdent.split('-URB')[0].split('-AURI')[0]);
      const pref = baseNum.length >= 9 && ['3', '4', '5'].includes(baseNum[0]) ? 'J' : 'V';
      canonicalIdent = `${pref}-${baseNum}`;
    }

    const oldContrib = contribMap.get(oldIdent.toUpperCase());
    await ensureCanonicalContribuyente(canonicalIdent, {
      nombre: s.contribuyente || oldContrib?.nombre,
      email: oldContrib?.email || '',
      telefono: oldContrib?.telefono || '',
      direccion: oldContrib?.direccion || ''
    });

    const { error: updErr } = await sb
      .from('inmuebles')
      .update({ identidad: canonicalIdent })
      .eq('id', s.id);

    if (updErr) {
      console.error(`Error actualizando inmueble ${code}:`, updErr.message);
    } else {
      sufSuccess++;
      oldFakeToClean.add(oldIdent);
    }
  }
  console.log(`  ✓ Inmuebles sufijados corregidos: ${sufSuccess} de ${remainingSuffixed.length}`);

  // Limpiar contribuyentes ficticios creados con sufijo
  if (oldFakeToClean.size > 0) {
    const fakeList = Array.from(oldFakeToClean);
    console.log(`  -> Eliminando ${fakeList.length} identidades artificiales de la tabla contribuyentes...`);
    for (let i = 0; i < fakeList.length; i += 50) {
      const chunk = fakeList.slice(i, i + 50);
      await sb.from('contribuyentes').delete().in('identidad', chunk);
    }
  }

  // 4. FASE B: CORRECCIÓN DE PREFIJOS ALTERADOS (G, V, E, J)
  console.log('\n[4/4] Procesando prefijos alterados (220 casos)...');
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
            sigyr_name: sigyr.user_name
          });
        }
      }
    }
  });

  console.log(`Prefijos a corregir: ${toFixPrefixes.length}`);
  let prefSuccess = 0;

  for (const p of toFixPrefixes) {
    const oldContrib = contribMap.get(p.current_ident.toUpperCase());
    await ensureCanonicalContribuyente(p.canonical_ident, {
      nombre: p.sigyr_name || p.contribuyente || oldContrib?.nombre,
      email: oldContrib?.email || '',
      telefono: oldContrib?.telefono || '',
      direccion: oldContrib?.direccion || ''
    });

    const { error: updErr } = await sb
      .from('inmuebles')
      .update({ identidad: p.canonical_ident })
      .eq('id', p.id);

    if (updErr) {
      console.error(`Error actualizando prefijo en ${p.code}:`, updErr.message);
    } else {
      prefSuccess++;
    }
  }

  console.log(`  ✓ Prefijos alterados corregidos: ${prefSuccess} de ${toFixPrefixes.length}`);

  console.log('\n================================================================');
  console.log('🎉 SANEAMIENTO COMPLETADO CON ÉXITO ABSOLUTO');
  console.log(`Total registros actualizados: ${sufSuccess + prefSuccess}`);
  console.log('================================================================');
}

runCompleteSanitation().catch(console.error);
