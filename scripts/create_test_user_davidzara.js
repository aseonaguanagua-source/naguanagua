const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['\"]|['\"]$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function createTestUser() {
  console.log('--- CREANDO USUARIO Y CONTRIBUYENTE DE PRUEBAS: DAVID ZARA ---');

  const IDENTIDAD = 'V-19751583';
  const NOMBRE = 'DAVID ZARA';
  const EMAIL = 'davidzara66@gmail.com';
  const TELEFONO = '04141234567';
  const CLAVE_PORTAL = '123456';
  const DIRECCION_FISCAL = 'AV. UNIVERSIDAD, C.C. CRISTAL, NIVEL MEZZANINA, LOCAL M-08, NAGUANAGUA, EDO. CARABOBO';

  // 1. Limpiar registros previos si existieran
  await supabase.from('inmuebles').delete().eq('identidad', IDENTIDAD);
  await supabase.from('contribuyentes').delete().eq('identidad', IDENTIDAD);

  // 2. Insertar en tabla `contribuyentes`
  const { data: contribData, error: errContrib } = await supabase
    .from('contribuyentes')
    .insert([{
      identidad: IDENTIDAD,
      nombre: NOMBRE,
      email: EMAIL,
      telefono: TELEFONO,
      direccion: DIRECCION_FISCAL,
      observaciones: 'USUARIO DE PRUEBAS RIGUROSAS DEL SISTEMA. CREADO CON ESCENARIOS DE RESIDENCIAL, CONDOMINIO, MULTI-ACTIVIDAD Y AGENTE DE RETENCIÓN.'
    }])
    .select();

  if (errContrib) {
    console.error('Error insertando contribuyente:', errContrib);
    return;
  }
  console.log('✓ Contribuyente insertado exitosamente:', contribData[0].identidad, contribData[0].nombre);

  // 3. Catálogo de Inmuebles de Prueba Rigurosa
  const inmueblesToInsert = [
    // CASO 1: Casa Quinta Residencial Individual (6 meses deuda, exento IVA, 10% mora)
    {
      inmueble: 'URB099101',
      identidad: IDENTIDAD,
      contribuyente: NOMBRE,
      tipo: 'RESIDENCIAL',
      clasificacion: 'Individual',
      actividad_principal: 'CASA (ZONA A)',
      direccion: 'URB. LA GRANJA, CALLE LOS MANGOS, QUINTA ZARA NRO. 12, NAGUANAGUA, EDO. CARABOBO',
      estado: 'Activo',
      cant_inmuebles: 0,
      mmv_mes: 0.95,
      saldo_favor_bs: 0,
      deuda_mmv: 5.70,
      meses_deuda: 6,
      multa_bs: 450.00,
      deuda_congelada_bs: 0,
      telefono: TELEFONO,
      correo_electronico: EMAIL,
      clave_portal: CLAVE_PORTAL,
      es_condominio: false,
      condominio_padre_id: null,
      agente_retencion: false,
      notas: 'CASO DE PRUEBA 1: Casa residencial individual, exenta de IVA con recargo de mora 10%.'
    },

    // CASO 2: Apartamento Residencial en Régimen de Condominio (14 meses deuda)
    {
      inmueble: 'URB099102',
      identidad: IDENTIDAD,
      contribuyente: NOMBRE,
      tipo: 'RESIDENCIAL',
      clasificacion: 'Individual',
      actividad_principal: 'APARTAMENTO (ZONA A)',
      direccion: 'URB. MAÑONGO, RES. MONTE BIANCO, TORRE A, PISO 4, APTO 4-B, NAGUANAGUA, EDO. CARABOBO',
      estado: 'Activo',
      cant_inmuebles: 0,
      mmv_mes: 0.85,
      saldo_favor_bs: 0,
      deuda_mmv: 11.90,
      meses_deuda: 14,
      multa_bs: 980.00,
      deuda_congelada_bs: 0,
      telefono: TELEFONO,
      correo_electronico: EMAIL,
      clave_portal: CLAVE_PORTAL,
      es_condominio: true,
      condominio_padre_id: 'URB025576',
      agente_retencion: false,
      notas: 'CASO DE PRUEBA 2: Apartamento residencial sujeto a condominio padre registrado.'
    },

    // CASO 3: Local Comercial en Centro Comercial / Condominio (8 meses deuda, 16% IVA, 12% mora)
    {
      inmueble: 'URB099103',
      identidad: IDENTIDAD,
      contribuyente: NOMBRE,
      tipo: 'COMERCIAL',
      clasificacion: 'Individual',
      actividad_principal: 'TIENDA DE ROPA Y CALZADO (MEDIA)',
      direccion: 'C.C. VÍA VENETO, NIVEL PB, LOCAL COMERCIAL L-15, URB. MAÑONGO, NAGUANAGUA, EDO. CARABOBO',
      estado: 'Activo',
      cant_inmuebles: 0,
      mmv_mes: 1.85,
      saldo_favor_bs: 0,
      deuda_mmv: 14.80,
      meses_deuda: 8,
      multa_bs: 1850.00,
      deuda_congelada_bs: 0,
      telefono: TELEFONO,
      correo_electronico: EMAIL,
      clave_portal: CLAVE_PORTAL,
      es_condominio: true,
      condominio_padre_id: 'URB001655',
      agente_retencion: false,
      notas: 'CASO DE PRUEBA 3: Local comercial en centro comercial en régimen de condominio.'
    },

    // CASO 4: Local Comercial Multi-Actividad (Patente 1: Charcutería y Alimentos en Local M-08)
    {
      inmueble: 'URB099104',
      identidad: IDENTIDAD,
      contribuyente: NOMBRE,
      tipo: 'COMERCIAL',
      clasificacion: 'Individual',
      actividad_principal: 'CHARCUTERÍA Y VENTA DE ALIMENTOS',
      direccion: 'AV. UNIVERSIDAD, C.C. CRISTAL, NIVEL MEZZANINA, LOCAL M-08, NAGUANAGUA, EDO. CARABOBO',
      estado: 'Activo',
      cant_inmuebles: 0,
      mmv_mes: 2.10,
      saldo_favor_bs: 0,
      deuda_mmv: 21.00,
      meses_deuda: 10,
      multa_bs: 2600.00,
      deuda_congelada_bs: 0,
      telefono: TELEFONO,
      correo_electronico: EMAIL,
      clave_portal: CLAVE_PORTAL,
      es_condominio: false,
      condominio_padre_id: null,
      agente_retencion: false,
      notas: 'CASO DE PRUEBA 4A: Primera patente comercial que comparte el Local M-08 con URB099105.'
    },

    // CASO 5: Local Comercial Multi-Actividad (Patente 2: Distribuidora de Bebidas en el MISMO Local M-08)
    {
      inmueble: 'URB099105',
      identidad: IDENTIDAD,
      contribuyente: NOMBRE,
      tipo: 'COMERCIAL',
      clasificacion: 'Individual',
      actividad_principal: 'DISTRIBUIDORA DE BEBIDAS Y CONFITERÍA',
      direccion: 'AV. UNIVERSIDAD, C.C. CRISTAL, NIVEL MEZZANINA, LOCAL M-08, NAGUANAGUA, EDO. CARABOBO',
      estado: 'Activo',
      cant_inmuebles: 0,
      mmv_mes: 1.95,
      saldo_favor_bs: 0,
      deuda_mmv: 19.50,
      meses_deuda: 10,
      multa_bs: 2400.00,
      deuda_congelada_bs: 0,
      telefono: TELEFONO,
      correo_electronico: EMAIL,
      clave_portal: CLAVE_PORTAL,
      es_condominio: false,
      condominio_padre_id: null,
      agente_retencion: false,
      notas: 'CASO DE PRUEBA 4B: Segunda patente en el mismo Local M-08 (prueba de agrupamiento indisoluble).'
    },

    // CASO 6: Local Comercial con Agente de Retención (75% IVA Exento / Retenido)
    {
      inmueble: 'URB099106',
      identidad: IDENTIDAD,
      contribuyente: NOMBRE,
      tipo: 'COMERCIAL',
      clasificacion: 'Individual',
      actividad_principal: 'SUPERMERCADO / BODEGÓN GOURMET',
      direccion: 'AV. SALVADOR FEO LA CRUZ, CENTRO EMPRESARIAL ZARA, PB LOCAL 1, NAGUANAGUA, EDO. CARABOBO',
      estado: 'Activo',
      cant_inmuebles: 0,
      mmv_mes: 3.50,
      saldo_favor_bs: 0,
      deuda_mmv: 17.50,
      meses_deuda: 5,
      multa_bs: 3200.00,
      deuda_congelada_bs: 0,
      telefono: TELEFONO,
      correo_electronico: EMAIL,
      clave_portal: CLAVE_PORTAL,
      es_condominio: false,
      condominio_padre_id: null,
      agente_retencion: true,
      notas: 'CASO DE PRUEBA 5: Local clasificado como Agente de Retención especial del 75% del IVA.'
    },

    // CASO 7: Local Solvente / Reciente (1 mes vigente de deuda)
    {
      inmueble: 'URB099107',
      identidad: IDENTIDAD,
      contribuyente: NOMBRE,
      tipo: 'COMERCIAL',
      clasificacion: 'Individual',
      actividad_principal: 'OFICINA DE SERVICIOS PROFESIONALES Y CONSULTORÍA',
      direccion: 'CALLE HERMÓGENES LÓPEZ, EDIF. CENTRO PROFESIONAL, OFICINA 2-C, NAGUANAGUA, EDO. CARABOBO',
      estado: 'Activo',
      cant_inmuebles: 0,
      mmv_mes: 1.20,
      saldo_favor_bs: 0,
      deuda_mmv: 1.20,
      meses_deuda: 1,
      multa_bs: 0,
      deuda_congelada_bs: 0,
      telefono: TELEFONO,
      correo_electronico: EMAIL,
      clave_portal: CLAVE_PORTAL,
      es_condominio: false,
      condominio_padre_id: null,
      agente_retencion: false,
      notas: 'CASO DE PRUEBA 6: Inmueble con 1 solo mes vigente (sin mora).'
    }
  ];

  const { data: inmsInserted, error: errInms } = await supabase
    .from('inmuebles')
    .insert(inmueblesToInsert)
    .select('id, inmueble, actividad_principal, direccion, tipo, meses_deuda, agente_retencion, es_condominio');

  if (errInms) {
    console.error('Error insertando inmuebles:', errInms);
    return;
  }

  console.log(`✓ Se insertaron con éxito ${inmsInserted.length} inmuebles de prueba:`);
  inmsInserted.forEach(i => {
    console.log(`  - [${i.inmueble}] ${i.tipo}: ${i.actividad_principal} (${i.meses_deuda} meses) | Condominio: ${i.es_condominio} | Agente Ret: ${i.agente_retencion}`);
  });

  console.log('\n--- VERIFICANDO AUTENTICACIÓN DEL PORTAL ---');
  console.log(`Usuario: ${IDENTIDAD} (también funciona como 19751583)`);
  console.log(`Contraseña configurada: ${CLAVE_PORTAL}`);
  console.log(`Correo: ${EMAIL}`);
  console.log(`Teléfono: ${TELEFONO}`);
}

createTestUser();
