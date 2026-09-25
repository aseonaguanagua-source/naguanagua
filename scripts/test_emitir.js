const fs = require('fs');

(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/admin/factura-digital/emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagoId: '6682ac4e-2b5a-4be2-82ba-1cf81487ef6b',
        recibos: ['RECIB-DEUDA'],
        montos: [],
        contribuyente: 'EMPRESA 10 MESES C.A.',
        identidad: 'JTEST10MESES',
        montoTotal: 100,
        formasPago: [
          { descripcion: 'Debito', fecha: new Date().toISOString(), forma: '01', monto: 100 }
        ]
      })
    });
    const txt = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", txt);
  } catch(e) {
    console.log("Error:", e);
  }
})();
