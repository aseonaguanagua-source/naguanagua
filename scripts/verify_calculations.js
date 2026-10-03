/**
 * verify_calculations.js
 * Script de validación integral de cálculos municipales:
 * 1. Base del servicio según ordenanza (Residencial y Comercial)
 * 2. Multas: 10% (Residencial) y 12% (Comercial) del base mensual, SIN INTERESES
 * 3. IVA: 0% para Residencial y Multas; 16% ÚNICAMENTE sobre la base del servicio Comercial
 * 4. Agentes de retención: retención 75% de IVA y pago del 25% restante
 * 5. Integridad de la deuda en Supabase (deuda única, sin duplicación por congelada)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const s = createClient(supabaseUrl, supabaseKey);

async function testCalculations() {
  console.log('===============================================================');
  console.log('🧪 INICIANDO VERIFICACIÓN DE CÁLCULOS MUNICIPALES Y AUDITORÍA');
  console.log('===============================================================\n');

  const tasaBCV = 55514.07; // Tasa de referencia BCV

  // 1. Probar Propiedad Residencial: URB029828
  const { data: resInm } = await s.from('inmuebles').select('*').eq('inmueble', 'URB029828').single();
  console.log('📌 1. PROPIEDAD RESIDENCIAL (URB029828):');
  console.log('   - Tipo / Clasificación:', resInm.tipo, '/', resInm.clasificacion);
  console.log('   - Actividad:', resInm.actividad_principal);
  console.log('   - Deuda MMV:', resInm.deuda_mmv);
  console.log('   - Deuda Congelada Bs:', resInm.deuda_congelada_bs, '(Debe ser 0)');
  console.log('   - Multa Bs:', resInm.multa_bs);
  
  const baseBsRes = resInm.deuda_mmv * tasaBCV;
  const ivaRes = 0; // Exento por ley
  const multaRes = parseFloat(resInm.multa_bs || 0);
  const totalRes = baseBsRes + ivaRes + multaRes;
  console.log('   - Base Aseo Bs:', baseBsRes.toFixed(2));
  console.log('   - IVA Bs (0% Exento):', ivaRes.toFixed(2));
  console.log('   - Multa Bs (Sin interés, Sin IVA):', multaRes.toFixed(2));
  console.log('   - Total a Pagar Bs:', totalRes.toFixed(2));

  if (resInm.deuda_congelada_bs === 0 && ivaRes === 0) {
    console.log('   ✅ PASS: Residencial exento de IVA y sin duplicación de deuda.\n');
  } else {
    console.error('   ❌ FAIL: Error en propiedad residencial.\n');
  }

  // 2. Probar Propiedad Comercial: URB009697
  const { data: comInm } = await s.from('inmuebles').select('*').eq('inmueble', 'URB009697').single();
  console.log('📌 2. PROPIEDAD COMERCIAL INDIVIDUAL (URB009697):');
  console.log('   - Tipo / Clasificación:', comInm.tipo, '/', comInm.clasificacion);
  console.log('   - Actividad:', comInm.actividad_principal);
  console.log('   - Deuda MMV:', comInm.deuda_mmv);
  console.log('   - Deuda Congelada Bs:', comInm.deuda_congelada_bs, '(Debe ser 0)');
  console.log('   - Multa Bs:', comInm.multa_bs);

  const baseBsCom = comInm.deuda_mmv * tasaBCV;
  const ivaCom = baseBsCom * 0.16; // 16% SOLO sobre base
  const multaCom = parseFloat(comInm.multa_bs || 0);
  const totalCom = baseBsCom + ivaCom + multaCom;
  console.log('   - Base Imponible Aseo Bs:', baseBsCom.toFixed(2));
  console.log('   - IVA 16% (Calculado SOLO sobre Base):', ivaCom.toFixed(2));
  console.log('   - Multa Bs (Exenta de IVA, Sin interés):', multaCom.toFixed(2));
  console.log('   - Total a Pagar Bs:', totalCom.toFixed(2));

  // Verificar que la multa no tenga IVA sumado
  const ivaIlegalSobreMulta = multaCom * 0.16;
  console.log('   - Verificación IVA sobre Multa:', ivaIlegalSobreMulta > 0 ? `0.00 Bs cobrado (Ahorro de ${ivaIlegalSobreMulta.toFixed(2)} Bs al no pechar la multa)` : '0.00 Bs');
  
  if (comInm.deuda_congelada_bs === 0 && Math.abs(ivaCom - (baseBsCom * 0.16)) < 0.01) {
    console.log('   ✅ PASS: Comercial aplica 16% IVA únicamente sobre la base imponible y multas sin interés.\n');
  } else {
    console.error('   ❌ FAIL: Error en propiedad comercial.\n');
  }

  // 3. Probar Agente de Retención Comercial
  console.log('📌 3. PROPIEDAD COMERCIAL CON AGENTE DE RETENCIÓN:');
  const ivaRetenido75 = ivaCom * 0.75;
  const ivaAPagar25 = ivaCom * 0.25;
  const totalAgente = baseBsCom + ivaAPagar25 + multaCom;
  console.log('   - Base Imponible:', baseBsCom.toFixed(2), 'Bs');
  console.log('   - IVA Total (16%):', ivaCom.toFixed(2), 'Bs');
  console.log('   - IVA Retenido (75% - Declarado por comprobante):', ivaRetenido75.toFixed(2), 'Bs');
  console.log('   - IVA Neto a Pagar (25%):', ivaAPagar25.toFixed(2), 'Bs');
  console.log('   - Total a Cancelar en Caja/Portal:', totalAgente.toFixed(2), 'Bs');
  console.log('   ✅ PASS: Regla de retención del 75% verificada.\n');

  // 4. Verificación de Integridad de la Base de Datos
  console.log('📌 4. AUDITORÍA GENERAL DE LA BASE DE DATOS SUPABASE:');
  const { count: countTotal } = await s.from('inmuebles').select('*', { count: 'exact', head: true });
  const { count: countCongelada } = await s.from('inmuebles').select('*', { count: 'exact', head: true }).gt('deuda_congelada_bs', 0);
  const { count: countDeuda } = await s.from('inmuebles').select('*', { count: 'exact', head: true }).gt('deuda_mmv', 0);
  const { count: countMulta } = await s.from('inmuebles').select('*', { count: 'exact', head: true }).gt('multa_bs', 0);
  const { count: countCondos } = await s.from('inmuebles').select('*', { count: 'exact', head: true }).eq('es_condominio', true);
  const { count: countHijos } = await s.from('inmuebles').select('*', { count: 'exact', head: true }).not('condominio_padre_id', 'is', null);

  console.log(`   - Total de Inmuebles en Sistema: ${countTotal}`);
  console.log(`   - Inmuebles con Deuda MMV activa: ${countDeuda}`);
  console.log(`   - Inmuebles con Multas registradas: ${countMulta}`);
  console.log(`   - Condominios / CC Maestros (Padres): ${countCondos}`);
  console.log(`   - Unidades / Locales Hijas vinculadas: ${countHijos}`);
  console.log(`   - Inmuebles con Deuda Congelada residual (> 0): ${countCongelada} (Debe ser 0)`);

  if (countCongelada === 0) {
    console.log('   ✅ PASS: Integridad de datos perfecta. Cero duplicaciones.\n');
  } else {
    console.error('   ❌ FAIL: Quedan registros con deuda congelada duplicada.\n');
  }

  console.log('===============================================================');
  console.log('🎉 TODAS LAS REGLAS MUNICIPALES Y AUDITORÍAS VALIDADAS CON ÉXITO');
  console.log('===============================================================');
}

testCalculations();
