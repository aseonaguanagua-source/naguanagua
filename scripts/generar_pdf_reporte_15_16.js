const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function generate() {
  console.log('Consultando pagos desde Supabase...');
  const { data: pagos, error } = await supabase
    .from('pagos_reportados')
    .select('*')
    .not('estado', 'in', '(Anulado,Reversado,Condonado)')
    .order('created_at', { ascending: false });

  if (error) { console.error('Error fetching pagos:', error); return; }

  // Filtrar pagos de ayer (15/10/2026) y hoy (16/10/2026)
  const pagosPeriodo = pagos.filter(p => {
    let d = p.detalles;
    if (typeof d === 'string') try { d = JSON.parse(d); } catch(e){}
    const fStr = (d?.fecha_transaccion || d?.fecha_pago || d?.fecha_banco || p.created_at || '').slice(0, 10);
    const cStr = (p.created_at || '').slice(0, 10);
    return fStr >= '2026-10-15' || cStr >= '2026-10-15';
  });

  // Orden cronológico ascendente
  pagosPeriodo.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  console.log('Total registros procesados:', pagosPeriodo.length);

  const doc = new PDFDocument({ margin: 30, size: 'LETTER' });
  const outputPath = '/Users/davidzara/Documents/naguanagua_zero/Reporte_Consolidado_Caja_15_16_Octubre_2026.pdf';
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const fBs = (num) => 'Bs. ' + (num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ==========================================
  // PÁGINA 1: PORTADA Y RESUMEN EJECUTIVO
  // ==========================================
  doc.rect(30, 30, 552, 732).strokeColor('#0f766e').lineWidth(1.5).stroke();

  // Banda superior
  doc.rect(31, 31, 550, 65).fillColor('#042f2e').fill();
  doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold')
     .text('ALCALDÍA BOLIVARIANA DE NAGUANAGUA', 30, 42, { align: 'center', width: 552 });
  doc.fontSize(10.5).font('Helvetica')
     .text('DIRECCIÓN DE HACIENDA Y RECAUDACIÓN — GESTIÓN TRIBUTARIA INTEGRAL', 30, 62, { align: 'center', width: 552 });
  doc.fontSize(9).font('Helvetica-Oblique').fillColor('#5eead4')
     .text('REPORTE CONSOLIDADO GENERAL DE RECAUDACIÓN EN CAJA (15 Y 16 DE OCTUBRE 2026)', 30, 77, { align: 'center', width: 552 });

  // Subtítulo
  let y = 112;
  doc.fillColor('#0f172a').fontSize(12.5).font('Helvetica-Bold')
     .text('RESUMEN GENERAL DE RECAUDACIÓN Y CUADRE', 50, y);
  doc.fontSize(8.5).font('Helvetica').fillColor('#64748b')
     .text('Período: 15 de Octubre de 2026 al 16 de Octubre de 2026 | Hora de emisión: 10:55 AM (Caracas)', 50, y + 16);

  // Tarjetas principales de métricas
  y = 145;
  const totalBs = pagosPeriodo.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
  const totalTransacciones = pagosPeriodo.length;

  // Tarjeta 1
  doc.roundedRect(50, y, 245, 58, 6).fillColor('#f0fdfa').strokeColor('#99f6e4').lineWidth(1).fillAndStroke();
  doc.fillColor('#0d9488').fontSize(8.5).font('Helvetica-Bold').text('TOTAL RECAUDADO CONSOLIDADO', 65, y + 12);
  doc.fillColor('#115e59').fontSize(15).font('Helvetica-Bold').text(fBs(totalBs), 65, y + 27);

  // Tarjeta 2
  doc.roundedRect(315, y, 245, 58, 6).fillColor('#f8fafc').strokeColor('#cbd5e1').lineWidth(1).fillAndStroke();
  doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text('TOTAL OPERACIONES COBRADAS', 330, y + 12);
  doc.fillColor('#0f172a').fontSize(15).font('Helvetica-Bold').text(totalTransacciones + ' Transacciones', 330, y + 27);

  // 1. Tabla por Forma de Pago
  y = 220;
  doc.fillColor('#0f172a').fontSize(10.5).font('Helvetica-Bold').text('1. DESGLOSE POR FORMA DE PAGO', 50, y);

  const porMetodo = {};
  const cantMetodo = {};
  pagosPeriodo.forEach(p => {
    let d = p.detalles;
    if (typeof d === 'string') try { d = JSON.parse(d); } catch(e){}
    let m = p.tipo || d?.metodo || 'Otros';
    if (m === 'Debito') m = 'Punto de Venta / Débito';
    if (m === 'TMD') m = 'Tarjeta Débito (TMD)';
    if (m === 'Credito') m = 'Tarjeta Crédito (TDC)';
    porMetodo[m] = (porMetodo[m] || 0) + (parseFloat(p.monto) || 0);
    cantMetodo[m] = (cantMetodo[m] || 0) + 1;
  });

  y += 16;
  doc.rect(50, y, 510, 18).fillColor('#0f766e').fill();
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
     .text('FORMA DE PAGO', 60, y + 5)
     .text('OPERACIONES', 280, y + 5, { align: 'center', width: 90 })
     .text('MONTO TOTAL (BS.)', 380, y + 5, { align: 'right', width: 90 })
     .text('% TOTAL', 480, y + 5, { align: 'right', width: 70 });

  y += 18;
  let fila = 0;
  const metodosSorted = Object.entries(porMetodo).sort((a, b) => b[1] - a[1]);
  for (const [m, total] of metodosSorted) {
    const bg = fila % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(50, y, 510, 16).fillColor(bg).fill();
    doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica')
       .text(m, 60, y + 4)
       .text(String(cantMetodo[m]), 280, y + 4, { align: 'center', width: 90 })
       .text(fBs(total), 380, y + 4, { align: 'right', width: 90 })
       .text(((total / totalBs) * 100).toFixed(1) + '%', 480, y + 4, { align: 'right', width: 70 });
    y += 16;
    fila++;
  }
  doc.rect(50, y, 510, 16).fillColor('#ccfbf1').fill();
  doc.fillColor('#115e59').fontSize(8).font('Helvetica-Bold')
     .text('TOTAL FORMAS DE PAGO', 60, y + 4)
     .text(String(totalTransacciones), 280, y + 4, { align: 'center', width: 90 })
     .text(fBs(totalBs), 380, y + 4, { align: 'right', width: 90 })
     .text('100.0%', 480, y + 4, { align: 'right', width: 70 });

  // 2. Tabla por Cajero / Taquilla
  y += 28;
  doc.fillColor('#0f172a').fontSize(10.5).font('Helvetica-Bold').text('2. RECAUDACIÓN POR CAJERO / TAQUILLA', 50, y);

  const porCajero = {};
  const cantCajero = {};
  pagosPeriodo.forEach(p => {
    let d = p.detalles;
    if (typeof d === 'string') try { d = JSON.parse(d); } catch(e){}
    let c = d?.cajero || d?.analista || 'Portal Web / Autogestión';
    porCajero[c] = (porCajero[c] || 0) + (parseFloat(p.monto) || 0);
    cantCajero[c] = (cantCajero[c] || 0) + 1;
  });

  y += 16;
  doc.rect(50, y, 510, 18).fillColor('#0f766e').fill();
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
     .text('OPERADOR / CAJERO / TAQUILLA', 60, y + 5)
     .text('RECIBOS', 280, y + 5, { align: 'center', width: 90 })
     .text('MONTO TOTAL (BS.)', 380, y + 5, { align: 'right', width: 90 })
     .text('% TOTAL', 480, y + 5, { align: 'right', width: 70 });

  y += 18;
  fila = 0;
  const cajerosSorted = Object.entries(porCajero).sort((a, b) => b[1] - a[1]);
  for (const [c, total] of cajerosSorted) {
    const bg = fila % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(50, y, 510, 15).fillColor(bg).fill();
    doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica')
       .text(c, 60, y + 3.5)
       .text(String(cantCajero[c]), 280, y + 3.5, { align: 'center', width: 90 })
       .text(fBs(total), 380, y + 3.5, { align: 'right', width: 90 })
       .text(((total / totalBs) * 100).toFixed(1) + '%', 480, y + 3.5, { align: 'right', width: 70 });
    y += 15;
    fila++;
  }
  doc.rect(50, y, 510, 16).fillColor('#ccfbf1').fill();
  doc.fillColor('#115e59').fontSize(8).font('Helvetica-Bold')
     .text('TOTAL RECAUDADO EN TAQUILLAS', 60, y + 4)
     .text(String(totalTransacciones), 280, y + 4, { align: 'center', width: 90 })
     .text(fBs(totalBs), 380, y + 4, { align: 'right', width: 90 })
     .text('100.0%', 480, y + 4, { align: 'right', width: 70 });

  // Pie de página Portada
  doc.fontSize(7.5).fillColor('#94a3b8').font('Helvetica')
     .text('Sistema de Gestión Tributaria Naguanagua — Generado automáticamente con datos en tiempo real de Supabase.', 50, 742, { align: 'center', width: 512 });

  // ==========================================
  // PÁGINAS 2 EN ADELANTE: DETALLE TRANSACCIONAL
  // ==========================================
  let pageNum = 2;
  const drawPageHeader = (pNum) => {
    doc.rect(30, 25, 552, 28).fillColor('#042f2e').fill();
    doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold')
       .text('REPORTE DETALLADO DE PAGOS EN CAJA — 15 Y 16 DE OCTUBRE 2026', 40, 34);
    doc.fontSize(8).font('Helvetica')
       .text('Página ' + pNum, 520, 34, { align: 'right', width: 50 });

    let ty = 58;
    doc.rect(30, ty, 552, 17).fillColor('#0f766e').fill();
    doc.fillColor('#ffffff').fontSize(7.2).font('Helvetica-Bold')
       .text('FECHA/HORA', 35, ty + 4.5, { width: 70 })
       .text('REFERENCIA', 105, ty + 4.5, { width: 55 })
       .text('RIF / CÉDULA', 160, ty + 4.5, { width: 65 })
       .text('CONTRIBUYENTE', 225, ty + 4.5, { width: 140 })
       .text('FORMA PAGO', 365, ty + 4.5, { width: 75 })
       .text('CAJERO', 440, ty + 4.5, { width: 55 })
       .text('MONTO (BS.)', 495, ty + 4.5, { align: 'right', width: 80 });
  };

  doc.addPage({ margin: 30, size: 'LETTER' });
  drawPageHeader(pageNum);

  let curY = 77;
  const rowHeight = 15;
  const maxRowsPerPage = 43;
  let rowsThisPage = 0;

  pagosPeriodo.forEach((p, idx) => {
    if (rowsThisPage >= maxRowsPerPage) {
      doc.addPage({ margin: 30, size: 'LETTER' });
      pageNum++;
      drawPageHeader(pageNum);
      curY = 77;
      rowsThisPage = 0;
    }

    let d = p.detalles;
    if (typeof d === 'string') try { d = JSON.parse(d); } catch(e){}

    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(30, curY, 552, rowHeight).fillColor(bg).fill();

    const fHora = (d?.fecha_transaccion || p.created_at || '').slice(0, 10) + ' ' + (d?.recibo_caja_at ? new Date(d.recibo_caja_at).toLocaleTimeString('es-VE', {hour:'2-digit', minute:'2-digit', hour12: true}) : '');
    const ref = String(p.referencia || d?.referencia || '-').slice(0, 10);
    const rif = String(p.identidad || '-').slice(0, 11);
    const nombre = String(d?.contribuyente || d?.contribuyente_nombre || d?.nombre || p.identidad || '-').slice(0, 26);
    let forma = String(p.tipo || d?.metodo || 'Transf.').slice(0, 14);
    if (forma.toLowerCase().includes('debito')) forma = 'Débito POS';
    const cajero = String(d?.cajero || d?.analista || '-').slice(0, 10);
    const monto = fBs(parseFloat(p.monto) || 0);

    doc.fillColor('#1e293b').fontSize(6.6).font('Helvetica')
       .text(fHora.slice(0, 16), 35, curY + 4, { width: 70 })
       .text(ref, 105, curY + 4, { width: 55 })
       .text(rif, 160, curY + 4, { width: 65 })
       .text(nombre, 225, curY + 4, { width: 140 })
       .text(forma, 365, curY + 4, { width: 75 })
       .text(cajero, 440, curY + 4, { width: 55 })
       .text(monto, 495, curY + 4, { align: 'right', width: 80 });

    curY += rowHeight;
    rowsThisPage++;
  });

  // Gran Total al final
  if (rowsThisPage + 4 > maxRowsPerPage) {
    doc.addPage({ margin: 30, size: 'LETTER' });
    pageNum++;
    drawPageHeader(pageNum);
    curY = 77;
  }

  curY += 10;
  doc.rect(30, curY, 552, 22).fillColor('#042f2e').fill();
  doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold')
     .text('GRAN TOTAL FINAL CONSOLIDADO (' + totalTransacciones + ' OPERACIONES COBRADAS)', 40, curY + 6.5)
     .text(fBs(totalBs), 400, curY + 6.5, { align: 'right', width: 175 });

  doc.end();

  stream.on('finish', () => {
    console.log('PDF generado exitosamente!');
    console.log('Ruta del archivo:', outputPath);
    console.log('Total de páginas:', pageNum);
    console.log('Tamaño del archivo:', (fs.statSync(outputPath).size / 1024).toFixed(1) + ' KB');
  });
}

generate();
