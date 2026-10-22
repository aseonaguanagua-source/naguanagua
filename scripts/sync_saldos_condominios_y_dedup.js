const fs = require('fs');
const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.trim().split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function parseMonto(montoRaw) {
  if (typeof montoRaw === 'number') return montoRaw;
  if (!montoRaw) return 0;
  let str = montoRaw.toString().trim();
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  return parseFloat(str) || 0;
}

async function run() {
  console.log('--- INICIANDO LIMPIEZA DE DUPLICADOS Y SINCRONIZACIÓN DE CONDOS ---');

  // 1. Obtener todos los documentos vigentes
  const { data: docs, error: docErr } = await supabase
    .from('documentos')
    .select('*')
    .ilike('tipo', '%nota%')
    .ilike('estado', 'vigente')
    .order('created_at', { ascending: true });

  if (docErr) {
    console.error('Error cargando documentos:', docErr);
    return;
  }

  const map = new Map();
  const dupsToAnnul = [];

  for (const d of docs) {
    let p = {};
    try { p = typeof d.detalles === 'string' ? JSON.parse(d.detalles) : d.detalles; } catch(e){}
    const ref = (p.origen_referencia || '').replace(/[^0-9]/g, '');
    const monto = parseMonto(p.monto);
    const id = (d.identidad || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!ref || monto <= 0) continue;

    const key = `${id}_${ref}_${monto.toFixed(2)}`;
    if (map.has(key)) {
      const prev = map.get(key);
      let prevP = {};
      try { prevP = typeof prev.detalles === 'string' ? JSON.parse(prev.detalles) : prev.detalles; } catch(e){}
      
      // Si el actual tiene analista y el anterior no, anular el anterior y conservar el actual
      if (p.analista && !prevP.analista) {
        dupsToAnnul.push(prev.id);
        map.set(key, d);
      } else {
        dupsToAnnul.push(d.id);
      }
    } else {
      map.set(key, d);
    }
  }

  console.log(`Anulando ${dupsToAnnul.length} documentos duplicados...`);
  for (const dupId of dupsToAnnul) {
    const docOrig = docs.find(x => x.id === dupId);
    let det = {};
    try { det = typeof docOrig.detalles === 'string' ? JSON.parse(docOrig.detalles) : (docOrig.detalles || {}); } catch(e){}
    det.motivo_anulacion = 'Duplicado automático caja/conciliación';
    
    await supabase
      .from('documentos')
      .update({
        estado: 'Anulado',
        detalles: JSON.stringify(det)
      })
      .eq('id', dupId);
  }
  console.log(`✓ ${dupsToAnnul.length} documentos duplicados anulados exitosamente.`);

  // 2. Sincronizar condominios y sus inmuebles matrices
  const { data: conds } = await supabase.from('condominios').select('id, codigo, nombre, identidad, abono_bs');
  const { data: inms } = await supabase.from('inmuebles').select('id, inmueble, identidad, saldo_favor_bs').gt('saldo_favor_bs', 0);

  let condosActualizados = 0;
  for (const c of conds) {
    const cRif = (c.identidad || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const cCod = (c.codigo || '').toUpperCase();

    // Documentos no anulados
    const matchingDocs = docs.filter(d => !dupsToAnnul.includes(d.id)).filter(d => {
      const dRif = (d.identidad || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return (cRif && dRif && cRif === dRif) || (d.identidad && d.identidad.toUpperCase() === cCod);
    });

    const matchingInms = inms.filter(i => {
      const iCod = (i.inmueble || '').toUpperCase();
      const iRif = (i.identidad || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return iCod === cCod || (cRif && iRif && cRif === iRif);
    });

    let sumDocs = 0;
    matchingDocs.forEach(d => {
      try {
        const p = typeof d.detalles === 'string' ? JSON.parse(d.detalles) : d.detalles;
        sumDocs += parseMonto(p.monto);
      } catch(e){}
    });

    let sumInms = 0;
    matchingInms.forEach(i => sumInms += parseFloat(i.saldo_favor_bs || 0));

    const curAbono = parseFloat(c.abono_bs || 0);
    const targetAbono = Math.round(Math.max(curAbono, sumDocs, sumInms) * 100) / 100;

    if (targetAbono > 0 && Math.abs(curAbono - targetAbono) > 0.01) {
      await supabase.from('condominios').update({ abono_bs: targetAbono }).eq('id', c.id);
      
      // Sincronizar también inmueble matriz si existe y tiene menor saldo
      const matrizInm = matchingInms.find(i => (i.inmueble || '').toUpperCase() === cCod);
      if (matrizInm && (parseFloat(matrizInm.saldo_favor_bs || 0) < targetAbono)) {
        await supabase.from('inmuebles').update({ saldo_favor_bs: targetAbono }).eq('id', matrizInm.id);
      }

      condosActualizados++;
      console.log(`[CONDO SYNC] ${c.codigo} (${c.nombre}): abono_bs ${curAbono} -> ${targetAbono}`);
    }
  }

  console.log(`\n=== PROCESO COMPLETADO ===`);
  console.log(`- Duplicados anulados: ${dupsToAnnul.length}`);
  console.log(`- Condominios sincronizados: ${condosActualizados}`);
}

run();
