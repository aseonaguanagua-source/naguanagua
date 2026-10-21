// Planillas oficiales de Servicio Especial y Servicio Extraordinario (formato PLANILLAS.xlsx del IAMEC).
//   Especial:       TSE  = F.O.Es × NVE × FAEs (FAEs = 1)
//   Extraordinario: TSEX = C.E.V × NVE × F. llenado
//   Monto (Bs) = TOTAL (UCD) × Tasa Euro BCV del día
import jsPDF from 'jspdf';
import { logos } from './logosBase64';

export type CategoriaServicio = 'especial' | 'extraordinario' | 'inspeccion' | 'visto_bueno' | 'tala_poda';

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

/**
 * Resto de conceptos oficiales (hojas de PLANILLAS.xlsx del IAMEC). Todos en UCD/F.O. × Tasa Euro BCV.
 * Son los ÚNICOS servicios permitidos además de Especial/Extraordinario.
 */
export const CONCEPTOS_IAMEC = {
  /** Inspección técnica: 0,1 UCD por m² (hoja INSPECCIONES: 72,327 = 0,1 × 723,27). */
  inspeccionUcdPorM2: 0.1,
  vistoBueno: { VISTO_BUENO: { label: 'Visto Bueno Ambiental', fo: 15 }, VARIABLE: { label: 'Variable Ambiental', fo: 15 }, multaImpago: 30 },
  poda: { permiso: 15, multas: { '5': 7, '20': 50, 'MAS20': 100 } },
  tala: { permiso: 15, multas: { '5': 12, '20': 300, 'MAS20': 2000 } },
  tramosMulta: { '5': 'hasta 05 especies', '20': '06 a 20 especies', 'MAS20': 'más de 20 especies' },
} as const;

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
  montoBs?: number | null;
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
  const insp = d.categoria === 'inspeccion';
  const vb = d.categoria === 'visto_bueno';
  const tp = d.categoria === 'tala_poda';
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const L = 18, R = W - 18;

  // ── Encabezado Oficial IAMEC ──
  // Logo IAMEC a la izquierda sin solapamiento
  const logoW = 34, logoH = 19;
  try { doc.addImage(logos.iamec, 'PNG', L, 9, logoW, logoH); } catch { /* sin logo */ }

  // Código único destacado para cobro en caja a la derecha (ubicado limpiamente sin tapar logos ni renglones)
  const boxW = 50, boxH = 16.5;
  const boxX = R - boxW;
  const boxY = 10;
  if (d.referencia) {
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(22, 101, 52);
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(22, 101, 52);
    doc.text('CÓDIGO PARA CANCELAR EN CAJA', boxX + boxW / 2, boxY + 5.5, { align: 'center' });
    const refStr = String(d.referencia);
    doc.setFontSize(refStr.length > 18 ? 8 : (refStr.length > 14 ? 9 : 10));
    doc.setTextColor(15, 23, 42);
    doc.text(refStr, boxX + boxW / 2, boxY + 12.5, { align: 'center' });
    doc.setTextColor(0);
  }

  // Texto institucional en el espacio central libre (sin tocar logo ni código de caja)
  const xCenter = (L + logoW + 4 + boxX) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO', xCenter, 14, { align: 'center' });
  doc.setFontSize(9.5);
  doc.setTextColor(22, 101, 52);
  doc.text('IAMEC NAGUANAGUA', xCenter, 18.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('ESTADO CARABOBO · RIF: G-20008614-9', xCenter, 22.5, { align: 'center' });
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('C.C. Río Sil, Nivel 2, Local 37, Bárbula · Naguanagua', xCenter, 26, { align: 'center' });
  doc.setTextColor(0);

  const tituloBanner = insp
    ? 'SOLICITUD / ACTA DE INSPECCIÓN TÉCNICA AMBIENTAL'
    : esp
      ? 'SERVICIO ESPECIAL'
      : vb
        ? 'VISTO BUENO AMBIENTAL'
        : tp
          ? 'PERMISO DE PODA Y TALA'
          : 'SERVICIO EXTRAORDINARIO';
  doc.setFillColor(22, 101, 52); doc.rect(L, 34, R - L, 9, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(insp ? 11 : 13);
  doc.text(tituloBanner, W / 2, 40.3, { align: 'center' });
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

  campo('FECHA DE EMISIÓN:', fechaVE(d.fechaEmision), L, 80);
  campo('CÓDIGO DE PLANILLA / CAJA:', d.referencia, L + 85, R - L - 85);
  y += 10;

  seccion(insp ? 'DATOS DEL SOLICITANTE / INMUEBLE:' : 'DATOS DEL CLIENTE:');
  campo('NOMBRE / RAZÓN SOCIAL:', d.nombre); y += 8;
  campo('CÉDULA DE IDENTIDAD / RIF:', d.identidad); y += 8;
  campo('PERSONA DE CONTACTO:', d.contacto); y += 8;
  campo('NÚMERO DE TELÉFONO:', d.telefono); y += 12;

  if (insp) {
    seccion('DETALLES DE LA INSPECCIÓN:');
    campo('DIRECCIÓN DEL INMUEBLE:', d.direccion || d.lugar || 'Municipio Naguanagua'); y += 8;
    campo('MOTIVO / SOLICITUD:', d.nombreEvento || d.vehiculoLabel || 'Inspección Técnica Ambiental'); y += 8;
    if (d.factor != null && d.factor > 0) {
      campo('ÁREA DECLARADA (m²):', `${d.factor} m²`, L, 80);
      campo('TARIFA ORDENANZA:', '0,10 UCD / m²', L + 85, R - L - 85);
      y += 8;
    }
    y += 4;
  } else if (esp) {
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

  seccion(insp ? 'LIQUIDACIÓN DE TASA ADMINISTRATIVA' : (esp ? 'COSTO SERVICIO ESPECIAL' : 'COSTO SERVICIO EXTRAORDINARIO'));
  if (d.vehiculoLabel) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(`Concepto: ${d.vehiculoLabel}${d.tasaEuro ? `  ·  Tasa Euro BCV: Bs. ${fmt(d.tasaEuro)}` : ''}`, L, y - 2);
    y += 3;
  }
  const heads = insp
    ? ['TARIFA (UCD)', 'CANTIDAD / ÁREA', 'FACTOR', 'TOTAL (UCD)', 'MONTO (Bs)']
    : (esp ? ['F.O.Es', 'NVE', 'FAEs', 'TOTAL (UCD)', 'MONTO (Bs)'] : ['C.E.V', 'NVE', 'F. LLENADO', 'TOTAL (UCD)', 'MONTO (Bs)']);
  const hayCalc = (d.valorUcd != null && d.nve != null && d.factor != null) || (d.montoBs != null && d.montoBs > 0);
  let totalUcd = d.valorUcd != null && d.nve != null && d.factor != null
    ? Math.round(d.valorUcd * d.nve * d.factor * 10000) / 10000
    : 0;
  let montoBsFinal = d.montoBs != null && d.montoBs > 0
    ? d.montoBs
    : (d.tasaEuro ? Math.round(totalUcd * d.tasaEuro * 100) / 100 : 0);

  // Si se modificó el monto en Bs manualmente y tenemos tasa Euro, recalculamos totalUcd para que cuadre exactamente
  if (d.montoBs != null && d.montoBs > 0 && d.tasaEuro && d.tasaEuro > 0) {
    montoBsFinal = d.montoBs;
    totalUcd = Math.round((montoBsFinal / d.tasaEuro) * 100) / 100;
  }

  const vals = hayCalc
    ? [
        fmt(d.valorUcd, insp ? 2 : 0),
        insp ? (d.factor ? `${d.factor} m²` : '1') : fmt(d.nve, 0),
        fmt(d.factor, d.factor != null ? (d.factor % 1 ? 1 : 0) : 0),
        fmt(totalUcd, 2),
        fmt(montoBsFinal, 2)
      ]
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
  if (insp) {
    doc.text('Tasa administrativa de Inspección Técnica Ambiental según Ordenanza del IAMEC (0,10 UCD/m² o tarifa fijada).', L, y);
  } else if (esp) {
    doc.text('TSE = F.O.Es × NVE × FAEs.  F.O.Es: Factor Ordenanza Especial (en UCD).  NVE: Número de viajes estimados.  FAEs = 1.', L, y);
  } else {
    doc.text('TSEX = C.E.V × NVE × F. llenado.  C.E.V: Costo especializado por viaje (UCD).  NVE: Número de viajes estimados.  F. llenado: Factor de llenado según capacidad.', L, y);
  }
  y += 4;
  doc.text('Monto (Bs) = Total (UCD) × Tasa Euro BCV vigente a la fecha de emisión.', L, y);
  doc.setTextColor(0);

  // Firmas
  y = Math.max(y + 24, 226);
  doc.setDrawColor(0);
  doc.line(L + 5, y, L + 70, y); doc.line(R - 70, y, R - 5, y);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text(insp ? 'Inspector Técnico IAMEC' : 'Firma y Sello IAMEC', L + 37.5, y + 5, { align: 'center' });
  doc.text('Firma del Solicitante / Contribuyente', R - 37.5, y + 5, { align: 'center' });

  // ── LOGOS INSTITUCIONALES EN LA PARTE INFERIOR (SIN ALCALDÍA) ──
  const yLogos = 246;
  try {
    if ((logos as any).lacava) {
      doc.addImage((logos as any).lacava, 'PNG', L + 2, yLogos + 2, 42, 11);
    }
  } catch {}
  try {
    if ((logos as any).elizabeth) {
      doc.addImage((logos as any).elizabeth, 'PNG', R - 50, yLogos + 3, 48, 9.5);
    }
  } catch {}

  if (descargar) {
    const base = esp ? 'Planilla_Servicio_Especial' : 'Planilla_Servicio_Extraordinario';
    doc.save(`${base}${d.identidad ? '_' + d.identidad.replace(/[^\w-]/g, '') : '_en_blanco'}${d.referencia ? '_' + d.referencia : ''}.pdf`);
  }
  return doc;
}
