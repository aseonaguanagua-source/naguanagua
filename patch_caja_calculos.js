const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

// Add import
if (!c.includes("import { calcularMensualidad } from '@/lib/calculos';")) {
  c = c.replace(
    "import { logAudit } from '@/lib/audit';",
    "import { logAudit } from '@/lib/audit';\nimport { calcularMensualidad } from '@/lib/calculos';"
  );
}

// Re-write the RECIB-HIST logic inside handleSearch
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
        
        // This is dynamic, so we just return the calculated concepts when asked for "conceptos"
        // Wait, for the table list we just need "montoPendiente" = totalMes.
        
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
    }`);

// Fix calculation of totalMmv in handleSearch to avoid error
c = c.replace(/if \(esRes\) totalMmv \+= cant \* mmv \* getFAR[\s\S]*?else totalMmv \+= cant \* mmv \* 57;/, `// We ignore totalMmv for the old DEUDA calculation`);
c = c.replace(/let ucdTotal = 0;[\s\S]*?baseMonto \+= ucdTotal \* tasaActual;/g, `// Omitted old baseMonto`);

// In generate Recibo data, fix the conceptos extraction:
const newConceptos = `
              const conceptosGrupo: any[] = [];
              let totalBaseGrupo = 0;
              let totalIvaGrupo = 0;
              let totalMultaGrupo = 0;

              grupo.refs.forEach((ref: string) => {
                if (ref.startsWith('RECIB-HIST-')) {
                  const parts = ref.split('-');
                  const inmId = parts[2];
                  const mNum = parts[3].replace('M','');
                  
                  // Find the dummy fact in pagosPendientes or session cache
                  const inm = userInms.find((i: any) => i.inmueble === inmId);
                  if (inm) {
                    const baseMonto = calcularMensualidad(
                      inm.clasificacion || '', 
                      inm.actividad_principal || '', 
                      parseInt(inm.cant_inmuebles || 1), 
                      tasaActual
                    );
                    const iva = baseMonto * 0.16;
                    const multa = baseMonto * 0.12;
                    totalBaseGrupo += baseMonto;
                    totalIvaGrupo += iva;
                    totalMultaGrupo += multa;
                  }
                } else {
                  // regular invoice... 
                  // skip for now or add generic
                }
              });

              if (totalBaseGrupo > 0) {
                 conceptosGrupo.push({ descripcion: 'Servicio de Aseo Urbano (Meses Históricos)', precioUnit: totalBaseGrupo, cantidad: 1, total: totalBaseGrupo });
                 conceptosGrupo.push({ descripcion: 'Multa (12%)', precioUnit: totalMultaGrupo, cantidad: 1, total: totalMultaGrupo });
                 conceptosGrupo.push({ descripcion: 'IVA (16%)', precioUnit: totalIvaGrupo, cantidad: 1, total: totalIvaGrupo });
              }
`;

// But wait, it's easier to just inject the exact concept array from `pagosPendientes` directly.
// Let's refine the script.
