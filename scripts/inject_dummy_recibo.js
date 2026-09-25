const fs = require('fs');
let content = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', 'utf8');

// Buscamos donde define combined y añadimos el dummy
const findCombined = "const combined = [...(allUserFacturas || []), ...fallbackFacturas];";
const injectDummy = `const combined = [...(allUserFacturas || []), ...fallbackFacturas];
      
      // Si no hay recibos, pero tiene inmuebles con deuda_mmv, inyectamos un recibo acumulado dinámico
      if (combined.length === 0 && userInmuebles && userInmuebles.length > 0) {
        const hasDeuda = userInmuebles.some(i => parseFloat(i.deuda_mmv || '0') > 0);
        if (hasDeuda && !isCondominio) {
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
        }
      }`;

if (!content.includes('dummy-deuda-acumulada')) {
    content = content.replace(findCombined, injectDummy);
    fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', content);
    console.log("Dummy recibo inyectado.");
} else {
    console.log("Ya existía.");
}
