import { NextResponse } from 'next/server';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

function formatearFecha(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

/** Convierte un número a texto en español */
function numeroALetras(n: number): string {
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const centenas = ['', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function grupo(num: number): string {
    if (num === 0) return '';
    if (num < 20) return unidades[num];
    if (num < 100) {
      const d = Math.floor(num / 10), u = num % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} y ${unidades[u]}`;
    }
    if (num === 100) return 'cien';
    const c = Math.floor(num / 100), r = num % 100;
    // Para 101-199 se usa "ciento" (no "cien")
    const base = c === 1 ? 'ciento' : centenas[c];
    return r === 0 ? centenas[c] : `${base} ${grupo(r)}`;
  }

  function convertir(num: number): string {
    if (num === 0) return 'cero';
    if (num < 1000) return grupo(num);
    if (num < 1000000) {
      const miles = Math.floor(num / 1000), r = num % 1000;
      const pre = miles === 1 ? 'mil' : `${grupo(miles)} mil`;
      return r === 0 ? pre : `${pre} ${grupo(r)}`;
    }
    const mill = Math.floor(num / 1000000), r = num % 1000000;
    const pre = mill === 1 ? 'un millón' : `${grupo(mill)} millones`;
    return r === 0 ? pre : `${pre} ${convertir(r)}`;
  }

  const cts = centavos === 0 ? 'cero centimos' : `${grupo(centavos)} centimos`;
  return `${convertir(entero)} bolivares con ${cts}`;
}

function nombreMes(fecha: Date): string {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return meses[fecha.getMonth()];
}

export async function POST(request: Request) {
  try {
    let body: any = {};
    try { body = await request.json(); } catch { /* sin body es válido */ }

    const fechaActual = new Date();
    const horaStr = fechaActual.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).toLowerCase();
    const fechaFmt = formatearFecha(fechaActual);

    // ── Parámetros configurables (con valores por defecto) ────────────────
    const montoServicio: number = parseFloat(body.montoServicio ?? 850);
    const montoMulta:    number = parseFloat(body.montoMulta   ?? 120);
    const mesPagado:     string = body.mes           || `${nombreMes(fechaActual)} ${fechaActual.getFullYear()}`;
    const razonSocial:   string = body.contribuyente || 'COMERCIAL EL PROGRESO C.A.';
    const numId:         string = body.numId         || '298765432';
    const tipoId:        string = body.tipoId        || 'J';
    // ─────────────────────────────────────────────────────────────────────

    const ivaServicio  = parseFloat((montoServicio * 0.16).toFixed(2)); // IVA 16% solo al servicio
    const totalGravado = montoServicio;
    const totalExento  = montoMulta;                                     // multa SIN IVA
    const totalIVA     = ivaServicio;
    const subtotal     = totalGravado + totalExento;
    const totalAPagar  = subtotal + totalIVA;
    const tieneMulta   = montoMulta > 0;

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
          Moneda:                       'BSD',
          Anulado:                      false,
          TipoDePago:                   'Inmediato',
          Serie:                        '',
          Sucursal:                     '',
          TipoDeVenta:                  'Interna',
        },
        Vendedor: null,
        Comprador: {
          TipoIdentificacion:   tipoId,
          NumeroIdentificacion: numId,
          RazonSocial:          razonSocial,
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
          NroItems:               String(tieneMulta ? 2 : 1),
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
          MontoEnLetras:          numeroALetras(totalAPagar),
          ListaRecargo:           null,
          ListaDescBonificacion:  null,
          ImpuestosSubtotal: [
            // Bloque E (Exento) — multa sin IVA, solo si hay multa
            ...(tieneMulta ? [{
              CodigoTotalImp:   'E',
              AlicuotaImp:      '00.00',
              BaseImponibleImp: totalExento.toFixed(2),
              ValorTotalImp:    '00.00',
            }] : []),
            // Bloque G (Gravado 16%) — servicio con IVA
            {
              CodigoTotalImp:   'G',
              AlicuotaImp:      '16.00',
              BaseImponibleImp: totalGravado.toFixed(2),
              ValorTotalImp:    totalIVA.toFixed(2),
            },
          ],
          OtrosImpuestosSubtotal: null,
          FormasPago: [{
            Descripcion: 'Pago Movil',
            Fecha:       fechaFmt,
            Forma:       '02',
            Monto:       totalAPagar.toFixed(2),
            Moneda:      'BSD',
            TipoCambio:  '0.0000',
          }],
          TotalIGTF:         null,
          TotalIGTF_VES:     null,
          MontoTotalOTI:     null,
          MontoTotalIVAyOTI: null,
        },
        TotalesRetencion: null,
        TotalesOtraMoneda: null,
        Orden: null,
      },
      DetallesItems: [
        // Ítem 1: Servicio de Aseo — CON IVA 16% (Gravado G)
        {
          NumeroLinea:             '1',
          CodigoCIIU:              '0198',
          CodigoPLU:               '0198001',
          IndicadorBienoServicio:  '2',
          Descripcion:             `Servicio de Aseo Urbano - Mensualidad ${mesPagado}`,
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
          ValorTotalItem:          (montoServicio + ivaServicio).toFixed(2),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        },
        // Ítem 2: Multa — SIN IVA (Exento E), solo si montoMulta > 0
        ...(tieneMulta ? [{
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
          ValorTotalItem:          montoMulta.toFixed(2),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        }] : []),
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
    const url = tfhkaResponse.resultado?.urlConsulta || null;

    if (!url) {
      return NextResponse.json({
        error: 'La API de The Factory HKA no devolvió un enlace.',
        raw: tfhkaResponse,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      url,
      resumen: {
        contribuyente: razonSocial,
        mes:           mesPagado,
        servicio:      `Bs ${montoServicio.toFixed(2)}`,
        iva16:         `Bs ${ivaServicio.toFixed(2)}`,
        multa:         `Bs ${montoMulta.toFixed(2)} (sin IVA)`,
        totalAPagar:   `Bs ${totalAPagar.toFixed(2)}`,
        montoEnLetras: numeroALetras(totalAPagar),
        correo:        'aseonaguanagua@globalgreenca.com',
      },
      raw: tfhkaResponse,
    });

  } catch (error: any) {
    console.error('[TFHKA Test]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
