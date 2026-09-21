const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/cobro-movil/page.tsx';
let c = fs.readFileSync(path, 'utf8');

const oldFn = `  const handleDownloadPDF = () => {
    if (!foundUser) return;
    const today = new Date();
    const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const cajero = localStorage.getItem('adminUser') || 'Cobrador';
    const MESES_FULL = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const getMes = (d: string) => {
      const p = d?.split('-'); 
      return p?.length >= 2 ? \`\${MESES_FULL[parseInt(p[1])-1]}-\${p[0]}\` : d || '—';
    };
    const inmsToProcess = userInms.length > 0
      ? userInms
      : [{ inmueble: 'Principal', tipo: 'Residencial', cant_inmuebles: 1, mmv_mes: 0 } as Inmueble];

    for (const inm of inmsToProcess) {`;

// Find and replace
const oldNorm = oldFn.replace(/\n/g, '\n');
const oldCRLF = oldFn.replace(/\n/g, '\r\n');

let found = false;
let startIdx = -1;
if (c.includes(oldCRLF)) { startIdx = c.indexOf(oldCRLF); found = true; }
else if (c.includes(oldNorm)) { startIdx = c.indexOf(oldNorm); found = true; }

if (!found) {
  // Try just the first line
  const firstLine = `  const handleDownloadPDF = () => {`;
  startIdx = c.indexOf(firstLine);
  if (startIdx === -1) { console.log('❌ Cannot find handleDownloadPDF'); process.exit(1); }
}

// Find end of function: the closing }; after doc.save
const endMarker1 = `doc.save(\`Estado_Cuenta_\${foundUser.Identidad}_\${codInm}_\${Date.now()}.pdf\`);\n    }\n  };`;
const endMarker1CRLF = `doc.save(\`Estado_Cuenta_\${foundUser.Identidad}_\${codInm}_\${Date.now()}.pdf\`);\r\n    }\r\n  };`;
let endIdx = c.indexOf(endMarker1CRLF, startIdx);
if (endIdx === -1) endIdx = c.indexOf(endMarker1, startIdx);
if (endIdx === -1) { console.log('❌ Cannot find end of handleDownloadPDF'); process.exit(1); }

const endPos = endIdx + (c.includes(endMarker1CRLF) ? endMarker1CRLF.length : endMarker1.length);

const newFn = `  const handleDownloadPDF = async () => {
    if (!foundUser) return;
    const today = new Date();
    const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const cajero = localStorage.getItem('adminUser') || 'Cobrador';
    const MESES_FULL = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const getMes = (d: string) => {
      const p = d?.split('-');
      return p?.length >= 2 ? \`\${MESES_FULL[parseInt(p[1])-1]}-\${p[0]}\` : d || '—';
    };

    // ── Consultar TODOS los meses pendientes directamente en Supabase ──
    let todasDeudas: Recibo[] = [];
    try {
      const idOrig = (foundUser.Identidad || '').trim();
      const idClean = idOrig.replace(/-/g, '').toUpperCase();
      const orFiltros = [\`identidad.eq.\${idOrig}\`];
      if (idClean !== idOrig) orFiltros.push(\`identidad.eq.\${idClean}\`);
      const { data: dbFacturas } = await supabase
        .from('facturas')
        .select('*')
        .or(orFiltros.join(','))
        .in('estado', ['Pendiente', 'Abonado'])
        .order('emision', { ascending: true });
      if (dbFacturas && dbFacturas.length > 0) {
        todasDeudas = dbFacturas as Recibo[];
      } else {
        const { data: fb } = await supabase
          .from('facturas').select('*')
          .eq('contribuyente', foundUser.Contribuyente || '')
          .in('estado', ['Pendiente', 'Abonado'])
          .order('emision', { ascending: true });
        if (fb) todasDeudas = fb as Recibo[];
      }
    } catch {
      todasDeudas = recibos;
    }

    // ── Usar solo el primer inmueble para el encabezado ──
    const inm = userInms.length > 0
      ? userInms[0]
      : { inmueble: 'Principal', tipo: 'Residencial', cant_inmuebles: 1, mmv_mes: 0 } as Inmueble;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const docNro = Math.floor(10000 + Math.random() * 90000);
    try { doc.addImage(logos.isma, 'JPEG', 14, 8, 42, 22); } catch(e) {}
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('ESTADO DE CUENTA', 105, 16, { align: 'center' });
    doc.setFontSize(9); doc.setTextColor(220, 38, 38);
    doc.text(\`TASA VIGENTE HASTA: \${tasaVigente}\`, 105, 23, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.3); doc.line(14, 32, 196, 32);
    doc.setFont('helvetica', 'italic');
    doc.text(\`Generado por: \${cajero}\`, 14, 38);
    doc.setFont('helvetica', 'normal');
    doc.text(\`Nro.: \${docNro}\`, 196, 38, { align: 'right' });
    doc.line(14, 41, 196, 41);
    const uso = inm.clasificacion || inm.tipo || 'Residencial';
    const area = (inm as any).area ? \`\${(inm as any).area} Mt2\` : '—';
    const codInm = inm.inmueble || 'Principal';
    doc.setFontSize(9);
    doc.text('Código:', 14, 47); doc.setFont('helvetica', 'bold'); doc.text(codInm, 30, 47);
    doc.setFont('helvetica', 'normal'); doc.text('Uso:', 65, 47);
    doc.setFont('helvetica', 'bold'); doc.text(uso, 76, 47);
    doc.setFont('helvetica', 'normal'); doc.text('Área Operativa:', 115, 47);
    doc.setFont('helvetica', 'bold'); doc.text(area, 142, 47);
    doc.setFont('helvetica', 'normal'); doc.text('Identidad:', 162, 47);
    doc.setFont('helvetica', 'bold'); doc.text(foundUser.Identidad, 180, 47);
    doc.setFont('helvetica', 'normal'); doc.text('Nombre o Razón Social:', 14, 54);
    doc.setFont('helvetica', 'bold'); doc.text(foundUser.Contribuyente, 62, 54);
    doc.setFont('helvetica', 'normal');
    const dirInm = (inm as any).direccion || foundUser.Direccion || '';
    const splitDir = doc.splitTextToSize(\`Dirección Inmueble: \${dirInm}\`, 182);
    doc.text(splitDir, 14, 60);
    let y = 60 + splitDir.length * 5 + 4;
    doc.line(14, y, 196, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('ESTADO DE CUENTA RESUMIDO', 105, y, { align: 'center' });
    y += 2; doc.line(14, y, 196, y); y += 6;

    const calcM = (f: Recibo): number => {
      if (f.estado === 'Abonado') return parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
      if (f.referencia?.startsWith('CM-') && tcmmv && tcmmv > 0) {
        const cant = parseFloat(String(inm.cant_inmuebles || 1));
        const mmv = parseFloat(String(inm.mmv_mes || 0));
        if (mmv > 0) return parseFloat((cant * mmv * tcmmv).toFixed(2));
      }
      return parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
    };

    const totalInm = todasDeudas.reduce((s, f) => s + calcM(f), 0);
    const mesesArr = [...new Set(todasDeudas.map(f => getMes(f.emision)))];
    const periodosLabel = mesesArr.join(', ') || '—';
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    [
      [\`Períodos Calculados (\${todasDeudas.length}):\`, periodosLabel],
      ['Monto Recolección Aseo Urbano Bs.', \`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}\`],
      ['Total Exento Bs.', \`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}\`],
      ['Base Imponible Bs.', 'Bs. 0,00'],
      ['IVA (16.00%) Bs.', 'Bs. 0,00'],
      ['Total estado de cuenta Bs.', \`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}\`],
    ].forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal'); doc.text(label, 14, y);
      doc.setFont('helvetica', 'bold'); doc.text(value, 196, y, { align: 'right' });
      y += 6;
    });
    doc.line(14, y, 196, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('TOTAL A PAGAR', 14, y);
    doc.text(\`Bs. \${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}\`, 196, y, { align: 'right' });
    y += 2; doc.line(14, y, 196, y); y += 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('ESTADO DE CUENTA DETALLADO', 105, y, { align: 'center' });
    y += 4;
    try {
      autoTable(doc, {
        startY: y,
        head: [['PERIODO', 'DETALLE', 'RECOLECCIÓN', 'INT REC', 'MULTA', 'IVA', 'TOTAL BS']],
        body: todasDeudas.map(f => {
          const m = calcM(f);
          const det = (inm as any).actividad_principal ? \`Aseo \${(inm.tipo || 'residencial').toLowerCase()}\` : 'Aseo residencial';
          return [f.emision || '—', det, m.toLocaleString('es-VE', {minimumFractionDigits:2}), '0,00','0,00','0,00', m.toLocaleString('es-VE', {minimumFractionDigits:2})];
        }),
        theme: 'grid',
        headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', lineColor:[0,0,0], lineWidth:0.3, halign:'center' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 0:{cellWidth:25}, 1:{cellWidth:48}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'}, 6:{halign:'right', fontStyle:'bold'} }
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    } catch(e) {}
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('INFORMACIÓN PARA PAGOS Y TRANSFERENCIAS', 105, y, { align: 'center' });
    y += 4; doc.line(14, y, 196, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text('Banco:  BANESCO (0134)', 14, y); y += 5;
    doc.text('Cta:    01340415144151031715', 14, y); y += 6;
    doc.setFont('helvetica', 'italic');
    doc.text('Pagos a nombre de: INST SOC MUN PARA EL AMBIENTE R.I.F.: G-200076739', 14, y);

    // ── NOTA EN ROJO AL PIE ──
    y += 10;
    doc.setLineWidth(0.3); doc.setDrawColor(220, 38, 38);
    doc.line(14, y, 196, y); y += 5;
    doc.setDrawColor(0, 0, 0); doc.setFontSize(8);
    doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(220, 38, 38);
    doc.text('IMPORTANTE: Los montos indicados en este estado de cuenta son validos UNICAMENTE para la fecha de emision del presente documento.', 105, y, { align: 'center' });
    y += 5;
    doc.text('La tasa de cambio BCV varia diariamente. Para cancelar en una fecha posterior, solicite un nuevo estado de cuenta actualizado.', 105, y, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);

    doc.save(\`Estado_Cuenta_\${foundUser.Identidad}_\${codInm}_\${Date.now()}.pdf\`);
  };`;

c = c.substring(0, startIdx) + newFn + c.substring(endPos);
fs.writeFileSync(path, c);
console.log('✅ handleDownloadPDF en cobro-movil actualizado: Supabase directo + todos los meses + nota en rojo al pie');
