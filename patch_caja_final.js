const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

if (!c.includes("import { calcularMensualidad } from '@/lib/calculos';")) {
  c = c.replace(
    "import { logAudit } from '@/lib/audit';",
    "import { logAudit } from '@/lib/audit';\nimport { calcularMensualidad } from '@/lib/calculos';"
  );
}

// 1. replace handleSearch RECIB-HIST logic
const hsSearch = `if (r.referencia?.startsWith('RECIB-HIST-')) {
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
          base: baseMonto.toFixed(2),
          iva: montoIVA.toFixed(2),
          multa: montoMulta.toFixed(2),
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
    }`;

c = c.replace(/if \(r\.referencia\?\.startsWith\('RECIB-HIST-'\)\) \{[\s\S]*?\}\n        \}\n      \}/, hsSearch);

// 2. replace conceptosGrupo generation
const cgSearch = `              const conceptosGrupo: any[] = [];
              grupo.refs.forEach((ref: string) => {
                if (ref.startsWith('RECIB-HIST-')) {
                  const pDet = pagosPendientes.find(p => p.facturas && p.facturas[0]?.referencia === ref);
                  if (pDet && pDet.facturas && pDet.facturas[0]) {
                    const f = pDet.facturas[0];
                    conceptosGrupo.push({ descripcion: \`Mes Histórico (M\${f.mesNum}) - Base Imponible\`, precioUnit: parseFloat(f.base), total: parseFloat(f.base) });
                    conceptosGrupo.push({ descripcion: \`Mes Histórico (M\${f.mesNum}) - Multa (12%)\`, precioUnit: parseFloat(f.multa), total: parseFloat(f.multa) });
                    conceptosGrupo.push({ descripcion: \`Mes Histórico (M\${f.mesNum}) - IVA (16%)\`, precioUnit: parseFloat(f.iva), total: parseFloat(f.iva) });
                  } else {
                     conceptosGrupo.push({ descripcion: \`Deuda Histórica: \${ref}\`, precioUnit: 0, total: 0 });
                  }
                } else {
                  const f = recibos.find((r: any) => r.referencia === ref);
                  const montoF = f ? parseFloat(getReciboMonto(f) || '0') : 0;
                  conceptosGrupo.push({
                    descripcion: \`Servicio Aseo Residencial/Comercial. Correspondiente al mes de: \${getMesRec(f?.emision || '')}\`,
                    precioUnit: montoF,
                    total: montoF
                  });
                }
              });`;

c = c.replace(/              const conceptosGrupo = grupo\.refs\.map\(\(ref: string\) => \{[\s\S]*?\}\);/, cgSearch);

// Eliminate any potential duplicate imports of getFAR from caja/page.tsx
c = c.replace(/      const getFAR = \([\s\S]*?      };\n/, "");

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
