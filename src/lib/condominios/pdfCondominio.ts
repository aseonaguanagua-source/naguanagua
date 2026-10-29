import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';
import { cleanClasificacionActividad } from '@/lib/calculos';
import { EstadoCuenta, RenglonEstado } from './servicio';
import * as M from './motor';
const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEur = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { 
  if (!p || p.indexOf('-') === -1) return p;
  const [y, m] = p.split('-'); 
  return `${MESES[parseInt(m) - 1]} ${y}`; 
};

function dibujarLogosPie(doc: jsPDF) {
  const yFoot = 282;
  try {
    if ((logos as any).lacava) {
      doc.addImage((logos as any).lacava, 'PNG', 14, yFoot, 34, 8.5, undefined, 'FAST');
    }
  } catch {}
  try {
    if ((logos as any).elizabeth) {
      doc.addImage((logos as any).elizabeth, 'PNG', 85, yFoot, 40, 7.5, undefined, 'FAST');
    }
  } catch {}
  try {
    if ((logos as any).naguanaguaTeQuiero) {
      doc.addImage((logos as any).naguanaguaTeQuiero, 'PNG', 162, yFoot - 2, 34, 12, undefined, 'FAST');
    }
  } catch {}
}

export function generarPdfEstadoCuentaCondominio(
  c: any, 
  e: EstadoCuenta, 
  cajero: string, 
  mostrarNA: boolean = true,
  moneda: 'BS' | 'EUR' = 'BS'
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const docNro = Math.floor(100000 + Math.random() * 900000).toString();
  const esEur = moneda === 'EUR';
  const tasaEur = parseFloat(String(e.tasa || 1)) || 1;
  const toCurr = (montoBs: number) => esEur ? (montoBs / tasaEur) : montoBs;
  const sym = esEur ? '€ ' : 'Bs. ';
  const fmtM = (montoBs: number) => `${sym}${fmtBs(toCurr(montoBs))}`;
  
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
  doc.text(`Dirección: ${c.direccion || 'Municipio Naguanagua, Estado Carabobo'}`, 14, y);
  y += 5;
  if (c.actividad) {
    doc.text(`Actividad: ${cleanClasificacionActividad(c.actividad)}`, 14, y);
    y += 5;
  }
  if (e.renglones.length === 1 && e.renglones[0].inmueble) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Local / Unidad: ${e.renglones[0].inmueble}${e.renglones[0].numero ? ` · ${e.renglones[0].numero}` : ''}`, 14, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
  }
  
  doc.setDrawColor(210, 210, 210);
  doc.line(14, y, 196, y);
  doc.setDrawColor(0, 0, 0);
  y += 5;

  // ── RESUMEN TOTALES ──
  doc.setFont('helvetica', 'bold');
  doc.text(`RESUMEN DE DEUDA TOTAL (${esEur ? 'EUROS €' : 'BOLÍVARES'})`, 105, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Aseo: ${fmtM(e.totales.baseBs)}`, 14, y);
  doc.text(`Multas: ${fmtM(e.totales.multaBs)}`, 70, y);
  doc.text(`IVA: ${fmtM(e.totales.ivaBs)}`, 130, y);
  y += 5;
  doc.text(`Retenciones: ${fmtM(e.totales.retencionBs)}`, 14, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL DEUDA: ${fmtM(e.totales.totalBs)}`, 130, y);
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
    const multasMonto = (r.deuda?.multaBs || 0) + (r.multaExtraBs || 0) + (r.multasManualesBs || 0);
    const aseoMonto = (r.deuda?.baseBs || 0) + (r.deuda?.ivaBs || 0);
    rows.push([
      indent + (r.inmueble || (r.clave === '__SIN_REGISTRAR__' ? 'SIN REGISTRAR' : '')),
      r.numero || (mostrarNA ? 'N/A' : ''),
      prop,
      id,
      r.periodos.map(fmtPeriodo).join(', '),
      fmtM(aseoMonto),
      fmtM(multasMonto),
      fmtM(r.totalBs)
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
      '—',
      '—',
      fmtM(sumTotalNA)
    ]);
  }

  const colHeadAseo = esEur ? 'Aseo (€)' : 'Aseo (Bs)';
  const colHeadMultas = esEur ? 'Multas (€)' : 'Multas (Bs)';
  const colHeadTotal = esEur ? 'Total (€)' : 'Total Bs';

  autoTable(doc, {
    startY: y,
    margin: { top: 43, bottom: 20 },
    head: [['Inmueble', 'Nro/Local', 'Propietario', 'Identidad', 'Períodos', colHeadAseo, colHeadMultas, colHeadTotal]],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: esEur ? [236, 253, 245] : [239, 246, 255], 
      textColor: esEur ? [6, 95, 70] : [30, 64, 175],
      fontStyle: 'bold', 
      lineColor: esEur ? [167, 243, 208] : [191, 219, 254], 
      lineWidth: 0.2, halign: 'center', fontSize: 6.8
    },
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 14 },
      2: { cellWidth: 44 },
      3: { cellWidth: 20 },
      4: { cellWidth: 32 },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 16, halign: 'right', fontStyle: 'bold' }
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
    doc.setFillColor(255, 255, 255);
    doc.rect(170, 34, 30, 4, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`Página ${i} de ${totalPages}   |   Nro.: ${docNro}`, 196, 36, { align: 'right' });
    dibujarLogosPie(doc);
  }

  doc.save(`Estado_Cuenta_Condominio_${c.codigo}_${esEur ? 'EUR_' : ''}${new Date().toISOString().slice(0, 10)}.pdf`);
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
    margin: { top: 43, bottom: 20 },
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
    dibujarLogosPie(doc);
  }

  doc.save(`Multas_Condominio_${c.codigo}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Genera el Estado de Cuenta individual de una Unidad / Local de condominio.
 * Muestra el desglose por mes/período, base, IVA, multas, retenciones y total a pagar.
 */
export async function generarPdfEstadoCuentaUnidad(
  c: any, 
  r: RenglonEstado, 
  tasa: number | string, 
  cajero: string,
  direccionContribuyente?: string,
  moneda: 'BS' | 'EUR' = 'BS'
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const docNro = Math.floor(100000 + Math.random() * 900000).toString();
  const esEur = moneda === 'EUR';
  const tasaEur = parseFloat(String(tasa || 1)) || 1;
  const toCurr = (montoBs: number) => esEur ? (montoBs / tasaEur) : montoBs;
  const sym = esEur ? '€ ' : 'Bs. ';
  const fmtM = (montoBs: number) => `${sym}${fmtBs(toCurr(montoBs))}`;

  // Buscar dirección fiscal del contribuyente si no viene dada
  let dirFinal = (direccionContribuyente || (r as any)?.direccion || '').trim();
  if (!dirFinal && (r.inmueble || r.identidad)) {
    try {
      const { supabase } = await import('@/lib/supabase');
      if (r.inmueble) {
        const { data: inm } = await supabase
          .from('inmuebles')
          .select('direccion')
          .eq('inmueble', r.inmueble)
          .maybeSingle();
        if (inm?.direccion && inm.direccion.trim().length > 3) {
          dirFinal = inm.direccion.trim();
        }
      }
      if (!dirFinal && r.identidad) {
        const { data: cont } = await supabase
          .from('contribuyentes')
          .select('direccion')
          .eq('identidad', r.identidad)
          .maybeSingle();
        if (cont?.direccion && cont.direccion.trim().length > 3) {
          dirFinal = cont.direccion.trim();
        }
      }
    } catch (e) {
      console.warn('[PDF] No se pudo obtener dirección del usuario:', e);
    }
  }

  const drawHeader = (pageNumber: number, totalPages: number) => {
    try {
      if (logos.alcaldia) doc.addImage(logos.alcaldia, 'PNG', 14, 10, 20, 25, undefined, 'FAST');
      if (logos.instituto) doc.addImage(logos.instituto, 'PNG', 174, 10, 22, 22, undefined, 'FAST');
    } catch (err) {}

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(esEur ? 'ESTADO DE CUENTA (EUROS €)' : 'ESTADO DE CUENTA', 105, 18, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38);
    doc.text(`TASA VIGENTE HASTA: ${new Date().toLocaleDateString('es-VE')}`, 105, 23, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    doc.setLineWidth(0.3);
    doc.line(14, 28, 196, 28);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generado por: ${cajero}`, 14, 32);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${pageNumber} de ${totalPages}   |   Nro.: ${docNro}`, 196, 32, { align: 'right' });
    doc.line(14, 34, 196, 34);
  };

  drawHeader(1, 1);
  let y = 39;

  // ── DATOS DEL CONTRIBUYENTE Y LOCAL ──
  const prop = r.propietario && r.propietario !== '' ? r.propietario : 'SIN PROPIETARIO REGISTRADO';
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Contribuyente:', 14, y);
  doc.setFont('helvetica', 'bold');
  const splitProp = doc.splitTextToSize(String(prop), 102);
  doc.text(splitProp, 38, y);

  doc.setFont('helvetica', 'normal');
  doc.text('R.I.F. / C.I.:', 145, y);
  doc.setFont('helvetica', 'bold');
  doc.text(r.identidad || 'N/A', 165, y);
  y += Math.max(5, splitProp.length * 4);

  doc.setFont('helvetica', 'normal');
  doc.text('Código Inmueble:', 14, y);
  doc.setFont('helvetica', 'bold');
  doc.text(r.inmueble || 'Principal', 40, y);

  const actLabel = cleanClasificacionActividad(r.actividad) || 'Servicio de Aseo Urbano';
  doc.setFont('helvetica', 'normal');
  doc.text('Actividad / Inmueble:', 95, y);
  doc.setFont('helvetica', 'bold');
  doc.text(String(actLabel).slice(0, 36), 130, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.text(`Condominio Matriz: ${c.nombre} (${c.codigo})  |  Local / Unidad: ${r.numero || 'N/A'}`, 14, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  const dirShow = dirFinal || c.direccion || 'Municipio Naguanagua, Estado Carabobo';
  const splitDir = doc.splitTextToSize(`Dirección Local/Inmueble: ${dirShow}`, 182);
  doc.text(splitDir, 14, y);
  y += (splitDir.length * 4) + 2;

  const tasaNum = parseFloat(String(tasa || 0)) || 993.21;
  const ucdValor = tasaNum * 57;
  const periodos = r.periodos || [];
  const porMes = r.deuda?.porMes || [];
  const mesesVencidos = periodos.length > 0 ? periodos.length : (r.deuda?.meses || 0);
  const periodoDesde = periodos.length > 0 ? fmtPeriodo(periodos[0]).toUpperCase() : '---';
  const periodoHasta = periodos.length > 0 ? fmtPeriodo(periodos[periodos.length - 1]).toUpperCase() : '---';

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Meses vencidos:', 14, y);
  doc.setFont('helvetica', 'bold');
  doc.text(String(mesesVencidos), 40, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Período:', 60, y);
  doc.setFont('helvetica', 'bold');
  doc.text(mesesVencidos > 0 ? `${periodoDesde} a ${periodoHasta}` : 'Al día', 74, y);
  doc.setFont('helvetica', 'normal');
  doc.text(esEur ? 'Valor del UCD (€):' : 'Valor del UCD (Bs):', 135, y);
  doc.setFont('helvetica', 'bold');
  doc.text(esEur ? `€ ${fmtBs(57)}` : fmtBs(ucdValor), 196, y, { align: 'right' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('Tasa Euro BCV:', 135, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`Bs. ${fmtBs(tasaNum)}`, 196, y, { align: 'right' });
  y += 3;

  doc.setDrawColor(210, 210, 210);
  doc.line(14, y, 196, y);
  doc.setDrawColor(0, 0, 0);
  y += 5;

  // ── RESUMEN OFICIAL DE LIQUIDACIÓN ──
  const sumMultas = (r.deuda?.multaBs || 0) + (r.multaExtraBs || 0) + (r.multasManualesBs || 0);
  const baseAseo = r.deuda?.baseBs || 0;
  const ivaBs = r.deuda?.ivaBs || 0;
  const retencionBs = r.deuda?.retencionBs || 0;
  const totalBrutoBs = Math.round((baseAseo + sumMultas + ivaBs) * 100) / 100;
  const totalNetoBs = r.totalBs || (totalBrutoBs - retencionBs);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(esEur ? 'ESTADO DE CUENTA RESUMIDO (€)' : 'ESTADO DE CUENTA RESUMIDO', 105, y, { align: 'center' });
  y += 2;
  doc.line(14, y, 196, y);
  y += 4;

  const resumenRows: Array<[string, string]> = [
    ['Períodos Calculados:', mesesVencidos > 0 ? `${periodoDesde} a ${periodoHasta} (${mesesVencidos} meses)` : 'Solvente / Al Día'],
    [`Monto Recolección Aseo Urbano ${esEur ? '€' : 'Bs.'}:`, fmtM(baseAseo)],
    [`Total Exento ${esEur ? '€' : 'Bs.'}:`, `${sym}0,00`],
    [`Base Imponible ${esEur ? '€' : 'Bs.'}:`, fmtM(baseAseo)],
    [`IVA (16.00%) ${esEur ? '€' : 'Bs.'}:`, fmtM(ivaBs)],
    [`Multas (Último mes sin multa) ${esEur ? '€' : 'Bs.'}:`, fmtM(sumMultas)],
    [`Total Estado de Cuenta ${esEur ? '€' : 'Bs.'}:`, fmtM(totalBrutoBs)],
    ['Total Estado de Cuenta UCD:', `${(totalBrutoBs / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} UCD`]
  ];

  if (retencionBs > 0) {
    resumenRows.push(
      [`IVA Retenido 75% (Agente de Retención) ${esEur ? '€' : 'Bs.'}:`, `- ${fmtM(retencionBs)}`],
      [`IVA a Cancelar (25%) ${esEur ? '€' : 'Bs.'}:`, fmtM(ivaBs - retencionBs)]
    );
  }

  doc.setFontSize(8);
  resumenRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(lbl, 14, y);
    doc.setFont('helvetica', 'bold');
    doc.text(val, 196, y, { align: 'right' });
    y += 4.5;
  });

  doc.line(14, y, 196, y);
  y += 5;

  // ── TOTAL A PAGAR HIGHLIGHT ──
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(retencionBs > 0 ? `TOTAL A CANCELAR (${esEur ? '€' : 'Bs.'} con retención)` : `TOTAL A PAGAR (${esEur ? 'EUROS €' : 'BOLÍVARES'})`, 14, y);
  doc.text(fmtM(totalNetoBs), 196, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 2;
  doc.line(14, y, 196, y);
  y += 5;

  // ── TABLA OFICIAL DETALLADA MES A MES ──
  const oficialRows: any[] = [];
  if (porMes.length > 0) {
    porMes.forEach((m: any, idx: number) => {
      const p = periodos[idx] || '';
      const [py, pm] = p.split('-');
      const mesFmt = pm && py ? `${pm}/${py}` : `Mes ${m.n}`;
      const totM = m.baseBs + m.multaBs + m.ivaBs;
      const ucdM = ucdValor > 0 ? (totM / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '-';
      oficialRows.push([
        { content: r.inmueble || r.numero || 'Local', styles: { fontStyle: 'bold' } },
        mesFmt,
        fmtBs(toCurr(m.baseBs)),
        '-',
        m.multaBs > 0 ? fmtBs(toCurr(m.multaBs)) : '-',
        fmtBs(toCurr(m.ivaBs)),
        fmtBs(toCurr(totM)),
        ucdM
      ]);
    });
  } else if (baseAseo > 0) {
    const totM = totalBrutoBs;
    const ucdM = ucdValor > 0 ? (totM / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '-';
    oficialRows.push([
      { content: r.inmueble || r.numero || 'Local', styles: { fontStyle: 'bold' } },
      mesesVencidos > 0 ? `${periodoDesde} a ${periodoHasta}` : 'Aseo Urbano',
      fmtBs(toCurr(baseAseo)),
      '-',
      sumMultas > 0 ? fmtBs(toCurr(sumMultas)) : '-',
      fmtBs(toCurr(ivaBs)),
      fmtBs(toCurr(totM)),
      ucdM
    ]);
  } else {
    oficialRows.push([{ content: 'Solvente — No posee períodos pendientes', colSpan: 8, styles: { halign: 'center' } }]);
  }

  // Multas adicionales / remanentes por períodos previos acumulados (ej. 35 multas adeudadas)
  if ((r.multaExtraBs || 0) > 0) {
    const mesesMultaEnAseo = (porMes || []).filter((m: any) => m.multaBs > 0).length;
    const mRemanentes = Math.max(0, (r.multaMeses || 0) - mesesMultaEnAseo);
    const cuotaRemanente = mRemanentes > 0 ? (r.multaExtraBs / mRemanentes) : r.multaExtraBs;
    const periodosPrevios = M.periodosMultasPrevias(r.pendienteDesde, mRemanentes);
    for (let k = 0; k < mRemanentes; k++) {
      const pPrev = periodosPrevios[k];
      const [py, pm] = pPrev ? pPrev.split('-') : ['', ''];
      const perLabel = pm && py ? `Multa ${pm}/${py}` : `Multa Período Previo ${k + 1}`;
      const totM = cuotaRemanente;
      const ucdM = ucdValor > 0 ? (totM / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '-';
      oficialRows.push([
        { content: r.inmueble || r.numero || 'Local', styles: { fontStyle: 'bold' } },
        perLabel,
        '0,00',
        '-',
        fmtBs(toCurr(totM)),
        '0,00',
        fmtBs(toCurr(totM)),
        ucdM
      ]);
    }
  }

  // Multas manuales si existen
  if (Array.isArray(r.multasManuales) && r.multasManuales.length > 0) {
    r.multasManuales.forEach((man: any) => {
      const ucdM = ucdValor > 0 ? (man.montoBs / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '-';
      oficialRows.push([
        { content: r.inmueble || 'Multa', styles: { fontStyle: 'bold' } },
        man.periodo ? fmtPeriodo(man.periodo) : 'Manual',
        '0,00',
        '-',
        fmtBs(toCurr(man.montoBs)),
        '0,00',
        fmtBs(toCurr(man.montoBs)),
        ucdM
      ]);
    });
  }

  const colTotalLabel = esEur ? 'TOTAL €' : 'TOTAL BS';

  autoTable(doc, {
    startY: y,
    margin: { top: 38, bottom: 20 },
    head: [['PROPIEDAD', 'MESES', 'SERV. ASEO', 'INT. MORA SERV. ASEO', 'MULTA IMPAGO', 'IVA', colTotalLabel, 'UCD']],
    body: oficialRows,
    foot: [
      [
        'TOTALES',
        `${mesesVencidos} mes(es)`,
        fmtBs(toCurr(baseAseo)),
        '-',
        fmtBs(toCurr(sumMultas)),
        fmtBs(toCurr(ivaBs)),
        fmtBs(toCurr(totalBrutoBs)),
        ucdValor > 0 ? (totalBrutoBs / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '-'
      ],
      ...(retencionBs > 0 ? [
        ['', 'IVA RETENIDO 75%', '', '', '', `- ${fmtBs(toCurr(retencionBs))}`, `- ${fmtBs(toCurr(retencionBs))}`, ucdValor > 0 ? `- ${(retencionBs / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : ''],
        ['', 'TOTAL A CANCELAR', '', '', '', fmtBs(toCurr(ivaBs - retencionBs)), fmtBs(toCurr(totalNetoBs)), ucdValor > 0 ? (totalNetoBs / ucdValor).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '']
      ] : [])
    ],
    theme: 'grid',
    headStyles: {
      fillColor: esEur ? [236, 253, 245] : [248, 250, 252], 
      textColor: esEur ? [6, 95, 70] : [15, 23, 42],
      fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center', fontSize: 7
    },
    footStyles: {
      fillColor: esEur ? [209, 250, 229] : [241, 245, 249], 
      textColor: [15, 23, 42],
      fontStyle: 'bold', lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 7, halign: 'right'
    },
    styles: { fontSize: 7, cellPadding: 1.3 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 18, halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right' }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(data.pageNumber, (doc.internal as any).getNumberOfPages());
      }
    }
  });

  y = (doc as any).lastAutoTable.finalY + 5;

  // ── INFORMACIÓN OFICIAL PARA PAGOS Y TRANSFERENCIAS ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('INFORMACIÓN PARA PAGOS Y TRANSFERENCIAS', 105, y, { align: 'center' });
  y += 2;
  doc.line(14, y, 196, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('1) Banco: BANCAMIGA (0172)  |  Cta: 01720110711101340717  |  Beneficiario: IAMEC BANCAMIGA  |  RIF: G-20008614-9', 14, y);
  y += 3.5;
  doc.text('2) Banco: BANESCO (0134)    |  Cta: 01341089590001008636  |  Beneficiario: IAMEC BANESCO    |  RIF: G-20008614-9', 14, y);
  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  const notaUCD = doc.splitTextToSize('UCD: Unidad de Cuenta Dinámica, equivalente a la tasa oficial del Euro publicada por el Banco Central de Venezuela multiplicada por 57 (Ordenanza de Aseo Urbano y Gestión Integral de Residuos del Municipio Naguanagua). El monto en bolívares se calcula con el valor del UCD vigente a la fecha de pago.', 182);
  doc.text(notaUCD, 14, y);
  y += notaUCD.length * 3 + 1;
  doc.setFont('helvetica', 'normal');

  // ── AVISO DE VIGENCIA DE TASA ──
  doc.setLineWidth(0.2);
  doc.setDrawColor(220, 38, 38);
  doc.line(14, y, 196, y);
  y += 3.5;
  doc.setDrawColor(0, 0, 0);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bolditalic');
  doc.setTextColor(220, 38, 38);
  doc.text('IMPORTANTE: Los montos indicados en este estado de cuenta son válidos ÚNICAMENTE para la fecha de emisión del presente documento.', 105, y, { align: 'center' });
  y += 3.5;
  doc.text('La tasa de cambio oficial BCV varía periódicamente. Para cancelar en fecha posterior, solicite un nuevo estado de cuenta actualizado.', 105, y, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFillColor(255, 255, 255);
    doc.rect(170, 30, 30, 4, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(`Página ${i} de ${totalPages}   |   Nro.: ${docNro}`, 196, 32, { align: 'right' });
    dibujarLogosPie(doc);
  }

  const codInm = (r.inmueble || r.numero || 'Unidad').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Estado_Cuenta_${codInm}_${c.codigo}_${esEur ? 'EUR_' : ''}${new Date().toISOString().slice(0, 10)}.pdf`);
}

