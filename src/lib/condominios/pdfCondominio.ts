import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';
import { EstadoCuenta, RenglonEstado } from './servicio';
const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { 
  if (!p || p.indexOf('-') === -1) return p;
  const [y, m] = p.split('-'); 
  return `${MESES[parseInt(m) - 1]} ${y}`; 
};

export function generarPdfEstadoCuentaCondominio(c: any, e: EstadoCuenta, cajero: string, mostrarNA: boolean = true) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const docNro = Math.floor(100000 + Math.random() * 900000).toString();
  
  const drawHeader = (pageNumber: number, totalPages: number) => {
    try {
      if (logos.alcaldia) doc.addImage(logos.alcaldia, 'PNG', 14, 10, 20, 25, undefined, 'FAST');
      if (logos.instituto) doc.addImage(logos.instituto, 'PNG', 174, 10, 22, 22, undefined, 'FAST');
    } catch (err) {}

    // ── TÍTULO ──
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO DE CUENTA CONDOMINIO', 105, 18, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    doc.text(`TASA VIGENTE HASTA: ${e.tasa}`, 105, 23, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // ── METADATA & LÍNEA ──
    doc.setLineWidth(0.3);
    doc.line(14, 32, 196, 32);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generado por: ${cajero}`, 14, 36);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${pageNumber} de ${totalPages}   |   Nro.: ${docNro}`, 196, 36, { align: 'right' });
    doc.line(14, 38, 196, 38);
  };

  drawHeader(1, 1);
  let y = 43;
  
  // ── DATOS DEL CONDOMINIO ──
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(c.nombre, 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Código: ${c.codigo}    |    RIF: ${c.identidad}`, 14, y);
  y += 5;
  doc.text(`Tipo: ${c.tipo}    |    Modalidad: ${c.modalidad}`, 14, y);
  y += 5;
  if (c.actividad) {
    doc.text(`Actividad: ${c.actividad}`, 14, y);
    y += 5;
  }
  
  doc.setDrawColor(210, 210, 210);
  doc.line(14, y, 196, y);
  doc.setDrawColor(0, 0, 0);
  y += 5;

  // ── RESUMEN TOTALES ──
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DE DEUDA TOTAL', 105, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Aseo: Bs. ${fmtBs(e.totales.baseBs)}`, 14, y);
  doc.text(`Multas: Bs. ${fmtBs(e.totales.multaBs)}`, 70, y);
  doc.text(`IVA: Bs. ${fmtBs(e.totales.ivaBs)}`, 130, y);
  y += 5;
  doc.text(`Retenciones: Bs. ${fmtBs(e.totales.retencionBs)}`, 14, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL DEUDA: Bs. ${fmtBs(e.totales.totalBs)}`, 130, y);
  y += 6;
  
  // ── PREPARAR LOS DATOS ──
  // Si la unidad es grupo (padre) agrupamos sus hijos debajo
  const rows: any[] = [];
  const renderRenglon = (r: RenglonEstado, indent: string = '') => {
    let prop = r.propietario || '';
    let id = r.identidad || '';
    if (mostrarNA) {
      if (!prop || prop === '') prop = 'N/A';
      if (!id || id === '') id = 'N/A';
    }
    
    rows.push([
      indent + (r.inmueble || (r.clave === '__SIN_REGISTRAR__' ? 'SIN REGISTRAR' : '')),
      r.numero || (mostrarNA ? 'N/A' : ''),
      prop,
      id,
      r.periodos.map(fmtPeriodo).join(', '),
      `Bs. ${fmtBs(r.totalBs)}`
    ]);
  };

  // Primero los que no tienen padre (o el condominio principal)
  const roots = e.renglones.filter(r => !r.padreId);
  
  let sumTotalNA = 0;
  const validRoots: typeof roots = [];

  for (const root of roots) {
    const isNA = !root.propietario && !root.identidad;
    if (isNA && mostrarNA && root.clave !== '__SIN_REGISTRAR__') {
      sumTotalNA += root.totalBs;
      const children = e.renglones.filter(r => r.padreId === root.clave);
      for (const child of children) {
        sumTotalNA += child.totalBs;
      }
    } else {
      validRoots.push(root);
    }
  }

  for (const root of validRoots) {
    renderRenglon(root);
    const children = e.renglones.filter(r => r.padreId === root.clave);
    for (const child of children) {
      renderRenglon(child, '  ↳ ');
    }
  }

  if (sumTotalNA > 0) {
    rows.push([
      'VARIOS',
      'N/A',
      'N/A (AGRUPADO)',
      'N/A',
      '—',
      `Bs. ${fmtBs(sumTotalNA)}`
    ]);
  }

  autoTable(doc, {
    startY: y,
    margin: { top: 43 },
    head: [['Inmueble', 'Nro/Local', 'Propietario', 'Identidad', 'Períodos', 'Total Bs']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [239, 246, 255], textColor: [30, 64, 175],
      fontStyle: 'bold', lineColor: [191, 219, 254], lineWidth: 0.2, halign: 'center', fontSize: 7.5
    },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 15 },
      2: { cellWidth: 55 },
      3: { cellWidth: 20 },
      4: { cellWidth: 42 },
      5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(data.pageNumber, (doc.internal as any).getNumberOfPages());
      }
    }
  });

  // Re-ajustar total pages (jsPDF workaround para total pages si ya se imprimieron)
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Ya lo dibujamos con el número correcto de página, no necesitamos parchear si ya usamos didDrawPage adecuadamente.
    // wait, drawHeader is called initially with (1, 1). We should overwrite it.
    doc.setFillColor(255, 255, 255);
    doc.rect(170, 34, 30, 4, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`Página ${i} de ${totalPages}   |   Nro.: ${docNro}`, 196, 36, { align: 'right' });
  }

  doc.save(`Estado_Cuenta_Condominio_${c.codigo}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generarPdfMultasCondominio(c: any, e: EstadoCuenta, cajero: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const docNro = Math.floor(100000 + Math.random() * 900000).toString();
  
  const drawHeader = (pageNumber: number, totalPages: number) => {
    try {
      if (logos.alcaldia) doc.addImage(logos.alcaldia, 'PNG', 14, 10, 20, 25, undefined, 'FAST');
      if (logos.instituto) doc.addImage(logos.instituto, 'PNG', 174, 10, 22, 22, undefined, 'FAST');
    } catch (err) {}

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE MULTAS CONDOMINIO', 105, 18, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    doc.text(`TASA VIGENTE HASTA: ${e.tasa}`, 105, 23, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    doc.setLineWidth(0.3);
    doc.line(14, 32, 196, 32);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generado por: ${cajero}`, 14, 36);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${pageNumber} de ${totalPages}   |   Nro.: ${docNro}`, 196, 36, { align: 'right' });
    doc.line(14, 38, 196, 38);
  };

  drawHeader(1, 1);
  let y = 43;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(c.nombre, 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Código: ${c.codigo}    |    RIF: ${c.identidad}`, 14, y);
  y += 5;
  
  doc.setDrawColor(210, 210, 210);
  doc.line(14, y, 196, y);
  doc.setDrawColor(0, 0, 0);
  y += 8;

  const rows: any[] = [];
  let totalMultas = 0;

  for (const r of e.renglones) {
    const sumMultas = r.deuda.multaBs + r.multaExtraBs + (r.multasManualesBs || 0);
    if (sumMultas > 0.01) {
      totalMultas += sumMultas;
      rows.push([
        r.inmueble || '',
        r.numero || 'N/A',
        r.propietario || 'N/A',
        r.identidad || 'N/A',
        r.periodos.map(fmtPeriodo).join(', '),
        `Bs. ${fmtBs(sumMultas)}`
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { top: 43 },
    head: [['Inmueble', 'Nro/Local', 'Propietario', 'Identidad', 'Períodos', 'Total Multas']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [254, 226, 226], textColor: [153, 27, 27],
      fontStyle: 'bold', lineColor: [252, 165, 165], lineWidth: 0.2, halign: 'center', fontSize: 7.5
    },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 15 },
      2: { cellWidth: 55 },
      3: { cellWidth: 20 },
      4: { cellWidth: 42 },
      5: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: [153, 27, 27] }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(data.pageNumber, (doc.internal as any).getNumberOfPages());
      }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(153, 27, 27);
  doc.text(`TOTAL MULTAS: Bs. ${fmtBs(totalMultas)}`, 196, finalY, { align: 'right' });

  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFillColor(255, 255, 255);
    doc.rect(170, 34, 30, 4, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(`Página ${i} de ${totalPages}   |   Nro.: ${docNro}`, 196, 36, { align: 'right' });
  }

  doc.save(`Multas_Condominio_${c.codigo}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
