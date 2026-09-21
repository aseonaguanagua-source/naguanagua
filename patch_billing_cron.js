const fs = require('fs');

// 1. Patch the billing cron route.ts
const routePath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/api/cron/billing/route.ts';
let routeContent = fs.readFileSync(routePath, 'utf8');

// Change the select to include inmueble field
routeContent = routeContent.replace(
  `.select('id, identidad, contribuyente, cod_cont, mmv_mes, cant_inmuebles, deuda_mmv')`,
  `.select('id, identidad, contribuyente, cod_cont, inmueble, mmv_mes, cant_inmuebles, deuda_mmv')`
);

// Change the reference generation: use inmueble code instead of cod_cont
routeContent = routeContent.replace(
  `  // ── PASO 2: Obtener referencias ya existentes para este período (batch) ──\n    const todasLasRefs = inmuebles\n      .filter((inm: any) => inm.cod_cont)\n      .map((inm: any) => \`CM-\${inm.cod_cont}-\${periodoKey}\`);`,
  `  // ── PASO 2: Obtener referencias ya existentes para este período (batch) ──\n    // Nuevo formato: CM-I-000001-09-2026 (un recibo por inmueble)\n    const todasLasRefs = inmuebles\n      .filter((inm: any) => inm.inmueble)\n      .map((inm: any) => \`CM-\${inm.inmueble}-\${periodoKey}\`);`
);

// Change the loop condition and ref generation
routeContent = routeContent.replace(
  `    for (const inm of inmuebles) {\n      if (!inm.cod_cont) continue;\n      const cant = parseFloat(inm.cant_inmuebles) || 1;\n      const mmv  = parseFloat(inm.mmv_mes) || 0;\n      if (mmv <= 0) continue;\n\n      const refFactura = \`CM-\${inm.cod_cont}-\${periodoKey}\`;`,
  `    for (const inm of inmuebles) {\n      if (!inm.inmueble) continue; // Usar código de inmueble individual\n      const cant = parseFloat(inm.cant_inmuebles) || 1;\n      const mmv  = parseFloat(inm.mmv_mes) || 0;\n      if (mmv <= 0) continue;\n\n      const refFactura = \`CM-\${inm.inmueble}-\${periodoKey}\`; // CM-I-000001-09-2026`
);

fs.writeFileSync(routePath, routeContent);
console.log("✅ Billing route.ts patched to generate per-inmueble bills.");
