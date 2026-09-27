const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/if \(r\.referencia\?\.startsWith\('RECIB-HIST-'\)\) \{[\s\S]*?\}\n        \}\n      \}/, `if (r.referencia?.startsWith('RECIB-HIST-')) {
      const parts = r.referencia.split('-');
      const inmId = parts[2];
      const monthNum = parseInt(parts[3].replace('M', ''));
      const inm = userInms.find((i: any) => i.inmueble === inmId);
      if (inm) {
        const baseMonto = calcularMensualidad(
          inm.clasificacion || '', 
          inm.actividad_principal || '', 
          parseInt(inm.cant_inmuebles || 1), 
          tasaActual
        );
        const montoIVA = baseMonto * 0.16;
        const montoMulta = baseMonto * 0.12;
        const totalMes = baseMonto + montoIVA + montoMulta;
        
        let det: any = {};
        det.facturas = [{
          id: r.id, 
          referencia: r.referencia,
          monto: totalMes.toFixed(2),
          base: baseMonto,
          iva: montoIVA,
          multa: montoMulta,
          mesNum: monthNum,
          clasificacion: inm.clasificacion || 'Residencial',
          actividad: inm.actividad_principal || ''
        }];
        det.montoTotal = totalMes;
        det.saldoFavorOriginal = 0;
        det.pagadoConSaldo = 0;
        det.saldoRestante = 0;
        
        pagosPendientes.push(det);
      }
    }`);

c = c.replace(/const baseMonto = \(\(ucdTotal \* tasaActual\) \+ congelada \+ multa\) \/ meses;/, `// patched`);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
