const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mikjixthqdxlynhxecdr.supabase.co';
const supabaseKey = 'sb_publishable_G45L3NkAerlI7c7WmMgqAw_PtZ33qt2';
const supabase = createClient(supabaseUrl, supabaseKey);

async function restore() {
  const { data, error } = await supabase
    .from('facturas')
    .insert([
      {
        referencia: 'HIST-' + Math.floor(Math.random() * 1000000) + '-RESTORED',
        contribuyente: 'J-400454140',
        emision: '2023-12-31',
        vencimiento: '2023-12-31',
        monto: 52513.20,
        estado: 'Pendiente'
      }
    ]);
    
  if (error) console.error('Error:', error);
  else console.log('Deuda restaurada:', data);
}

restore();
