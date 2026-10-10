const fs = require('fs');

const file = 'src/lib/condominios/cobro.ts';
let content = fs.readFileSync(file, 'utf8');

const retencionInsert = `
    const pErr = await sb.from('pagos_reportados').insert({
      id, identidad: f.identidad, monto: f.totalBs, banco: pago.banco || 'N/A', referencia: refFinal,
      tipo: pago.metodo, estado: pago.metodo === 'Transferencia' || pago.metodo === 'Pago Movil' ? 'Por Verificar' : 'Aprobado',
      detalles: JSON.stringify(detalles), created_at: fecha
    }).then(r => r.error);
    if (pErr) return { error: pErr.message };

    // ── GENERAR COMPROBANTE DE RETENCIÓN DE IVA COMO NOTA DE CRÉDITO ──
    if (ret > 0) {
      await sb.from('pagos_reportados').insert({
        id: crypto.randomUUID(),
        identidad: f.identidad,
        monto: ret,
        banco: 'N/A',
        referencia: 'RET-' + Date.now().toString().slice(-6),
        tipo: 'Retencion de IVA',
        estado: 'Aprobado',
        created_at: fecha,
        detalles: JSON.stringify({
          modulo: 'condominios',
          cajero: pago.cajero,
          es_condominio: true,
          pago_vinculado: id,
          nota: 'Generado automáticamente por retención de agente.'
        })
      });
    }
`;

content = content.replace(
/    const pErr = await sb\.from\('pagos_reportados'\)\.insert\(\{[\s\S]*?if \(pErr\) return \{ error: pErr\.message \};/,
retencionInsert
);

fs.writeFileSync(file, content);
console.log("Patched condominios/cobro.ts");
