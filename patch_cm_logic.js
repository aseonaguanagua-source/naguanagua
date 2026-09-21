const fs = require('fs');

async function run() {
  const replacementLogic = `    // CM- = exactamente 1 mes
    if (r.referencia?.startsWith('CM-')) {
      let monthlyMMV = 0;
      // Nuevo formato: CM-I-000001-09-2026 (contiene el id del inmueble)
      const matchedInmueble = userInms.find((inm: any) => inm.inmueble && r.referencia.includes(inm.inmueble));
      
      if (matchedInmueble) {
        const cant = parseFloat(matchedInmueble.cant_inmuebles || 1);
        const mmv  = parseFloat(matchedInmueble.mmv_mes || 0);
        if (mmv > 0) monthlyMMV = cant * mmv;
      } else {
        // Fallback (recibos consolidados antiguos)
        userInms.forEach((inm: any) => {
          const cant = parseFloat(inm.cant_inmuebles || 1);
          const mmv  = parseFloat(inm.mmv_mes || 0);
          if (mmv > 0) monthlyMMV += cant * mmv;
        });
      }
      if (monthlyMMV > 0) return (monthlyMMV * tasaActual).toFixed(2);
    }`;

  const replacementLogicPortal = `    // CM-
    if (r.referencia?.startsWith('CM-')) {
      let monthlyMMV = 0;
      const matchedInmueble = misInmuebles.find((inm: any) => inm.inmueble && r.referencia.includes(inm.inmueble));
      
      if (matchedInmueble) {
        const cant = parseFloat(matchedInmueble.cant_inmuebles || 1);
        const mmv  = parseFloat(matchedInmueble.mmv_mes || 0);
        if (mmv > 0) monthlyMMV = cant * mmv;
      } else {
        misInmuebles.forEach((inm: any) => {
          const cant = parseFloat(inm.cant_inmuebles || 1);
          const mmv  = parseFloat(inm.mmv_mes || 0);
          if (mmv > 0) monthlyMMV += cant * mmv;
        });
      }
      if (monthlyMMV > 0) return (monthlyMMV * tasaBcv).toFixed(2);
    }`;

  const replacementLogicContrib = `                    // Si es recibo mensual CM-, usar factor actual x tasa
                    if (f.referencia?.startsWith('CM-')) {
                      let monthlyMMV = 0;
                      const matchedInmueble = userInms.find((inm: any) => inm.inmueble && f.referencia.includes(inm.inmueble));
                      if (matchedInmueble) {
                        const cant = parseFloat(matchedInmueble.cant_inmuebles || 1);
                        const mmv = parseFloat(matchedInmueble.mmv_mes || 0);
                        if (mmv > 0) monthlyMMV = cant * mmv;
                      } else {
                        userInms.forEach((inm: any) => {
                          const cant = parseFloat(inm.cant_inmuebles || 1);
                          const mmv = parseFloat(inm.mmv_mes || 0);
                          if (mmv > 0) monthlyMMV += cant * mmv;
                        });
                      }
                      if (monthlyMMV > 0) {
                        deudaActual = monthlyMMV * currentTasa;
                      }
                    }`;

  // Patch admin/caja/page.tsx
  let path1 = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/page.tsx';
  let c1 = fs.readFileSync(path1, 'utf8');
  c1 = c1.replace(/    \/\/ CM- = exactamente 1 mes[\s\S]*?if \(monthlyMMV > 0\) \{\n        return \(monthlyMMV \* tasaActual\)\.toFixed\(2\);\n      \}\n    \}/m, replacementLogic);
  fs.writeFileSync(path1, c1);
  console.log("Patched caja/page.tsx");

  // Patch portal estado-cuenta
  let path2 = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/portal/(dashboard)/estado-cuenta/page.tsx';
  let c2 = fs.readFileSync(path2, 'utf8');
  c2 = c2.replace(/    \/\/ CM-\n    if \(r\.referencia\?\.startsWith\('CM-'\)\) \{[\s\S]*?if \(monthlyMMV > 0\) return \(monthlyMMV \* tasaBcv\)\.toFixed\(2\);\n    \}/m, replacementLogicPortal);
  fs.writeFileSync(path2, c2);
  console.log("Patched portal/estado-cuenta/page.tsx");

  // Patch admin/contribuyentes/page.tsx
  let path3 = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/contribuyentes/page.tsx';
  let c3 = fs.readFileSync(path3, 'utf8');
  c3 = c3.replace(/                    \/\/ Si es recibo mensual CM-, usar factor actual x tasa\n                    if \(f\.referencia\?\.startsWith\('CM-'\)\) \{[\s\S]*?\}\n                    \}/m, replacementLogicContrib);
  fs.writeFileSync(path3, c3);
  console.log("Patched admin/contribuyentes/page.tsx");
}

run();
