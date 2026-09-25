

async function testEmision() {
  const baseUrl = 'https://demoemisionv2.thefactoryhka.com.ve';
  const user = 'sqovrqunrqjv_tfhka';
  const password = 'UB!yb7U/r*/?';

  try {
    // 1. Obtener Token
    const authRes = await fetch(`${baseUrl}/api/Autenticacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: user, clave: password })
    });
    
    if (!authRes.ok) throw new Error("Auth falló");
    const authData = await authRes.json();
    const token = authData.token;

    // 2. Emitir
    const documentoData = {
      encabezado: {
        identificacionDocumento: {
          tipoDocumento: "01", 
          serie: "",
          numeroDocumento: "00001",
          fechaEmision: "24/09/2026",
          horaEmision: "10:00:00 am",
          moneda: "BSD",
          tipoDePago: "Contado",
          tipoDeVenta: "Interna"
        },
        vendedor: {
          nombre: "INSTITUTO AUTONOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA",
        },
        comprador: {
          numeroIdentificacion: "12345678",
          razonSocial: "PRUEBA CONTRIBUYENTE",
          tipoIdentificacion: "V",
          correo: ["davidzara66@gmail.com"],
          direccion: "Avenida Principal de Naguanagua",
          pais: "VE"
        },
        totales: {
          nroItems: "1",
          montoGravadoTotal: "0.00",
          montoExentoTotal: "100.00",
          montoPercibidoTotal: "0.00",
          subtotalAntesDescuento: "100.00",
          totalDescuento: "0.00",
          subtotal: "100.00",
          totalIVA: "0.00",
          totalAPagar: "100.00",
          montoTotalConIVA: "100.00",
          montoEnLetras: "CIEN BOLIVARES CON CERO CENTIMOS",
          impuestosSubtotal: [
            {
              codigoTotalImp: "E",
              alicuotaImp: "00.00",
              baseImponibleImp: "100.00",
              valorTotalImp: "00.00"
            }
          ],
          formasPago: [
            {
              forma: "01", // Efectivo/Otros
              monto: "100.00",
              moneda: "VES",
              tipoCambio: "1.00"
            }
          ]
        }
      },
      detallesItems: [
        {
          numeroLinea: "1",
          descripcion: "Servicio de Aseo Urbano",
          cantidad: "1.00",
          unidadMedida: "NIU",
          indicadorBienoServicio: "2",
          precioUnitario: "100.00",
          precioAntesDescuento: "100.00",
          descuentoMonto: "0.00",
          recargoMonto: "0.00",
          precioItem: "100.00",
          codigoImpuesto: "E",
          tasaIVA: "0.00",
          valorIVA: "0.00",
          valorTotalItem: "100.00"
        }
      ]
    };

    console.log("Enviando factura...");
    const emitRes = await fetch(`${baseUrl}/api/Emision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ documentoElectronico: documentoData })
    });

    const emitText = await emitRes.text();
    console.log("Status Emision:", emitRes.status);
    console.log("Response Emision:", emitText);

  } catch (e) {
    console.error(e);
  }
}

testEmision();
