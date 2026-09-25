const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /await fetch\('\/api\/admin\/factura-digital\/emitir', \{[\s\S]*?\}\);\s*\} catch\(err\)/g;

const replacement = `const tfhkaRes = await fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: pagoIdManual,
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
            const tfhkaData = await tfhkaRes.json();
            if (tfhkaData.url) {
              window.open(tfhkaData.url, '_blank');
            }
          } catch(err)`;

content = content.replace(regex, replacement);

fs.writeFileSync(path, content, 'utf8');
console.log("Factura Digital integration updated with window.open");
