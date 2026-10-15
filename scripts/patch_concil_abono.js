const fs = require('fs');
const path = './src/app/(admin)/admin/caja/conciliacion/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = `
            let dineroConcil = montoConciliadoNum;
            for (const inm of inmList2) {
              const histRefsThisInm = histRefsConcil.filter((r: string) => r.includes(\`-\${inm.inmueble || inm.codigo}-\`));
              const numMesesInm = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
              if (recibos.includes('RECIB-DEUDA') && !esAbonoParcialConcil) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', inm.id);
              } else if (!esAbonoParcialConcil && histRefsThisInm.length > 0) {
                const nuevoMeses = Math.max(0, numMesesInm - histRefsThisInm.length);
                const d = parseFloat(String(inm.deuda_mmv || 0));
                const m = parseFloat(String(inm.multa_bs || 0));
                const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
                const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));
                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: nuevaDeudaMMV,
                  multa_bs: nuevaMultaBs,
                  ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                }).eq('id', inm.id);
              } else if (esAbonoParcialConcil && numMesesInm > 0 && dineroConcil > 0) {
                const bMes = calcularMensualidad(inm, tasaParaGuardar || 981.18);
                const esRes = isResidencialInm(inm);
                const ivaMes = esRes ? 0 : Math.round((bMes * 0.16) * 100) / 100;
                const tasaMora = esRes ? 0.10 : 0.12;
                let cubiertos = 0;
                const maxM = histRefsThisInm.length > 0 ? histRefsThisInm.length : numMesesInm;
                for (let m = 1; m <= maxM; m++) {
                  const isUltimo = (m >= numMesesInm);
                  const multaMes = isUltimo ? 0 : Math.round((bMes * tasaMora) * 100) / 100;
                  const costoMes = Math.round((bMes + ivaMes) * 100) / 100 + multaMes;
                  if (dineroConcil >= costoMes - 0.01) {
                    dineroConcil = Math.max(0, dineroConcil - costoMes);
                    cubiertos++;
                  } else {
                    break;
                  }
                }
                const nuevoMeses = Math.max(0, numMesesInm - cubiertos);
                const d = parseFloat(String(inm.deuda_mmv || 0));
                const m = parseFloat(String(inm.multa_bs || 0));
                const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
                const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));
                const saldoSobrante = dineroConcil > 0.01 ? parseFloat(dineroConcil.toFixed(2)) : 0;
                dineroConcil = 0;
                const sAct = parseFloat(String(inm.saldo_favor_bs || '0')) || 0;
                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: nuevaDeudaMMV,
                  multa_bs: nuevaMultaBs,
                  saldo_favor_bs: sAct + saldoSobrante,
                  ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                }).eq('id', inm.id);
              }
            }
`;

const replacement = `
            let dineroConcil = montoConciliadoNum;
            
            const inmsToProcess = inmList2.filter(inm => {
              const histRefsThisInm = histRefsConcil.filter((r: string) => r.includes(\`-\${inm.inmueble || inm.codigo}-\`));
              return histRefsThisInm.length > 0 || recibos.includes('RECIB-DEUDA');
            });

            for (let idx = 0; idx < inmsToProcess.length; idx++) {
              const inm = inmsToProcess[idx];
              const isLastInm = idx === inmsToProcess.length - 1;

              const histRefsThisInm = histRefsConcil.filter((r: string) => r.includes(\`-\${inm.inmueble || inm.codigo}-\`));
              const numMesesInm = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
              
              if (recibos.includes('RECIB-DEUDA') && !esAbonoParcialConcil) {
                await supabase.from('inmuebles').update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 }).eq('id', inm.id);
              } else if (!esAbonoParcialConcil && histRefsThisInm.length > 0) {
                const nuevoMeses = Math.max(0, numMesesInm - histRefsThisInm.length);
                const d = parseFloat(String(inm.deuda_mmv || 0));
                const m = parseFloat(String(inm.multa_bs || 0));
                const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
                const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));
                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: nuevaDeudaMMV,
                  multa_bs: nuevaMultaBs,
                  ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                }).eq('id', inm.id);
              } else if (esAbonoParcialConcil && numMesesInm > 0 && dineroConcil > 0) {
                const bMes = calcularMensualidad(inm, tasaParaGuardar || 981.18);
                const esRes = isResidencialInm(inm);
                const ivaMes = esRes ? 0 : Math.round((bMes * 0.16) * 100) / 100;
                const tasaMora = esRes ? 0.10 : 0.12;
                
                const sAct = parseFloat(String(inm.saldo_favor_bs || '0')) || 0;
                let dineroLocal = dineroConcil + sAct;

                let cubiertos = 0;
                const maxM = histRefsThisInm.length > 0 ? histRefsThisInm.length : numMesesInm;
                
                for (let m = 1; m <= maxM; m++) {
                  const isUltimo = (m >= numMesesInm);
                  const multaMes = isUltimo ? 0 : Math.round((bMes * tasaMora) * 100) / 100;
                  const costoMes = Math.round((bMes + ivaMes) * 100) / 100 + multaMes;
                  if (dineroLocal >= costoMes - 0.01) {
                    dineroLocal = Math.max(0, dineroLocal - costoMes);
                    cubiertos++;
                  } else {
                    break;
                  }
                }
                
                const nuevoMeses = Math.max(0, numMesesInm - cubiertos);
                const d = parseFloat(String(inm.deuda_mmv || 0));
                const m = parseFloat(String(inm.multa_bs || 0));
                const nuevaDeudaMMV = nuevoMeses === 0 ? 0 : parseFloat(((d * nuevoMeses) / (numMesesInm || 1)).toFixed(6));
                const nuevaMultaBs = nuevoMeses === 0 ? 0 : parseFloat(((m * nuevoMeses) / (numMesesInm || 1)).toFixed(2));
                
                let nuevoSaldo = 0;
                if (dineroLocal > dineroConcil) {
                  nuevoSaldo = dineroLocal - dineroConcil;
                } else {
                  dineroConcil = dineroLocal;
                  nuevoSaldo = 0;
                }

                if (isLastInm && dineroConcil > 0.01) {
                  nuevoSaldo += dineroConcil;
                  dineroConcil = 0;
                }

                await supabase.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: nuevaDeudaMMV,
                  multa_bs: nuevaMultaBs,
                  saldo_favor_bs: parseFloat(nuevoSaldo.toFixed(2)),
                  ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                }).eq('id', inm.id);
              }
            }
`;

if (content.includes('dineroConcil = 0;')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Patched successfully!");
} else {
    console.log("Could not find target!");
}
