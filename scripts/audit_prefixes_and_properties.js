const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const sigyrDump = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr_audit_dump.json', 'utf8'));

const DT_MAP = { 1: 'V', 2: 'E', 3: 'J', 4: 'G' };

async function fullAnalysis() {
  console.log('1. Descargando datos completos de Supabase...');
  let supaInms = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('inmuebles').select('id, inmueble, identidad, contribuyente, estado, es_condominio, condominio_padre_id, padre_id, tipo, clasificacion, direccion').range(from, from + 999);
    if (!data || data.length === 0) break;
    supaInms = supaInms.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log('Total Supabase:', supaInms.length);

  // Mapear Supabase por código
  const supaMap = new Map();
  supaInms.forEach(i => {
    if (i.inmueble) supaMap.set(i.inmueble.trim().toUpperCase(), i);
  });

  // Mapear SIGYR por código
  const sigyrMap = new Map();
  sigyrDump.forEach(r => {
    if (r.urbaser_code) sigyrMap.set(r.urbaser_code.trim().toUpperCase(), r);
  });

  // Normalizador
  function cleanDoc(doc) {
    if (!doc) return '';
    return String(doc).replace(/\D/g, '').replace(/^0+/, '');
  }

  // 1. COMPARATIVA DE PREFIJOS
  let totalConPrefijoIncorrecto = 0;
  const prefTransitions = {};
  const wrongPrefixList = [];

  // Inmuebles sin prefijo en Supabase (solo dígitos)
  let sinPrefijoEnSupa = 0;
  const sinPrefijoList = [];

  // Inmuebles con sufijos extraños (-URB..., -AURI...)
  const sufijadosList = [];

  supaInms.forEach(s => {
    const code = (s.inmueble || '').trim().toUpperCase();
    const sigyr = sigyrMap.get(code);
    const supaId = (s.identidad || '').trim();

    if (/-(?:URB|AURI)\d+/i.test(supaId)) {
      sufijadosList.push({
        code,
        supa_id: supaId,
        contribuyente: s.contribuyente,
        sigyr_doc: sigyr ? ((DT_MAP[sigyr.document_type_id] || '') + '-' + sigyr.document) : 'N/A',
        estado: s.estado
      });
    }

    // Sin prefijo (ej: solo números o sin letra inicial V, E, J, G, P)
    if (/^\d+$/.test(supaId.replace(/-/g, '')) && !/^[VEJPG]/i.test(supaId)) {
      sinPrefijoEnSupa++;
      if (sinPrefijoList.length < 50) {
        sinPrefijoList.push({
          code,
          supa_id: supaId,
          sigyr: sigyr ? (DT_MAP[sigyr.document_type_id] + '-' + sigyr.document) : 'N/A',
          contribuyente: s.contribuyente
        });
      }
    }

    if (sigyr && sigyr.document) {
      const sigyrPref = DT_MAP[sigyr.document_type_id] || '';
      const sigyrCleanNum = cleanDoc(sigyr.document);
      const supaMatch = supaId.match(/^([VEJPG])[-_\s]?(.*)$/i);
      const supaPref = supaMatch ? supaMatch[1].toUpperCase() : '';
      const supaCleanNum = cleanDoc(supaMatch ? supaMatch[2] : supaId);

      // Si el número coincide pero el prefijo difiere
      if (sigyrCleanNum && supaCleanNum && sigyrCleanNum === supaCleanNum) {
        if (sigyrPref && supaPref && sigyrPref !== supaPref) {
          totalConPrefijoIncorrecto++;
          const trKey = sigyrPref + ' (SIGYR) -> ' + supaPref + ' (Actual)';
          prefTransitions[trKey] = (prefTransitions[trKey] || 0) + 1;
          wrongPrefixList.push({
            code,
            sigyr_id: sigyrPref + '-' + sigyr.document,
            supa_id: supaId,
            sigyr_name: sigyr.user_name,
            supa_name: s.contribuyente,
            sigyrPref,
            supaPref,
            num: sigyrCleanNum,
            estado: s.estado
          });
        }
      }
    }
  });

  // 2. AUDITORÍA DE MULTI-INMUEBLES: ¿TRAJO TODOS LOS INMUEBLES DE CADA USUARIO?
  // Agrupar contribuyentes de SIGYR por clave oficial: Prefijo-Numero
  const sigyrUsers = new Map();
  sigyrDump.forEach(r => {
    if (!r.urbaser_code) return;
    const pref = DT_MAP[r.document_type_id] || 'V';
    const num = cleanDoc(r.document);
    if (!num) return;
    const key = pref + '-' + num;
    if (!sigyrUsers.has(key)) {
      sigyrUsers.set(key, {
        pref,
        num,
        name: r.user_name,
        doc_raw: r.document,
        codes: []
      });
    }
    sigyrUsers.get(key).codes.push(r.urbaser_code.trim().toUpperCase());
  });

  // Mapear inmuebles de Supabase por número limpio (extrayendo antes de cualquier sufijo -URB)
  const supaByNum = new Map();
  supaInms.forEach(s => {
    const rawNoSuf = (s.identidad || '').split('-URB')[0].split('-AURI')[0];
    const num = cleanDoc(rawNoSuf);
    if (!num) return;
    if (!supaByNum.has(num)) supaByNum.set(num, []);
    supaByNum.get(num).push(s);
  });

  let totalUsersSigyr = sigyrUsers.size;
  let totalUsersMultiples = 0;
  let multiConTodosTraidos = 0;
  let multiConDiscrepancia = 0;

  const discrepancies = [];

  sigyrUsers.forEach((u, key) => {
    if (u.codes.length > 1) {
      totalUsersMultiples++;
      const inSupa = supaByNum.get(u.num) || [];
      const supaCodesSet = new Set(inSupa.map(x => (x.inmueble || '').trim().toUpperCase()));

      const faltantes = u.codes.filter(c => !supaCodesSet.has(c));
      const inactivosEnSupa = inSupa.filter(x => u.codes.includes(x.inmueble) && x.estado !== 'Activo');
      const fragmentadosPorSufijo = inSupa.filter(x => u.codes.includes(x.inmueble) && /-(?:URB|AURI)\d+/i.test(x.identidad || ''));

      if (faltantes.length > 0 || inactivosEnSupa.length > 0 || fragmentadosPorSufijo.length > 0) {
        multiConDiscrepancia++;
        discrepancies.push({
          key,
          name: u.name,
          sigyr_count: u.codes.length,
          supa_found_count: supaCodesSet.size,
          faltantes_total: faltantes.length,
          faltantes: faltantes.map(fc => {
            const rowInSupa = supaMap.get(fc);
            return {
              code: fc,
              en_supa: !!rowInSupa,
              identidad_actual: rowInSupa?.identidad || 'NO_REGISTRADO',
              contribuyente_actual: rowInSupa?.contribuyente || 'NO_REGISTRADO',
              estado: rowInSupa?.estado || 'NO_REGISTRADO'
            };
          }),
          fragmentados_sufijo_count: fragmentadosPorSufijo.length,
          inactivos_count: inactivosEnSupa.length,
          inmuebles_afectados: inSupa.filter(x => u.codes.includes(x.inmueble)).map(x => ({ code: x.inmueble, ident: x.identidad, estado: x.estado }))
        });
      } else {
        multiConTodosTraidos++;
      }
    }
  });

  console.log('--- REPORTE ESTADÍSTICO CONSOLIDADO ---');
  console.log('Total usuarios únicos en SIGYR:', totalUsersSigyr);
  console.log('Total usuarios con múltiples inmuebles en SIGYR (>1):', totalUsersMultiples);
  console.log('  -> Traídos íntegros, activos y limpios:', multiConTodosTraidos);
  console.log('  -> Con alguna discrepancia (faltantes, inactivos o fragmentados):', multiConDiscrepancia);
  console.log('Total inmuebles con prefijo cambiado (mismo num, distinta letra):', totalConPrefijoIncorrecto);
  console.log('Transiciones de prefijo:', prefTransitions);
  console.log('Total inmuebles con identidad sufijada artificialmente (-URB/-AURI):', sufijadosList.length);
  console.log('Total inmuebles sin prefijo en Supabase (solo dígitos):', sinPrefijoEnSupa);

  const stats = {
    totalInmueblesSupabase: supaInms.length,
    totalInmueblesSigyr: sigyrDump.length,
    totalUsersSigyr,
    totalUsersMultiples,
    multiConTodosTraidos,
    multiConDiscrepancia,
    totalConPrefijoIncorrecto,
    prefTransitions,
    sufijadosCount: sufijadosList.length,
    sinPrefijoCount: sinPrefijoEnSupa,
    sinPrefijoSample: sinPrefijoList,
    sufijadosSample: sufijadosList.slice(0, 50),
    wrongPrefixSample: wrongPrefixList.slice(0, 60),
    discrepanciesSample: discrepancies.slice(0, 60),
    allDiscrepancies: discrepancies
  };

  fs.writeFileSync(path.join(__dirname, '../reporte_auditoria_completa_datos.json'), JSON.stringify(stats, null, 2));
  console.log('Datos guardados exitosamente en reporte_auditoria_completa_datos.json');
}

fullAnalysis().catch(console.error);
