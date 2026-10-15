const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const sigyrDump = JSON.parse(fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/backup_sigyr/sigyr_audit_dump.json', 'utf8'));

async function remediateAll() {
  console.log('====================================================================');
  console.log('🔧 INICIANDO REMEDIACIÓN INTEGRAL DE CONDOMINIOS Y CONTRIBUYENTES');
  console.log('====================================================================');

  // 1. SANEAMIENTO DE LOS 9 INMUEBLES CON IDENTIDAD / NOMBRE NULO
  console.log('\n[1/3] Sanando 9 inmuebles huérfanos con datos oficiales de SIGYR...');
  const nullCodes = ['URB016072', 'URB014950', 'URB016071', 'URB032095', 'URB032096', 'URB032094', 'URB034228', 'URB016350', 'URB014949'];
  
  // Asegurar contribuyente provisional V-0000000
  await sb.from('contribuyentes').upsert({
    identidad: 'V-0000000',
    nombre: 'NO REGISTRADO / PENDIENTE',
    email: '',
    telefono: '',
    direccion: 'NAGUANAGUA'
  }, { onConflict: 'identidad' });

  for (const c of nullCodes) {
    const sItem = sigyrDump.find(r => r.urbaser_code === c);
    const nombre = sItem?.user_name || 'PENDIENTE POR REGISTRAR';
    const direccion = sItem?.reference || '';
    
    // Crear contribuyente específico si no existe
    const identProv = `V-PROV-${c}`;
    await sb.from('contribuyentes').upsert({
      identidad: identProv,
      nombre: nombre,
      email: '',
      telefono: '',
      direccion: direccion
    }, { onConflict: 'identidad' });

    const { error: updErr } = await sb.from('inmuebles').update({
      identidad: identProv,
      contribuyente: nombre,
      direccion: direccion || undefined,
      estado: 'Activo'
    }).eq('inmueble', c);

    if (updErr) console.error(`Error actualizando ${c}:`, updErr.message);
    else console.log(`  ✓ ${c}: ${nombre} (${identProv})`);
  }

  // 2. CORREGIR COMERCIOS Y PARTICULARES ERRÓNEAMENTE MARCADOS COMO CONDOMINIO
  console.log('\n[2/3] Corrigiendo 26 comercios y personas erróneamente marcados como condominios...');
  const wronglyCondoCodes = [
    'URB033294', // AUTOMERCADO LAS CHIMENEAS, C.A
    'URB033622', // ACCESORIOS CANGURO, C.A
    'URB002272', // EL MERCADITO EXPRESS, C.A
    'URB033797', // CLINICA VETERINARIA DEL NORTE 2025, C.A
    'URB030879', // ASOCIACION CARABOBEÑA DE TIRO
    'URB033526', // GRANJA A COLOR, C.A
    'URB033880', // TECNICAM VENTAS, C.A.
    'URB033711', // SPEED MOTORCYCLES NAGUANAGUA, C.A.
    'URB033364', // PLASTIVEN JVM,CA.
    'URB007889', // AUTOLAVADOSW PRO C.A
    'URB033958', // GRUPO TOTAL 99, C.A
    'URB033649', // DISTRIBUIDORA M J S, C.A
    'URB033454', // SOCIEDAD DE HECHO BIAGIO LOVOI Y OTROS
    'URB033980', // MINI LOCALES
    'URB033324', // LUIS ALBERTO FERNANDES DE SOUSA
    'URB033317', // CARMEN YOLANDA GIL GARCIA
    'URB000466', // JOSE ANTONIO CORREIA DA SILVA
    'URB008595', // JAIME APARICI SOLER
    'URB033768', // JULIO CESAR BENAVIDEZ
    'AURI017508', // CARLOS ENRIQUE OBISPO OCHOA
    'URB019444', // CARLOS ENRIQUE OBISPO OCHOA
    'URB034699', // CHEN HIJADING
    'URB034698', // CHEN HIJADING
    'URB034697', // CHEN HIJADIG
    'URB034684', // CHEN HUADING
    'URB034685'  // HIJADING CHEN
  ];

  const { data: fixedComercios, error: comErr } = await sb
    .from('inmuebles')
    .update({
      es_condominio: false,
      clasificacion: 'Individual'
    })
    .in('inmueble', wronglyCondoCodes)
    .select('inmueble, contribuyente');

  if (comErr) console.error('Error corrigiendo comercios:', comErr.message);
  else console.log(`  ✓ ${fixedComercios.length} comercios y personas regularizados como Individual (es_condominio: false)`);

  // 3. REGISTRAR LOS 11 CONDOMINIOS REALES FALTANTES EN LA TABLA 'condominios'
  console.log('\n[3/3] Registrando condominios reales faltantes en tabla condominios...');
  const realCondoCodes = [
    'URB029160', // RESD EL QUIJOTE
    'URB028116', // CONJUNTO RESIDENCIAL "VILLAS DEL SOL"
    'URB003074', // NAFEB, C.A (EDIFICIO EL SOL)
    'URB033670', // CONDOMINIO DEL CONJUNTO RESIDENCIAL LE FONTI
    'URB033555', // CONDOMINIO VALLE FRESCO III TORRE C
    'URB033563', // CONJ RESD LOS TULIPANES
    'URB003322', // CONJ. RESD. EL YAQUE
    'URB024783', // VILLA NUESTRA SRA DE FATIMA
    'URB034480', // RESD LA FLORECENTE
    'URB028483', // INVERSIONES RIO GRANDE, C.A.
    'URB034963'  // EVILIA CARLOTA FRANCESCHI LEON
  ];

  const { data: realCondoInms } = await sb
    .from('inmuebles')
    .select('*')
    .in('inmueble', realCondoCodes);

  let insertedCondos = 0;
  for (const cInm of (realCondoInms || [])) {
    const isCom = (cInm.tipo || '').toUpperCase().includes('COMERCIAL');
    const condoRecord = {
      codigo: cInm.inmueble,
      identidad: cInm.identidad || 'J-00000000',
      nombre: cInm.contribuyente || `CONDOMINIO ${cInm.inmueble}`,
      tipo: isCom ? 'COMERCIAL' : 'RESIDENCIAL',
      modalidad: 'CENTRALIZADO',
      cant_declarada: parseInt(cInm.cant_inmuebles || '1') || 1,
      actividad: isCom ? 'COMERCIAL' : 'RESIDENCIAL',
      tarifa_mmv: parseFloat(cInm.mmv_mes || 0.8),
      agente_retencion: isCom,
      telefono: cInm.telefono || '',
      correo: cInm.correo_electronico || '',
      direccion: cInm.direccion || '',
      estado: 'Activo',
      permite_pago_por_unidad: true,
      permite_abonos: true,
      cobro_tarifa_por_unidad: false,
      origen: 'MIGRACION'
    };

    const { error: insErr } = await sb
      .from('condominios')
      .upsert(condoRecord, { onConflict: 'codigo' });

    if (insErr) {
      console.error(`Error insertando condominio ${cInm.inmueble}:`, insErr.message);
    } else {
      insertedCondos++;
      console.log(`  ✓ Condominio registrado: ${cInm.inmueble} - ${cInm.contribuyente}`);
      
      // Actualizar inmueble matriz
      await sb.from('inmuebles').update({
        es_condominio: true,
        clasificacion: 'Condominio',
        estado: 'Activo'
      }).eq('id', cInm.id);

      // Si tiene hijas en inmuebles con padre_id o condominio_padre_id, asegurar el enlace
      await sb.from('inmuebles').update({
        condominio_padre_id: cInm.inmueble
      }).or(`padre_id.eq.${cInm.inmueble},condominio_padre_id.eq.${cInm.inmueble}`);
    }
  }

  console.log(`\n🎉 Remediación completada: ${insertedCondos} condominios registrados, ${fixedComercios?.length || 0} comercios individualizados.`);
}

remediateAll().catch(console.error);
