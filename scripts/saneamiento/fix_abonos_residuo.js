// Repara abonos aprobados que no descontaron la deuda (inmuebles con meses_deuda=0 y deuda guardada).
// Uso: node scripts/saneamiento/fix_abonos_residuo.js [--apply]
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

// Decisiones (ver informe):
//  - MECÁNICO CHEO URB007034: 3 pagos débito aprobados (18.895,07 + 2.180,20 + 2.180,20 = 23.255,47) contra 1 mes de 20.997,22
//    -> mes pagado + nota de crédito 2.258,25 (la ref 85022502 queda marcada para verificar contra el lote del punto).
//  - Residenciales pagados por portal que cubrieron el mes completo -> deuda_mmv 0 (diferencias de céntimos se ignoran).
//  - GRUPO UMA MOTORS (J-408799197) y J-501442509 (Por Verificar) quedan para revisión manual.
const FIXES = [
  { inmueble: 'URB007034', identidad: 'J-507840433', saldo: 2258.25, nota: 'Excedente de abonos débito refs 00055834, 00585600, 85022502 (mes 20.997,22). Ref 85022502 por verificar contra lote.' },
  { inmueble: 'AURI006024', identidad: 'V-6056104' },
  { inmueble: 'AURI002977', identidad: 'V-5268774' },
  { inmueble: 'AURI003728', identidad: 'V-5268774' },
  { inmueble: 'AURI005498', identidad: 'V-5268774' },
  { inmueble: 'AURI003970', identidad: 'J-299527130' },
  { inmueble: 'AURI008949', identidad: 'V-7051971' },
  { inmueble: 'AURI008493', identidad: 'V-11428086' },
];

(async () => {
  const { data: antes, error } = await sb.from('inmuebles').select('*').in('inmueble', FIXES.map(f => f.inmueble));
  if (error) throw error;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(`scripts/saneamiento/backup_fix_abonos_${stamp}.json`, JSON.stringify(antes, null, 1));
  for (const f of FIXES) {
    const inm = antes.find(i => i.inmueble === f.inmueble);
    if (!inm) { console.log('NO EXISTE', f.inmueble); continue; }
    if (parseInt(inm.meses_deuda || 0) > 0) { console.log('SALTO (tiene meses)', f.inmueble, inm.meses_deuda); continue; }
    const nuevoSaldo = Math.round(((parseFloat(inm.saldo_favor_bs || 0) || 0) + (f.saldo || 0)) * 100) / 100;
    const upd = { deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0, saldo_favor_bs: nuevoSaldo };
    console.log(APPLY ? 'APLICA' : 'DRY', f.inmueble, `deuda_mmv ${inm.deuda_mmv} -> 0`, `saldo ${inm.saldo_favor_bs} -> ${nuevoSaldo}`);
    if (!APPLY) continue;
    const { error: e1 } = await sb.from('inmuebles').update(upd).eq('id', inm.id);
    if (e1) { console.log('ERROR', f.inmueble, e1.message); continue; }
    if (f.saldo) {
      const { error: e2 } = await sb.from('documentos').insert({
        identidad: f.identidad, contribuyente: f.identidad, tipo: 'Nota de Credito', estado: 'Vigente',
        detalles: JSON.stringify({ monto: f.saldo.toFixed(2), origen_referencia: f.nota, fecha_emision: new Date().toISOString(), analista: 'Saneamiento' }),
      });
      if (e2) console.log('ERROR nota', e2.message);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
