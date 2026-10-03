const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

const TASA_BCV = 55514.07;

const mapsData = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/harmonize_maps.json', 'utf8'));
const priceMap = new Map(Object.entries(mapsData.price_map));
const docPrefixMap = new Map(Object.entries(mapsData.doc_prefix_map));

function getResRate(act) {
  const a = (act || '').toUpperCase();
  if (a.includes('ZONA A')) return 0.021588;
  if (a.includes('ZONA B')) return 0.017276;
  if (a.includes('ZONA C')) return 0.008652;
  if (a.includes('ZONA D')) return 0.005881;
  if (a.includes('DESOCUPADO')) return 0.002669;
  return 0.017276;
}

function cleanIdentidad(rawId, nombre = '') {
  if (!rawId) return 'V-0';
  let str = String(rawId).trim().toUpperCase();
  str = str.replace(/[\*\+\s\.]/g, '');
  str = str.replace(/^([VEJG])-?([VEJG])/, '$1-');

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

  let prefix = '';
  let rest = str;
  if (/^[VEJPG]/i.test(str)) {
    prefix = str.charAt(0).toUpperCase() + '-';
    rest = str.slice(1).replace(/^-+/, '');
  }

  const digitsOnly = rest.replace(/\D/g, '');
  if (!digitsOnly) return prefix ? `${prefix}0` : 'V-0';
  if (prefix) return `${prefix}${digitsOnly}`;

  if (docPrefixMap.has(digitsOnly)) {
    return `${docPrefixMap.get(digitsOnly)}${digitsOnly}`;
  }

  const nUpper = (nombre || '').toUpperCase();
  const isJuridico = digitsOnly.length >= 9 || 
                     nUpper.includes('C.A') || 
                     nUpper.includes('S.A') || 
                     nUpper.includes('CONDOMINIO') || 
                     nUpper.includes('INVERSIONES') || 
                     nUpper.includes('SRL') ||
                     nUpper.includes('COMERCIAL') ||
                     nUpper.includes('EMPRESA') ||
                     nUpper.includes('S.C');
  return isJuridico ? `J-${digitsOnly}` : `V-${digitsOnly}`;
}

async function finish() {
  console.log('=== 1. NORMALIZANDO LOS 14 CONTRIBUYENTES RESTANTES ===');
  const { data: noHyphenContrib } = await supabase.from('contribuyentes').select('id, identidad, nombre').not('identidad', 'like', '%-%');
  if (noHyphenContrib && noHyphenContrib.length > 0) {
    for (const c of noHyphenContrib) {
      const canonical = cleanIdentidad(c.identidad, c.nombre);
      console.log(`Actualizando ${c.identidad} (${c.nombre}) -> ${canonical}`);
      await supabase.from('contribuyentes').update({ identidad: canonical }).eq('id', c.id);
    }
  }
  console.log('✓ Contribuyentes restantes normalizados.');

  console.log('\n=== 2. PROCESANDO INMUEBLES PENDIENTES CON DEUDA/MULTA CERO ===');
  // Obtener todos los inmuebles con deuda pendiente
  let pendingCount = 0;
  while (true) {
    const { data: pend, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, mmv_mes, cant_inmuebles, meses_deuda, deuda_mmv, multa_bs')
      .gt('meses_deuda', 0)
      .eq('deuda_mmv', 0)
      .limit(200);

    if (error) { console.error('Error fetching pending:', error); break; }
    if (!pend || pend.length === 0) break;

    const updates = pend.map(inm => {
      const meses = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
      const tipo = (inm.tipo || '').toUpperCase();
      const act = (inm.actividad_principal || '').toUpperCase().trim();
      const cant = Math.max(1, parseInt(String(inm.cant_inmuebles || 1)));
      const esRes = tipo.includes('RESIDENCIAL');

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

      const deudaMmv = parseFloat((tarifaMesUCD * meses).toFixed(6));
      let multaBs = 0;
      if (meses > 1) {
        const mesesMora = meses - 1;
        const pctMulta = esRes ? 0.10 : 0.12;
        const multaUCD = mesesMora * tarifaMesUCD * pctMulta;
        multaBs = parseFloat((multaUCD * TASA_BCV).toFixed(2));
      }

      const normId = cleanIdentidad(inm.identidad, inm.contribuyente);

      return {
        id: inm.id,
        identidad: normId,
        deuda_mmv: deudaMmv,
        deuda_congelada_bs: 0,
        multa_bs: multaBs
      };
    });

    for (const chunk of updates) {
      await supabase.from('inmuebles').update({
        identidad: chunk.identidad,
        deuda_mmv: chunk.deuda_mmv,
        deuda_congelada_bs: 0,
        multa_bs: chunk.multa_bs
      }).eq('id', chunk.id);
    }

    pendingCount += pend.length;
    console.log(`  Actualizados ${pendingCount} inmuebles pendientes con deuda.`);
  }

  console.log('\n=== 3. PROCESANDO INMUEBLES CON MESES > 1 Y MULTA CERO ===');
  let pendingMultas = 0;
  while (true) {
    const { data: pendM, error: errM } = await supabase
      .from('inmuebles')
      .select('id, inmueble, tipo, actividad_principal, mmv_mes, cant_inmuebles, meses_deuda, deuda_mmv')
      .gt('meses_deuda', 1)
      .eq('multa_bs', 0)
      .limit(200);

    if (errM) { console.error('Error fetching pending multas:', errM); break; }
    if (!pendM || pendM.length === 0) break;

    for (const inm of pendM) {
      const meses = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
      const tipo = (inm.tipo || '').toUpperCase();
      const act = (inm.actividad_principal || '').toUpperCase().trim();
      const cant = Math.max(1, parseInt(String(inm.cant_inmuebles || 1)));
      const esRes = tipo.includes('RESIDENCIAL');

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

      const mesesMora = meses - 1;
      const pctMulta = esRes ? 0.10 : 0.12;
      const multaUCD = mesesMora * tarifaMesUCD * pctMulta;
      const multaBs = parseFloat((multaUCD * TASA_BCV).toFixed(2));

      await supabase.from('inmuebles').update({ multa_bs: multaBs }).eq('id', inm.id);
    }

    pendingMultas += pendM.length;
    console.log(`  Actualizadas ${pendingMultas} multas pendientes.`);
  }

  console.log('\n=== FINISH COMPLETADO EXITOSAMENTE ===');
}

finish().catch(err => console.error('Error finishing:', err));
