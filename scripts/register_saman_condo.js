const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '../.env.local')));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function registerSaman() {
  console.log('Registrando URB000326 (MULTICENTRO EL SAMAN) en condominios...');

  // 1. Obtener datos de URB000326 de inmuebles
  const { data: inm, error: inmErr } = await sb
    .from('inmuebles')
    .select('*')
    .eq('inmueble', 'URB000326')
    .single();

  if (inmErr || !inm) {
    console.error('Error obteniendo inmueble URB000326:', inmErr);
    return;
  }

  // 2. Insertar o actualizar en tabla condominios
  const condoData = {
    codigo: 'URB000326',
    identidad: inm.identidad || 'J-309642634',
    nombre: 'MULTICENTRO EL SAMAN (GRUPO ZEGNA 1104, C.A)',
    tipo: 'COMERCIAL',
    modalidad: 'CENTRALIZADO',
    cant_declarada: 25,
    actividad: 'COMERCIAL',
    tarifa_mmv: parseFloat(inm.mmv_mes || 0.0542),
    agente_retencion: true,
    telefono: inm.telefono || '04244108828',
    correo: inm.correo_electronico || 'CONDOMINIOCCELSAMAN@GMAIL.COM',
    direccion: inm.direccion,
    estado: 'Activo',
    permite_pago_por_unidad: true,
    permite_abonos: true,
    cobro_tarifa_por_unidad: false,
    origen: 'MIGRACION'
  };

  const { data: condoRes, error: condoErr } = await sb
    .from('condominios')
    .upsert(condoData, { onConflict: 'codigo' })
    .select();

  if (condoErr) {
    console.error('Error insertando en tabla condominios:', condoErr);
    return;
  }
  console.log('✓ Insertado exitosamente en condominios:', condoRes);

  // 3. Vincular los 25 locales hijas con condominio_padre_id = 'URB000326'
  const codes = [];
  for (let i = 327; i <= 351; i++) {
    codes.push('URB' + String(i).padStart(6, '0'));
  }

  const { data: updHijas, error: updErr } = await sb
    .from('inmuebles')
    .update({
      condominio_padre_id: 'URB000326',
      padre_id: 'URB000326',
      es_condominio: false
    })
    .in('inmueble', codes)
    .select('inmueble, contribuyente, estado');

  if (updErr) {
    console.error('Error vinculando hijas:', updErr);
  } else {
    console.log(`✓ ${updHijas.length} locales vinculados como hijas de URB000326`);
  }

  // 4. Asegurar que URB000326 tenga es_condominio = true y estado = 'Activo'
  await sb.from('inmuebles').update({
    es_condominio: true,
    clasificacion: 'Condominio',
    cant_inmuebles: 25,
    estado: 'Activo'
  }).eq('inmueble', 'URB000326');

  console.log('🎉 URB000326 configurado y vinculado al 100%');
}

registerSaman().catch(console.error);
