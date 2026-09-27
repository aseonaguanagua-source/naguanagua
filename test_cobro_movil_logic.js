const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const p = { identidad: '19109082' };
  const docTypeState = 'V';
  
  const idLimpio = p.identidad.replace(/-/g, '').toUpperCase();
  const docType = docTypeState.toUpperCase();
  const fullDoc = `${docType}-${idLimpio}`;
  const fullDocDash = `${docType}${idLimpio}`;
  
  console.log("Searching with:", fullDoc, fullDocDash, idLimpio);
  const { data: inmsDB } = await supabase
    .from('inmuebles')
    .select('*')
    .or(`identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`);
    
  console.log("inmsDB length:", inmsDB ? inmsDB.length : 0);
  
  if(!inmsDB || inmsDB.length === 0) return;
  
  const user = { Contribuyente: inmsDB[0].contribuyente, Actividad: inmsDB[0].actividad_principal };
  
  let inmsFinal = [...inmsDB];
  const isCondoByFlag = inmsDB.some(i => i.condominio === 'SI' || i.condominio === 'Si' || i.condominio === 'si');
  const isCondoByName = (user.Contribuyente || '').toLowerCase().includes('condominio') || (user.Actividad || '').toLowerCase().includes('condominio');
  
  console.log("isCondo:", isCondoByFlag, isCondoByName);
  console.log("inmsFinal length:", inmsFinal.length);
  
  let combined = [];
  
  if (combined.length === 0 && inmsFinal && inmsFinal.length > 0) {
      const hasDeuda = inmsFinal.some(i => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
      console.log("hasDeuda:", hasDeuda);
      if (hasDeuda) {
        inmsFinal.forEach(inm => {
          const deudaMMV = parseFloat(inm.deuda_mmv || '0');
          const congelada = parseFloat(inm.deuda_congelada_bs || '0');
          const multa = parseFloat(inm.multa_bs || '0');
          
          let rawMeses = inm.meses_deuda;
          console.log("rawMeses:", rawMeses);
          // BUG CHECK: In JS parseInt(0 || 1) -> wait, '0' is truthy, but if it is number 0, 0 || 1 is 1!
          let mStr = inm.meses_deuda;
          if (mStr === null || mStr === undefined) mStr = '0'; // Wait, in cobro-movil I did: parseInt(i.meses_deuda || '0')
          const meses = parseInt(String(inm.meses_deuda) || '0'); 
          console.log("parsed meses:", parseInt(inm.meses_deuda || 1), "actual:", meses);
          
          if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {
            console.log("Will push!");
          } else {
            console.log("Condition false!", deudaMMV, congelada, multa, meses);
          }
        });
      }
  }
}
check();
