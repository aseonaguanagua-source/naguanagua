import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import type { DatosRecibo } from '@/lib/reciboMailer';

/**
 * PDF del recibo de pago (no fiscal) para adjuntar al correo.
 * Usa jsPDF en el servidor (sin navegador). Mismo contenido que el HTML del correo.
 */

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let logoCache: string | null | undefined;
function logoIamec(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'logos', 'iamec_pdf.png'));
    logoCache = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    logoCache = null; // si el archivo no viaja al servidor, el PDF sale sin logo
  }
  return logoCache;
}

export function construirReciboPdf(d: DatosRecibo): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = 0;

  // ── Encabezado ──
  doc.setFillColor(10, 74, 42);
  doc.rect(0, 0, W, 30, 'F');
  const logo = logoIamec();
  if (logo) { try { doc.addImage(logo, 'PNG', M, 5, 20, 20); } catch { /* logo opcional */ } }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ALCALDÍA DE NAGUANAGUA • IAMEC', W / 2, 13, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(220, 252, 231);
  doc.text('RECIBO DE PAGO • SERVICIO DE ASEO URBANO', W / 2, 20, { align: 'center' });
  doc.setFontSize(8);
  doc.text('R.I.F. G-20000147-3', W / 2, 25, { align: 'center' });
  y = 40;

  // ── Datos del contribuyente y del pago ──
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(doc.splitTextToSize(String(d.contribuyente || ''), W - 2 * M - 60), M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`C.I./R.I.F.: ${d.identidad}`, M, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`N° ${d.numeroRecibo}`, W - M, y, { align: 'right' });
  y += 12;

  const formaPago = [d.pago.tipo, d.pago.banco && d.pago.banco !== d.pago.tipo ? d.pago.banco : ''].filter(Boolean).join(' · ');
  const datos: [string, string][] = [
    ['Fecha de pago', d.fechaPago],
    ['Forma de pago', formaPago || '-'],
    ['Referencia', String(d.pago.referencia || '-')],
  ];
  if (d.det?.cajero) datos.push(['Caja', String(d.det.cajero)]);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(M, y, W - 2 * M, datos.length * 6 + 4, 2, 2, 'FD');
  doc.setFontSize(9);
  datos.forEach(([k, v], i) => {
    const yy = y + 6 + i * 6;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139); doc.text(`${k}:`, M + 4, yy);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42); doc.text(v, W - M - 4, yy, { align: 'right' });
  });
  y += datos.length * 6 + 10;

  // ── Tabla simple ──
  const tabla = (headers: string[], widths: number[], aligns: ('left' | 'right')[], rows: { cells: string[]; red?: number[] }[]) => {
    const x0 = M;
    const rowH = 6.5;
    const ensure = (h: number) => { if (y + h > H - 30) { doc.addPage(); y = 20; } };
    ensure(rowH * 2);
    doc.setFillColor(241, 245, 249);
    doc.rect(x0, y, W - 2 * M, rowH, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    let x = x0;
    headers.forEach((h, i) => { doc.text(h, aligns[i] === 'right' ? x + widths[i] - 2 : x + 2, y + 4.4, { align: aligns[i] }); x += widths[i]; });
    y += rowH;
    doc.setFont('helvetica', 'normal');
    rows.forEach(r => {
      const lines = r.cells.map((c, i) => doc.splitTextToSize(c, widths[i] - 4) as string[]);
      const h = Math.max(1, ...lines.map(l => l.length)) * 4 + 2.5;
      ensure(h);
      x = x0;
      lines.forEach((l, i) => {
        if (r.red?.includes(i)) doc.setTextColor(185, 28, 28); else doc.setTextColor(15, 23, 42);
        doc.text(l, aligns[i] === 'right' ? x + widths[i] - 2 : x + 2, y + 4.2, { align: aligns[i] });
        x += widths[i];
      });
      y += h;
      doc.setDrawColor(226, 232, 240);
      doc.line(x0, y, W - M, y);
    });
    y += 6;
  };

  const ancho = W - 2 * M;
  if (d.lineas.length > 0) {
    tabla(['Inmueble', 'Dirección', 'Concepto'], [30, ancho - 85, 55], ['left', 'left', 'right'],
      d.lineas.map(l => ({
        cells: [
          l.codigo,
          [l.direccion, l.uso].filter(Boolean).join(' · '),
          [l.meses > 0 ? `${l.meses} mes${l.meses === 1 ? '' : 'es'} de aseo urbano` : '', l.multa ? 'Multa por mora' : ''].filter(Boolean).join(' + '),
        ],
      })));
  }

  const dg = d.desglose;
  if (dg && dg.lineas.length > 0) {
    if (dg.periodoTexto) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
      doc.text(`Período cancelado: ${dg.periodoTexto}`, M, y); y += 5;
    }
    const varios = d.lineas.length > 1;
    const periodo = (l: any) => `${l.periodo}${varios ? ` (${l.codigo})` : ''}`;
    if (dg.cuadra) {
      const hayIva = dg.lineas.some(l => l.iva > 0);
      const headers = ['Período', 'Aseo', ...(hayIva ? ['IVA'] : []), 'Multa', 'Total'];
      const nNum = headers.length - 1;
      const wNum = 28;
      const widths = [ancho - wNum * nNum, ...Array(nNum).fill(wNum)];
      const aligns: ('left' | 'right')[] = ['left', ...Array(nNum).fill('right')];
      tabla(headers, widths, aligns, dg.lineas.map(l => {
        const cells = [periodo(l), l.base ? fmtBs(l.base) : '-', ...(hayIva ? [l.iva ? fmtBs(l.iva - l.retencion) : '-'] : []), l.multa ? fmtBs(l.multa) : '-', fmtBs(l.total)];
        return { cells, red: l.multa ? [cells.length - 2] : [] };
      }));
    } else {
      tabla(['Período', 'Concepto'], [ancho - 50, 50], ['left', 'right'],
        dg.lineas.map(l => ({ cells: [periodo(l), l.tipo === 'multa' ? 'Multa por mora' : 'Aseo urbano'] })));
    }
  }

  // ── Total ──
  if (y + 20 > H - 30) { doc.addPage(); y = 20; }
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(M, y, ancho, 12, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(6, 95, 70);
  doc.text('TOTAL PAGADO', M + 4, y + 7.8);
  doc.setFontSize(13); doc.setTextColor(22, 101, 52);
  doc.text(`Bs ${fmtBs(d.pago.monto)}`, W - M - 4, y + 8, { align: 'right' });
  y += 20;

  // ── Pie ──
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text('Este recibo es un comprobante de pago y no constituye factura fiscal.', W / 2, H - 18, { align: 'center' });
  doc.text('Instituto Autónomo Municipal de Ecosocialismo Naguanagua (IAMEC) • Naguanagua, Estado Carabobo', W / 2, H - 13, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}
