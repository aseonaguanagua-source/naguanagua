import { NextResponse } from 'next/server';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

function formatearFecha(d: Date): string {
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
    const fechaFmt = formatearFecha(fechaActual);

    // Datos del contribuyente comercial ficticio (entorno DEMO)
    // Servicio: Bs 850 (Gravado 16%) + Multa: Bs 120 (Exenta)
    const montoServicio = 850.00;
    const montoMulta   = 120.00;
    const ivaServicio  = parseFloat((montoServicio * 0.16).toFixed(2)); // 136.00
    const totalGravado = montoServicio;
    const totalExento  = montoMulta;
    const totalIVA     = ivaServicio;
    const subtotal     = totalGravado + totalExento;  // 970.00
    const totalAPagar  = subtotal + totalIVA;          // 1106.00

    const documentoElectronico = {
      Encabezado: {
        IdentificacionDocumento: {
          TipoDocumento:                '01',
          NumeroDocumento:              String(Date.now()).slice(-8),
          TipoProveedor:                null,
          TipoTransaccion:              null,
          NumeroPlanillaImportacion:    null,
          NumeroExpedienteImportacion:  null,
          SerieFacturaAfectada:         null,
          NumeroFacturaAfectada:        null,
          FechaFacturaAfectada:         null,
          MontoFacturaAfectada:         null,
          ComentarioFacturaAfectada:    null,
          RegimenEspTributacion:        null,
          FechaEmision:                 fechaFmt,
          FechaVencimiento:             fechaFmt,
          HoraEmision:                  horaStr,
          Anulado:                      false,
          TipoDePago:                   'Inmediato',
          Serie:                        '',
          Sucursal:                     '',
          TipoDeVenta:                  'Interna',
          Moneda:                       'BSD',
        },
        Vendedor: null,
        Comprador: {
          TipoIdentificacion:   'J',
          NumeroIdentificacion: '298765432',
          RazonSocial:          'COMERCIAL EL PROGRESO C.A.',
          Direccion:            'AV. UNIVERSIDAD, LOCAL 12, NAGUANAGUA, CARABOBO',
          Ubigeo:               null,
          Pais:                 'VE',
          Notificar:            null,
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
          SubtotalAntesDescuento: subtotal.toFixed(2),
          TotalDescuento:         null,
          TotalRecargos:          null,
          Subtotal:               subtotal.toFixed(2),
          TotalIVA:               totalIVA.toFixed(2),
          MontoTotalConIVA:       totalAPagar.toFixed(2),
          TotalAPagar:            totalAPagar.toFixed(2),
          MontoEnLetras:          'mil ciento seis bolivares con cero centimos',
          ListaRecargo:           null,
          ListaDescBonificacion:  null,
          ImpuestosSubtotal: [
            {
              CodigoTotalImp:   'E',
              AlicuotaImp:      '00.00',
              BaseImponibleImp: totalExento.toFixed(2),
              ValorTotalImp:    '00.00',
            },
            {
              CodigoTotalImp:   'G',
              AlicuotaImp:      '16.00',
              BaseImponibleImp: totalGravado.toFixed(2),
              ValorTotalImp:    totalIVA.toFixed(2),
            },
          ],
          OtrosImpuestosSubtotal: null,
          FormasPago: [
            {
              Descripcion: 'Pago Movil',
              Fecha:       fechaFmt,
              Forma:       '02',
              Monto:       totalAPagar.toFixed(2),
              Moneda:      'BSD',
              TipoCambio:  '0.0000',
            },
          ],
          TotalIGTF:          null,
          TotalIGTF_VES:      null,
          MontoTotalOTI:      null,
          MontoTotalIVAyOTI:  null,
        },
        TotalesRetencion: null,
        TotalesOtraMoneda: null,
        Orden: null,
      },
      DetallesItems: [
        {
          NumeroLinea:             '1',
          CodigoCIIU:              '0198',
          CodigoPLU:               '0198001',
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
          TasaIVA:                 '16',
          ValorIVA:                ivaServicio.toFixed(2),
          ValorTotalItem:          String(montoServicio + ivaServicio),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        },
        {
          NumeroLinea:             '2',
          CodigoCIIU:              '0198',
          CodigoPLU:               '0198002',
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
          CodigoImpuesto:          'E',
          TasaIVA:                 '0',
          ValorIVA:                '0.00',
          ValorTotalItem:          String(montoMulta),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        },
      ],
      DetallesRetencion: null,
      Viajes:            null,
      InfoAdicional:     [],
      GuiaDespacho:      null,
      Transporte:        null,
      EsLote:            null,
      EsMinimo:          null,
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
