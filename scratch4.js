const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function search() {
  let allWrong = [];
  let from = 0;
  let to = 999;
  
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('inmueble, direccion')
      .ilike('clasificacion', 'Comercial')
      .ilike('direccion', '%residencial%')
      .range(from, to);
      
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    
    allWrong = allWrong.concat(data);
    from += 1000;
    to += 1000;
  }
  
  // Also check 'residencia '
  from = 0;
  to = 999;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('inmueble, direccion')
      .ilike('clasificacion', 'Comercial')
      .ilike('direccion', '%residencias%')
      .range(from, to);
      
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    
    allWrong = allWrong.concat(data);
    from += 1000;
    to += 1000;
  }

  // filter out the ones already fixed (they shouldn't be here since we search by Comercial)
  console.log("Total remaining wrong:", allWrong.length);
  // Just print unique condo names from address
  const uniqueNames = new Set();
  allWrong.forEach(w => {
    const m = w.direccion.match(/RESIDENCIAL[ A-Z]+/i) || w.direccion.match(/RESIDENCIAS[ A-Z]+/i);
    if (m) uniqueNames.add(m[0].trim());
  });
  console.log([...uniqueNames]);
}

search();
