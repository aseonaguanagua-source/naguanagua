const fs = require('fs');

const filePath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/portal/(dashboard)/estado-cuenta/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the full handleDownloadPDF function
const oldFn = `  const handleDownloadPDF = () => {
    if (!portalDoc) return;
    const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
    const myContribuyente = contribuyentes?.find((c: any) => (c.Identidad || '').replace(/-/g, '').toUpperCase() === docNorm);
    
    const viewData = {
      Contribuyente: myContribuyente?.Contribuyente || 'N/A',
      Identidad: portalDoc,
      Telefono: myContribuyente?.Telefono || 'N/A',
      Direccion: myContribuyente?.Direccion || 'N/A'
    };

    const doc = new jsPDF();
    
    // Add Logos
    try {
      doc.addImage(logos.alcaldia, 'JPEG', 14, 10, 25, 25);
      doc.addImage(logos.isma, 'JPEG', 42, 10, 25, 25);
      doc.addImage(logos.global_rec, 'JPEG', 145, 10, 25, 25);
      doc.addImage(logos.basura_cero, 'JPEG', 173, 10, 25, 25);
    } catch(e) { console.warn("Error loading logos", e); }

    // Title & Taxpayer Info
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("ESTADO DE CUENTA", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(\`Razón Social: \${viewData.Contribuyente}\`, 14, 40);
    doc.text(\`R.I.F / C.I: \${viewData.Identidad}\`, 14, 46);
    doc.text(\`Teléfono: \${viewData.Telefono}\`, 14, 52);
    
    const splitDireccion = doc.splitTextToSize(\`Dirección: \${viewData.Direccion}\`, 180);
    doc.text(splitDireccion, 14, 58);
    
    let currentY = 58 + (splitDireccion.length * 5) + 5;

    // Desglose de Inmuebles
    if (misInmuebles.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("DESGLOSE DE INMUEBLES / ACTIVIDADES", 14, currentY);
      
      const inmueblesData = misInmuebles.map((i: any) => [
        i.inmueble || i.cod_cont || '-',
        i.cant_inmuebles || '1',
        i.tipo || 'N/A',
        i.actividad_principal || 'Residencial',
        i.direccion || 'N/A'
      ]);

      try {
        autoTable(doc, {
          startY: currentY + 3,
          head: [['Inmueble', 'Cant.', 'Clasif.', 'Actividad', 'Dirección']],
          body: inmueblesData,
          theme: 'grid',
          headStyles: { fillColor: [51, 65, 85] },
          styles: { fontSize: 8 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
      } catch (e) {}
    }

    doc.setFont("helvetica", "bold");
    doc.text("RECIBOS PENDIENTES (DEUDA)", 14, currentY);

    const tableData = pendientes.map((d: any) => {
      return [
        d.referencia,
        mesLabel(d.emision).toUpperCase(),
        d.vencimiento || 'N/A',
        \`\${parseFloat(getReciboMonto(d)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.\`
      ];
    });

    tableData.push(["", "", "TOTAL DEUDA:", \`\${totalPendBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.\`]);

    try {
      autoTable(doc, {
        startY: currentY + 3,
        head: [['Referencia', 'Período', 'Vencimiento', 'Monto']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38] },
        styles: { fontSize: 9 },
        columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
      });
      currentY = (doc as any).lastAutoTable.finalY + 12;
    } catch (e: any) {
      console.error(e);
    }

    doc.save(\`Estado_Cuenta_\${viewData.Identidad}_\${Date.now()}.pdf\`);
  };`;

const newFn = `  const handleDownloadPDF = () => {
    if (!portalDoc) return;
    const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
    const myContribuyente = contribuyentes?.find((c: any) => (c.Identidad || '').replace(/-/g, '').toUpperCase() === docNorm);

    const viewData = {
      Contribuyente: myContribuyente?.Contribuyente || '',
      Identidad: portalDoc,
      Telefono: myContribuyente?.Telefono || '',
      Direccion: myContribuyente?.Direccion || ''
    };

    // === Generate one PDF per inmueble ===
    const inmsToProcess = misInmuebles.length > 0 ? misInmuebles : [{ inmueble: 'Principal', tipo: 'Residencial', cant_inmuebles: 1 }];

    inmsToProcess.forEach((inm: any, idx: number) => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const today = new Date();
      const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const docNro = Math.floor(10000 + Math.random() * 90000);

      // ── LOGOS ──
      try { doc.addImage(logos.isma, 'JPEG', 14, 10, 38, 20); } catch(e) {}

      // ── TITLE ──
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('ESTADO DE CUENTA', 105, 17, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(220, 38, 38);
      doc.text(\`TASA VIGENTE HASTA: \${tasaVigente}\`, 105, 24, { align: 'center' });
      doc.setTextColor(0, 0, 0);

      // ── HORIZONTAL LINE ──
      doc.setLineWidth(0.3);
      doc.line(14, 32, 196, 32);

      // ── GENERATED BY + NUMBER ──
      const cajeroGuardado = typeof window !== 'undefined' ? localStorage.getItem('portal_user') || viewData.Contribuyente : viewData.Contribuyente;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text(\`Generado por: \${cajeroGuardado}\`, 14, 38);
      doc.setFont('helvetica', 'normal');
      doc.text(\`Nro.: \${docNro}\`, 196, 38, { align: 'right' });

      // ── LINE ──
      doc.line(14, 41, 196, 41);

      // ── INMUEBLE INFO ROW ──
      const uso = inm.clasificacion || inm.tipo || 'Residencial';
      const area = inm.area ? \`\${inm.area} Mt2\` : '—';
      const codInm = inm.inmueble || 'Principal';

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Código:', 14, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(codInm, 30, 47);
      doc.setFont('helvetica', 'normal');
      doc.text('Uso:', 65, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(uso, 76, 47);
      doc.setFont('helvetica', 'normal');
      doc.text('Área Operativa:', 115, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(area, 142, 47);
      doc.setFont('helvetica', 'normal');
      doc.text('Identidad:', 162, 47);
      doc.setFont('helvetica', 'bold');
      doc.text(viewData.Identidad, 179, 47);

      // ── NOMBRE/RAZÓN SOCIAL ──
      doc.setFont('helvetica', 'normal');
      doc.text('Nombre o Razón Social:', 14, 54);
      doc.setFont('helvetica', 'bold');
      doc.text(viewData.Contribuyente, 60, 54);

      // ── DIRECCIÓN INMUEBLE ──
      doc.setFont('helvetica', 'normal');
      const dirInm = inm.direccion || viewData.Direccion || '';
      const splitDir = doc.splitTextToSize(\`Dirección Inmueble: \${dirInm}\`, 182);
      doc.text(splitDir, 14, 60);

      let y = 60 + splitDir.length * 5 + 5;

      // ── LINE ──
      doc.line(14, y, 196, y);
      y += 6;

      // ── ESTADO DE CUENTA RESUMIDO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('ESTADO DE CUENTA RESUMIDO', 105, y, { align: 'center' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 6;

      // Get recibos for this specific inmueble
      const inmRecibos = pendientes.filter((f: any) => {
        if (inm.inmueble) return f.referencia.includes(inm.inmueble);
        return true;
      });
      const totalInm = inmRecibos.reduce((s: number, f: any) => s + parseFloat(getReciboMonto(f)), 0);
      const mesesArr = [...new Set(inmRecibos.map((f: any) => mesLabel(f.emision).toUpperCase()))];
      const periodosLabel = mesesArr.join(', ') || '—';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const resumenRows = [
        [\`Períodos Calculados (\${inmRecibos.length}):\`, periodosLabel],
        ['Monto Recolección Aseo Urbano Bs.', \`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`],
        ['Total Exento Bs.', \`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`],
        ['Base Imponible Bs.', 'Bs. 0,00'],
        ['IVA (16.00%) Bs.', 'Bs. 0,00'],
        ['Total estado de cuenta Bs.', \`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`],
      ];

      resumenRows.forEach(([label, value]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(label, 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(value, 196, y, { align: 'right' });
        y += 6;
      });

      // ── LINE ──
      doc.line(14, y, 196, y);
      y += 6;

      // ── TOTAL A PAGAR ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('TOTAL A PAGAR', 14, y);
      doc.text(\`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`, 196, y, { align: 'right' });
      y += 2;
      doc.line(14, y, 196, y);
      y += 8;

      // ── ESTADO DE CUENTA DETALLADO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('ESTADO DE CUENTA DETALLADO', 105, y, { align: 'center' });
      y += 4;

      const detalleRows = inmRecibos.map((f: any) => {
        const monto = parseFloat(getReciboMonto(f));
        const det = inm.actividad_principal ? \`Aseo \${(inm.tipo || inm.clasificacion || 'residencial').toLowerCase()}\` : 'Aseo residencial';
        const periodoDate = f.emision ? f.emision.replace(/-/g, '-') : '—';
        return [
          periodoDate,
          det,
          monto.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
          '0,00', '0,00', '0,00',
          monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })
        ];
      });

      try {
        autoTable(doc, {
          startY: y,
          head: [['PERIODO', 'DETALLE', 'RECOLECCIÓN', 'INT REC', 'MULTA', 'IVA', 'TOTAL BS']],
          body: detalleRows,
          theme: 'grid',
          headStyles: { fillColor: [255, 255, 255], textColor: [0,0,0], fontStyle: 'bold', lineColor: [0,0,0], lineWidth: 0.3, halign: 'center' },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 45 },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right', fontStyle: 'bold' }
          }
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      } catch(e) {}

      // ── INFORMACIÓN DE PAGO ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('INFORMACIÓN PARA PAGOS Y TRANSFERENCIAS', 105, y, { align: 'center' });
      y += 5;
      doc.line(14, y, 196, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.text('Banco:  BANESCO (0134)', 14, y);
      y += 5;
      doc.text('Cta:    01340415144151031715', 14, y);
      y += 7;
      doc.setFont('helvetica', 'italic');
      doc.text('Pagos a nombre de: INST SOC MUN PARA EL AMBIENTE R.I.F.: G-200076739', 14, y);

      const fileName = \`Estado_Cuenta_\${viewData.Identidad}_\${codInm}_\${Date.now()}.pdf\`;
      doc.save(fileName);
    });
  };`;

if (content.includes('  const handleDownloadPDF = () => {')) {
  content = content.replace(oldFn, newFn);
  if (!content.includes('handleDownloadPDF = () => {')) {
    // Fallback: use indexOf
    const startIdx = content.indexOf('  const handleDownloadPDF = () => {');
    const endIdx = content.indexOf('\n  };\n', startIdx) + 5;
    content = content.substring(0, startIdx) + newFn + content.substring(endIdx);
  }
  fs.writeFileSync(filePath, content);
  console.log('✅ PDF format updated to ISMA template');
} else {
  console.log('❌ handleDownloadPDF function not found at expected location');
  // Direct injection: find the function and replace it
  const startMarker = '  const handleDownloadPDF = () => {';
  const startIdx = content.indexOf(startMarker);
  if (startIdx !== -1) {
    // Find the matching closing brace
    let depth = 0;
    let i = startIdx;
    let foundEnd = -1;
    while (i < content.length) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') {
        depth--;
        if (depth === 0) { foundEnd = i + 1; break; }
      }
      i++;
    }
    // Also consume the ";" after "}"
    if (foundEnd !== -1 && content[foundEnd] === ';') foundEnd++;
    if (foundEnd !== -1) {
      content = content.substring(0, startIdx) + newFn + content.substring(foundEnd);
      fs.writeFileSync(filePath, content);
      console.log('✅ PDF function replaced via brace matching');
    } else {
      console.log('❌ Could not find end of function');
    }
  } else {
    console.log('❌ Start marker not found either');
  }
}
