const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/conciliacion/page.tsx';
let c = fs.readFileSync(path, 'utf8');

const OLD = `      // Aprobado: marcar recibos como Pagado o aplicar abono
      if (estatus === 'Aprobado' && recibos.length > 0) {
        if (det.es_abono && montoConciliadoNum > 0) {
          // Es un abono parcial (Pago M\u00e3\u00baltiple)
          const { data: facs } = await supabase.from('facturas').select('*').in('referencia', recibos);
          if (facs && facs.length > 0) {
            // Ordenar por fecha (las m\u00e3\u00a1s antiguas primero)
            facs.sort((a, b) => new Date(a.fecha_emision || 0).getTime() - new Date(b.fecha_emision || 0).getTime());
            let dineroDisponible = montoConciliadoNum;
            
            for (const fac of facs) {
              const montoFac = parseFloat(fac.monto || '0');
              if (dineroDisponible >= montoFac - 0.01) {
                // Se paga completa
                dineroDisponible = Math.max(0, dineroDisponible - montoFac);
                await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', fac.referencia);
              } else if (dineroDisponible > 0.01) {
                // Abono parcial
                const montoRestante = (montoFac - dineroDisponible).toFixed(2);
                await supabase.from('facturas').update({ monto: montoRestante, estado: 'Abonado' }).eq('referencia', fac.referencia);
                dineroDisponible = 0;
              } else {
                // No queda dinero, regresarla a Pendiente
                await supabase.from('facturas').update({ estado: 'Pendiente' }).eq('referencia', fac.referencia);
              }
            }
          }
        } else {
          // Pago completo normal
          await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', recibos);
        }
      }`;

const NEW = `      // Aprobado: marcar recibos como Pagado o aplicar abono proporcional
      if (estatus === 'Aprobado' && recibos.length > 0) {
        const { data: facs } = await supabase.from('facturas').select('*').in('referencia', recibos);
        if (facs && facs.length > 0) {
          // Calcular deuda total de los recibos seleccionados
          const deudaTotal = facs.reduce((s, f) => s + parseFloat(f.monto || '0'), 0);
          const esAbonoParcial = det.es_abono || (montoConciliadoNum > 0 && montoConciliadoNum < deudaTotal - 0.01);

          if (esAbonoParcial && montoConciliadoNum > 0) {
            // Distribuir el monto entre facturas (mas antiguas primero)
            facs.sort((a, b) => new Date(a.emision || a.created_at || 0).getTime() - new Date(b.emision || b.created_at || 0).getTime());
            let dineroDisponible = montoConciliadoNum;

            for (const fac of facs) {
              const montoFac = parseFloat(fac.monto || '0');
              if (dineroDisponible >= montoFac - 0.01) {
                // Cubre la factura completa
                dineroDisponible = Math.max(0, dineroDisponible - montoFac);
                await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', fac.referencia);
              } else if (dineroDisponible > 0.01) {
                // Abono parcial: actualizar monto restante
                const montoRestante = parseFloat((montoFac - dineroDisponible).toFixed(2));
                await supabase.from('facturas').update({ monto: montoRestante, estado: 'Abonado' }).eq('referencia', fac.referencia);
                dineroDisponible = 0;
              } else {
                // Sin dinero: dejar pendiente
                await supabase.from('facturas').update({ estado: 'Pendiente' }).eq('referencia', fac.referencia);
              }
            }

            // Si sobro saldo despues de pagar todo, registrar como saldo a favor
            if (dineroDisponible > 0.01) {
              const { data: inmList } = await supabase.from('inmuebles').select('id, saldo_favor_bs').eq('identidad', pago.identidad);
              if (inmList && inmList.length > 0) {
                const saldoActual = parseFloat(inmList[0].saldo_favor_bs || '0') || 0;
                await supabase.from('inmuebles').update({ saldo_favor_bs: saldoActual + dineroDisponible }).eq('id', inmList[0].id);
              }
            }
          } else {
            // Pago completo: marcar todas como Pagado
            await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', recibos);
          }
        }
      }`;

// Try both CRLF and LF
const crlfOLD = OLD.replace(/\n/g, '\r\n');
if (c.includes(crlfOLD)) {
  c = c.replace(crlfOLD, NEW.replace(/\n/g, '\r\n'));
  console.log('✅ Reemplazado (CRLF)');
} else if (c.includes(OLD)) {
  c = c.replace(OLD, NEW);
  console.log('✅ Reemplazado (LF)');
} else {
  // Try to find and replace the Aprobado block by anchor
  const anchorStart = "      // Aprobado: marcar recibos como Pagado o aplicar abono";
  const anchorEnd = "      }\r\n\r\n      // Con Diferencia:";
  const altEnd = "      }\n\n      // Con Diferencia:";
  
  const startIdx = c.indexOf(anchorStart);
  if (startIdx === -1) { console.log('❌ Anchor not found'); process.exit(1); }
  
  let endIdx = c.indexOf(anchorEnd, startIdx);
  if (endIdx === -1) endIdx = c.indexOf(altEnd, startIdx);
  if (endIdx === -1) { console.log('❌ End anchor not found'); process.exit(1); }
  
  const endFull = endIdx + (c.includes(anchorEnd) ? anchorEnd.length : altEnd.length);
  const isCRLF = c.includes(anchorEnd);
  
  c = c.substring(0, startIdx) + (isCRLF ? NEW.replace(/\n/g, '\r\n') : NEW) + '\r\n\r\n' + c.substring(endFull);
  console.log('✅ Reemplazado por anchor (startIdx=' + startIdx + ', endIdx=' + endIdx + ')');
}

fs.writeFileSync(path, c, 'utf8');
console.log('Archivo guardado. Verificando...');

// Quick verify
if (c.includes('esAbonoParcial')) {
  console.log('✅ esAbonoParcial encontrado en archivo');
} else {
  console.log('❌ esAbonoParcial NO encontrado - fallo el reemplazo');
}
