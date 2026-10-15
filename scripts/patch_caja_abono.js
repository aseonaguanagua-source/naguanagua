const fs = require('fs');
const path = './src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = `
            for (const inm of userInmsClean) {
              const histRefsThisInm = histRefs.filter(r => r.includes(\`-\${inm.inmueble || inm.codigo}-\`));
              const numMesesInm = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
              if (numMesesInm <= 0 || dineroParaInms <= 0) continue;

              const bMes = calcularMensualidad(inm, currentBcvRate);
              const esRes = isResidencialInm(inm);
              const ivaMes = esRes ? 0 : Math.round((bMes * 0.16) * 100) / 100;
              const tasaMora = esRes ? 0.10 : 0.12;

              // Sobrante de un comprobante anterior (pago múltiple): se suma para completar meses
              const saldoActual = parseFloat(String(inm.saldo_favor_bs || '0')) || 0;
              dineroParaInms += saldoActual;

              let mesesCubiertos = 0;
              const maxMeses = Math.min(numMesesInm, histRefsThisInm.length > 0 ? histRefsThisInm.length : numMesesInm);
              for (let m = 1; m <= maxMeses; m++) {
                const isUltimo = (m >= numMesesInm);
                const multaMes = isUltimo ? 0 : Math.round((bMes * tasaMora) * 100) / 100;
                const costoMes = Math.round((bMes + ivaMes) * 100) / 100 + multaMes;

                if (dineroParaInms >= costoMes - 0.01) {
                  dineroParaInms = Math.max(0, dineroParaInms - costoMes);
                  mesesCubiertos++;
                } else {
                  break; // no alcanza para un mes completo adicional
                }
              }

              const nuevoMeses = Math.max(0, numMesesInm - mesesCubiertos);
              const d = parseFloat(String(inm.deuda_mmv || 0));
              const m = parseFloat(String(inm.multa_bs || 0));
              const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
              const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));

              // El sobrante que no completó otro mes se acredita a saldo_favor_bs para dejar "lo que falta"
              const saldoSobrante = dineroParaInms > 0.01 ? parseFloat(dineroParaInms.toFixed(2)) : 0;
              dineroParaInms = 0; // asignado

              // El saldo previo ya se sumó arriba: el nuevo saldo es solo lo que sobró
              const nuevoSaldo = saldoSobrante;
`;

const replacement = `
            const inmsToProcess = userInmsClean.filter(inm => {
              const histRefsThisInm = histRefs.filter(r => r.includes(\`-\${inm.inmueble || inm.codigo}-\`));
              return histRefsThisInm.length > 0 || selectedRecibos.includes('RECIB-DEUDA');
            });

            for (let idx = 0; idx < inmsToProcess.length; idx++) {
              const inm = inmsToProcess[idx];
              const isLastInm = idx === inmsToProcess.length - 1;

              const histRefsThisInm = histRefs.filter(r => r.includes(\`-\${inm.inmueble || inm.codigo}-\`));
              const numMesesInm = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
              
              if (numMesesInm <= 0) continue;

              const bMes = calcularMensualidad(inm, currentBcvRate);
              const esRes = isResidencialInm(inm);
              const ivaMes = esRes ? 0 : Math.round((bMes * 0.16) * 100) / 100;
              const tasaMora = esRes ? 0.10 : 0.12;

              const saldoActual = parseFloat(String(inm.saldo_favor_bs || '0')) || 0;
              let dineroLocal = dineroParaInms + saldoActual;

              let mesesCubiertos = 0;
              const maxMeses = Math.min(numMesesInm, histRefsThisInm.length > 0 ? histRefsThisInm.length : numMesesInm);
              
              for (let m = 1; m <= maxMeses; m++) {
                const isUltimo = (m >= numMesesInm);
                const multaMes = isUltimo ? 0 : Math.round((bMes * tasaMora) * 100) / 100;
                const costoMes = Math.round((bMes + ivaMes) * 100) / 100 + multaMes;

                if (dineroLocal >= costoMes - 0.01) {
                  dineroLocal = Math.max(0, dineroLocal - costoMes);
                  mesesCubiertos++;
                } else {
                  break; 
                }
              }

              const nuevoMeses = Math.max(0, numMesesInm - mesesCubiertos);
              const d = parseFloat(String(inm.deuda_mmv || 0));
              const m = parseFloat(String(inm.multa_bs || 0));
              const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
              const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));

              let nuevoSaldo = 0;
              if (dineroLocal > dineroParaInms) {
                // We didn't consume all of saldoActual
                nuevoSaldo = dineroLocal - dineroParaInms;
              } else {
                // We consumed all of saldoActual, AND some of dineroParaInms
                dineroParaInms = dineroLocal; // Remaining global money
                nuevoSaldo = 0;
              }

              // Si es el último inmueble que estamos procesando, el sobrante global se le abona a él
              if (isLastInm && dineroParaInms > 0.01) {
                nuevoSaldo += dineroParaInms;
                dineroParaInms = 0;
              }
              
              nuevoSaldo = parseFloat(nuevoSaldo.toFixed(2));
`;

if (content.includes('dineroParaInms = 0; // asignado')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Patched successfully!");
} else {
    console.log("Could not find target!");
}
