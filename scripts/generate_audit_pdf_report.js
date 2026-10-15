const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default || require('jspdf-autotable');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../reporte_auditoria_completa_datos.json'), 'utf8'));

async function buildPdf() {
  console.log('Generando PDF de auditoría integral...');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Paleta de colores corporativos
  const cNavy = [15, 30, 54];
  const cTeal = [0, 128, 128];
  const cGold = [197, 149, 44];
  const cDarkGray = [55, 65, 81];
  const cLightGray = [243, 244, 246];
  const cWhite = [255, 255, 255];
  const cRed = [185, 28, 28];
  const cGreen = [16, 122, 60];

  function addHeader(doc, title, subtitle) {
    doc.setFillColor(...cNavy);
    doc.rect(0, 0, pageWidth, 55, 'F');
    doc.setFillColor(...cGold);
    doc.rect(0, 55, pageWidth, 3, 'F');

    doc.setTextColor(...cWhite);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('ALCALDÍA BOLIVARIANA DE NAGUANAGUA', margin, 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 220, 240);
    doc.text('DIRECCIÓN DE HACIENDA Y SISTEMA DE RECAUDACIÓN TRIBUTARIA (SIGYR 2.0)', margin, 38);

    doc.setFontSize(8);
    doc.setTextColor(...cGold);
    doc.text('AUDITORÍA COMPARATIVA BD ANTERIOR VS ACTUAL', pageWidth - margin, 24, { align: 'right' });
    doc.setTextColor(200, 220, 240);
    doc.text(`Fecha: 14 de Octubre de 2026`, pageWidth - margin, 38, { align: 'right' });
  }

  function addFooter(doc, pageNum, totalPages) {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Documento Confidencial de Auditoría Técnica - Control Previo a Ejecución de Modificaciones', margin, pageHeight - 18);
    doc.text(`Página ${pageNum}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
  }

  // ==========================================
  // PÁGINA 1: PORTADA Y RESUMEN EJECUTIVO
  // ==========================================
  addHeader(doc);

  let y = 80;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...cNavy);
  doc.text('INFORME DE AUDITORÍA COMPARATIVA', margin, y);
  y += 18;
  doc.setFontSize(12);
  doc.setTextColor(...cTeal);
  doc.text('INTEGRIDAD DE IDENTIDADES, PREFIJOS E INMUEBLES POR CONTRIBUYENTE', margin, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...cDarkGray);
  const intro = 'El presente informe consolida los resultados del cruce exhaustivo entre la base de datos histórica del sistema anterior (SIGYR - 54.917 registros maestros) y la base de datos operativa actual en Supabase (51.513 inmuebles). El objetivo es responder rigurosamente si los contribuyentes con múltiples inmuebles conservaron la totalidad de sus propiedades y determinar el grado de alteración en prefijos (V, J, G, E) y sufijos de identidad antes de ejecutar cualquier script correctivo.';
  const splitIntro = doc.splitTextToSize(intro, pageWidth - margin * 2);
  doc.text(splitIntro, margin, y);
  y += splitIntro.length * 12 + 10;

  // TARJETAS KPI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...cNavy);
  doc.text('1. MÉTRICAS CLAVE Y CUADRO DE MANDO EJECUTIVO', margin, y);
  y += 12;

  const kpis = [
    { label: 'Inmuebles SIGYR (Histórico)', val: '54.917', color: cNavy },
    { label: 'Inmuebles Actuales (Supabase)', val: '51.513', color: cNavy },
    { label: 'Contribuyentes Multi-Inmueble (>1)', val: '4.499', color: cTeal },
    { label: 'Multi-Inmueble 100% Íntegros', val: '2.894 (64.3%)', color: cGreen },
    { label: 'Multi-Inmueble con Discrepancia', val: '1.605 (35.7%)', color: cRed },
    { label: 'Inmuebles Sufijados (-URB/-AURI)', val: '1.354', color: cRed },
    { label: 'Prefijos Alterados (Mismo Núm)', val: '220', color: [217, 119, 6] },
    { label: 'Inmuebles Sin Prefijo', val: '0 (Ninguno)', color: cGreen }
  ];

  const cardW = (pageWidth - margin * 2 - 15) / 2;
  const cardH = 34;

  kpis.forEach((kpi, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = margin + col * (cardW + 15);
    const cy = y + row * (cardH + 8);

    doc.setFillColor(...cLightGray);
    doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(cx, cy, cardW, cardH, 3, 3, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(kpi.label, cx + 8, cy + 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.val, cx + 8, cy + 27);
  });

  y += Math.ceil(kpis.length / 2) * (cardH + 8) + 15;

  // RESUMEN DE HALLAZGOS PRINCIPALES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...cNavy);
  doc.text('2. PRINCIPALES CONCLUSIONES DEL DIAGNÓSTICO', margin, y);
  y += 12;

  const puntos = [
    '• 64.3% de los contribuyentes con múltiples propiedades (2.894 de 4.499) mantienen todas sus propiedades activas y perfectamente vinculadas a su RIF/Cédula sin ningún problema.',
    '• La causa #1 de discrepancia (1.354 de 1.605 casos) es la "Sufijación Artificial": se le agregó "-URB..." o "-AURI..." al final de la cédula (ej. 403374864-URB005933), rompiendo la búsqueda por RIF en Contribuyentes.',
    '• Se identificaron exactamente 220 inmuebles donde el número de documento es idéntico al de SIGYR pero la letra del prefijo fue alterada (principalmente personas con V- a las que les pusieron J-).',
    '• En la pantalla de Contribuyentes (/admin/contribuyentes) existe un filtro de seguridad ("isCondoChild") que oculta a contribuyentes que poseen locales en condominios, provocando que salgan en Caja pero no en Contribuyentes.'
  ];

  puntos.forEach(p => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...cDarkGray);
    const sp = doc.splitTextToSize(p, pageWidth - margin * 2);
    doc.text(sp, margin, y);
    y += sp.length * 11 + 4;
  });

  addFooter(doc, 1, 4);

  // ==========================================
  // PÁGINA 2: ANÁLISIS DE PREFIJOS INCORRECTOS
  // ==========================================
  doc.addPage();
  addHeader(doc);
  y = 75;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...cNavy);
  doc.text('CAPÍTULO I: ANÁLISIS DE PREFIJOS DE IDENTIDAD ALTERADOS', margin, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...cDarkGray);
  const prefDesc = 'Se realizó un cotejo entre el tipo de documento oficial registrado en SIGYR (document_type_id: 1=V, 2=E, 3=J, 4=G) y el prefijo de la columna "identidad" en la base de datos actual. En 220 casos, el número numérico de la cédula/RIF es exactamente el mismo, pero el prefijo alfabético fue cambiado durante migraciones o registros manuales.';
  const spPref = doc.splitTextToSize(prefDesc, pageWidth - margin * 2);
  doc.text(spPref, margin, y);
  y += spPref.length * 11 + 8;

  // TABLA DE TRANSICIONES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...cTeal);
  doc.text('Distribución de Cambios de Prefijo:', margin, y);
  y += 6;

  const prefRows = Object.entries(data.prefTransitions).map(([trans, count]) => {
    let motivo = '';
    if (trans.includes('V (SIGYR) -> J')) motivo = 'Persona natural registrada como persona jurídica (J-) por error.';
    else if (trans.includes('E (SIGYR) -> J')) motivo = 'Extranjero registrado como persona jurídica (J-) por error.';
    else if (trans.includes('G (SIGYR) -> J')) motivo = 'Entidad pública (Gubernamental) clasificada erróneamente como empresa (J-).';
    else if (trans.includes('E (SIGYR) -> V')) motivo = 'Cédula de extranjero (E-) normalizada a venezolano (V-).';
    else if (trans.includes('V (SIGYR) -> E')) motivo = 'Cédula venezolana alterada a extranjero.';
    else if (trans.includes('J (SIGYR) -> V')) motivo = 'Empresa jurídica asignada erróneamente con prefijo V-.';

    return [trans, count.toString(), `${((count / data.totalConPrefijoIncorrecto) * 100).toFixed(1)}%`, motivo];
  });

  autoTable(doc, {
    startY: y,
    head: [['Transición de Prefijo', 'Casos', '% Total', 'Diagnóstico Técnico']],
    body: prefRows,
    theme: 'grid',
    headStyles: { fillColor: cNavy, textColor: cWhite, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, textColor: cDarkGray, cellPadding: 3 },
    tableWidth: 532,
    columnStyles: {
      0: { cellWidth: 130, fontStyle: 'bold' },
      1: { cellWidth: 45, halign: 'center' },
      2: { cellWidth: 45, halign: 'center' },
      3: { cellWidth: 312 }
    },
    margin: { left: margin, right: margin }
  });

  y = doc.lastAutoTable.finalY + 14;

  // CASOS EJEMPLARES DE PREFIJOS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...cTeal);
  doc.text('Muestra de Casos Reales Detectados con Prefijo Incorrecto:', margin, y);
  y += 6;

  const samplePrefRows = (data.wrongPrefixSample || []).slice(0, 10).map(r => [
    r.code,
    (r.supa_name || r.sigyr_name || '').slice(0, 30),
    r.sigyr_id,
    r.supa_id,
    `${r.sigyrPref} -> ${r.supaPref}`,
    r.estado || 'Activo'
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Inmueble', 'Contribuyente', 'Ident. SIGYR', 'Ident. Actual', 'Cambio', 'Estado']],
    body: samplePrefRows,
    theme: 'striped',
    headStyles: { fillColor: cTeal, textColor: cWhite, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: cDarkGray, cellPadding: 3 },
    tableWidth: 532,
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 172 },
      2: { cellWidth: 75 },
      3: { cellWidth: 75 },
      4: { cellWidth: 90, halign: 'center', textColor: cRed, fontStyle: 'bold' },
      5: { cellWidth: 60, halign: 'center' }
    },
    margin: { left: margin, right: margin }
  });

  addFooter(doc, 2, 4);

  // ==========================================
  // PÁGINA 3: SUFIJACIÓN ARTIFICIAL Y CAUSA DE PÉRDIDA EN CAJA/CONTRIBUYENTES
  // ==========================================
  doc.addPage();
  addHeader(doc);
  y = 75;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...cNavy);
  doc.text('CAPÍTULO II: SUFIJACIÓN ARTIFICIAL Y DESVINCULACIÓN DE INMUEBLES', margin, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...cDarkGray);
  const sufDesc = 'Se descubrieron 1.354 inmuebles cuya cédula/RIF en la tabla inmuebles contiene el código del inmueble anexado con un guión (por ejemplo: "403374864-URB005933"). Esto ocurrió en migraciones previas para evadir restricciones de unicidad en la base de datos antigua. Este artificio provoca directamente que al buscar al contribuyente por su RIF legal en Contribuyentes o en Caja, dichos inmuebles sean invisibles o figuren desvinculados.';
  const spSuf = doc.splitTextToSize(sufDesc, pageWidth - margin * 2);
  doc.text(spSuf, margin, y);
  y += spSuf.length * 11 + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...cTeal);
  doc.text('Ejemplos Representativos de Inmuebles Fragmentados por Sufijo:', margin, y);
  y += 6;

  const sampleSufRows = (data.sufijadosSample || []).slice(0, 12).map(r => [
    r.code,
    (r.contribuyente || '').slice(0, 34),
    r.supa_id,
    r.sigyr_doc,
    r.estado || 'Activo'
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Razón Social / Propietario', 'Identidad Dañada en BD Actual', 'RIF Original SIGYR', 'Estado']],
    body: sampleSufRows,
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9], textColor: cWhite, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: cDarkGray, cellPadding: 3 },
    tableWidth: 532,
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 172 },
      2: { cellWidth: 150, textColor: cRed, fontStyle: 'bold' },
      3: { cellWidth: 90, textColor: cGreen, fontStyle: 'bold' },
      4: { cellWidth: 60, halign: 'center' }
    },
    margin: { left: margin, right: margin }
  });

  y = doc.lastAutoTable.finalY + 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...cNavy);
  doc.text('¿POR QUÉ ALGUNOS CONTRIBUYENTES SALEN EN CAJA PERO NO EN CONTRIBUYENTES?', margin, y);
  y += 12;

  const pqTxt = [
    '1. Filtro Excluyente en Contribuyentes: En la pantalla de Contribuyentes (/admin/contribuyentes), el código fuente aplica un filtro "isCondoChild" que oculta a todo contribuyente que posea inmuebles filiales de condominios o centros comerciales. En Caja, en cambio, la búsqueda consulta directamente por código o RIF en la base de datos sin este filtro.',
    '2. Búsqueda por Código vs Búsqueda por RIF: Cuando un inmueble tiene la identidad alterada ("403374864-URB005933"), el cajero que busca por el código URB005933 lo encuentra de inmediato en Caja. Pero el funcionario que busca en Contribuyentes por el RIF "J-403374864" no obtiene ningún resultado porque en la base de datos no coincide la cadena de texto.',
    '3. Segmentación Activos / Inactivos: Contribuyentes muestra por defecto únicamente registros "Activos". Si el inmueble quedó marcado como Inactivo, solo aparece al cambiar expresamente a la pestaña "Inactivos", mientras que Caja por código lo localiza directamente.'
  ];

  pqTxt.forEach(p => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...cDarkGray);
    const sp = doc.splitTextToSize(p, pageWidth - margin * 2);
    doc.text(sp, margin, y);
    y += sp.length * 10 + 4;
  });

  addFooter(doc, 3, 4);

  // ==========================================
  // PÁGINA 4: PLAN DE ACCIÓN Y CONCLUSIONES
  // ==========================================
  doc.addPage();
  addHeader(doc);
  y = 75;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...cNavy);
  doc.text('CAPÍTULO III: PLAN DE SANEAMIENTO PROPUESTO (PREVIO APROBACIÓN)', margin, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...cDarkGray);
  const planDesc = 'Para corregir de forma definitiva y homogénea estas inconsistencias sin riesgo de alteración tributaria ni pérdida de pagos históricos, se ha diseñado el siguiente plan técnico escalonado:';
  doc.text(planDesc, margin, y);
  y += 14;

  const fases = [
    {
      num: 'FASE 1: SANEAMIENTO DE SUFIJOS ARTIFICIALES (1.354 Inmuebles)',
      color: cTeal,
      desc: 'Remover los sufijos "-URB..." y "-AURI..." de la columna identidad en la tabla inmuebles, restaurando el RIF canónico (ej. "J-403374864" en lugar de "403374864-URB005933"). Esto reagrupa automáticamente todas las propiedades bajo el mismo contribuyente.'
    },
    {
      num: 'FASE 2: CORRECCIÓN DE PREFIJOS ALFABÉTICOS (220 Inmuebles)',
      color: cNavy,
      desc: 'Restaurar el prefijo oficial verificado en SIGYR: transformar los 144 casos de V a J (personas naturales registradas con J), los 14 casos de G a J (entes públicos) y los casos E a V / V a E debidamente certificados, preservando la integridad del historial de pagos.'
    },
    {
      num: 'FASE 3: ELIMINACIÓN DEL FILTRO DE BLOQUEO EN CONTRIBUYENTES',
      color: [180, 83, 9],
      desc: 'Modificar el filtro del frontend en /admin/contribuyentes para que no oculte a los propietarios individuales de locales filiales de condominios. De esta manera, el 100% de los contribuyentes consultables en Caja serán exactamente los mismos visibles en Contribuyentes.'
    },
    {
      num: 'FASE 4: PROTOCOLO DE SEGURIDAD Y RESPALDOS',
      color: cGreen,
      desc: 'Ejecución en modo transacción con respaldo previo en archivo JSON de seguridad, registro en tabla de auditoría del sistema y verificación con reporte post-ejecución sin interrumpir la operación de taquilla.'
    }
  ];

  fases.forEach(f => {
    doc.setFillColor(...cLightGray);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 42, 3, 3, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 42, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...f.color);
    doc.text(f.num, margin + 8, y + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...cDarkGray);
    const spDesc = doc.splitTextToSize(f.desc, pageWidth - margin * 2 - 16);
    doc.text(spDesc, margin + 8, y + 24);

    y += 48;
  });

  y += 10;

  // FIRMA Y CONFORMIDAD
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...cNavy);
  doc.text('CONTROL Y CONFORMIDAD PREVIA A EJECUCIÓN', margin, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...cDarkGray);
  doc.text('Este informe ha sido generado para la revisión y autorización del Administrador del Sistema. Ninguna sentencia de actualización (UPDATE / DELETE) será ejecutada en la base de datos de producción hasta contar con su expresa instrucción de proceder.', margin, y, { maxWidth: pageWidth - margin * 2 });

  y += 50;

  const signW = 180;
  doc.setDrawColor(100, 100, 100);
  doc.line(margin + 40, y, margin + 40 + signW, y);
  doc.line(pageWidth - margin - 40 - signW, y, pageWidth - margin - 40, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...cNavy);
  doc.text('ING. DAVID ZARA / AUDITORÍA TÉCNICA', margin + 40 + signW / 2, y + 12, { align: 'center' });
  doc.text('ADMINISTRACIÓN MUNICIPAL / ALCALDÍA', pageWidth - margin - 40 - signW / 2, y + 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Equipo de Desarrollo & Bases de Datos', margin + 40 + signW / 2, y + 22, { align: 'center' });
  doc.text('Aprobación para Ejecución de Scripts', pageWidth - margin - 40 - signW / 2, y + 22, { align: 'center' });

  addFooter(doc, 4, 4);

  // Guardar archivo en carpeta de artefactos y en docs
  const outPathArtifact = '/Users/davidzara/.gemini/antigravity-ide/brain/77e0c192-7c65-4a9e-ad23-1267f7dc92d7/Informe_Auditoria_Identidades_Prefijos_SIGYR.pdf';
  const outPathWorkspace = path.join(__dirname, '../docs/Informe_Auditoria_Identidades_Prefijos_SIGYR.pdf');

  fs.mkdirSync(path.dirname(outPathWorkspace), { recursive: true });

  const pdfBytes = doc.output('arraybuffer');
  fs.writeFileSync(outPathArtifact, Buffer.from(pdfBytes));
  fs.writeFileSync(outPathWorkspace, Buffer.from(pdfBytes));

  console.log('PDF generado exitosamente en:');
  console.log('1.', outPathArtifact);
  console.log('2.', outPathWorkspace);
}

buildPdf().catch(console.error);
