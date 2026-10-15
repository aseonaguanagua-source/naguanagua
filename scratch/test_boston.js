const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function cleanClasificacionActividad(str) {
  if (!str) return '';
  return str.replace(/\s*\((ALTA|MEDIA|BAJA)\)/i, '').trim();
}
function isResidencialInm(inm) {
  const tipo = (inm?.tipo || '').toUpperCase();
  const act = (inm?.actividad_principal || '').toUpperCase();
  return tipo === 'RESIDENCIAL' || act.includes('RESIDENCIAL');
}
function calcularMensualidad(inm, tasa) {
  const esRes = isResidencialInm(inm);
  const mmv = parseFloat(inm.mmv_mes || 0);
  return Math.round(mmv * 57 * tasa * (esRes ? 1 : 0.128) * 100) / 100;
}

async function simular() {
  const { data: userInms } = await supabase.from('inmuebles').select('*').eq('identidad', 'J-502037292').neq('estado', 'Eliminado');
  const { data: deudas } = await supabase.from('facturas').select('*').eq('identidad', 'J-502037292').neq('estado', 'Pagado');
  const tasaValida = 49.88;

  console.log('userInms:', userInms.map(i => i.inmueble));
  console.log('deudas:', deudas.map(d => ({ ref: d.referencia, monto: d.monto })));

  const ownCodes = new Set(userInms.map(i => i.inmueble));
  const normDir = (d) => (d || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const clusters = [];
  for (const inm of userInms) {
    const esRes = isResidencialInm(inm);
    const rawDir = (inm.direccion || '').trim();
    const tipoCluster = esRes ? 'RESIDENCIAL' : 'COMERCIAL';
    const padreDe = (x) => {
      const p = x.condominio_padre_id || x.padre_id;
      return p && ownCodes.has(p) ? p : null;
    };
    const padreId = padreDe(inm);
    const dirKey = rawDir && rawDir !== '0 0' ? normDir(rawDir) : '';

    const matched = esRes ? undefined : clusters.find(c => {
      if (c.tipo === 'RESIDENCIAL') return false;
      return c.inmuebles.some(ci => {
        const ciPadre = padreDe(ci);
        if (padreId && ciPadre === padreId) return true;
        const ciDir = ci.direccion && ci.direccion !== '0 0' ? normDir(ci.direccion) : '';
        return Boolean(dirKey) && ciDir === dirKey;
      });
    });

    if (matched) {
      matched.inmuebles.push(inm);
      matched.isMultiActivity = true;
      continue;
    }

    clusters.push({
      clusterId: padreId || inm.inmueble,
      tipo: tipoCluster,
      isMultiActivity: false,
      inmuebles: [inm]
    });
  }

  console.log('Clusters count:', clusters.length);
  clusters.forEach((c, idx) => {
    console.log('Cluster', idx, c.clusterId, 'isMulti:', c.isMultiActivity, 'inmuebles:', c.inmuebles.map(i => i.inmueble));
    
    const clusterInmCodes = [...new Set(c.inmuebles.flatMap(i => [(i.inmueble || '').toUpperCase(), (i.padre_id || '').toUpperCase()]).filter(Boolean))];
    const clusterCodConts = c.inmuebles.map(i => (i.cod_cont || '').toUpperCase()).filter(Boolean);

    let clusterDeudas = deudas.filter(f => {
      if (!f.referencia) return true;
      const ref = f.referencia.toUpperCase();
      return clusterInmCodes.some(code => ref.includes(code)) ||
             clusterCodConts.some(cc => ref.includes(cc));
    });
    console.log('  Cluster', idx, 'clusterDeudas:', clusterDeudas.map(d => d.referencia));

    // Desglose
    let subtotalBaseLocal = 0;
    let subtotalIvaLocal = 0;
    let subtotalMultasLocal = 0;
    let maxMesesCluster = 0;

    const clusterInmBreakdown = c.inmuebles.map(inm => {
      const bMes = calcularMensualidad(inm, tasaValida);
      const iMes = bMes * 0.16;
      const mBase = parseInt(String(inm.meses_deuda || 0), 10) || 0;
      const mDeuda = mBase > 0 ? mBase : 1;
      if (mDeuda > maxMesesCluster) maxMesesCluster = mDeuda;

      const baseTotal = bMes * mDeuda;
      const ivaTotal = iMes * mDeuda;
      let multaTotal = 0;

      subtotalBaseLocal += baseTotal;
      subtotalIvaLocal += ivaTotal;
      subtotalMultasLocal += multaTotal;

      return {
        inmueble: inm.inmueble,
        baseTotal,
        ivaTotal,
        multaTotal,
        total: baseTotal + ivaTotal + multaTotal
      };
    });

    const totalPagarLocal = subtotalBaseLocal + subtotalIvaLocal + subtotalMultasLocal;
    const ivaRetenidoLocal = Math.round(clusterInmBreakdown.reduce((s, b) => {
      const inmB = c.inmuebles.find(i => i.inmueble === b.inmueble);
      return s + (inmB?.agente_retencion ? b.ivaTotal * 0.75 : 0);
    }, 0) * 100) / 100;
    const totalCancelarLocal = totalPagarLocal - ivaRetenidoLocal;

    console.log('  subtotalBaseLocal:', subtotalBaseLocal);
    console.log('  subtotalIvaLocal:', subtotalIvaLocal);
    console.log('  ivaRetenidoLocal:', ivaRetenidoLocal);
    console.log('  totalPagarLocal:', totalPagarLocal);
    console.log('  totalCancelarLocal:', totalCancelarLocal);
  });
}
simular();
