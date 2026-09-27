const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

// Fix 1: ivaPercent should ALWAYS be 0 because we calculate IVA mathematically inside getReciboMonto!
// But wait! If we do that, we lose the "Retención de IVA" logic which relies on ivaPercent > 0 to show the dropdown!
// So instead, we must keep ivaPercent as a pure UI element (for the retención) but NOT add it to the final total if the items ALREADY have it.
// Actually, it's better to calculate totalBase, totalIVA, totalMulta explicitly.

// Let's replace the whole Resumen de Pago section logic!
c = c.replace(/const totalConImpuestos = \(totalBs \+ \(totalBs \* ivaPercent\)\) - montoRetencionIVA;/g,
  `// Recalculate explicit totals based on selected items to prevent double IVA
    let sumBase = 0, sumIVA = 0, sumMulta = 0;
    selectedRecibos.forEach(ref => {
      if (ref.startsWith('RECIB-HIST-')) {
        const parts = ref.split('-');
        const inmId = parts[2];
        const inm = (inmuebles || []).find((i) => i.inmueble === inmId);
        if (inm) {
          const bm = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActual);
          const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
          sumBase += bm;
          sumIVA += esRes ? 0 : bm * 0.16;
          // check if month is current month (no multa)
          const f = recibos.find(r => r.referencia === ref);
          const emision = f ? new Date(f.emision) : new Date();
          const isCurrentMonth = emision.getMonth() === new Date().getMonth() && emision.getFullYear() === new Date().getFullYear();
          if (!isCurrentMonth) {
            sumMulta += bm * (esRes ? 0.10 : 0.12);
          }
        }
      } else if (ref.startsWith('CM-')) {
        let targetInms = (inmuebles || []).filter(inm => inm.inmueble && ref.includes(inm.inmueble));
        if (targetInms.length === 0) targetInms = inmuebles.filter(i => i.identidad === foundUser?.Identidad);
        targetInms.forEach(inm => {
          const bm = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActual);
          const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
          sumBase += bm;
          sumIVA += esRes ? 0 : bm * 0.16;
        });
      } else {
        const f = recibos.find(r => r.referencia === ref);
        if (f) sumBase += parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
      }
    });

    selectedCuotas.forEach(sc => {
      const c = cuotas.find(cq => cq.convId === sc.convId && cq.cuotaId === sc.cuotaId);
      if (c) sumBase += parseFloat(c.monto || '0');
    });
    selectedServicios.forEach(ref => {
      const s = serviciosEsp.find(ss => ss.referencia === ref);
      if (s) { sumBase += parseFloat(s.monto || '0'); sumIVA += parseFloat(s.monto || '0') * ivaPercent; }
    });
    selectedTalaPoda.forEach(ref => {
      const s = talaPoda.find(ss => ss.referencia === ref);
      if (s) { sumBase += parseFloat(s.monto || '0'); sumIVA += parseFloat(s.monto || '0') * ivaPercent; }
    });

    const calculatedTotalBs = sumBase + sumIVA + sumMulta;
    const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);
    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;`);

// Fix getReciboMonto logic to respect "No multa in current month"
c = c.replace(/const montoMulta = baseMonto \* \(esRes \? 0\.10 : 0\.12\);/g,
  `const emision = r.emision ? new Date(r.emision) : new Date();
        const isCurrentMonth = emision.getMonth() === new Date().getMonth() && emision.getFullYear() === new Date().getFullYear();
        const montoMulta = isCurrentMonth ? 0 : baseMonto * (esRes ? 0.10 : 0.12);`);

// Fix Resumen de Pago UI
c = c.replace(/<span>IVA \(\{ivaPercent \* 100\}%\) Total:<\/span>\n                <span className="font-semibold">Bs\. \{formatBs\(totalBs \* ivaPercent\)\}<\/span>/g,
  `<span>IVA (16%) Total:</span>
                <span className="font-semibold">Bs. {formatBs(sumIVA)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600 mt-2">
                <span>Multa Total:</span>
                <span className="font-semibold text-rose-600">Bs. {formatBs(sumMulta)}</span>`);

c = c.replace(/<span className="text-red-600 font-bold">- Bs\. \{formatBs\(\(totalBs \* ivaPercent\) \* \(retencionIVA \/ 100\)\)\}<\/span>/g,
  `<span className="text-red-600 font-bold">- Bs. {formatBs(realMontoRetencionIVA)}</span>`);

c = c.replace(/<span>- Bs\. \{formatBs\(Math\.min\(\(totalBs \+ \(totalBs \* ivaPercent\)\) - montoRetencionIVA, foundUser\.SaldoFavor\)\)\}<\/span>/g,
  `<span>- Bs. {formatBs(Math.min(calculatedTotalBs - realMontoRetencionIVA, foundUser.SaldoFavor))}</span>`);

c = c.replace(/<span className="text-2xl font-black text-emerald-700">Bs\. \{formatBs\(Math\.max\(0, \(\(totalBs \+ \(totalBs \* ivaPercent\)\) - montoRetencionIVA\) - \(useSaldoFavor \? \(foundUser\?\.SaldoFavor \|\| 0\) : 0\)\)\)\}<\/span>/g,
  `<span className="text-2xl font-black text-emerald-700">Bs. {formatBs(Math.max(0, (calculatedTotalBs - realMontoRetencionIVA) - (useSaldoFavor ? (foundUser?.SaldoFavor || 0) : 0)))}</span>`);

c = c.replace(/<span>Deuda Total \(Bimestral\) Seleccionada:<\/span>\n                <span className="font-semibold">Bs\. \{formatBs\(totalBs\)\}<\/span>/g,
  `<span>Base Imponible Total:</span>
                <span className="font-semibold">Bs. {formatBs(sumBase)}</span>`);


// Also fix facturasPorInmueble mapping for PDF receipt concepts so it honors the month (no multa in Sept)
c = c.replace(/const porcentajeMulta = f\.clasificacion\.toLowerCase\(\)\.includes\('residencial'\) \? '10%' : '12%';\n                    conceptosGrupo\.push\(\{ descripcion: \`Mes Histórico \(M\$\{f\.mesNum\}\) - Multa \(\$\{porcentajeMulta\}\)\`, precioUnit: parseFloat\(f\.multa\), total: parseFloat\(f\.multa\) \}\);/g,
  `const emisionF = new Date(); // To be accurate, we'd need the exact date of that dummy month, but f.multa already has 0 if current!
                    if (parseFloat(f.multa) > 0) {
                      const porcentajeMulta = f.clasificacion.toLowerCase().includes('residencial') ? '10%' : '12%';
                      conceptosGrupo.push({ descripcion: \`Mes Histórico (M\${f.mesNum}) - Multa (\${porcentajeMulta})\`, precioUnit: parseFloat(f.multa), total: parseFloat(f.multa) });
                    }`);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
