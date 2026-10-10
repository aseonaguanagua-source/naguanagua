const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/app/cobro-movil/page.tsx');
let content = fs.readFileSync(file, 'utf8');

const targetRegex = /const variants = getIdentidadVariants\(inputClean, activePrefix\);[\s\S]*?if \(fByName && fByName\.length > 0\) fallbackFacturas = fByName as Recibo\[\];\n    \}/;

const replacement = `    try {
      const res = await fetch(\`/api/cobro-movil/buscar?q=\${encodeURIComponent(inputClean)}\`);
      const data = await res.json();
      
      if (!res.ok) {
        setSearchError(data.error || 'Error al buscar el contribuyente.');
        setIsSearching(false);
        return;
      }

      const inmsDB = data.inmuebles;
      const user = data.foundUser as Contribuyente;

      if (user.Identidad && /^[A-Z]-/i.test(user.Identidad)) {
        const detectedPrefix = user.Identidad.charAt(0).toUpperCase();
        if (detectedPrefix !== docType) setDocType(detectedPrefix);
      }

      setFoundUser(user);

      let inmsFinal = [...inmsDB];
      const isCondoByFlag = inmsDB.some((i: any) => i.es_condominio === true);
      const isCondoByName = (user.Contribuyente || '').toLowerCase().includes('condominio') || (user.Actividad || '').toLowerCase().includes('condominio');

      if (isCondoByFlag || isCondoByName) {
        const condoCodes = inmsDB.map((i: any) => i.inmueble).filter(Boolean);
        if (condoCodes.length > 0) {
          const { data: hijos } = await supabase
            .from('inmuebles')
            .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
            .in('condominio_padre_id', condoCodes);
          if (hijos && hijos.length > 0) {
            const ids = new Set(inmsFinal.map(x => x.id));
            hijos.forEach(h => {
              if (!ids.has(h.id)) inmsFinal.push(h);
            });
          }
        }
      }

      const naParentCodes = inmsFinal
        .filter((i: any) => 
          (i.actividad_principal || '').trim().toUpperCase() === 'N/A' && 
          (parseInt(i.cant_inmuebles || '0') > 0 || inmsFinal.some((c: any) => c.condominio_padre_id === i.inmueble))
        )
        .map((i: any) => i.inmueble);

      const billableInms = inmsFinal.filter((i: any) => !naParentCodes.includes(i.inmueble));
      const finalInmsToUse = billableInms.length > 0 ? billableInms : inmsFinal;
      setUserInms(finalInmsToUse as Inmueble[]);

      const totalDeudaMMV = finalInmsToUse.reduce((s: number, i: any) => s + parseFloat(i.deuda_mmv || 0), 0);
      const totalCongelada = inmsDB.reduce((s: number, i: any) => s + parseFloat(i.deuda_congelada_bs || 0), 0);

      const allUserFacturas = data.facturas.filter((f: any) => ['Pendiente', 'Por Verificar', 'Abonado'].includes(f.estado));
      let fallbackFacturas: Recibo[] = [];
`;

if (!content.match(targetRegex)) {
  console.log("Target regex not matched!");
} else {
  content = content.replace(targetRegex, replacement);
  fs.writeFileSync(file, content);
  console.log("Patched successfully!");
}
