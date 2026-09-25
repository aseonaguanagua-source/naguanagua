const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

let SUPABASE_URL = '';
let SUPABASE_KEY = '';
try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
  if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
} catch(e) {}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let passed = 0;
let failed = 0;
const results = [];

function assert(testName, condition, detail) {
  if (condition) {
    passed++;
    results.push(`  ✅ ${testName}`);
  } else {
    failed++;
    results.push(`  ❌ ${testName} — ${detail || 'FAILED'}`);
  }
}

(async () => {
  console.log('🧪 EJECUTANDO TEST SUITE\n');
  console.log('═══════════════════════════════════════\n');

  // ── SETUP ──
  await supabase.from('pagos_reportados').delete().eq('identidad', 'JTEST10MESES');
  await supabase.from('inmuebles').update({ deuda_mmv: 500 }).eq('identidad', 'JTEST10MESES');

  // ── T1: Inmueble de prueba ──
  console.log('📋 T1: Verificar inmueble de prueba');
  const { data: inm } = await supabase.from('inmuebles').select('*').eq('identidad', 'JTEST10MESES');
  assert('Inmueble existe', inm && inm.length > 0);
  assert('deuda_mmv = 500', inm?.[0]?.deuda_mmv === 500, `deuda_mmv = ${inm?.[0]?.deuda_mmv}`);

  // ── T2: Insert pago con UUID real ──
  console.log('\n📋 T2: Insert de pago con UUID real');
  const testPagoId = crypto.randomUUID();
  const { error: insertErr } = await supabase.from('pagos_reportados').insert({
    id: testPagoId,
    identidad: 'JTEST10MESES',
    monto: 100,
    banco: 'Test',
    referencia: 'TEST-REF-' + Date.now(),
    tipo: 'Debito',
    estado: 'Aprobado',
    detalles: JSON.stringify({ recibos: ['RECIB-DEUDA'], cajero: 'test', es_abono: false, tasa_bcv: 1 })
  });
  assert('Insert sin error', !insertErr, insertErr?.message);

  // ── T3: Lectura ──
  console.log('\n📋 T3: Lectura del pago insertado');
  const { data: pagoLeido } = await supabase.from('pagos_reportados').select('*').eq('id', testPagoId);
  assert('Pago se puede leer', pagoLeido && pagoLeido.length > 0);
  assert('Monto correcto', pagoLeido?.[0]?.monto === 100, `monto = ${pagoLeido?.[0]?.monto}`);

  // ── T4: Limpieza de deuda ──
  console.log('\n📋 T4: Limpieza de deuda_mmv');
  await supabase.from('inmuebles').update({ deuda_mmv: 0 }).eq('identidad', 'JTEST10MESES');
  const { data: inmPost } = await supabase.from('inmuebles').select('deuda_mmv').eq('identidad', 'JTEST10MESES');
  assert('deuda_mmv = 0 tras limpieza', inmPost?.[0]?.deuda_mmv === 0, `deuda_mmv = ${inmPost?.[0]?.deuda_mmv}`);

  // ── T5: API TFHKA ──
  console.log('\n📋 T5: API Factura Digital TFHKA');
  try {
    const res = await fetch('http://localhost:3000/api/admin/factura-digital/emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagoId: testPagoId,
        recibos: ['RECIB-DEUDA'],
        montos: [],
        contribuyente: 'EMPRESA TEST C.A.',
        identidad: 'JTEST10MESES',
        montoTotal: 100,
        formasPago: [{ descripcion: 'Debito', fecha: new Date().toISOString(), forma: '01', monto: 100 }]
      })
    });
    const data = await res.json();
    assert('API responde 200', res.status === 200, `status = ${res.status}`);
    assert('Factura simulada generada', data.success === true, JSON.stringify(data));
    assert('URL de demo generada', data.url?.includes('thefactoryhka'), `url = ${data.url}`);
    assert('Es simulación', data.simulated === true);
  } catch(e) {
    assert('API accesible', false, e.message);
  }

  // ── T6: Factura guardada en pago ──
  console.log('\n📋 T6: Factura Digital guardada en pago');
  const { data: pagoConFactura } = await supabase.from('pagos_reportados').select('detalles').eq('id', testPagoId);
  if (pagoConFactura?.[0]) {
    const det = typeof pagoConFactura[0].detalles === 'string' ? JSON.parse(pagoConFactura[0].detalles) : pagoConFactura[0].detalles;
    assert('factura_digital en detalles', !!det.factura_digital);
    assert('factura_digital.emitida = true', det.factura_digital?.emitida === true);
    assert('factura_digital.url existe', !!det.factura_digital?.url);
  } else {
    assert('Pago encontrado', false);
  }

  // ── T7: Residencial no genera factura ──
  console.log('\n📋 T7: Residencial NO genera factura');
  try {
    const res = await fetch('http://localhost:3000/api/admin/factura-digital/emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagoId: crypto.randomUUID(),
        recibos: ['RECIB-TEST'],
        montos: [],
        contribuyente: 'PERSONA RESIDENCIAL',
        identidad: 'V12345678',
        montoTotal: 50,
        formasPago: []
      })
    });
    const data = await res.json();
    assert('Residencial omitida correctamente', data.skipped === true, JSON.stringify(data));
  } catch(e) {
    assert('API accesible para residencial', false, e.message);
  }

  // ── T8: supabaseAdmin.ts funciona ──
  console.log('\n📋 T8: Service Role Key funciona');
  assert('Service Role Key configurada', SUPABASE_KEY.startsWith('sb_secret_'));

  // ── CLEANUP ──
  await supabase.from('pagos_reportados').delete().eq('identidad', 'JTEST10MESES');
  await supabase.from('inmuebles').update({ deuda_mmv: 500 }).eq('identidad', 'JTEST10MESES');

  // ── REPORT ──
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RESULTADOS:\n');
  results.forEach(r => console.log(r));
  console.log(`\n  Total: ${passed + failed} | ✅ Pasaron: ${passed} | ❌ Fallaron: ${failed}`);
  console.log('═══════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
})();
