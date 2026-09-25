const fs = require('fs');

function patchReciboImprimible() {
  const file = 'src/components/ReciboImprimible.tsx';
  let c = fs.readFileSync(file, 'utf-8');
  
  if (!c.includes('tipoContribuyente')) {
    c = c.replace('caja: string;', 'caja: string;\n  tipoContribuyente?: string;');
    
    const target = `{data.esAbono ? 'RECIBO DE ABONO / PAGO PARCIAL' : 'RECIBO DE ASEO URBANO'}`;
    const replacement = `{data.esAbono 
          ? 'RECIBO DE ABONO / PAGO PARCIAL' 
          : ((data.tipoContribuyente && data.tipoContribuyente.toLowerCase().includes('residencial')) || (data.codContribuyente && data.codContribuyente.startsWith('AURI'))
              ? 'RECIBO DE COBRO' 
              : 'FACTURA DE ASEO URBANO')}`;
              
    c = c.replace(target, replacement);
    fs.writeFileSync(file, c, 'utf-8');
    console.log('Patched ReciboImprimible.tsx');
  }
}

function patchEstadoCuenta() {
  const file = 'src/app/(admin)/admin/estado-cuenta/page.tsx';
  let c = fs.readFileSync(file, 'utf-8');
  
  if (!c.includes('tipoContribuyente: tipoContrib,')) {
    // We need to inject tipoContribuyente into setSelectedRecibo
    // Around line 589 we have:
    /*
      setSelectedRecibo({
        reciboNo: row.referencia ? row.referencia.split('-').pop()?.padStart(7, '0') : '0000001',
    */
    
    // First let's extract tipoContrib around where codContrib is defined
    const targetVar = `let codContrib = contrib ? contrib.identidad : row.identidad;`;
    const replacementVar = `let codContrib = contrib ? contrib.identidad : row.identidad;\n    let tipoContrib = contrib ? contrib.tipo : 'Comercial';`;
    
    if (c.includes(targetVar)) {
      c = c.replace(targetVar, replacementVar);
    }
    
    const targetSet = `codContribuyente: codContrib,`;
    const replacementSet = `codContribuyente: codContrib,\n      tipoContribuyente: tipoContrib,`;
    
    if (c.includes(targetSet)) {
      c = c.replace(targetSet, replacementSet);
    }
    
    fs.writeFileSync(file, c, 'utf-8');
    console.log('Patched estado-cuenta/page.tsx');
  }
}

patchReciboImprimible();
patchEstadoCuenta();
