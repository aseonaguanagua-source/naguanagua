const fs = require('fs');

const replaceGetMonto = `    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inmId = parts[2];
      const inm = userInms.find((i: any) => i.inmueble === inmId);
      if (inm) {
        const meses = Math.max(1, parseInt(String(inm.meses_deuda || 1)));
        const d = parseFloat(String(inm.deuda_mmv || 0));
        const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
        let ucdTotal = 0;
        if (d > 0) {
          if (esRes) ucdTotal = d * getFAR(inm.actividad_principal || '');
          else ucdTotal = d;
        }
        const congelada = parseFloat(String(inm.deuda_congelada_bs || 0));
        const multa = parseFloat(String(inm.multa_bs || 0));
        
        return parseFloat((((ucdTotal * tcmmv) + congelada + multa) / meses).toFixed(2));
      }
      return 0;
    } else if (r.referencia?.startsWith('RECIB-') || r.referencia === 'RECIB-DEUDA') {`;

const searchInjectCM = `        if (hasDeuda) {
          combined.push({ id: 'dummy-deuda', referencia: 'RECIB-DEUDA', emision: new Date().toISOString(), vencimiento: new Date().toISOString(), estado: 'Pendiente', monto: '0' });
        }`;

const replaceInjectCM = `        if (hasDeuda) {
          misInmuebles.forEach((inm: any) => {
            const deudaMMV = parseFloat(String(inm.deuda_mmv || '0'));
            const congelada = parseFloat(String(inm.deuda_congelada_bs || '0'));
            const multa = parseFloat(String(inm.multa_bs || '0'));
            const meses = parseInt(String(inm.meses_deuda || 1));
            if (deudaMMV > 0 || congelada > 0 || multa > 0) {
              const numMeses = Math.max(1, meses);
              for (let i = 1; i <= numMeses; i++) {
                combined.push({
                  id: \`dummy-hist-\${inm.inmueble}-\${i}\`,
                  referencia: \`RECIB-HIST-\${inm.inmueble}-M\${i}\`,
                  emision: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i)).toISOString(),
                  vencimiento: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i)).toISOString(),
                  estado: 'Pendiente',
                  monto: '0'
                });
              }
            }
          });
        }`;

// PATCH COBRO-MOVIL
let cm = fs.readFileSync('src/app/cobro-movil/page.tsx', 'utf8');
cm = cm.replace(searchInjectCM, replaceInjectCM);
cm = cm.replace(`    if (r.referencia?.startsWith('RECIB-') || r.referencia === 'RECIB-DEUDA') {`, replaceGetMonto);
fs.writeFileSync('src/app/cobro-movil/page.tsx', cm);


// PATCH PORTAL PAGOS
let port = fs.readFileSync('src/app/portal/(dashboard)/pagos/page.tsx', 'utf8');
const searchInjectPort = `        if (hasDeuda && !isCondominio) {
          combined.push({
            id: 'dummy-deuda-acumulada',
            referencia: 'RECIB-DEUDA',
            identidad: foundUser.Identidad,
            contribuyente: foundUser.Contribuyente,
            emision: new Date().toISOString(),
            vencimiento: new Date().toISOString(),
            estado: 'Pendiente',
            monto: '0' 
          });
        }`;
const replaceInjectPort = `        if (hasDeuda && !isCondominio) {
          misInmuebles.forEach((inm: any) => {
            const deudaMMV = parseFloat(String(inm.deuda_mmv || '0'));
            const congelada = parseFloat(String(inm.deuda_congelada_bs || '0'));
            const multa = parseFloat(String(inm.multa_bs || '0'));
            const meses = parseInt(String(inm.meses_deuda || 1));
            if (deudaMMV > 0 || congelada > 0 || multa > 0) {
              const numMeses = Math.max(1, meses);
              for (let i = 1; i <= numMeses; i++) {
                combined.push({
                  id: \`dummy-hist-\${inm.inmueble}-\${i}\`,
                  referencia: \`RECIB-HIST-\${inm.inmueble}-M\${i}\`,
                  identidad: foundUser.Identidad,
                  contribuyente: foundUser.Contribuyente,
                  emision: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i)).toISOString(),
                  vencimiento: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i)).toISOString(),
                  estado: 'Pendiente',
                  monto: '0'
                });
              }
            }
          });
        }`;
port = port.replace(searchInjectPort, replaceInjectPort);

const searchPortGetMonto = `    if (r.referencia?.startsWith('RECIB-') || r.referencia === 'RECIB-DEUDA') {
      let totalDeudaMMV = 0;
      let totalMulta = 0;
      let totalCongelada = 0;
      misInmuebles.forEach((inm: any) => {
        const d = parseFloat(inm.deuda_mmv || 0);
        const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
        if (d > 0) {
          if (esRes) totalDeudaMMV += d * getFAR(inm.actividad_principal || '');
          else totalDeudaMMV += d;
        }
        totalCongelada += parseFloat(inm.deuda_congelada_bs || 0);
        totalMulta += parseFloat(inm.multa_bs || 0);
      });
      if (totalDeudaMMV > 0 || totalCongelada > 0 || totalMulta > 0) {
        let baseMonto = (totalDeudaMMV * tcmmv) + totalCongelada + totalMulta;
        let montoPendiente = 0;
        pagosPendientes.forEach((p: any) => {
          let det: any = {};
          try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch (e) {}
          const refs: string[] = det.recibos || [];
          if (refs.includes(r.referencia)) {
            const montoPago = parseFloat(String(p.monto || '0').replace(/[^0-9.]/g, '')) || 0;
            if (refs.length > 0) montoPendiente += (montoPago / refs.length);
          }
        });
        return String(Math.max(0, baseMonto - montoPendiente).toFixed(2));
      }
      return String(parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0);
    }`;

const replacePortGetMonto = `    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inmId = parts[2];
      const inm = misInmuebles.find((i: any) => i.inmueble === inmId);
      if (inm) {
        const meses = Math.max(1, parseInt(inm.meses_deuda || 1));
        const d = parseFloat(inm.deuda_mmv || 0);
        const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
        let ucdTotal = 0;
        if (d > 0) {
          if (esRes) ucdTotal = d * getFAR(inm.actividad_principal || '');
          else ucdTotal = d;
        }
        const congelada = parseFloat(inm.deuda_congelada_bs || 0);
        const multa = parseFloat(inm.multa_bs || 0);
        
        const baseMonto = ((ucdTotal * tcmmv) + congelada + multa) / meses;
        
        let montoPendiente = 0;
        pagosPendientes.forEach((p: any) => {
          let det: any = {};
          try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch (e) {}
          const refs: string[] = det.recibos || [];
          if (refs.includes(r.referencia)) {
            const montoPago = parseFloat(String(p.monto || '0').replace(/[^0-9.]/g, '')) || 0;
            if (refs.length > 0) montoPendiente += (montoPago / refs.length);
          }
        });
        return String(Math.max(0, baseMonto - montoPendiente).toFixed(2));
      }
      return '0.00';
    } else if (r.referencia?.startsWith('RECIB-')) {
      return String(parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0);
    }`;

port = port.replace(searchPortGetMonto, replacePortGetMonto);
fs.writeFileSync('src/app/portal/(dashboard)/pagos/page.tsx', port);
