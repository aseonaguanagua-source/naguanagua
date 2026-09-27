const fs = require('fs');

let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

// 1. Reemplazar la inyección de RECIB-DEUDA por RECIB-HIST- (múltiples meses)
const searchInject = `        if (hasDeuda && !isCondominio) {
          combined.push({
            id: 'dummy-deuda-acumulada',
            referencia: 'RECIB-DEUDA',
            identidad: user.Identidad,
            contribuyente: user.Contribuyente,
            emision: new Date().toISOString(),
            vencimiento: new Date().toISOString(),
            estado: 'Pendiente',
            monto: '0' // getReciboMonto lo calculará basado en inmuebles.deuda_mmv
          });
        }`;

const replaceInject = `        if (hasDeuda && !isCondominio) {
          misInmuebles.forEach((inm: any) => {
            const deudaMMV = parseFloat(inm.deuda_mmv || '0');
            const congelada = parseFloat(inm.deuda_congelada_bs || '0');
            const multa = parseFloat(inm.multa_bs || '0');
            const meses = parseInt(inm.meses_deuda || 1);
            if (deudaMMV > 0 || congelada > 0 || multa > 0) {
              const numMeses = Math.max(1, meses);
              // Generar un recibo dummy por cada mes de mora
              for (let i = 1; i <= numMeses; i++) {
                combined.push({
                  id: \`dummy-hist-\${inm.inmueble}-\${i}\`,
                  referencia: \`RECIB-HIST-\${inm.inmueble}-M\${i}\`,
                  identidad: user.Identidad,
                  contribuyente: user.Contribuyente,
                  emision: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i)).toISOString(),
                  vencimiento: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i)).toISOString(),
                  estado: 'Pendiente',
                  monto: '0'
                });
              }
            }
          });
        }`;

c = c.replace(searchInject, replaceInject);

// 2. Actualizar getReciboMonto para calcular RECIB-HIST
const searchGetMonto = `    if (r.referencia?.startsWith('RECIB-')) {
      let totalDeudaMMV = 0;
      let totalMulta = 0;
      let totalCongelada = 0;
      userInms.forEach((inm: any) => {
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
        let baseMonto = (totalDeudaMMV * tasaActual) + totalCongelada + totalMulta;
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
      // Fallback si no hay deuda_mmv registrado
      return String(parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0);
    }`;

const replaceGetMonto = `    if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inmId = parts[2];
      const inm = userInms.find((i: any) => i.inmueble === inmId);
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
        
        const baseMonto = ((ucdTotal * tasaActual) + congelada + multa) / meses;
        
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
      // Fallback for old RECIB-DEUDA or standard RECIB
      return String(parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0);
    }`;

c = c.replace(searchGetMonto, replaceGetMonto);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
