const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `        }).select('id').single();

        if (esAbonoDebito) {`;

const replaceStr = `        }).select('id').single();

        // ── TFHKA FACTURACIÓN DIGITAL ──
        if (pagoInsertado?.id) {
          try {
            await fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: pagoInsertado.id,
                recibos: selectedRecibos,
                montos: [], // se calculan en la API
                contribuyente: foundUser.Contribuyente,
                identidad: foundUser.Identidad,
                montoTotal: montoReal,
                formasPago: [
                  { descripcion: paymentMethod, fecha: new Date().toISOString(), forma: '01', monto: montoReal }
                ]
              })
            });
          } catch(err) {
            console.error('Error enviando a factura digital TFHKA', err);
          }
        }

        if (esAbonoDebito) {`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(path, content, 'utf8');
console.log("Factura Digital integration added to caja/page.tsx");
