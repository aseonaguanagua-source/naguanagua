const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/estado-cuenta/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// Find and replace the conceptos block inside handleOpenRecibo
// The current code builds only 1 concepto from the clicked row.
// We need to:
// 1. Query ALL facturas for this contributor (same estados)
// 2. Build conceptos array from all of them (sorted by emision)
// 3. Sum them all for total

const oldBlock = `    const descripcionConcepto = esAbono
      ? \`ABONO PARCIAL - Aseo Residencial/Comercial. Mes: \${mesTexto}\`
      : \`Servicio Aseo Residencial/Comercial. Correspondiente al mes de: \${mesTexto}\`;

    setSelectedRecibo({
      reciboNo: row.referencia ? row.referencia.split('-').pop()?.padStart(7, '0') : '0000001',
      controlWeb: (row.estado === 'Pagado' || esAbono) ? 'WEB-0000001' : '',
      fechaEmision: row.emision || new Date().toISOString().split('T')[0],
      codContribuyente: codContrib,
      razonSocial,
      domicilioFiscal: direccionFiscal,
      rifCi: rifCiReal,
      caja: cajeroActivo,
      conceptos: [{
        descripcion: descripcionConcepto,
        precioUnit: montoNumerico,
        total: montoNumerico
      }],
      subTotal: montoNumerico,
      exento: montoNumerico,
      iva: 0,
      total: montoNumerico,
      formaPago: formaPagoStr,
      banco: bancoReal,
      referencia: referenciaReal,
      esAbono,
      montoCancelado,
      montoPendiente,
      historialPagos: typeof historialPagos !== 'undefined' ? historialPagos : undefined,
      tasaBcv: tasaBcvAplicada,
    });`;

const newBlock = `    // ── Construir conceptos con TODOS los meses del contribuyente ──
    // Si el recibo ya fue pagado o es abono, mostrar solo ese mes
    // Si es Pendiente/Por Verificar, mostrar todos los meses pendientes del contribuyente
    const MESES_TXT = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const getMesTxt = (emision: string) => {
      if (!emision) return '---';
      const parts = emision.split('-');
      if (parts.length >= 2) return \`\${MESES_TXT[parseInt(parts[1])-1]} \${parts[0]}\`;
      return emision;
    };

    let conceptos: { descripcion: string; precioUnit: number; total: number }[] = [];
    let totalConceptos = montoNumerico;

    if (!esAbono && (row.estado === 'Pendiente' || row.estado === 'Por Verificar' || row.estado === 'Abonado')) {
      // Buscar TODOS los meses pendientes del mismo contribuyente
      try {
        const idBusc = (row.identidad || '').trim();
        const idClean = idBusc.replace(/-/g, '').toUpperCase();
        const { data: todasFacturas } = await supabase
          .from('facturas')
          .select('*')
          .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
          .or(\`identidad.eq.\${idBusc},identidad.eq.\${idClean}\`)
          .order('emision', { ascending: true });

        if (todasFacturas && todasFacturas.length > 0) {
          // Calcular monto para cada factura usando tcmmv si está disponible
          const userInmsForAll = (inmuebles as any[]).filter((inm: any) =>
            (inm.identidad || '').replace(/-/g,'').toUpperCase() === idClean
          );
          conceptos = todasFacturas.map((f: any) => {
            let mF = parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
            if (tcmmv && tcmmv > 0 && userInmsForAll.length > 0) {
              if (f.referencia?.startsWith('CM-')) {
                let mmv = 0;
                userInmsForAll.forEach((inm: any) => {
                  mmv += parseFloat(inm.cant_inmuebles || 1) * parseFloat(inm.mmv_mes || 0);
                });
                if (mmv > 0) mF = parseFloat((mmv * tcmmv).toFixed(2));
              } else if (f.referencia?.startsWith('RECIB-')) {
                let deuda = 0;
                userInmsForAll.forEach((inm: any) => { deuda += parseFloat(inm.deuda_mmv || 0); });
                if (deuda > 0) mF = parseFloat((deuda * tcmmv).toFixed(2));
              }
            }
            return {
              descripcion: \`Servicio Aseo Residencial/Comercial. Correspondiente al mes de: \${getMesTxt(f.emision)}\`,
              precioUnit: mF,
              total: mF
            };
          });
          totalConceptos = conceptos.reduce((s, cp) => s + cp.total, 0);
        }
      } catch(e) { console.warn('Error cargando todos los meses:', e); }
    }

    // Fallback si no se cargaron meses: usar solo el mes del recibo clickeado
    if (conceptos.length === 0) {
      const descripcionConcepto = esAbono
        ? \`ABONO PARCIAL - Aseo Residencial/Comercial. Mes: \${mesTexto}\`
        : \`Servicio Aseo Residencial/Comercial. Correspondiente al mes de: \${mesTexto}\`;
      conceptos = [{ descripcion: descripcionConcepto, precioUnit: montoNumerico, total: montoNumerico }];
      totalConceptos = montoNumerico;
    }

    setSelectedRecibo({
      reciboNo: row.referencia ? row.referencia.split('-').pop()?.padStart(7, '0') : '0000001',
      controlWeb: (row.estado === 'Pagado' || esAbono) ? 'WEB-0000001' : '',
      fechaEmision: row.emision || new Date().toISOString().split('T')[0],
      codContribuyente: codContrib,
      razonSocial,
      domicilioFiscal: direccionFiscal,
      rifCi: rifCiReal,
      caja: cajeroActivo,
      conceptos,
      subTotal: totalConceptos,
      exento: totalConceptos,
      iva: 0,
      total: totalConceptos,
      formaPago: formaPagoStr,
      banco: bancoReal,
      referencia: referenciaReal,
      esAbono,
      montoCancelado,
      montoPendiente,
      historialPagos: typeof historialPagos !== 'undefined' ? historialPagos : undefined,
      tasaBcv: tasaBcvAplicada,
    });`;

// Handle CRLF
const oldCRLF = oldBlock.replace(/\n/g, '\r\n');
if (c.includes(oldCRLF)) {
  c = c.replace(oldCRLF, newBlock.replace(/\n/g, '\r\n'));
  console.log('Replaced with CRLF version');
} else if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  console.log('Replaced with LF version');
} else {
  // Try substring match
  const key = `    setSelectedRecibo({\r\n      reciboNo: row.referencia`;
  const idx = c.indexOf(key);
  if (idx === -1) { console.log('❌ Cannot find setSelectedRecibo block'); process.exit(1); }
  
  // Find the descripcionConcepto declaration before it
  const descKey = `    const descripcionConcepto = esAbono`;
  const descIdx = c.lastIndexOf(descKey, idx);
  if (descIdx === -1) { console.log('❌ Cannot find descripcionConcepto'); process.exit(1); }

  // Find end of setSelectedRecibo (closing });)
  const endKey = `      tasaBcv: tasaBcvAplicada,\r\n    });`;
  const endIdx = c.indexOf(endKey, idx);
  if (endIdx === -1) { console.log('❌ Cannot find end of setSelectedRecibo'); process.exit(1); }

  const endPos = endIdx + endKey.length;
  c = c.substring(0, descIdx) + newBlock.replace(/\n/g, '\r\n') + c.substring(endPos);
  console.log('Replaced with substring match');
}

fs.writeFileSync(path, c);
console.log('✅ handleOpenRecibo ahora muestra TODOS los meses pendientes del contribuyente');
