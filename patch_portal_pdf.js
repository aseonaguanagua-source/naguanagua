const fs = require('fs');

async function run() {
  const filePath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/portal/(dashboard)/estado-cuenta/page.tsx';
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Add imports
  if (!content.includes('import jsPDF')) {
    content = content.replace(
      "import { formatBs } from '@/lib/formatCurrency';",
      "import { formatBs } from '@/lib/formatCurrency';\nimport jsPDF from 'jspdf';\nimport autoTable from 'jspdf-autotable';\nimport { logos } from '@/lib/logosBase64';"
    );
  }
  
  if (!content.includes('Download,')) {
    content = content.replace(
      "import { FileText, Building",
      "import { Download, FileText, Building"
    );
  }

  // 2. Add contribuyentes to useAppContext
  if (content.includes('const { inmuebles, recibos } = useAppContext();')) {
    content = content.replace(
      'const { inmuebles, recibos } = useAppContext();',
      'const { inmuebles, recibos, contribuyentes } = useAppContext();'
    );
  }

  // 3. Insert handleDownloadPDF
  const pdfLogic = `
  const handleDownloadPDF = () => {
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
  };

  if (isLoading) return`;
  
  if (!content.includes('handleDownloadPDF')) {
    content = content.replace('  if (isLoading) return', pdfLogic);
  }

  // 4. Add UI button at the top
  const headerHtml = `
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-xl font-bold text-slate-800">Mi Estado de Cuenta</h1>
        <button 
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          Descargar PDF
        </button>
      </div>

      {/* Resumen Financiero */}`;
  
  if (!content.includes('Mi Estado de Cuenta')) {
    content = content.replace('{/* Resumen Financiero */}', headerHtml);
  }

  fs.writeFileSync(filePath, content);
  console.log("Portal PDF export patched successfully!");
}

run();
