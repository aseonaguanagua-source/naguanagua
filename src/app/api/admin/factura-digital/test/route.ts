import { NextResponse } from 'next/server';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

function formatearFecha(isoString: string): string {
  const d = new Date(isoString);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

export async function POST(_request: Request) {
  try {
    const fechaActual = new Date();
    const horaStr = fechaActual.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).toLowerCase();
    const fechaFmt = formatearFecha(fechaActual.toISOString());

    // Datos del contribuyente comercial ficticio (datos de prueba para TFHKA Demo)
    const montoServicio = 850.00;   // Bs — monto del servicio de aseo
    const montoMulta   = 120.00;   // Bs — multa por mora (exenta de IVA)
    const ivaServicio  = montoServicio * 0.16;  // 136.00
    const totalGravado = montoServicio;          // Solo el servicio lleva IVA
    const totalExento  = montoMulta;             // La multa es exenta
    const totalIVA     = ivaServicio;            // 136.00
    const totalAPagar  = totalGravado + totalExento + totalIVA;  // 1106.00

    const documentoElectronico = {
      Moneda: 'VES',
      Encabezado: {
        IdentificacionDocumento: {
          TipoDocumento:    '01',  // Factura
          NumeroDocumento:  `0000${Date.now()}`.slice(-8),
          TipoProveedor:    null,
          TipoTransaccion:  null,
          FechaEmision:     fechaFmt,
          FechaVencimiento: fechaFmt,
          HoraEmision:      horaStr,
          Anulado:          false,
          TipoDePago:       'Inmediato',
          Serie:            '',
          Sucursal:         '',
          TipoDeVenta:      'Interna',
        },
        Vendedor: null,
        Comprador: {
          TipoIdentificacion:   'J',
          NumeroIdentificacion: '298765432',   // RIF ficticio para entorno DEMO
          RazonSocial:          'COMERCIAL EL PROGRESO C.A.',
          Direccion:            'AV. UNIVERSIDAD, LOCAL 12, NAGUANAGUA, CARABOBO',
          Ubigeo:               null,
          Pais:                 'VE',
          Notificar:            'Si',
          Telefono:             [],
          Correo:               ['aseonaguanagua@globalgreenca.com'],
          OtrosEnvios:          null,
        },
        SujetoRetenido: null,
        Tercero:        null,
        Totales: {
          NroItems:               '2',
          MontoGravadoTotal:      totalGravado.toFixed(2),
          MontoExentoTotal:       totalExento.toFixed(2),
          MontoPercibidoTotal:    '0.00',
          SubtotalAntesDescuento: (totalGravado + totalExento).toFixed(2),
          TotalDescuento:         null,
          TotalRecargos:          null,
          Subtotal:               (totalGravado + totalExento).toFixed(2),
          TotalIVA:               totalIVA.toFixed(2),
          MontoTotalConIVA:       totalAPagar.toFixed(2),
          TotalAPagar:            totalAPagar.toFixed(2),
          MontoEnLetras:          'MIL CIENTO SEIS BOLIVARES CON 00/100',
          ImpuestosSubtotal: [
            {
              CodigoTotalImp:   'G',
              AlicuotaImp:      '16.00',
              BaseImponibleImp: totalGravado.toFixed(2),
              ValorTotalImp:    totalIVA.toFixed(2),
            },
            {
              CodigoTotalImp:   'E',
              AlicuotaImp:      '00.00',
              BaseImponibleImp: totalExento.toFixed(2),
              ValorTotalImp:    '0.00',
            },
          ],
          FormasPago: [
            {
              Descripcion: 'Pago',
              Fecha:       fechaFmt,
              Forma:       '01',  // Efectivo/Transferencia
              Monto:       totalAPagar.toFixed(2),
              Moneda:      'VES',
              TipoCambio:  '0.0000',
            },
          ],
        },
      },
      DetallesItems: [
        {
          NumeroLinea:             '1',
          CodigoCIIU:              '0198',
          CodigoPLU:               'ASEO001',
          IndicadorBienoServicio:  '2',
          Descripcion:             'Servicio de Aseo Urbano - Mensualidad Septiembre 2026',
          Cantidad:                '1',
          UnidadMedida:            'NIU',
          PrecioUnitario:          montoServicio.toFixed(2),
          PrecioUnitarioDescuento: null,
          MontoBonificacion:       null,
          DescripcionBonificacion: null,
          DescuentoMonto:          '0.00',
          RecargoMonto:            '0',
          PrecioItem:              montoServicio.toFixed(2),
          PrecioAntesDescuento:    montoServicio.toFixed(2),
          CodigoImpuesto:          'G',
          TasaIVA:                 '16.00',
          ValorIVA:                ivaServicio.toFixed(2),
          ValorTotalItem:          (montoServicio + ivaServicio).toFixed(2),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        },
        {
          NumeroLinea:             '2',
          CodigoCIIU:              '0198',
          CodigoPLU:               'MULTA001',
          IndicadorBienoServicio:  '2',
          Descripcion:             'Multa por Mora - Aseo Urbano',
          Cantidad:                '1',
          UnidadMedida:            'NIU',
          PrecioUnitario:          montoMulta.toFixed(2),
          PrecioUnitarioDescuento: null,
          MontoBonificacion:       null,
          DescripcionBonificacion: null,
          DescuentoMonto:          '0.00',
          RecargoMonto:            '0',
          PrecioItem:              montoMulta.toFixed(2),
          PrecioAntesDescuento:    montoMulta.toFixed(2),
          CodigoImpuesto:          'E',   // Exento — la multa no lleva IVA
          TasaIVA:                 '0.00',
          ValorIVA:                '0.00',
          ValorTotalItem:          montoMulta.toFixed(2),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        },
      ],
    };

    const tfhkaResponse = await TheFactoryHKA.emitirDocumento(documentoElectronico);
    const url = tfhkaResponse.resultado?.imprentaDigital || null;

    if (!url) {
      return NextResponse.json({
        error: 'La API de The Factory HKA no devolvió un enlace.',
        raw: tfhkaResponse,
      }, { status: 400 });
    }

    return NextResponse.json({ success: true, url, raw: tfhkaResponse });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
