const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');

c = c.replace(/const deudaInmuebleBs = userInms\.reduce\(\(sum: number, inm: any\) => \{[\s\S]*?\}, 0\);/, `const deudaInmuebleBs = userInms.reduce((sum: number, inm: any) => {
                      const meses = Math.max(0, parseInt(inm.meses_deuda || 0));
                      const baseUnMes = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tcmmv);
                      const totalUnMes = baseUnMes + (baseUnMes * 0.16) + (baseUnMes * 0.12);
                      return sum + (totalUnMes * meses);
                    }, 0);`);

c = c.replace(/<td className="p-2 text-right font-bold text-red-600">\{\([\s\S]*?\}\) Bs<\/td>/, `<td className="p-2 text-right font-bold text-red-600">{(() => {
                                      const meses = Math.max(0, parseInt(inm.meses_deuda || 0));
                                      const baseUnMes = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tcmmv);
                                      const totalUnMes = baseUnMes + (baseUnMes * 0.16) + (baseUnMes * 0.12);
                                      return (totalUnMes * meses).toFixed(2);
                                    })()} Bs</td>`);

fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', c);
