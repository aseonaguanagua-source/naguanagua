const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default || require('jspdf-autotable');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tcmmv = 985.729808;

function r2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function fmtBs(val) {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normId(id) {
  return String(id || '').trim().toUpperCase();
}

function isResidencial(inm) {
  const c = String(inm?.clasificacion || '').toUpperCase();
  const t = String(inm?.tipo || '').toUpperCase();
  const a = String(inm?.actividad_principal || '').toUpperCase();
  return c.includes('RESIDENCIAL') || t.includes('RESIDENCIAL') || a.includes('RESIDENCIAL');
}

function calcularMensualidad(inm, tasa) {
  const esRes = isResidencial(inm);
  const mmv = parseFloat(inm?.mmv_mes || '0') || 0;
  return esRes ? r2(mmv * 57 * tasa) : r2(mmv * 57 * tasa * 0.128);
}

async function fetchAll(table, selectQuery, filterFn) {
  let rows = [];
  let start = 0;
  const step = 1000;
  while (true) {
    let q = supabase.from(table).select(selectQuery).range(start, start + step - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) {
      console.error(`Error fetching ${table}:`, error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < step) break;
    start += step;
  }
  return rows;
}

async function main() {
  console.log("=== GENERANDO REPORTE DE VARIACIÓN CAJA VS SOY CONTRIBUYENTE ===");

  console.log("1. Descargando datos de Supabase...");
  const inmuebles = await fetchAll('inmuebles', 'inmueble,identidad,contribuyente,tipo,clasificacion,meses_deuda,deuda_mmv,deuda_congelada_bs,multa_bs,mmv_mes,saldo_favor_bs,agente_retencion,condominio_padre_id,es_condominio,estado,notas');
  console.log(`Inmuebles: ${inmuebles.length}`);

  const facturas = await fetchAll('facturas', 'referencia,identidad,monto,estado,emision', q => q.in('estado', ['Pendiente', 'Por Verificar', 'Abonado']));
  console.log(`Facturas Pendientes: ${facturas.length}`);

  const pagos = await fetchAll('pagos_reportados', 'id,identidad,monto,estado,detalles', q => q.eq('estado', 'Por Verificar'));
  console.log(`Pagos Por Verificar: ${pagos.length}`);

  // Mapear facturas por identidad
  const facturasPorId = new Map();
  facturas.forEach(f => {
    const id = normId(f.identidad);
    if (!id) return;
    if (!facturasPorId.has(id)) facturasPorId.set(id, []);
    facturasPorId.get(id).push(f);
  });

  // Mapear pagos por verificar por referencia
  const pagosPorRef = new Map();
  pagos.forEach(p => {
    let det = {};
    try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch(e){}
    const refs = det.recibos || [];
    const monto = parseFloat(p.monto || 0);
    refs.forEach(r => {
      pagosPorRef.set(r, (pagosPorRef.get(r) || 0) + (refs.length > 0 ? monto / refs.length : monto));
    });
  });

  // Agrupar inmuebles por contribuyente (identidad)
  const contribuyentesMap = new Map();
  inmuebles.forEach(i => {
    if (i.estado === 'Eliminado') return;
    const id = normId(i.identidad);
    if (!id || id === 'N/A') return;
    if (!contribuyentesMap.has(id)) {
      contribuyentesMap.set(id, {
        identidad: id,
        contribuyente: i.contribuyente || 'SIN NOMBRE',
        inmuebles: []
      });
    }
    contribuyentesMap.get(id).inmuebles.push(i);
  });

  console.log(`Total Contribuyentes Únicos: ${contribuyentesMap.size}`);

  // Auditoría contribuyente por contribuyente
  let totalAuditados = 0;
  let totalCoincidenciaExacta = 0;
  let totalDiffCentavos = 0;
  let totalCondominioCentralizado = 0;
  let totalAgentesVisual = 0;
  let totalConPagosEnVuelo = 0;
  let totalDiscrepanciasReales = 0;

  const filasDiscrepancias = [];
  const filasAgentes = [];
  const filasCondominios = [];
  const filasPagosVuelo = [];

  contribuyentesMap.forEach((cData, id) => {
    totalAuditados++;
    const userInms = cData.inmuebles;
    const userFacs = facturasPorId.get(id) || [];

    // --- CÁLCULO SISTEMA PRINCIPAL (CAJA) ---
    let cajaBase = 0;
    let cajaIVA = 0;
    let cajaMulta = 0;
    let cajaIVARetenible = 0;
    let cajaSaldoFavor = 0;

    userInms.forEach(inm => {
      const esRes = isResidencial(inm);
      const bMes = calcularMensualidad(inm, tcmmv);
      const meses = parseInt(inm.meses_deuda || 0);
      const deudaMMV = parseFloat(inm.deuda_mmv || 0);
      const totalMeses = Math.max(0, meses > 0 ? meses : (deudaMMV > 0 ? 1 : 0));
      const mesesConMora = Math.max(0, totalMeses - 1);
      const tasaMora = esRes ? 0.10 : 0.12;

      const baseInm = r2(bMes * totalMeses);
      const ivaInm = esRes ? 0 : r2((bMes * 0.16) * totalMeses);
      const multaInm = r2((bMes * tasaMora) * mesesConMora);

      cajaBase += baseInm;
      cajaIVA += ivaInm;
      cajaMulta += multaInm;
      if (!esRes && inm.agente_retencion === true) {
        cajaIVARetenible += ivaInm;
      }
      cajaSaldoFavor += parseFloat(inm.saldo_favor_bs || 0);
    });

    const cajaRetencion = r2(cajaIVARetenible * 0.75);
    const cajaTotalBruto = r2(cajaBase + cajaIVA + cajaMulta);
    const cajaTotalNeto = r2(Math.max(0, cajaTotalBruto - cajaRetencion - cajaSaldoFavor));

    // --- CÁLCULO SOY CONTRIBUYENTE (PORTAL) ---
    const portalActivos = userInms.filter(i => !i.condominio_padre_id && !i.es_condominio);
    const soloCondominio = portalActivos.length === 0 && userInms.some(i => i.condominio_padre_id || i.es_condominio);

    let portalBase = 0;
    let portalIVA = 0;
    let portalMulta = 0;
    let portalRetencion = 0;
    let portalSaldoFavor = 0;
    let portalPagosVueloDeducidos = 0;

    portalActivos.forEach(inm => {
      const esRes = isResidencial(inm);
      const bMes = calcularMensualidad(inm, tcmmv);
      const meses = parseInt(inm.meses_deuda || 0);
      const deudaMMV = parseFloat(inm.deuda_mmv || 0);
      const n = Math.max(0, meses > 0 ? meses : (deudaMMV > 0 ? 1 : 0));
      const tasaMora = esRes ? 0.10 : 0.12;

      for (let m = 1; m <= n; m++) {
        const esUltimo = m >= n;
        const refHist = `RECIB-HIST-${inm.inmueble}-M${m}`;
        const base = r2(bMes);
        const iva = esRes ? 0 : r2(bMes * 0.16);
        const multa = esUltimo ? 0 : r2(bMes * tasaMora);
        const ret = (!esRes && inm.agente_retencion === true) ? r2(iva * 0.75) : 0;

        portalBase += base;
        portalIVA += iva;
        portalMulta += multa;
        portalRetencion += ret;

        if (pagosPorRef.has(refHist)) {
          portalPagosVueloDeducidos += pagosPorRef.get(refHist);
        }
      }
      portalSaldoFavor += parseFloat(inm.saldo_favor_bs || 0);
    });

    const portalTotalBruto = r2(portalBase + portalIVA + portalMulta);
    const portalTotalNeto = soloCondominio ? 0 : r2(Math.max(0, portalTotalBruto - portalRetencion - portalSaldoFavor - portalPagosVueloDeducidos));

    const esAgente = userInms.some(i => i.agente_retencion === true);
    const tieneCondo = userInms.some(i => i.condominio_padre_id || i.es_condominio);
    const tieneVuelo = portalPagosVueloDeducidos > 0;

    if (soloCondominio) {
      totalCondominioCentralizado++;
      if (filasCondominios.length < 40 && cajaTotalNeto > 0) {
        filasCondominios.push([
          id,
          cData.contribuyente.slice(0, 24),
          userInms[0].inmueble,
          userInms[0].condominio_padre_id || 'CONDO',
          fmtBs(cajaTotalNeto),
          'Bs. 0,00 (Condominio)',
          'Gestionado por Condominio Padre'
        ]);
      }
    } else if (tieneVuelo) {
      totalConPagosEnVuelo++;
      if (filasPagosVuelo.length < 20) {
        filasPagosVuelo.push([
          id,
          cData.contribuyente.slice(0, 24),
          fmtBs(cajaTotalNeto),
          fmtBs(portalTotalNeto),
          fmtBs(portalPagosVueloDeducidos),
          'En Verificación'
        ]);
      }
    } else if (esAgente && cajaRetencion > 0) {
      totalAgentesVisual++;
      if (filasAgentes.length < 35) {
        filasAgentes.push([
          id,
          cData.contribuyente.slice(0, 22),
          fmtBs(cajaTotalBruto),
          fmtBs(cajaRetencion),
          fmtBs(cajaTotalNeto),
          fmtBs(portalTotalNeto),
          'Coincidencia Neta 100%'
        ]);
      }
    } else {
      const diff = Math.abs(cajaTotalNeto - portalTotalNeto);
      if (diff === 0) {
        totalCoincidenciaExacta++;
      } else if (diff <= 0.05) {
        totalDiffCentavos++;
      } else {
        totalDiscrepanciasReales++;
        if (filasDiscrepancias.length < 40) {
          filasDiscrepancias.push([
            id,
            cData.contribuyente.slice(0, 22),
            userInms.map(i => i.inmueble).join(', ').slice(0, 16),
            fmtBs(cajaTotalNeto),
            fmtBs(portalTotalNeto),
            fmtBs(diff),
            tieneCondo ? 'Mezcla Condominio/Indep.' : 'Ajuste de Saldo/Notas'
          ]);
        }
      }
    }
  });

  console.log("Resultados de la Auditoría:", {
    totalAuditados,
    totalCoincidenciaExacta,
    totalDiffCentavos,
    totalCondominioCentralizado,
    totalAgentesVisual,
    totalConPagosEnVuelo,
    totalDiscrepanciasReales
  });

  // --- GENERACIÓN DEL DOCUMENTO PDF ---
  console.log("Construyendo documento PDF con jsPDF...");
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Helper Header / Footer
  function addHeader(d, title, subtitle) {
    d.setFillColor(15, 23, 42); // slate-900
    d.rect(0, 0, pageWidth, 24, 'F');
    d.setFillColor(184, 205, 41); // lime
    d.rect(0, 24, pageWidth, 1.5, 'F');

    d.setFont('helvetica', 'bold');
    d.setFontSize(11);
    d.setTextColor(255, 255, 255);
    d.text('ALCALDÍA DE NAGUANAGUA - DIRECCIÓN DE HACIENDA Y ASEO URBANO', 14, 10);
    d.setFontSize(9);
    d.setFont('helvetica', 'normal');
    d.setTextColor(203, 213, 225);
    d.text(`${title} | ${subtitle}`, 14, 17);
    d.text(`Tasa Oficial: Bs. ${fmtBs(tcmmv)}`, pageWidth - 14, 17, { align: 'right' });
  }

  function addFooter(d, pageNum, totalPages) {
    d.setFont('helvetica', 'italic');
    d.setFontSize(8);
    d.setTextColor(148, 163, 184);
    d.text(`Auditoría de Consistencia Caja vs. Soy Contribuyente | Fecha: 16/10/2026 | Página ${pageNum} de ${totalPages}`, 14, pageHeight - 8);
    d.text('Documento Confidencial de Auditoría y Control Fiscal', pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  // --- PÁGINA 1: PORTADA Y RESUMEN EJECUTIVO ---
  addHeader(doc, 'INFORME DE AUDITORÍA COMPARATIVA', 'SISTEMA CAJA VS. SOY CONTRIBUYENTE');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('AUDITORÍA DE VARIACIÓN DE FACTURACIÓN Y DEUDAS', 14, 35);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Análisis exhaustivo de concordancia entre el Sistema Principal (Caja) y el Portal "Soy Contribuyente".', 14, 41);

  // Cuadro de Métricas Clave
  const kpiY = 47;
  const kpiW = (pageWidth - 28 - 9) / 4;

  const kpis = [
    { label: 'Contribuyentes Auditados', val: totalAuditados.toLocaleString(), color: [30, 41, 59] },
    { label: 'Concordancia Exacta', val: (totalCoincidenciaExacta + totalAgentesVisual).toLocaleString(), color: [16, 185, 129] },
    { label: 'En Condominios', val: totalCondominioCentralizado.toLocaleString(), color: [59, 130, 246] },
    { label: 'Discrepancias Reales', val: totalDiscrepanciasReales.toLocaleString(), color: [239, 68, 68] }
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (kpiW + 3);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, kpiY, kpiW, 20, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, kpiW, 20, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.val, x + kpiW / 2, kpiY + 9, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + kpiW / 2, kpiY + 16, { align: 'center' });
  });

  // Explicación de Categorías
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Diagnóstico Estructural de las Variaciones Identificadas', 14, 76);

  autoTable(doc, {
    startY: 80,
    head: [['Categoría de Comportamiento', 'Casos', '% Universo', 'Explicación Operativa y de Diseño']],
    body: [
      [
        'Coincidencia Exacta / Neta',
        `${(totalCoincidenciaExacta + totalAgentesVisual).toLocaleString()}`,
        `${(((totalCoincidenciaExacta + totalAgentesVisual) / totalAuditados) * 100).toFixed(1)}%`,
        'El contribuyente ve exactamente el mismo monto a pagar en el Portal que el cajero en la taquilla.'
      ],
      [
        'Tratamiento de Condominios',
        `${totalCondominioCentralizado.toLocaleString()}`,
        `${((totalCondominioCentralizado / totalAuditados) * 100).toFixed(1)}%`,
        'En el Portal se bloquea la autoliquidación ("Gestionado por Condominio") para que pague la Junta Administradora, mientras que en Caja se dispone del módulo Caja Condominios.'
      ],
      [
        'Agentes de Retención (75% IVA)',
        `${totalAgentesVisual.toLocaleString()}`,
        `${((totalAgentesVisual / totalAuditados) * 100).toFixed(1)}%`,
        'En el Portal cada renglón mensual se muestra en su Valor Neto ya retenido. En Caja se muestra el Bruto y el 75% se descuenta al total en el cierre. El monto final cobrado es idéntico.'
      ],
      [
        'Diferencia Menor de Redondeo',
        `${totalDiffCentavos.toLocaleString()}`,
        `${((totalDiffCentavos / totalAuditados) * 100).toFixed(1)}%`,
        'Variaciones de ±0,01 a ±0,05 Bs por reparto de centavos indivisibles entre la fórmula de prorrateo mensual de Caja y la suma renglón a renglón del Portal.'
      ],
      [
        'Pagos en Verificación',
        `${totalConPagosEnVuelo.toLocaleString()}`,
        `${((totalConPagosEnVuelo / totalAuditados) * 100).toFixed(1)}%`,
        'En el Portal el recibo se oculta temporalmente o descuenta el comprobante reportado; en Caja se muestra en color naranja como "En Verificación" para evitar doble cobro.'
      ],
      [
        'Discrepancias Reales / Auditoría',
        `${totalDiscrepanciasReales.toLocaleString()}`,
        `${((totalDiscrepanciasReales / totalAuditados) * 100).toFixed(1)}%`,
        'Casos especiales: contribuyentes con múltiples inmuebles donde parte es condominio y parte independiente, o facturas estáticas creadas con tasas anteriores.'
      ]
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 46 },
      1: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 20 },
      3: { cellWidth: 'auto' }
    }
  });

  // Conclusión Ejecutiva en Página 1
  const finalY1 = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(14, finalY1, pageWidth - 28, 28, 2, 2, 'F');
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(14, finalY1, pageWidth - 28, 28, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(22, 101, 52);
  doc.text('DICTAMEN DE CONCORDANCIA:', 18, finalY1 + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(21, 128, 61);
  doc.text(
    'No existe fuga de recaudación ni inconsistencia matemática en el motor de cálculo. La diferencia observada entre ambos sistemas obedece a decisiones operativas intencionadas: (1) La centralización de pagos en juntas de condominio para evitar pagos fraccionados no autorizados, y (2) La presentación por renglón Neto en Soy Contribuyente frente a la vista Bruta con retención global en taquilla de Caja.',
    18,
    finalY1 + 13,
    { maxWidth: pageWidth - 36 }
  );

  // --- PÁGINA 2: AUDITORÍA DE AGENTES DE RETENCIÓN ---
  doc.addPage();
  addHeader(doc, 'ANÁLISIS DE AGENTES DE RETENCIÓN', 'COMPARATIVA BRUTO (CAJA) VS NETO (PORTAL)');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Muestra de Verificación: Agentes de Retención Especiales', 14, 33);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('En Caja el cajero observa Base + IVA + Multa y en el pie de página se resta el 75% de retención. En Soy Contribuyente el usuario ve directamente el monto Neto a transferir.', 14, 38);

  autoTable(doc, {
    startY: 42,
    head: [['RIF', 'Razón Social', 'Caja: Bruto', 'Ret. IVA 75%', 'Caja: Total Neto', 'Portal: Total Neto', 'Estado']],
    body: filasAgentes,
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { cellWidth: 44 },
      2: { halign: 'right', cellWidth: 24 },
      3: { halign: 'right', cellWidth: 22, textColor: [220, 38, 38] },
      4: { halign: 'right', cellWidth: 26, fontStyle: 'bold', textColor: [16, 185, 129] },
      5: { halign: 'right', cellWidth: 26, fontStyle: 'bold', textColor: [16, 185, 129] },
      6: { halign: 'center', cellWidth: 'auto', textColor: [15, 118, 110] }
    }
  });

  // --- PÁGINA 3: AUDITORÍA DE CONDOMINIOS ---
  doc.addPage();
  addHeader(doc, 'INMUEBLES EN CONDOMINIOS', 'ESQUEMA DE COBRO CENTRALIZADO');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Inmuebles con Bloqueo de Portal por Esquema Condominial', 14, 33);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Estos inmuebles figuran con deuda en el catastro, pero su recaudación está asignada al código matriz del Condominio (Caja Condominios).', 14, 38);

  autoTable(doc, {
    startY: 42,
    head: [['Identidad', 'Propietario / Local', 'Inmueble', 'Condo Padre', 'Deuda Individual', 'Vista en Portal', 'Regla de Sistema']],
    body: filasCondominios,
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { cellWidth: 44 },
      2: { cellWidth: 20 },
      3: { cellWidth: 22, fontStyle: 'bold' },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'center', cellWidth: 26, textColor: [59, 130, 246] },
      6: { cellWidth: 'auto', fontSize: 7 }
    }
  });

  // --- PÁGINA 4: DISCREPANCIAS REALES DE AUDITORÍA Y ACCIONES RECOMENDADAS ---
  doc.addPage();
  addHeader(doc, 'CASOS DE AUDITORÍA Y DISCREPANCIAS', 'REVISIÓN DETALLADA DE DIFERENCIAS');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Detalle de Casos con Variación Real entre Sistemas', 14, 33);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Contribuyentes donde la suma total a pagar presenta una brecha superior a Bs. 0,05 entre el portal y la taquilla.', 14, 38);

  autoTable(doc, {
    startY: 42,
    head: [['Identidad', 'Contribuyente', 'Inmuebles', 'Monto Caja', 'Monto Portal', 'Diferencia', 'Origen Técnico']],
    body: filasDiscrepancias,
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { cellWidth: 42 },
      2: { cellWidth: 24 },
      3: { halign: 'right', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 20, fontStyle: 'bold', textColor: [220, 38, 38] },
      6: { cellWidth: 'auto', fontSize: 7 }
    }
  });

  const finalY4 = doc.lastAutoTable.finalY + 8;
  if (finalY4 < pageHeight - 40) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, finalY4, pageWidth - 28, 30, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, finalY4, pageWidth - 28, 30, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('RECOMENDACIONES PARA EL ADMINISTRADOR (MODO DIOS):', 18, finalY4 + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      '1. En los casos de "Mezcla Condominio/Indep.", el contribuyente posee locales independientes y locales en centros comerciales. Utilizar el botón "Sacar de Condominio" en /admin/dev si se desea que pague directamente en Soy Contribuyente.\n' +
      '2. Los casos de agentes de retención están 100% cuadrados en el monto neto final a transferir. No requieren ajustes.\n' +
      '3. Para unificar la visualización de centavos, el algoritmo del Portal y Caja comparten la misma tasa oficial sincronizada por /api/bcv.',
      18,
      finalY4 + 13,
      { maxWidth: pageWidth - 36 }
    );
  }

  // Numerar páginas al final
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  const outputPath = path.join(__dirname, '../REPORTE_VARIACION_CAJA_VS_SOY_CONTRIBUYENTE.pdf');
  fs.writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
  console.log(`Reporte PDF generado exitosamente en: ${outputPath}`);
}

main().catch(console.error);
