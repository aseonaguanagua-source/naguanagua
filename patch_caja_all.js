const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');

c = c.replace(/const \[totalBs, setTotalBs\] = useState\(0\);/g,
  `const [totalBs, setTotalBs] = useState(0);
  const [sumBase, setSumBase] = useState(0);
  const [sumIVA, setSumIVA] = useState(0);
  const [sumMulta, setSumMulta] = useState(0);`);

c = c.replace(/    setTotalBs\(total\);\n  \}, \[selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda\]\);/g,
  `    setTotalBs(total);

    let sb = 0, siva = 0, smulta = 0;
    const tasaActualUse = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);

    selectedRecibos.forEach(ref => {
      if (ref.startsWith('RECIB-HIST-')) {
        const parts = ref.split('-');
        const inmId = parts[2];
        const inm = (inmuebles || []).find((i) => i.inmueble === inmId);
        if (inm) {
          const bm = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActualUse);
          const esRes = (inm.clasificacion || '').toLowerCase().includes('residencial');
          sb += bm;
          siva += esRes ? 0 : bm * 0.16;
          const f = recibos.find(r => r.referencia === ref);
          const emision = f && f.emision ? new Date(f.emision) : new Date();
          const isCurrentMonth = emision.getMonth() === new Date().getMonth() && emision.getFullYear() === new Date().getFullYear();
          if (!isCurrentMonth) {
            smulta += bm * (esRes ? 0.10 : 0.12);
          }
        }
      } else if (ref.startsWith('CM-')) {
        let targetInms = (inmuebles || []).filter(inm => inm.inmueble && ref.includes(inm.inmueble));
        if (targetInms.length === 0) targetInms = (inmuebles || []).filter(i => i.identidad === foundUser?.Identidad);
        targetInms.forEach(inm => {
          const bm = calcularMensualidad(inm.clasificacion || '', inm.actividad_principal || '', parseInt(inm.cant_inmuebles || 1), tasaActualUse);
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

  }, [selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda, inmuebles, customBcvRate, tcmmv, ivaPercent, foundUser]);`);

// Fix getReciboMonto logic to respect "No multa in current month"
c = c.replace(/const montoMulta = baseMonto \* \(esRes \? 0\.10 : 0\.12\);/g,
  `const emision = r.emision ? new Date(r.emision) : new Date();
        const isCurrentMonth = emision.getMonth() === new Date().getMonth() && emision.getFullYear() === new Date().getFullYear();
        const montoMulta = isCurrentMonth ? 0 : baseMonto * (esRes ? 0.10 : 0.12);`);

// Fix handlePayment
c = c.replace(/const totalConImpuestos = \(totalBs \+ \(totalBs \* ivaPercent\)\) - montoRetencionIVA;/g,
  `const calculatedTotalBs = sumBase + sumIVA + sumMulta;
    const realMontoRetencionIVA = sumIVA * (retencionIVA / 100);
    const totalConImpuestos = calculatedTotalBs - realMontoRetencionIVA;`);

// Fix Resumen de Pago UI
c = c.replace(/<span>IVA \(\{ivaPercent \* 100\}%\) Total:<\/span>\n                <span className="font-semibold">Bs\. \{formatBs\(totalBs \* ivaPercent\)\}<\/span>/g,
  `<span>IVA (16%) Total:</span>
                <span className="font-semibold">Bs. {formatBs(sumIVA)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600 mt-2">
                <span>Multa Total:</span>
                <span className="font-semibold text-rose-600">Bs. {formatBs(sumMulta)}</span>`);

c = c.replace(/<span className="text-red-600 font-bold">- Bs\. \{formatBs\(\(totalBs \* ivaPercent\) \* \(retencionIVA \/ 100\)\)\}<\/span>/g,
  `<span className="text-red-600 font-bold">- Bs. {formatBs(sumIVA * (retencionIVA / 100))}</span>`);

c = c.replace(/<span>- Bs\. \{formatBs\(Math\.min\(\(totalBs \+ \(totalBs \* ivaPercent\)\) - montoRetencionIVA, foundUser\.SaldoFavor\)\)\}<\/span>/g,
  `<span>- Bs. {formatBs(Math.min((sumBase + sumIVA + sumMulta) - (sumIVA * (retencionIVA / 100)), foundUser.SaldoFavor))}</span>`);

c = c.replace(/<span className="text-2xl font-black text-emerald-700">Bs\. \{formatBs\(Math\.max\(0, \(\(totalBs \+ \(totalBs \* ivaPercent\)\) - montoRetencionIVA\) - \(useSaldoFavor \? \(foundUser\?\.SaldoFavor \|\| 0\) : 0\)\)\)\}<\/span>/g,
  `<span className="text-2xl font-black text-emerald-700">Bs. {formatBs(Math.max(0, ((sumBase + sumIVA + sumMulta) - (sumIVA * (retencionIVA / 100))) - (useSaldoFavor ? (foundUser?.SaldoFavor || 0) : 0)))}</span>`);

c = c.replace(/<span>Deuda Total \(Bimestral\) Seleccionada:<\/span>\n                <span className="font-semibold">Bs\. \{formatBs\(totalBs\)\}<\/span>/g,
  `<span>Base Imponible Total:</span>
                <span className="font-semibold">Bs. {formatBs(sumBase)}</span>`);


// Fix PDF concepts
c = c.replace(/const porcentajeMulta = f\.clasificacion\.toLowerCase\(\)\.includes\('residencial'\) \? '10%' : '12%';\n                    conceptosGrupo\.push\(\{ descripcion: \`Mes Histórico \(M\$\{f\.mesNum\}\) - Multa \(\$\{porcentajeMulta\}\)\`, precioUnit: parseFloat\(f\.multa\), total: parseFloat\(f\.multa\) \}\);/g,
  `const porcentajeMulta = f.clasificacion.toLowerCase().includes('residencial') ? '10%' : '12%';
                    if (parseFloat(f.multa) > 0) {
                      conceptosGrupo.push({ descripcion: \`Mes Histórico (M\${f.mesNum}) - Multa (\${porcentajeMulta})\`, precioUnit: parseFloat(f.multa), total: parseFloat(f.multa) });
                    }`);

fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
