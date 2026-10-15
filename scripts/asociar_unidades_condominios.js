const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const sigyrDump = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr_audit_dump.json', 'utf8'));

// Función para extraer el número de local o apartamento de la dirección/referencia
function extractNumero(ref, childCode) {
  if (!ref) return childCode;
  const s = ref.toUpperCase();

  // Buscar patrones comunes de locales, apartamentos, town houses, consultorios
  const mLocal = s.match(/(?:LOCAL|LOCALES|LOC)\.?\s*(?:COMERCIAL)?\s*(?:NRO\.?|NUM\.?|#)?\s*([A-Z0-9\-_/]+)/i);
  if (mLocal && mLocal[1]) return mLocal[1].trim();

  const mApto = s.match(/(?:APTO|APARTAMENTO|APT)\.?\s*(?:NRO\.?|NUM\.?|#)?\s*([A-Z0-9\-_/]+)/i);
  if (mApto && mApto[1]) return mApto[1].trim();

  const mTH = s.match(/(?:TOWN\s*HOUSE|TOWNHOUSE|TH)\.?\s*(?:NRO\.?|NUM\.?|#)?\s*([A-Z0-9\-_/]+)/i);
  if (mTH && mTH[1]) return `TH-${mTH[1].trim()}`;

  const mCasa = s.match(/(?:CASA|VILLA)\.?\s*(?:NRO\.?|NUM\.?|#)?\s*([A-Z0-9\-_/]+)/i);
  if (mCasa && mCasa[1]) return `CASA-${mCasa[1].trim()}`;

  const mGalpon = s.match(/(?:GALPON|GALPÓN)\.?\s*(?:NRO\.?|NUM\.?|#)?\s*([A-Z0-9\-_/]+)/i);
  if (mGalpon && mGalpon[1]) return `GALPON-${mGalpon[1].trim()}`;

  const mCons = s.match(/(?:CONSULTORIO|CONS)\.?\s*(?:NRO\.?|NUM\.?|#)?\s*([A-Z0-9\-_/]+)/i);
  if (mCons && mCons[1]) return `CONS-${mCons[1].trim()}`;

  const mOfic = s.match(/(?:OFICINA|OFIC|OF)\.?\s*(?:NRO\.?|NUM\.?|#)?\s*([A-Z0-9\-_/]+)/i);
  if (mOfic && mOfic[1]) return `OF-${mOfic[1].trim()}`;

  const mNro = s.match(/NRO\.?\s*([A-Z0-9\-_/]+)/i);
  if (mNro && mNro[1]) return mNro[1].trim();

  return childCode;
}

async function sincronizarUnidadesCondominios() {
  console.log('====================================================================');
  console.log('🏢 ASOCIANDO UNIDADES Y LOCALES A TODOS LOS CONDOMINIOS');
  console.log('====================================================================');

  // 1. Cargar todos los condominios
  const { data: allCondos, error: cErr } = await sb.from('condominios').select('*');
  if (cErr) throw new Error(cErr.message);
  console.log(`Total condominios registrados: ${allCondos.length}`);

  const condoByCode = new Map();
  allCondos.forEach(c => condoByCode.set(c.codigo.toUpperCase(), c));

  // 2. Cargar todas las unidades ya existentes en condominio_unidades para no duplicar
  let existingUnits = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from('condominio_unidades').select('inmueble, condominio_id').range(from, from + 999);
    if (!data || data.length === 0) break;
    existingUnits = existingUnits.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const existingSet = new Set(existingUnits.map(u => (u.inmueble || '').toUpperCase()).filter(Boolean));
  console.log(`Total unidades actualmente registradas en condominio_unidades: ${existingSet.size}`);

  // 3. Descargar todos los inmuebles de Supabase para obtener sus datos frescos (tarifa_mmv, actividad, etc.)
  let supaInms = [];
  from = 0;
  while (true) {
    const { data } = await sb
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, mmv_mes, aseo_pendiente_desde, multa_meses, estado, clasificacion, condominio_padre_id, padre_id, direccion')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    supaInms = supaInms.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const supaInmMap = new Map();
  supaInms.forEach(i => {
    if (i.inmueble) supaInmMap.set(i.inmueble.toUpperCase(), i);
  });
  console.log(`Total inmuebles en catálogo Supabase: ${supaInms.length}`);

  // 4. Mapear hijas desde SIGYR
  const sigyrDaughtersByParent = new Map();
  sigyrDump.forEach(r => {
    if (r.parent_urbaser_code && !r.prop_deleted_at) {
      const pCod = r.parent_urbaser_code.toUpperCase();
      if (!sigyrDaughtersByParent.has(pCod)) sigyrDaughtersByParent.set(pCod, []);
      sigyrDaughtersByParent.get(pCod).push(r);
    }
  });

  // También mapear hijas que en Supabase tienen condominio_padre_id o padre_id
  supaInms.forEach(i => {
    const pCod = (i.condominio_padre_id || i.padre_id || '').toUpperCase();
    if (pCod && condoByCode.has(pCod)) {
      if (!sigyrDaughtersByParent.has(pCod)) sigyrDaughtersByParent.set(pCod, []);
      const exists = sigyrDaughtersByParent.get(pCod).some(x => (x.urbaser_code || '').toUpperCase() === i.inmueble.toUpperCase());
      if (!exists) {
        sigyrDaughtersByParent.get(pCod).push({
          urbaser_code: i.inmueble,
          document: i.identidad,
          user_name: i.contribuyente,
          reference: i.direccion || '',
          act_name: i.actividad_principal
        });
      }
    }
  });

  console.log(`Total condominios con hijas detectadas: ${sigyrDaughtersByParent.size}`);

  // 5. Insertar unidades faltantes por cada condominio
  let totalInserted = 0;
  let totalLinked = 0;
  const updatesCondoDeclarada = [];

  for (const condo of allCondos) {
    const pCod = condo.codigo.toUpperCase();
    const daughters = sigyrDaughtersByParent.get(pCod) || [];
    if (daughters.length === 0) continue;

    const unitsToInsert = [];
    const childCodesToLink = [];

    for (const d of daughters) {
      const childCode = (d.urbaser_code || '').toUpperCase();
      if (!childCode) continue;

      childCodesToLink.push(childCode);

      // Si ya está en condominio_unidades, omitir inserción
      if (existingSet.has(childCode)) continue;

      const sInm = supaInmMap.get(childCode);
      const propietario = sInm?.contribuyente || d.user_name || 'PROPIETARIO / LOCAL';
      const identidad = sInm?.identidad || d.document || null;
      const ref = sInm?.direccion || d.reference || '';
      const numero = extractNumero(ref, childCode);
      const actividad = sInm?.actividad_principal || d.act_name || (condo.tipo === 'COMERCIAL' ? 'LOCAL COMERCIAL' : 'APARTAMENTO');
      const mmv = parseFloat(sInm?.mmv_mes || condo.tarifa_mmv || (condo.tipo === 'COMERCIAL' ? 1.5 : 0.91)) || 0.91;
      const desde = sInm?.aseo_pendiente_desde || condo.aseo_pendiente_desde || '2026-09-01';
      const multas = parseInt(sInm?.multa_meses || 0) || 0;

      unitsToInsert.push({
        condominio_id: condo.id,
        inmueble: childCode,
        numero: numero,
        identidad: identidad,
        propietario: propietario,
        actividad: actividad,
        tarifa_mmv: mmv,
        estado: sInm?.estado === 'Eliminado' ? 'Eliminada' : 'Activa',
        aseo_pendiente_desde: desde,
        multa_meses: multas,
        abono_bs: 0,
        creada_en_modulo: false
      });
      existingSet.add(childCode);
    }

    // Insertar en lotes a condominio_unidades
    if (unitsToInsert.length > 0) {
      for (let i = 0; i < unitsToInsert.length; i += 200) {
        const chunk = unitsToInsert.slice(i, i + 200);
        const { error: insErr } = await sb.from('condominio_unidades').insert(chunk);
        if (insErr) {
          console.error(`Error insertando unidades para ${pCod}:`, insErr.message);
        } else {
          totalInserted += chunk.length;
        }
      }
    }

    // Vincular en la tabla inmuebles con condominio_padre_id
    if (childCodesToLink.length > 0) {
      for (let i = 0; i < childCodesToLink.length; i += 200) {
        const chunk = childCodesToLink.slice(i, i + 200);
        const { error: updErr } = await sb
          .from('inmuebles')
          .update({ condominio_padre_id: pCod })
          .in('inmueble', chunk);
        if (!updErr) {
          totalLinked += chunk.length;
        }
      }
    }

    // Actualizar cant_declarada en condominios si la real es mayor
    const totalUnitsForCondo = daughters.length;
    if (totalUnitsForCondo > (condo.cant_declarada || 0)) {
      await sb.from('condominios').update({ cant_declarada: totalUnitsForCondo }).eq('id', condo.id);
    }
  }

  console.log('====================================================================');
  console.log(`✅ PROCESO COMPLETADO:`);
  console.log(`- Unidades insertadas en condominio_unidades: ${totalInserted}`);
  console.log(`- Inmuebles vinculados con condominio_padre_id: ${totalLinked}`);
  console.log('====================================================================');
}

sincronizarUnidadesCondominios().catch(console.error);
