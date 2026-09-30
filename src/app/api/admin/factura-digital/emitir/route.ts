import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

function numeroALetras(monto: number): string {
  return "MONTO EN LETRAS POR IMPLEMENTAR";
}

function formatearFecha(isoString: string): string {
  const d = new Date(isoString);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

export async function POST(request: Request) {
  try {
    const { pagoId, recibos, montos, contribuyente, identidad, formasPago, montoTotal } = await request.json();

    if (!pagoId || !recibos || recibos.length === 0) {
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    // --- BUSINESS RULE: Only emit invoices for Commercial properties ---
    const { data: userProps, error: propsErr } = await supabase
      .from('inmuebles')
      .select('tipo, actividad_principal, direccion')
      .eq('identidad', identidad);

    if (propsErr) {
      console.error("Props error:", propsErr);
      return NextResponse.json({ error: 'Error fetching user properties: ' + propsErr.message }, { status: 500 });
    }

    let isComercial = false;
    const propRef = userProps && userProps.length > 0 ? userProps[0] : null;

    if (userProps && userProps.length > 0) {
      isComercial = userProps.some(p =>
        (p.tipo || '').toLowerCase().includes('comercial') ||
        (p.tipo || '').toLowerCase().includes('industrial') ||
        (p.actividad_principal || '').toLowerCase().includes('comercial') ||
        (p.actividad_principal || '').toLowerCase().includes('industrial')
      );
    }

    // Fallback: J or G RIF → commercial
    if (!isComercial && (identidad.startsWith('J') || identidad.startsWith('G') || identidad.startsWith('J-') || identidad.startsWith('G-'))) {
      isComercial = true;
    }

    if (!isComercial) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Emisión omitida: el contribuyente es residencial.'
      });
    }
    // ------------------------------------------------------------------

    const fechaActual = new Date();
    const horaStr = fechaActual.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();

    const { data: facturasBD } = await supabase.from('facturas').select('*').in('referencia', recibos);

    let totalGravado = 0;
    let totalExento = 0;
    let totalIVA = 0;

    // All commercial invoice items carry 16% IVA (per TFHKA spec)
    const detallesItems = (facturasBD || []).map((fac: any, idx: number) => {
      const montoItem = parseFloat(String(fac.monto || '0').replace(/[^0-9.]/g, ''));
      const valorIVA = parseFloat((montoItem * 0.16).toFixed(2));
      const valorTotalItem = montoItem + valorIVA;
      totalGravado += montoItem;
      totalIVA += valorIVA;

      return {
        NumeroLinea:             String(idx + 1),
        CodigoCIIU:              "0198",
        CodigoPLU:               "ASEO001",
        IndicadorBienoServicio:  "2",
        Descripcion:             `Servicio de Aseo Urbano - Recibo ${fac.referencia}`,
        Cantidad:                "1",
        UnidadMedida:            "NIU",
        PrecioUnitario:          montoItem.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          "0.00",
        RecargoMonto:            "0",
        PrecioItem:              montoItem.toFixed(2),
        PrecioAntesDescuento:    montoItem.toFixed(2),
        CodigoImpuesto:          "G",
        TasaIVA:                 "16",
        ValorIVA:                valorIVA.toFixed(2),
        ValorTotalItem:          String(valorTotalItem),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      };
    });

    const docIdentificacion = identidad.replace(/[^A-Z0-9-]/gi, '');
    const tipoId = docIdentificacion.charAt(0).toUpperCase();
    const numId  = docIdentificacion.substring(1).replace(/^-/, '');

    const subtotal   = totalGravado + totalExento;
    const totalAPagar = subtotal + totalIVA;

    const jsonTFHKA = {
      documentoElectronico: {
        Encabezado: {
          IdentificacionDocumento: {
            TipoDocumento:                "01",
            NumeroDocumento:              `000000${pagoId}`.slice(-8),
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
            FechaEmision:                 formatearFecha(fechaActual.toISOString()),
            FechaVencimiento:             formatearFecha(fechaActual.toISOString()),
            HoraEmision:                  horaStr,
            Moneda:                       "BSD",
            Anulado:                      false,
            TipoDePago:                   "Inmediato",
            Serie:                        "",
            Sucursal:                     "",
            TipoDeVenta:                  "Interna",
          },
          Vendedor: null,
          Comprador: {
            TipoIdentificacion:   tipoId || "J",
            NumeroIdentificacion: numId,
            RazonSocial:          contribuyente || "CONTRIBUYENTE",
            Direccion:            propRef?.direccion || "NAGUANAGUA",
            Ubigeo:               null,
            Pais:                 "VE",
            Notificar:            null,
            Telefono:             [],
            Correo:               ["aseonaguanagua@globalgreenca.com"],
            OtrosEnvios:          null,
          },
          SujetoRetenido: null,
          Tercero:        null,
          Totales: {
            NroItems:               String(detallesItems.length),
            MontoGravadoTotal:      totalGravado.toFixed(2),
            MontoExentoTotal:       totalExento.toFixed(2),
            MontoPercibidoTotal:    "0.00",
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
              ...(totalExento > 0 ? [{
                CodigoTotalImp:   "E",
                AlicuotaImp:      "00.00",
                BaseImponibleImp: totalExento.toFixed(2),
                ValorTotalImp:    "00.00",
              }] : []),
              {
                CodigoTotalImp:   "G",
                AlicuotaImp:      "16.00",
                BaseImponibleImp: totalGravado.toFixed(2),
                ValorTotalImp:    totalIVA.toFixed(2),
              },
            ],
            OtrosImpuestosSubtotal: null,
            FormasPago: [
              {
                Descripcion: "Pago Movil",
                Fecha:       formatearFecha(fechaActual.toISOString()),
                Forma:       "02",
                Monto:       totalAPagar.toFixed(2),
                Moneda:      "BSD",
                TipoCambio:  "0.0000",
              },
            ],
            TotalIGTF:         null,
            TotalIGTF_VES:     null,
            MontoTotalOTI:     null,
            MontoTotalIVAyOTI: null,
          },
          TotalesRetencion: null,
          TotalesOtraMoneda: null,
          Orden: null,
        },
        DetallesItems:    detallesItems,
        DetallesRetencion: null,
        Viajes:            null,
        InfoAdicional:     [],
        GuiaDespacho:      null,
        Transporte:        null,
        EsLote:            null,
        EsMinimo:          null,
      }
    };

    const isTfhkaEnabled = process.env.TFHKA_ENABLED === 'true';

    const { data: pagoData } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoId).single();
    let nuevosDetalles: any = pagoData?.detalles || {};
    if (typeof nuevosDetalles === 'string') {
      try { nuevosDetalles = JSON.parse(nuevosDetalles); } catch(e) { nuevosDetalles = {}; }
    }

    if (isTfhkaEnabled) {
      console.log(`[TFHKA] Enviando Factura Real para pago ${pagoId}`);
      try {
        const tfhkaResponse = await TheFactoryHKA.emitirDocumento(jsonTFHKA.documentoElectronico);

        nuevosDetalles.factura_digital = {
          emitida:          true,
          url:              tfhkaResponse.resultado?.imprentaDigital || null,
          numero_control:   tfhkaResponse.resultado?.numeroControl || "ERROR-CONTROL",
          numero_documento: tfhkaResponse.resultado?.numeroDocumento || "ERROR-DOC",
          fecha_emision:    new Date().toISOString(),
          raw_response:     tfhkaResponse,
        };
      } catch (err: any) {
        console.error("[TFHKA] Error en emisión real:", err.message);
        nuevosDetalles.factura_digital_error = err.message;
        await supabase.from('pagos_reportados').update({ detalles: nuevosDetalles }).eq('id', pagoId);
        return NextResponse.json({ error: 'Error en TFHKA: ' + err.message }, { status: 500 });
      }
    } else {
      console.log(`[SIMULACIÓN TFHKA] JSON generado:`, JSON.stringify(jsonTFHKA, null, 2));

      nuevosDetalles.factura_digital = {
        emitida:          true,
        url:              "https://democonsulta.thefactoryhka.com.ve/?doc=GhQVet4Fbe+vAHltz47VsoKrQ1NOzTmiOLp4jVe5oz4U01Z9FA/OdGcGnU9nU1co",
        numero_control:   `00-00000${Math.floor(Math.random() * 1000)}`,
        fecha_emision:    new Date().toISOString(),
        simulated:        true,
        payload_generado: jsonTFHKA,
      };
    }

    await supabase.from('pagos_reportados').update({ detalles: nuevosDetalles }).eq('id', pagoId);

    return NextResponse.json({
      success: true,
      simulated: !isTfhkaEnabled,
      url: nuevosDetalles.factura_digital.url,
    });

  } catch (err: any) {
    console.error("Error al emitir factura digital:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
