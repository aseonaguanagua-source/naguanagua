import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

export async function POST(request: Request) {
  try {
    const fechaActual = new Date();
    const horaStr = fechaActual.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
    
    // Formato de fecha AAAA-MM-DD
    const pad = (n: number) => String(n).padStart(2, '0');
    const fechaFmt = `${pad(fechaActual.getDate())}/${pad(fechaActual.getMonth()+1)}/${fechaActual.getFullYear()}`;

    // Mock document
    const mockDocument = {
      Encabezado: {
        IdentificacionDocumento: {
          TipoDocumento: "01",
          NumeroDocumento: String(Math.floor(Math.random() * 99999999)).padStart(8, '0'),
          TipoProveedor: null,
          TipoTransaccion: null,
          FechaEmision: fechaFmt,
          FechaVencimiento: fechaFmt,
          HoraEmision: horaStr,
          Anulado: false,
          TipoDePago: "Inmediato",
          Serie: "",
          Sucursal: "",
          TipoDeVenta: "Interna"
        },
        Vendedor: null,
        Comprador: {
          TipoIdentificacion: "J",
          NumeroIdentificacion: "123456789",
          RazonSocial: "EMPRESA DE PRUEBA C.A.",
          Direccion: "AVENIDA UNIVERSIDAD NAGUANAGUA",
          Ubigeo: null,
          Pais: "VE",
          Notificar: "SI",
          Telefono: [],
          Correo: [],
          OtrosEnvios: null
        },
        SujetoRetenido: null,
        Tercero: null,
        Totales: {
          NroItems: "1",
          MontoGravadoTotal: "100.00",
          MontoExentoTotal: "0.00",
          MontoPercibidoTotal: "0.00",
          SubtotalAntesDescuento: "100.00",
          TotalDescuento: null,
          TotalRecargos: null,
          Subtotal: "100.00",
          TotalIVA: "16.00",
          MontoTotalConIVA: "116.00",
          TotalAPagar: "116.00",
          MontoEnLetras: "CIENTO DIECISEIS BOLIVARES CON 00/100",
          ImpuestosSubtotal: [
            {
              CodigoTotalImp: "G",
              AlicuotaImp: "16.00",
              BaseImponibleImp: "100.00",
              ValorTotalImp: "16.00"
            }
          ],
          FormasPago: [
            {
              Descripcion: "Pago",
              Fecha: fechaFmt,
              Forma: "01",
              Monto: "116.00",
              Moneda: "VES",
              TipoCambio: "0.0000"
            }
          ]
        }
      },
      DetallesItems: [
        {
          NumeroLinea: "1",
          CodigoCIIU: "0198",
          CodigoPLU: "ASEO001",
          IndicadorBienoServicio: "2",
          Descripcion: "Servicio de Aseo Urbano - PRUEBA",
          Cantidad: "1",
          UnidadMedida: "NIU",
          PrecioUnitario: "100.00",
          PrecioUnitarioDescuento: null,
          MontoBonificacion: null,
          DescripcionBonificacion: null,
          DescuentoMonto: "0.00",
          RecargoMonto: "0",
          PrecioItem: "100.00",
          PrecioAntesDescuento: "100.00",
          CodigoImpuesto: "G",
          TasaIVA: "16.00",
          ValorIVA: "16.00",
          ValorTotalItem: "116.00",
          InfoAdicionalItem: [],
          ListaItemOTI: null
        }
      ]
    };

    const tfhkaResponse = await TheFactoryHKA.emitirDocumento(mockDocument);
    const url = tfhkaResponse.resultado?.imprentaDigital || null;

    if (!url) {
      return NextResponse.json({ error: 'La API de The Factory HKA no devolvió un enlace.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, url, raw: tfhkaResponse });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
