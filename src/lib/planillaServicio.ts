// Planillas oficiales de Servicio Especial y Servicio Extraordinario (formato PLANILLAS.xlsx del IAMEC).
//   Especial:       TSE  = F.O.Es × NVE × FAEs (FAEs = 1)
//   Extraordinario: TSEX = C.E.V × NVE × F. llenado
//   Monto (Bs) = TOTAL (UCD) × Tasa Euro BCV del día
import jsPDF from 'jspdf';
import { logos } from './logosBase64';

export type CategoriaServicio = 'especial' | 'extraordinario';

/** Matriz F.O.Es (UCD) — hoja "CALCULO SERV ESPECIAL". */
export const TARIFAS_ESPECIAL = [
  { vehiculo: 'CAMION_350', label: 'Hasta 2 toneladas (Camión 350 / Volteo pequeño)', BAJA: 60, MEDIA: 80, ALTA: 100 },
  { vehiculo: 'CAMION_600', label: '2,1 a 4 toneladas (Camión 600 / Volteo mediano)', BAJA: 80, MEDIA: 100, ALTA: 120 },
  { vehiculo: 'CAMION_750', label: 'Más de 4,1 toneladas (Camión 750 / Volteo grande)', BAJA: 100, MEDIA: 120, ALTA: 140 },
  { vehiculo: 'COMPACTADOR', label: 'Camión compactador (uso exclusivo/especial)', BAJA: 200, MEDIA: 260, ALTA: 300 },
] as const;

/** C.E.V (UCD) y factor de llenado — hoja "CALCULO SERV EXTRAORDINARIO". */
export const TARIFAS_EXTRAORDINARIO = [
  { vehiculo: 'VOLTEO_1', label: 'Volteo 1 (de 3,5 a 5 toneladas)', capacidad: 7, nivel: 'MEDIA', factor: 0.5, ucd: 80 },
  { vehiculo: 'VOLTEO_2', label: 'Volteo 2 (de más de 5 toneladas)', capacidad: 10, nivel: 'MAXIMA', factor: 1, ucd: 120 },
] as const;

export type DatosPlanilla = {
  categoria: CategoriaServicio;
  fechaEmision?: string;
  referencia?: string;
  nombre?: string;
  identidad?: string;
  contacto?: string;
  telefono?: string;
  // Especial (evento)
  nombreEvento?: string;
  fechaEvento?: string;
  lugar?: string;
  horario?: string;
  aforo?: string | number;
  // Extraordinario
  direccion?: string;
  // Cálculo
  vehiculoLabel?: string;
  nivel?: string;
  valorUcd?: number | null;
  nve?: number | null;
  factor?: number | null;
  tasaEuro?: number | null;
};

export function calcularServicio(valorUcd: number, nve: number, factor: number, tasaEuro: number) {
  const total = Math.round(valorUcd * nve * factor * 10000) / 10000;
  return { total, montoBs: Math.round(total * tasaEuro * 100) / 100 };
}

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || isNaN(Number(n)) ? '' : Number(n).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

const fechaVE = (s?: string) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

/** Genera la planilla. Con datos vacíos produce la planilla en blanco para llenar a mano. */
export function generarPlanillaServicio(d: DatosPlanilla, descargar = true): jsPDF {
  const esp = d.categoria === 'especial';
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const L = 18, R = W - 18;

  // Encabezado
  try { doc.addImage(logos.iamec, 'PNG', L, 10, 38, 21); } catch { /* sin logo */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('ALCALDÍA DEL MUNICIPIO NAGUANAGUA — IAMEC', W / 2 + 12, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA · RIF: G-20008614-9', W / 2 + 12, 21, { align: 'center' });
  doc.text('Carretera Nacional Vía La Entrada, C.C. Río Sil, Nivel 2, Local 37, Bárbula, Naguanagua, Carabobo', W / 2 + 12, 25, { align: 'center' });

  doc.setFillColor(22, 101, 52); doc.rect(L, 35, R - L, 9, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(esp ? 'SERVICIO ESPECIAL' : 'SERVICIO EXTRAORDINARIO', W / 2, 41.3, { align: 'center' });
  doc.setTextColor(0);

  let y = 52;
  const campo = (etq: string, val?: string, x = L, w = R - L) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(etq, x, y);
    const tw = doc.getTextWidth(etq) + 2;
    doc.setFont('helvetica', 'normal');
    if (val) doc.text(doc.splitTextToSize(String(val), w - tw)[0], x + tw, y);
    doc.setDrawColor(160); doc.line(x + tw, y + 1.2, x + w, y + 1.2);
  };
  const seccion = (t: string) => {
    doc.setFillColor(236, 242, 238); doc.rect(L, y - 4.5, R - L, 6.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(t, L + 2, y); y += 9;
  };

  campo('FECHA DE EMISIÓN:', fechaVE(d.fechaEmision), L, 85);
  campo('REFERENCIA:', d.referencia, L + 95, R - L - 95);
  y += 10;

  seccion('DATOS DEL CLIENTE:');
  campo('NOMBRE / RAZÓN SOCIAL:', d.nombre); y += 8;
  campo('CÉDULA DE IDENTIDAD / RIF:', d.identidad); y += 8;
  campo('PERSONA DE CONTACTO:', d.contacto); y += 8;
  campo('NÚMERO DE TELÉFONO:', d.telefono); y += 12;

  if (esp) {
    seccion('DATOS DEL EVENTO:');
    campo('NOMBRE DEL EVENTO:', d.nombreEvento); y += 8;
    campo('FECHA:', fechaVE(d.fechaEvento), L, 80); campo('HORARIO:', d.horario, L + 90, R - L - 90); y += 8;
    campo('LUGAR:', d.lugar); y += 8;
    campo('AFORO:', d.aforo !== undefined && d.aforo !== null ? String(d.aforo) : '', L, 80); y += 12;
  } else {
    seccion('DATOS DEL SERVICIO:');
    campo('DIRECCIÓN:', d.direccion); y += 8;
    campo('FECHA:', fechaVE(d.fechaEvento), L, 80); campo('HORARIO:', d.horario, L + 90, R - L - 90); y += 12;
  }

  seccion(esp ? 'COSTO SERVICIO ESPECIAL' : 'COSTO SERVICIO EXTRAORDINARIO');
  if (d.vehiculoLabel) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(`Unidad: ${d.vehiculoLabel}${d.nivel ? `  ·  Nivel: ${d.nivel}` : ''}${d.tasaEuro ? `  ·  Tasa Euro BCV: Bs. ${fmt(d.tasaEuro)}` : ''}`, L, y - 2);
    y += 3;
  }
  const heads = esp ? ['F.O.Es', 'NVE', 'FAEs', 'TOTAL (UCD)', 'MONTO (Bs)'] : ['C.E.V', 'NVE', 'F. LLENADO', 'TOTAL (UCD)', 'MONTO (Bs)'];
  const hayCalc = d.valorUcd != null && d.nve != null && d.factor != null;
  const c = hayCalc && d.tasaEuro ? calcularServicio(d.valorUcd!, d.nve!, d.factor!, d.tasaEuro) : null;
  const vals = hayCalc
    ? [fmt(d.valorUcd, 0), fmt(d.nve, 0), fmt(d.factor, d.factor! % 1 ? 1 : 0), fmt(c ? c.total : d.valorUcd! * d.nve! * d.factor!, 2), c ? fmt(c.montoBs) : '']
    : ['', '', esp ? '1' : '', '', ''];
  const cw = (R - L) / 5;
  doc.setDrawColor(90); doc.setFontSize(9);
  heads.forEach((h, i) => {
    doc.setFillColor(22, 101, 52); doc.rect(L + i * cw, y, cw, 8, 'FD');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.text(h, L + i * cw + cw / 2, y + 5.3, { align: 'center' });
  });
  doc.setTextColor(0); doc.setFont('helvetica', 'normal');
  vals.forEach((v, i) => { doc.rect(L + i * cw, y + 8, cw, 10); doc.text(v, L + i * cw + cw / 2, y + 14.3, { align: 'center' }); });
  y += 24;

  doc.setFontSize(7.5); doc.setTextColor(80);
  doc.text(esp
    ? 'TSE = F.O.Es × NVE × FAEs.  F.O.Es: Factor Ordenanza Especial (Baja/Media/Alta, en UCD).  NVE: Número de viajes estimados.  FAEs = 1.'
    : 'TSEX = C.E.V × NVE × F. llenado.  C.E.V: Costo especializado por viaje (UCD).  NVE: Número de viajes estimados.  F. llenado: Media 0,5 / Máxima 1.', L, y);
  y += 4;
  doc.text('Monto (Bs) = Total (UCD) × Tasa Euro BCV vigente a la fecha de emisión.', L, y);
  doc.setTextColor(0);

  // Firmas
  y = Math.max(y + 28, 235);
  doc.setDrawColor(0);
  doc.line(L + 5, y, L + 70, y); doc.line(R - 70, y, R - 5, y);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text('Firma y Sello IAMEC', L + 37.5, y + 5, { align: 'center' });
  doc.text('Firma del Cliente / C.I.', R - 37.5, y + 5, { align: 'center' });

  if (descargar) {
    const base = esp ? 'Planilla_Servicio_Especial' : 'Planilla_Servicio_Extraordinario';
    doc.save(`${base}${d.identidad ? '_' + d.identidad.replace(/[^\w-]/g, '') : '_en_blanco'}${d.referencia ? '_' + d.referencia : ''}.pdf`);
  }
  return doc;
}
