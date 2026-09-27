const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', 'utf8');

if (!c.includes("import { calcularMensualidad, getFO } from '@/lib/calculos';")) {
  c = c.replace(
    "import { logAudit } from '@/lib/audit';",
    "import { logAudit } from '@/lib/audit';\nimport { calcularMensualidad, getFO } from '@/lib/calculos';"
  );
}

const newCalc = `  const calculateFactorForRow = async (row: any) => {
    try {
      const res = await fetch(\`/api/bcv?t=\${Date.now()}\`, { cache: 'no-store' });
      const data = await res.json();
      
      let factorTotal = 0;
      let totalBsAll = 0;
      let leyenda = '';
      const desgloseLocales: any[] = [];

      const misInmuebles = inmuebles.filter(i => i.identidad === row.Identidad);

      if (misInmuebles.length > 0) {
        const isCondominio = misInmuebles.some(i => (parseInt(i.cant_inmuebles) || 1) > 1);
        leyenda = isCondominio ? \`Condominio / Complejo Residencial\` : misInmuebles.map(i => i.actividad_principal || 'Residencial').join(', ');
        
        misInmuebles.forEach(inm => {
          const cant = parseInt(inm.cant_inmuebles) || 1;
          const metraje = inm.area || inm.area_operativa || 'N/A';
          const actividad = inm.actividad_principal || 'No especificada';
          const clasificacion = inm.clasificacion || inm.tipo || 'Residencial';
          const esRes = (clasificacion || '').toLowerCase().includes('residencial');
          
          const fo = getFO(actividad, esRes);
          factorTotal += (fo * cant);
          
          if (fo > 0) {
            if (cant > 1) {
              for(let i=1; i<=cant; i++) {
                const baseMonto = calcularMensualidad(clasificacion, actividad, 1, data.tcmmv);
                const iva = baseMonto * 0.16;
                const multa = baseMonto * 0.12;
                const totalItem = baseMonto + iva + multa;
                totalBsAll += totalItem;
                
                desgloseLocales.push({
                  numeracion: \`Local/Inmueble Múltiple - Unidad \${i}\`,
                  leyenda: \`\${actividad} (Base+IVA+Multa)\`,
                  factor: fo,
                  montoBs: (Math.trunc(totalItem * 100) / 100).toFixed(2)
                });
              }
            } else {
                const baseMonto = calcularMensualidad(clasificacion, actividad, 1, data.tcmmv);
                const iva = baseMonto * 0.16;
                const multa = baseMonto * 0.12;
                const totalItem = baseMonto + iva + multa;
                totalBsAll += totalItem;
                
              desgloseLocales.push({
                numeracion: \`Inmueble/Local\`,
                leyenda: \`\${actividad} (Base+IVA+Multa)\`,
                factor: fo,
                montoBs: (Math.trunc(totalItem * 100) / 100).toFixed(2)
              });
            }
          }
        });
      }
      
      const totalTruncado = (Math.trunc(totalBsAll * 100) / 100).toFixed(2);

      return {
        factor: factorTotal,
        leyenda,
        totalBs: totalTruncado,
        fuente: data.source,
        tasaBcv: data.tcmmv,
        desglose: desgloseLocales
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  };`;

c = c.replace(/  const calculateFactorForRow = async \([\s\S]*?    \} catch \(e\) \{\n      console\.error\(e\);\n      return null;\n    \}\n  \};/, newCalc);

fs.writeFileSync('src/app/(admin)/admin/contribuyentes/page.tsx', c);
