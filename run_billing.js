const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: 'c:\\\\Users\\\\david\\\\Desktop\\\\tucacas\\\\global_green_tucacas\\\\.env.local' });

async function runBilling() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('No Supabase credentials');
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    const usdRes = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    const eurRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial');

    if (!usdRes.ok || !eurRes.ok) throw new Error('Error HTTP obteniendo tasas');

    const eurData = await eurRes.json();
    const tcmmv = eurData.promedio;
    console.log('Tasa TCMMV:', tcmmv);

    const { data: inmuebles, error: inmueblesError } = await supabase
      .from('inmuebles')
      .select('id, identidad, contribuyente, cod_cont, mmv_mes, cant_inmuebles, deuda_mmv');

    if (inmueblesError) throw inmueblesError;

    let procesados = 0;
    let montoTotal = 0;
    const fechaActual = new Date();
    
    for (const inm of inmuebles) {
      const cant = parseInt(inm.cant_inmuebles) || 1;
      const mmv = parseFloat(inm.mmv_mes) || 0;
      
      if (mmv > 0) {
        const deudaAgregadaBs = parseFloat((cant * mmv * tcmmv).toFixed(2));
        const deudaMmvAnterior = parseFloat(inm.deuda_mmv) || 0;
        const nuevaDeudaMmv = deudaMmvAnterior + (cant * mmv);

        await supabase.from('inmuebles').update({ deuda_mmv: nuevaDeudaMmv }).eq('id', inm.id);

        await supabase.from('facturas').insert({
          referencia: `CM-${inm.cod_cont}-${Date.now().toString().slice(-6)}`,
          identidad: inm.identidad,
          contribuyente: inm.contribuyente,
          monto: deudaAgregadaBs,
          estado: 'Pendiente',
          emision: fechaActual.toISOString().split('T')[0],
          vencimiento: new Date(fechaActual.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });

        procesados++;
        montoTotal += deudaAgregadaBs;
      }
    }

    await supabase.from('audit').insert({
      action: 'Facturación Mensual Automática (Manual Run)',
      details: `Se procesaron \${procesados} contribuyentes. Monto total facturado: Bs \${montoTotal.toFixed(2)}. Tasa aplicada: \${tcmmv}`,
      user_email: 'Sistema (Script)',
      module: 'Cron Billing'
    });

    console.log('Facturación completada:', procesados, 'procesados, Monto total:', montoTotal);
  } catch (err) {
    console.error('Error:', err);
  }
}
runBilling();
