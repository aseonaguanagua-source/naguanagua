const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/cobro-movil/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    const combined = [...(allUserFacturas || []), ...fallbackFacturas] as Recibo[];
    if (combined.length === 0 && (totalDeudaMMV > 0 || totalCongelada > 0)) {
      combined.push({ referencia: 'RECIB-DEUDA', emision: new Date().toISOString(), estado: 'Pendiente', monto: '0' } as Recibo);
    }`;

const replacement = `    const combined = [...(allUserFacturas || []), ...fallbackFacturas] as Recibo[];
    
    // Inyectar recibos dummy divididos por mes si no hay facturas reales
    if (combined.length === 0 && inmsFinal && inmsFinal.length > 0) {
      const hasDeuda = inmsFinal.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
      if (hasDeuda) {
        inmsFinal.forEach((inm: any) => {
          const deudaMMV = parseFloat(inm.deuda_mmv || '0');
          const congelada = parseFloat(inm.deuda_congelada_bs || '0');
          const multa = parseFloat(inm.multa_bs || '0');
          const meses = parseInt(inm.meses_deuda || 1);
          if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {
            const numMeses = Math.max(1, meses);
            for (let i = 1; i <= numMeses; i++) {
              combined.push({
                id: \`dummy-hist-\${inm.inmueble}-\${i}\`,
                referencia: \`RECIB-HIST-\${inm.inmueble}-M\${i}\`,
                identidad: user.Identidad,
                contribuyente: user.Contribuyente,
                emision: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i - 1)).toISOString(),
                vencimiento: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i - 1)).toISOString(),
                estado: 'Pendiente',
                monto: '0'
              } as Recibo);
            }
          }
        });
      }
    }`;

if(content.includes(target)){
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("Success");
} else {
    console.log("Target not found");
}
