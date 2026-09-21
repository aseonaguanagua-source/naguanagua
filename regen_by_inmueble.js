const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mikjixthqdxlynhxecdr.supabase.co';
const supabaseKey = 'sb_publishable_G45L3NkAerlI7c7WmMgqAw_PtZ33qt2';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const periodoKey = '09-2026';
  const emisionDate = '2026-09-01';
  const vencimientoDate = '2026-09-30';
  const tcmmv = 968.07;

  // PASO 1: Borrar recibos unificados CM-C-XXX Pendiente
  console.log("Buscando recibos unificados CM-C-...");
  const { data: recsUnificados, error: fetchErr } = await supabase
    .from('facturas')
    .select('referencia, estado')
    .like('referencia', `CM-C-%-${periodoKey}`);

  if (fetchErr) { console.error("Error:", fetchErr.message); return; }

  const refsPendientes = (recsUnificados || [])
    .filter(r => r.estado === 'Pendiente')
    .map(r => r.referencia);

  console.log(`Recibos unificados Pendiente: ${refsPendientes.length}`);

  if (refsPendientes.length > 0) {
    const { error: delErr } = await supabase.from('facturas').delete().in('referencia', refsPendientes);
    if (delErr) { console.error("Error borrando:", delErr.message); return; }
    console.log(`✅ ${refsPendientes.length} recibos unificados borrados.`);
  }

  // PASO 2: Obtener inmuebles activos
  const { data: inmuebles, error: inmueblesErr } = await supabase
    .from('inmuebles')
    .select('id, identidad, contribuyente, inmueble, mmv_mes, cant_inmuebles, deuda_mmv')
    .gt('mmv_mes', 0);

  if (inmueblesErr) { console.error("Error inmuebles:", inmueblesErr.message); return; }
  console.log(`Inmuebles activos: ${inmuebles.length}`);

  // PASO 3: Verificar existentes
  const todasLasRefs = inmuebles.filter(i => i.inmueble).map(i => `CM-${i.inmueble}-${periodoKey}`);
  const { data: existentes } = await supabase.from('facturas').select('referencia').in('referencia', todasLasRefs);
  const refsExistentes = new Set((existentes || []).map(e => e.referencia));

  // PASO 4: Construir nuevas facturas
  const facturasNuevas = [];
  for (const inm of inmuebles) {
    if (!inm.inmueble) continue;
    const cant = parseFloat(inm.cant_inmuebles) || 1;
    const mmv  = parseFloat(inm.mmv_mes) || 0;
    if (mmv <= 0) continue;

    const refFactura = `CM-${inm.inmueble}-${periodoKey}`;
    if (refsExistentes.has(refFactura)) continue;

    const deudaAgregadaBs = parseFloat((cant * mmv * tcmmv).toFixed(2));
    facturasNuevas.push({
      referencia:    refFactura,
      identidad:     inm.identidad,
      contribuyente: inm.contribuyente,
      monto:         deudaAgregadaBs,
      estado:        'Pendiente',
      emision:       emisionDate,
      vencimiento:   vencimientoDate
    });
  }

  console.log(`Nuevos recibos a insertar: ${facturasNuevas.length}`);

  if (facturasNuevas.length === 0) {
    console.log("✅ Ya existen todos los recibos por inmueble. Nada que insertar.");
    return;
  }

  // PASO 5: Insertar en bloques
  const CHUNK = 50;
  let insertados = 0;
  for (let i = 0; i < facturasNuevas.length; i += CHUNK) {
    const chunk = facturasNuevas.slice(i, i + CHUNK);
    const { error } = await supabase.from('facturas').upsert(chunk, { onConflict: 'referencia', ignoreDuplicates: true });
    if (error) {
      console.error(`Error en chunk ${i}:`, error.message);
    } else {
      insertados += chunk.length;
      process.stdout.write(`\r  Insertados: ${insertados}/${facturasNuevas.length}`);
    }
  }

  console.log(`\n✅ ${insertados} recibos individuales por inmueble insertados.`);
  console.log("🎉 Proceso completado. Septiembre 2026 tiene recibos separados por inmueble.");
}

run().catch(console.error);
