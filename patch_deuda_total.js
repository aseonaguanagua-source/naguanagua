const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');

c = c.replace(/const deudaInmuebleBs = userInms\.reduce\(\(acc: number, inm: any\) => \{[\s\S]*?\}, 0\);/, `const deudaInmuebleBs = userInms.reduce((acc: number, inm: any) => {
    const meses = Math.max(0, parseInt(inm.meses_deuda || 0));
    const baseUnMes = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tcmmv);
    const totalUnMes = baseUnMes + (baseUnMes * 0.16) + (baseUnMes * 0.12);
    return acc + (totalUnMes * meses);
  }, 0);`);

fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', c);
