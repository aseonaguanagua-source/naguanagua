const fs = require('fs');

function fixEstadoCuenta() {
  const file = 'src/app/portal/(dashboard)/estado-cuenta/page.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // We need to import getFAR if not already there
  if (!content.includes('getFAR')) {
    content = content.replace("import { formatBs } from '@/lib/formatCurrency';", "import { formatBs } from '@/lib/formatCurrency';\nimport { getFAR } from '@/lib/calculos';");
  }

  const target = `      if (matchedInmueble) {
        const cant = parseFloat(matchedInmueble.cant_inmuebles || 1);
        const mmv  = parseFloat(matchedInmueble.mmv_mes || 0);
        if (mmv > 0) monthlyMMV = cant * mmv;
      } else {
        misInmuebles.forEach((inm: any) => {
          const cant = parseFloat(inm.cant_inmuebles || 1);
          const mmv  = parseFloat(inm.mmv_mes || 0);
          if (mmv > 0) monthlyMMV += cant * mmv;
        });
      }
      if (monthlyMMV > 0) baseMonto = monthlyMMV * tasaBcv;`;

  const replacement = `      const inmsToCalc = matchedInmueble ? [matchedInmueble] : misInmuebles;
      let totalMonto = 0;
      inmsToCalc.forEach((inm: any) => {
        const cant = parseFloat(inm.cant_inmuebles || 1);
        const mmv  = parseFloat(inm.mmv_mes || 0); // FO
        if (mmv > 0) {
          const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
          const ucdMultiplicador = esRes ? (57 * getFAR(inm.actividad_principal || '')) : (57 * 0.128);
          totalMonto += cant * mmv * ucdMultiplicador * tasaBcv;
        }
      });
      if (totalMonto > 0) baseMonto = totalMonto;`;

  if(content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Fixed EstadoCuenta");
  } else {
    console.log("Could not find target in EstadoCuenta");
  }
}

function fixPagos() {
  const file = 'src/app/portal/(dashboard)/pagos/page.tsx';
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes('getFAR')) {
    content = content.replace("import { formatBs } from '@/lib/formatCurrency';", "import { formatBs } from '@/lib/formatCurrency';\nimport { getFAR } from '@/lib/calculos';");
  }

  const target = `              if (mmv > 0) {
                const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
                if (esRes) {
                  totalMonto += cant * mmv * 57 * getFAR(inm.actividad_principal || '') * tcmmv;
                } else {
                  totalMonto += cant * mmv * 57 * tcmmv;
                }
              }`;

  const replacement = `              if (mmv > 0) {
                const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
                const ucdMultiplicador = esRes ? (57 * getFAR(inm.actividad_principal || '')) : (57 * 0.128);
                totalMonto += cant * mmv * ucdMultiplicador * tcmmv;
              }`;

  if(content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Fixed Pagos");
  } else {
    console.log("Could not find target in Pagos");
  }
}

fixEstadoCuenta();
fixPagos();
