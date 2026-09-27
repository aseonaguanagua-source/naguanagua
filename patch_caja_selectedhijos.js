const fs = require('fs');
const file = 'src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '    setTotalBs(total);\n\n    let sb = 0, siva = 0, smulta = 0;\n    const tasaActualUse = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);',
  `    let sb = 0, siva = 0, smulta = 0;\n    const tasaActualUse = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);\n\n    if (isCondominio && condominioModo === 'Local') {\n      selectedHijos.forEach(id => {\n        const h = condominioHijos.find((ch: any) => ch.id === id);\n        if (h) {\n          const monto = (h.deuda_mmv || 0) * tasaActualUse;\n          total += monto;\n          sb += monto;\n        }\n      });\n    }\n\n    setTotalBs(total);`
);

content = content.replace(
  `[selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda, inmuebles, customBcvRate, tcmmv, ivaPercent, foundUser]`,
  `[selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda, inmuebles, customBcvRate, tcmmv, ivaPercent, foundUser, isCondominio, condominioModo, selectedHijos, condominioHijos]`
);

// We need to remove the setTotalBs from the checkboxes!
content = content.replace(
  `                            setTotalBs(condominioHijos.reduce((acc, h) => acc + ((h.deuda_mmv || 0) * tcmmv), 0));`,
  `                            // setTotalBs happens in useEffect`
);
content = content.replace(
  `                            setTotalBs(0);`,
  `                            // setTotalBs(0) happens in useEffect`
);
content = content.replace(
  `                            const newTotal = condominioHijos.filter(h => newSelected.includes(h.id)).reduce((acc, h) => acc + ((h.deuda_mmv || 0) * tcmmv), 0);\n                            setTotalBs(newTotal);`,
  `                            // newTotal is handled in useEffect`
);

fs.writeFileSync(file, content);
