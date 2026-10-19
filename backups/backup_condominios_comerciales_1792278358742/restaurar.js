const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^[\"']|[\"']$/g, '');
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function restaurar() {
  console.log('Iniciando restauración de respaldo...');
  const unidades = JSON.parse(fs.readFileSync(path.join(__dirname, 'condominio_unidades.json'), 'utf-8'));
  console.log('Restaurando ' + unidades.length + ' unidades en condominio_unidades...');
  for (let i = 0; i < unidades.length; i += 100) {
    const batch = unidades.slice(i, i + 100);
    const { error } = await supabase.from('condominio_unidades').upsert(batch, { onConflict: 'id' });
    if (error) console.error('Error restaurando batch:', error);
  }
  console.log('Restauración completada con éxito.');
}
restaurar();