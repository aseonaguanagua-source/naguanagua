const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');

c = c.replace(/parseFloat\(inm\.deuda_congelada_bs \|\| 0\) \+[\s\S]*?\.toFixed\(2\)/, `(() => {
                                      const meses = Math.max(1, parseInt(inm.meses_deuda || 0));
                                      const baseUnMes = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tcmmv);
                                      const totalUnMes = baseUnMes + (baseUnMes * 0.16) + (baseUnMes * 0.12);
                                      return (totalUnMes * meses).toFixed(2);
                                    })()`);

fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', c);
