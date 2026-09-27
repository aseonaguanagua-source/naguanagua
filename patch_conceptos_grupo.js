const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

const replacement = `              const conceptosGrupo: any[] = [];
              grupo.refs.forEach((ref: string) => {
                if (ref.startsWith('RECIB-HIST-')) {
                  const pDet = pagosPendientes.find(p => p.facturas && p.facturas[0]?.referencia === ref);
                  if (pDet && pDet.facturas[0]) {
                    const f = pDet.facturas[0];
                    conceptosGrupo.push({ descripcion: \`Mes Histórico: M\${f.mesNum} - Base Imponible\`, precioUnit: parseFloat(f.base), total: parseFloat(f.base) });
                    conceptosGrupo.push({ descripcion: \`IVA (16%)\`, precioUnit: parseFloat(f.iva), total: parseFloat(f.iva) });
                    conceptosGrupo.push({ descripcion: \`Multa (12%)\`, precioUnit: parseFloat(f.multa), total: parseFloat(f.multa) });
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

c = c.replace(/              const conceptosGrupo = grupo\.refs\.map\(\(ref: string\) => \{[\s\S]*?\}\);/, replacement);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
