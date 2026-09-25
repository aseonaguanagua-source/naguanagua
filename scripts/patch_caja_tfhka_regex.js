const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /\}\)\.select\('id'\)\.single\(\);\s*if \(esAbonoDebito\)/g;

const replacement = `}).select('id').single();

        // ── LIMPIAR DEUDA MMV SI SE PAGÓ EL DUMMY DEBT ──
        if (selectedRecibos.includes('RECIB-DEUDA') && !esAbonoDebito) {
           await supabase.from('inmuebles').update({ deuda_mmv: 0 }).eq('identidad', foundUser.Identidad);
        }

        // ── TFHKA FACTURACIÓN DIGITAL ──
        if (pagoInsertado?.id) {
          try {
            const tfhkaRes = await fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: pagoInsertado.id,
                recibos: selectedRecibos,
                montos: [],
                contribuyente: foundUser.Contribuyente,
                identidad: foundUser.Identidad,
                montoTotal: montoReal,
                formasPago: [
                  { descripcion: paymentMethod, fecha: new Date().toISOString(), forma: '01', monto: montoReal }
                ]
              })
            });
            const tfhkaData = await tfhkaRes.json();
            if (tfhkaData.url) {
              window.open(tfhkaData.url, '_blank');
            }
          } catch(err) {
            console.error('Error enviando a factura digital TFHKA', err);
          }
        }

        if (esAbonoDebito)`;

content = content.replace(regex, replacement);

fs.writeFileSync(path, content, 'utf8');
console.log("Factura Digital integration added successfully with window.open");
