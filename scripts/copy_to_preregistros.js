require('dotenv').config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch the 3 users added today
  const { data: users, error } = await supabase
    .from('inmuebles')
    .select('*')
    .gte('created_at', today.toISOString());

  if (error) {
    console.error('Error fetching inmuebles:', error);
    return;
  }

  if (!users || users.length === 0) {
    console.log('No users added today.');
    return;
  }

  console.log(`Found ${users.length} records. Preparing to insert into pre_registros...`);

  const preRegistrosData = users.map(user => ({
    identidad: user.identidad,
    contribuyente: user.contribuyente,
    registro: user.telefono || '', // Map telefono to registro
    tipo: user.clasificacion || 'Residencial', // Map clasificacion to tipo
    actividad: user.actividad_principal || 'Casa Domiciliaria',
    codigo: user.nivel_metraje || 'De 1 m2 a 30 m2', // Map nivel to codigo
    registrado: new Date().toISOString()
  }));

  const { error: insertError } = await supabase
    .from('pre_registros')
    .insert(preRegistrosData);

  if (insertError) {
    console.error('Error inserting into pre_registros:', insertError);
  } else {
    console.log('Successfully inserted into pre_registros!');
  }
}

main();
