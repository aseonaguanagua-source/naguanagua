const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// First replace the insert logic to pre-generate UUID
const targetStr1 = `        const { data: pagoInsertado } = await supabase.from('pagos_reportados').insert({
          identidad: foundUser.Identidad,`;

const replaceStr1 = `        const pagoIdManual = crypto.randomUUID();
        const { error: insertErr } = await supabase.from('pagos_reportados').insert({
          id: pagoIdManual,
          identidad: foundUser.Identidad,`;

// Second replace the select('id').single() to not use it
const targetStr2 = `        }).select('id').single();

        // ── TFHKA FACTURACIÓN DIGITAL ──
        if (pagoInsertado?.id) {
          try {
            await fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: pagoInsertado.id,`;

const replaceStr2 = `        });
        if (insertErr) throw insertErr;

        // Limpiar deuda_mmv si se pagó RECIB-DEUDA
        if (selectedRecibos.includes('RECIB-DEUDA') && !esAbonoDebito) {
           await supabase.from('inmuebles').update({ deuda_mmv: 0 }).eq('identidad', foundUser.Identidad);
        }

        // ── TFHKA FACTURACIÓN DIGITAL ──
        if (pagoIdManual) {
          try {
            await fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: pagoIdManual,`;

content = content.replace(targetStr1, replaceStr1);
content = content.replace(targetStr2, replaceStr2);

fs.writeFileSync(path, content, 'utf8');
console.log("Patched caja/page.tsx to pre-generate UUID and clear dummy debt");
