const fs = require('fs');
let content = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
content = content.replace(
  `}).select('id').single();

        if (esAbonoDebito) {`,
  `}).select('id').single();

        // Emitir Factura Digital The Factory HKA (Asíncrono)
        if (pagoInsertado && selectedRecibos.length > 0) {
          try {
            fetch('/api/admin/factura-digital/emitir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pagoId: pagoInsertado.id,
                recibos: selectedRecibos,
                montos: { total: montoReal },
                contribuyente: foundUser.Contribuyente,
                identidad: foundUser.Identidad
              })
            }).catch(e => console.error('Error trigger factura digital caja:', e));
          } catch(e) {}
        }

        if (esAbonoDebito) {`
);
fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', content);
