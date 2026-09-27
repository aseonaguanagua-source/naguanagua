const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/const \[totalBs, setTotalBs\] = useState\(0\);/,
  `const [totalBs, setTotalBs] = useState(0);
  const [sumBase, setSumBase] = useState(0);
  const [sumIVA, setSumIVA] = useState(0);
  const [sumMulta, setSumMulta] = useState(0);`);

c = c.replace(/    setTotalBs\(total\);\n  \}, \[selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda\]\);/g,
  `    setTotalBs(total);

    let sb = 0, siva = 0, smulta = 0;
    selectedRecibos.forEach(ref => {
      if (ref.startsWith('RECIB-HIST-')) {
        const parts = ref.split('-');
        const inmId = parts[2];
        const inm = (inmuebles || []).find((i) => i.inmueble === inmId);
        if (inm) {
          const bm = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActual);
          const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
          sb += bm;
          siva += esRes ? 0 : bm * 0.16;
          const f = recibos.find(r => r.referencia === ref);
          const emision = f ? new Date(f.emision) : new Date();
          const isCurrentMonth = emision.getMonth() === new Date().getMonth() && emision.getFullYear() === new Date().getFullYear();
          if (!isCurrentMonth) {
            smulta += bm * (esRes ? 0.10 : 0.12);
          }
        }
      } else if (ref.startsWith('CM-')) {
        let targetInms = (inmuebles || []).filter(inm => inm.inmueble && ref.includes(inm.inmueble));
        if (targetInms.length === 0) targetInms = (inmuebles || []).filter(i => i.identidad === foundUser?.Identidad);
        targetInms.forEach(inm => {
          const bm = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActual);
          const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
          sb += bm;
          siva += esRes ? 0 : bm * 0.16;
        });
      } else {
        const f = recibos.find(r => r.referencia === ref);
        if (f) sb += parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
      }
    });

    selectedCuotas.forEach(sc => {
      const c = cuotas.find(cq => cq.convId === sc.convId && cq.cuotaId === sc.cuotaId);
      if (c) sb += parseFloat(c.monto || '0');
    });
    selectedServicios.forEach(ref => {
      const s = serviciosEsp.find(ss => ss.referencia === ref);
      if (s) { sb += parseFloat(s.monto || '0'); siva += parseFloat(s.monto || '0') * ivaPercent; }
    });
    selectedTalaPoda.forEach(ref => {
      const s = talaPoda.find(ss => ss.referencia === ref);
      if (s) { sb += parseFloat(s.monto || '0'); siva += parseFloat(s.monto || '0') * ivaPercent; }
    });
    setSumBase(sb);
    setSumIVA(siva);
    setSumMulta(smulta);

  }, [selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda, inmuebles, tasaActual, ivaPercent, foundUser]);`);


c = c.replace(/    let sumBase = 0, sumIVA = 0, sumMulta = 0;\n    selectedRecibos\.forEach\(ref => \{\n      if \(ref\.startsWith\('RECIB-HIST-'\)\) \{\n        const parts = ref\.split\('-'\);\n        const inmId = parts\[2\];\n        const inm = \(inmuebles \|\| \[\]\)\.find\(\(i\) => i\.inmueble === inmId\);\n        if \(inm\) \{\n          const bm = calcularMensualidad\(inm\.clasificacion \|\| '', inm\.actividad_principal \|\| '', parseInt\(inm\.cant_inmuebles \|\| 1\), tasaActual\);\n          const esRes = \(inm\.clasificacion \|\| ''\)\.toLowerCase\(\)\.includes\('residencial'\);\n          sumBase \+= bm;\n          sumIVA \+= esRes \? 0 : bm \* 0\.16;\n          \/\/ check if month is current month \(no multa\)\n          const f = recibos\.find\(r => r\.referencia === ref\);\n          const emision = f \? new Date\(f\.emision\) : new Date\(\);\n          const isCurrentMonth = emision\.getMonth\(\) === new Date\(\)\.getMonth\(\) && emision\.getFullYear\(\) === new Date\(\)\.getFullYear\(\);\n          if \(!isCurrentMonth\) \{\n            sumMulta \+= bm \* \(esRes \? 0\.10 : 0\.12\);\n          \}\n        \}\n      \} else if \(ref\.startsWith\('CM-'\)\) \{\n        let targetInms = \(inmuebles \|\| \[\]\)\.filter\(inm => inm\.inmueble && ref\.includes\(inm\.inmueble\)\);\n        if \(targetInms\.length === 0\) targetInms = inmuebles\.filter\(i => i\.identidad === foundUser\?\.Identidad\);\n        targetInms\.forEach\(inm => \{\n          const bm = calcularMensualidad\(inm\.clasificacion \|\| '', inm\.actividad_principal \|\| '', parseInt\(inm\.cant_inmuebles \|\| 1\), tasaActual\);\n          const esRes = \(inm\.clasificacion \|\| ''\)\.toLowerCase\(\)\.includes\('residencial'\);\n          sumBase \+= bm;\n          sumIVA \+= esRes \? 0 : bm \* 0\.16;\n        \}\);\n      \} else \{\n        const f = recibos\.find\(r => r\.referencia === ref\);\n        if \(f\) sumBase \+= parseFloat\(String\(f\.monto \|\| '0'\)\.replace\(\/\[\^\\\\d\.\]\/g, ''\)\) \|\| 0;\n      \}\n    \}\);\n\n    selectedCuotas\.forEach\(sc => \{\n      const c = cuotas\.find\(cq => cq\.convId === sc\.convId && cq\.cuotaId === sc\.cuotaId\);\n      if \(c\) sumBase \+= parseFloat\(c\.monto \|\| '0'\);\n    \}\);\n    selectedServicios\.forEach\(ref => \{\n      const s = serviciosEsp\.find\(ss => ss\.referencia === ref\);\n      if \(s\) \{ sumBase \+= parseFloat\(s\.monto \|\| '0'\); sumIVA \+= parseFloat\(s\.monto \|\| '0'\) \* ivaPercent; \}\n    \}\);\n    selectedTalaPoda\.forEach\(ref => \{\n      const s = talaPoda\.find\(ss => ss\.referencia === ref\);\n      if \(s\) \{ sumBase \+= parseFloat\(s\.monto \|\| '0'\); sumIVA \+= parseFloat\(s\.monto \|\| '0'\) \* ivaPercent; \}\n    \}\);/g, '');


fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
