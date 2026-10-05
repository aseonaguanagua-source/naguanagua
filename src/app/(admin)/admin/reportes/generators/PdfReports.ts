import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';

// Helper para descarga confiable de PDF en todos los navegadores
export function descargarPdfBlob(doc: jsPDF, filename: string) {
  try {
    doc.save(filename);
  } catch (err) {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e2) {
      console.error('Error al descargar PDF:', e2);
      window.open(doc.output('bloburl'), '_blank');
    }
  }
}

// Helper de formato de moneda
const formatBs = (num: number) => {
  return 'Bs. ' + (num || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const generarCorteCajaPDF = (
  pagosFiltrados: any[], 
  contribuyentes: any[] = [], 
  fechaInicio: string = '',
  fechaFin: string = '',
  tasaEuro: number = 0,
  cajeroNombre: string = 'Todos'
) => {
  if (!pagosFiltrados || pagosFiltrados.length === 0) {
    alert("No hay pagos en el rango de fechas o cajero seleccionado.");
    return;
  }

  const doc = new jsPDF('p', 'pt', 'letter');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  // ==============================
  // HEADER
  // ==============================
  try {
    if (logos && logos.iamec) {
      doc.addImage(logos.iamec, 'PNG', 40, 20, 110, 40);
    }
  } catch (e) {
    console.warn("Logo no pudo cargarse en el PDF:", e);
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text("CORTE DE CAJA", pageWidth / 2, 40, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text("Reporte Detallado de Transacciones", pageWidth / 2, 55, { align: 'center' });

  // Divider 1
  doc.setLineWidth(1.5);
  doc.line(40, 70, pageWidth - 40, 70);

  // ==============================
  // METADATA
  // ==============================
  const startDate = fechaInicio ? new Date(fechaInicio + 'T00:00:00').toLocaleString('es-VE', {hour12: true, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : new Date().toLocaleString('es-VE');
  const endDate = fechaFin ? new Date(fechaFin + 'T23:59:59').toLocaleString('es-VE', {hour12: true, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : new Date().toLocaleString('es-VE');
  
  doc.setFontSize(9);
  doc.text(`Periodo: Desde ${startDate}`, 40, 85);
  doc.text(`Hasta ${endDate}`, pageWidth - 40, 85, { align: 'right' });
  doc.text(`Registros: ${pagosFiltrados.length}`, 40, 100);
  doc.text(`Cajero: ${cajeroNombre}`, pageWidth - 40, 100, { align: 'right' });

  // Divider 2
  doc.setLineWidth(0.5);
  doc.line(40, 105, pageWidth - 40, 105);

  // ==============================
  // RESUMEN DE OPERACIONES
  // ==============================
  const debitos = pagosFiltrados.filter(p => p.tipo?.toUpperCase().includes('DEBITO') || p.tipo === 'Punto de Venta');
  const transferencias = pagosFiltrados.filter(p => p.tipo?.toUpperCase().includes('TRANSFERENCIA'));
  // Asumiendo que hay un tipo "Saldo a Favor" o similar. Si no, lo dejamos vacío por ahora o deducimos de la data.
  const saldosAFavor = pagosFiltrados.filter(p => p.tipo?.toUpperCase().includes('SALDO'));

  const totalDebito = debitos.reduce((acc: number, p: any) => acc + parseFloat(p.monto || '0'), 0);
  const totalTransf = transferencias.reduce((acc: number, p: any) => acc + parseFloat(p.monto || '0'), 0);
  const totalSaldo = saldosAFavor.reduce((acc: number, p: any) => acc + parseFloat(p.monto || '0'), 0);
  const totalGeneral = totalDebito + totalTransf + totalSaldo;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text("RESUMEN DE OPERACIONES", pageWidth / 2, 130, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text("Debito", 40, 155);
  doc.text(formatBs(totalDebito), pageWidth - 40, 155, { align: 'right' });

  doc.text("TRANSFERENCIAS REGISTRADAS POR EL CAJERO", 40, 170);
  doc.text(formatBs(totalTransf), pageWidth - 40, 170, { align: 'right' });

  doc.text("Saldo a Favor", 40, 185);
  doc.text(formatBs(totalSaldo), pageWidth - 40, 185, { align: 'right' });

  // Divider for total
  doc.setLineWidth(1);
  doc.line(40, 195, pageWidth - 40, 195);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text("TOTAL GENERAL", 40, 210);
  doc.text(formatBs(totalGeneral), pageWidth - 40, 210, { align: 'right' });

  doc.setLineWidth(1.5);
  doc.line(40, 220, pageWidth - 40, 220);

  // ==============================
  // DETALLE DE TRANSACCIONES
  // ==============================
  doc.setFontSize(12);
  doc.text("DETALLE DE TRANSACCIONES", pageWidth / 2, 250, { align: 'center' });

  let startY = 270;

  // Helper function to draw sub-tables
  const drawSubTable = (title: string, dataItems: any[], columns: string[], rowMapper: (p: any, cInfo: any) => any[], footerTotal: number, footerLabel: string) => {
    if (!dataItems || dataItems.length === 0) return;
    
    // Check if we need a new page for the title
    if (startY > pageHeight - 100) {
      doc.addPage();
      startY = 40;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title, pageWidth / 2, startY, { align: 'center' });
    
    const body = dataItems.map(p => {
      const cInfo = (contribuyentes || []).find(c => c.Identidad === p.identidad || c.identidad === p.identidad) || {};
      return rowMapper(p, cInfo);
    });

    autoTable(doc, {
      startY: startY + 10,
      head: [columns],
      body: body,
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 2, textColor: [0, 0, 0] },
      headStyles: { fontStyle: 'bold', lineWidth: { top: 0.5, bottom: 0.5 }, lineColor: [0, 0, 0] },
      columnStyles: { [columns.length - 1]: { halign: 'right' } }, // El monto siempre a la derecha
    });

    let currentY = ((doc as any).lastAutoTable?.finalY || (startY + 50)) + 10;
    
    // Draw footer total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(footerLabel, pageWidth - 100, currentY, { align: 'right' });
    doc.text(formatBs(footerTotal).replace('Bs. ', ''), pageWidth - 40, currentY, { align: 'right' });
    
    currentY += 5;
    doc.setLineWidth(1);
    doc.line(40, currentY, pageWidth - 40, currentY);

    startY = currentY + 30;
  };

  // 1. Débito
  drawSubTable(
    "TRANSACCIONES CON TARJETA DE DEBITO", 
    debitos, 
    ["FECHA/HORA", "TIPO", "CONTRIBUYENTE", "RECIBO", "BANCO", "APROBACION", "LOTE", "MONTO"],
    (p, c) => [
      new Date(p.created_at).toLocaleString('es-VE', {hour12: false, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}),
      String(p.tipo || 'DEB').substring(0,3).toUpperCase(),
      String(c.Contribuyente || c.contribuyente || p.contribuyente || p.identidad || 'N/A').substring(0,35),
      String(p.factura_ref || p.referencia || 'N/A'),
      String(p.banco_origen || p.banco || 'N/A'),
      String(p.referencia || 'N/A'),
      '0390',
      parseFloat(p.monto || '0').toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ],
    totalDebito,
    "Total Debito:"
  );

  // 2. Transferencias
  drawSubTable(
    "TRANSFERENCIAS REGISTRADAS POR EL CAJERO", 
    transferencias, 
    ["FECHA/HORA", "BANCO ORIGEN", "BANCO DESTINO", "REFERENCIA", "MONTO Bs.", "MONTO EUR"],
    (p, c) => {
      let det: any = {};
      try { det = (typeof p.detalles === 'string' ? JSON.parse(p.detalles) : p.detalles) || {}; } catch(e) {}
      const bancoOrigen = String(p.banco || det.banco_origen || det.banco_emisor || 'N/A').substring(0,22);
      const bancoDestino = String(det.banco_destino || det.banco_receptor || 'N/A').substring(0,22);
      const montoNum = parseFloat(det.monto_conciliado || p.monto || '0');
      const tasaPagoEuro = det.tasa_euro || det.tasa_bcv_conciliacion || tasaEuro || 0;
      const montoEur = tasaPagoEuro > 0 ? (montoNum / tasaPagoEuro).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A';
      return [
        new Date(p.created_at).toLocaleString('es-VE', {hour12: false, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}),
        bancoOrigen,
        bancoDestino,
        String(p.referencia || 'N/A'),
        montoNum.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        montoEur
      ];
    },
    totalTransf,
    "Total Transferencias:"
  );

  // 3. Saldo a Favor
  drawSubTable(
    "SALDO A FAVOR APLICADO", 
    saldosAFavor, 
    ["FECHA/HORA", "TIPO", "CAJERO", "CONTRIBUYENTE", "APLICADO A NUMERO", "MONTO"],
    (p, c) => [
      new Date(p.created_at).toLocaleString('es-VE', {hour12: false, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}),
      String(p.tipo || 'SAL').substring(0,3).toUpperCase(),
      cajeroNombre,
      String(c.Contribuyente || c.contribuyente || p.contribuyente || p.identidad || 'N/A'),
      String(p.factura_ref || p.referencia || 'N/A'),
      parseFloat(p.monto || '0').toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ],
    totalSaldo,
    "Total Saldo a Favor:"
  );

  // ==============================
  // FOOTER APLICADO A TODAS LAS PÁGINAS
  // ==============================
  const pageCount = (doc as any).internal.getNumberOfPages();
  const emisionStr = new Date().toLocaleString('es-VE', {hour12: true, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'});
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setLineWidth(0.5);
    doc.line(40, pageHeight - 40, pageWidth - 40, pageHeight - 40);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Sistema de Gestion - ${new Date().getFullYear()}`, 40, pageHeight - 25);
    doc.text(`Emitido: ${emisionStr}`, 40, pageHeight - 15);

    doc.text(`Pagina ${i} de ${pageCount}`, pageWidth - 40, pageHeight - 25, { align: 'right' });
    doc.text(`Cajero: ${cajeroNombre}`, pageWidth - 40, pageHeight - 15, { align: 'right' });
  }

  descargarPdfBlob(doc, `Corte_Caja_${new Date().getTime()}.pdf`);
};

// ============================================
// INGRESO BANCARIO (SIN ALTERAR, SOLO ACTUALIZAR EXPORTS)
// ============================================

export const generarIngresoBancarioPDF = (
  pagosFiltrados: any[], 
  contribuyentes: any[], 
  tipo: 'Diario' | 'Semanal' | 'Mensual',
  fechaInicio: string,
  fechaFin: string
) => {
  if (pagosFiltrados.length === 0) {
    alert("No hay pagos en el rango de fechas seleccionado.");
    return;
  }

  const doc = new jsPDF('p', 'pt', 'letter');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  if (logos.iamec) {
    doc.addImage(logos.iamec, 'PNG', 40, 20, 110, 40);
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text("INGRESOS", pageWidth / 2, 40, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text("Banco: TODOS", pageWidth / 2, 55, { align: 'center' }); // O el banco filtrado

  doc.setLineWidth(1.5);
  doc.line(40, 70, pageWidth - 40, 70);

  const startDate = fechaInicio ? new Date(fechaInicio + 'T00:00:00').toLocaleString('es-VE', {hour12: true, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : new Date().toLocaleString('es-VE');
  const endDate = fechaFin ? new Date(fechaFin + 'T23:59:59').toLocaleString('es-VE', {hour12: true, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : new Date().toLocaleString('es-VE');
  
  doc.setFontSize(9);
  doc.text(`Periodo: Desde ${startDate}`, 40, 85);
  doc.text(`Hasta ${endDate}`, pageWidth - 40, 85, { align: 'right' });
  doc.text(`Registros: ${pagosFiltrados.length}`, 40, 100);
  doc.text(`Banco: TODOS`, pageWidth - 40, 100, { align: 'right' });

  doc.setLineWidth(0.5);
  doc.line(40, 105, pageWidth - 40, 105);

  const debitos = pagosFiltrados.filter(p => p.tipo?.toUpperCase().includes('DEBITO') || p.tipo === 'Punto de Venta');
  const transferencias = pagosFiltrados.filter(p => p.tipo?.toUpperCase().includes('TRANSFERENCIA'));

  const totalDebito = debitos.reduce((acc: number, p: any) => acc + parseFloat(p.monto || '0'), 0);
  const totalTransf = transferencias.reduce((acc: number, p: any) => acc + parseFloat(p.monto || '0'), 0);
  const totalGeneral = totalDebito + totalTransf;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text("RESUMEN DE INGRESOS", pageWidth / 2, 130, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text("Debito", 40, 155);
  doc.text(formatBs(totalDebito), pageWidth - 40, 155, { align: 'right' });

  doc.text("Transferencias", 40, 170);
  doc.text(formatBs(totalTransf), pageWidth - 40, 170, { align: 'right' });

  doc.setLineWidth(1);
  doc.line(40, 185, pageWidth - 40, 185);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text("TOTAL INGRESOS", 40, 200);
  doc.text(formatBs(totalGeneral), pageWidth - 40, 200, { align: 'right' });

  doc.setLineWidth(1.5);
  doc.line(40, 210, pageWidth - 40, 210);

  doc.setFontSize(12);
  doc.text("DETALLE DE INGRESOS", pageWidth / 2, 240, { align: 'center' });

  let startY = 260;

  const drawSubTable = (title: string, dataItems: any[], columns: string[], rowMapper: (p: any, cInfo: any) => any[], footerTotal: number, footerLabel: string) => {
    if (dataItems.length === 0) return;
    
    if (startY > pageHeight - 100) {
      doc.addPage();
      startY = 40;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title, pageWidth / 2, startY, { align: 'center' });
    
    const body = dataItems.map(p => {
      const cInfo = contribuyentes.find(c => c.Identidad === p.identidad) || {};
      return rowMapper(p, cInfo);
    });

    autoTable(doc, {
      startY: startY + 10,
      head: [columns],
      body: body,
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 2, textColor: [0, 0, 0] },
      headStyles: { fontStyle: 'bold', lineWidth: { top: 0.5, bottom: 0.5 }, lineColor: [0, 0, 0] },
      columnStyles: { [columns.length - 1]: { halign: 'right' } }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(footerLabel, pageWidth - 100, currentY, { align: 'right' });
    doc.text(parseFloat(footerTotal.toString()).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), pageWidth - 40, currentY, { align: 'right' });
    
    currentY += 5;
    doc.setLineWidth(1);
    doc.line(40, currentY, pageWidth - 40, currentY);

    startY = currentY + 30;
  };

  drawSubTable(
    "DEBITO", 
    debitos, 
    ["FECHA/HORA", "TIPO", "CONTRIBUYENTE", "RECIBO", "BANCO", "APROBACION", "LOTE", "MONTO"],
    (p, c) => [
      new Date(p.created_at).toLocaleString('es-VE', {hour12: false, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) || 'N/A',
      p.tipo.substring(0,3).toUpperCase(),
      (c.Contribuyente || p.identidad).substring(0,40),
      p.factura_ref || p.referencia || 'N/A',
      p.banco_origen || 'BANESCO - 0134',
      p.referencia || 'N/A',
      '0390',
      parseFloat(p.monto).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ],
    totalDebito,
    "Total Debito:"
  );

  drawSubTable(
    "TRANSFERENCIAS", 
    transferencias, 
    ["FECHA/HORA", "TIPO", "CONTRIBUYENTE", "RECIBO", "BANCO ORIGEN", "REFERENCIA", "MONTO"],
    (p, c) => [
      new Date(p.created_at).toLocaleString('es-VE', {hour12: false, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) || 'N/A',
      p.tipo.substring(0,3).toUpperCase(),
      (c.Contribuyente || p.identidad).substring(0,40),
      p.factura_ref || p.referencia || 'N/A',
      (p.banco_origen || 'N/A').substring(0,20),
      p.referencia || 'N/A',
      parseFloat(p.monto).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ],
    totalTransf,
    "Total Transferencias:"
  );

  const pageCount = (doc as any).internal.getNumberOfPages();
  const emisionStr = new Date().toLocaleString('es-VE', {hour12: true, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'});
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setLineWidth(0.5);
    doc.line(40, pageHeight - 40, pageWidth - 40, pageHeight - 40);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Sistema de Gestion - ${new Date().getFullYear()}`, 40, pageHeight - 25);
    doc.text(`Emitido: ${emisionStr}`, 40, pageHeight - 15);

    doc.text(`Pagina ${i} de ${pageCount}`, pageWidth - 40, pageHeight - 25, { align: 'right' });
    doc.text(`Cajero: N/A`, pageWidth - 40, pageHeight - 15, { align: 'right' });
  }

  doc.save(`Ingreso_Bancario_${tipo}_${new Date().getTime()}.pdf`);
};


