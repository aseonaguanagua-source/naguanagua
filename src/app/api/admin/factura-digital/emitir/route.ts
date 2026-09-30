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

    // Para RECIB-HIST-*, buscar en inmuebles (no están en tabla facturas)
    const histRecibos = recibos.filter((r: string) => r.startsWith('RECIB-HIST-'));
    const histItems: any[] = [];
    if (histRecibos.length > 0) {
      // Extraer códigos de inmueble de referencias: RECIB-HIST-{COD}-M{N}
      const codigosInm = [...new Set(histRecibos.map((r: string) => r.split('-').slice(2, -1).join('-')))];
      const { data: inmsHist } = await supabase
        .from('inmuebles')
        .select('inmueble, deuda_mmv, deuda_congelada_bs, multa_bs, tipo, actividad_principal')
        .in('inmueble', codigosInm);

      histRecibos.forEach((ref: string) => {
        const codInm = ref.split('-').slice(2, -1).join('-');
        const inm = (inmsHist || []).find((i: any) => i.inmueble === codInm);
        let montoBase = parseFloat(String(inm?.deuda_mmv || inm?.deuda_congelada_bs || '0'));

        // Condición de carrera: la caja limpia deuda_mmv ANTES de llamar a emitir.
        // Si el inmueble ya tiene deuda=0 pero montoTotal está disponible, usar montoTotal
        if (montoBase <= 0 && montoTotal && parseFloat(String(montoTotal)) > 0) {
          montoBase = parseFloat(String(montoTotal));
        }

        // MULTA: calcular como % del base (NO usar multa_bs que es el total histórico acumulado)
        // Residencial: 10%, Comercial/Industrial: 12%
        const esResidencial = (inm?.tipo || '').toLowerCase().includes('residencial');
        const pctMulta = esResidencial ? 0.10 : 0.12;
        const montoMulta = parseFloat((montoBase * pctMulta).toFixed(2));

        if (montoBase > 0) histItems.push({ ref, montoBase, montoMulta, tipoInm: inm?.tipo || '' });
      });
    }

    let totalGravado = 0;
    let totalExento  = 0;
    let totalIVA     = 0;
    let lineaNum     = 0;

    // Items de facturas normales (16% IVA)
    const itemsFacturas = (facturasBD || []).map((fac: any) => {
      lineaNum++;
      const montoItem = parseFloat(String(fac.monto || '0').replace(/[^0-9.]/g, ''));
      const valorIVA  = parseFloat((montoItem * 0.16).toFixed(2));
      totalGravado   += montoItem;
      totalIVA       += valorIVA;
      return {
        NumeroLinea:             String(lineaNum),
        CodigoCIIU:              "0198",
        CodigoPLU:               "ASEO001",
        IndicadorBienoServicio:  "2",
        Descripcion:             `Servicio de Aseo Urbano - ${fac.referencia}`,
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
        ValorTotalItem:          String(parseFloat((montoItem + valorIVA).toFixed(2))),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      };
    });

    // Items de deuda histórica (base con IVA 16%, multa Exenta)
    const itemsHist = histItems.flatMap((h: any) => {
      const items = [];
      lineaNum++;
      const valorIVAHist = parseFloat((h.montoBase * 0.16).toFixed(2));
      totalGravado += h.montoBase;
      totalIVA     += valorIVAHist;
      items.push({
        NumeroLinea:             String(lineaNum),
        CodigoCIIU:              "0198",
        CodigoPLU:               "ASEO001",
        IndicadorBienoServicio:  "2",
        Descripcion:             `Servicio de Aseo Urbano (Histórico) - ${h.ref}`,
        Cantidad:                "1",
        UnidadMedida:            "NIU",
        PrecioUnitario:          h.montoBase.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          "0.00",
        RecargoMonto:            "0",
        PrecioItem:              h.montoBase.toFixed(2),
        PrecioAntesDescuento:    h.montoBase.toFixed(2),
        CodigoImpuesto:          "G",
        TasaIVA:                 "16",
        ValorIVA:                valorIVAHist.toFixed(2),
        ValorTotalItem:          String(parseFloat((h.montoBase + valorIVAHist).toFixed(2))),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      });
      if (h.montoMulta > 0) {
        lineaNum++;
        totalExento += h.montoMulta;
        items.push({
          NumeroLinea:             String(lineaNum),
          CodigoCIIU:              "0198",
          CodigoPLU:               "MULT001",
          IndicadorBienoServicio:  "2",
          Descripcion:             `Multa por Mora - ${h.ref}`,
          Cantidad:                "1",
          UnidadMedida:            "NIU",
          PrecioUnitario:          h.montoMulta.toFixed(2),
          PrecioUnitarioDescuento: null,
          MontoBonificacion:       null,
          DescripcionBonificacion: null,
          DescuentoMonto:          "0.00",
          RecargoMonto:            "0",
          PrecioItem:              h.montoMulta.toFixed(2),
          PrecioAntesDescuento:    h.montoMulta.toFixed(2),
          CodigoImpuesto:          "E",
          TasaIVA:                 "0",
          ValorIVA:                "0.00",
          ValorTotalItem:          h.montoMulta.toFixed(2),
          InfoAdicionalItem:       [],
          ListaItemOTI:            null,
        });
      }
      return items;
    });

    const detallesItems = [...itemsFacturas, ...itemsHist];

    // Si no hay items, no emitir (nada que facturar)
    if (detallesItems.length === 0) {
      return NextResponse.json({ success: true, skipped: true, message: 'Sin items para facturar.' });
    }

    const docIdentificacion = identidad.replace(/[^A-Z0-9-]/gi, '');
    const primeraLetra = docIdentificacion.charAt(0).toUpperCase();

    let tipoId: string;
    let numId: string;

    if (/^[VJGEP]$/.test(primeraLetra)) {
      // Identidad con prefijo explícito: V-12345678, J-12345678, etc.
      tipoId = primeraLetra;
      numId  = docIdentificacion.substring(1).replace(/^-/, '');
    } else {
      // Identidad sin prefijo (solo números) — detectar por nombre del contribuyente y tipo
      const nombreContrib = (contribuyente || '').toUpperCase();
      const tipoInmueble  = (propRef?.tipo || '').toUpperCase();

      // Indicadores de persona jurídica (empresa)
      const esJuridica = /\b(C\.A\.|S\.A\.|S\.R\.L\.|C\.P\.|C\.V\.|A\.C\.|COMPANIA|EMPRESA|INVERSIONES|INDUSTRIAS|CORPORACION|FUNDACION|ASOCIACION|COOPERATIVA|C\.A$|S\.A$)\b/.test(nombreContrib);
      // Indicadores de persona extranjera (nombre no venezolano o FONDO)
      const esExtranjero = /\b(FUND(O|ACION)?|INTERNATIONAL|AMERICAN|GLOBAL|LATIN|CORP\.|LLC|LTD|LIMITED)\b/.test(nombreContrib);

      tipoId = esJuridica ? 'J'
             : esExtranjero && !tipoInmueble.includes('RESIDENCIAL') ? 'E'
             : 'V';
      numId  = docIdentificacion; // número completo sin prefijo
    }

    const subtotal   = totalGravado + totalExento;
    const totalAPagar = subtotal + totalIVA;

    const jsonTFHKA = {
      documentoElectronico: {
        Encabezado: {
          IdentificacionDocumento: {
            TipoDocumento:                "01",
            NumeroDocumento:              String(Math.floor(Date.now() / 1000)).slice(-10),
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
            // Formas de pago: usar datos reales de la caja
            FormasPago: (() => {
              const mapaForma: Record<string, {desc: string, codigo: string}> = {
                'debito':       { desc: 'Tarjeta de Débito',      codigo: '03' },
                'credito':      { desc: 'Tarjeta de Crédito',     codigo: '04' },
                'transferencia':{ desc: 'Transferencia Bancaria', codigo: '05' },
                'deposito':     { desc: 'Depósito Bancario',      codigo: '05' },
                'depositobancario': { desc: 'Depósito Bancario',  codigo: '05' },
              };
              if (formasPago && formasPago.length > 0) {
                return formasPago.map((fp: any) => {
                  const key = (fp.descripcion || fp.forma || '').toLowerCase().replace(/[\s_-]/g,'');
                  const mapped = mapaForma[key] || { desc: fp.descripcion || 'Transferencia', codigo: fp.forma || '05' };
                  return {
                    Descripcion: mapped.desc,
                    Fecha:       formatearFecha(fp.fecha || fechaActual.toISOString()),
                    Forma:       mapped.codigo,
                    Monto:       parseFloat(String(fp.monto || totalAPagar)).toFixed(2),
                    Moneda:      'BSD',
                    TipoCambio:  '0.0000',
                  };
                });
              }
              // Fallback
              return [{
                Descripcion: 'Transferencia Bancaria',
                Fecha:       formatearFecha(fechaActual.toISOString()),
                Forma:       '05',
                Monto:       totalAPagar.toFixed(2),
                Moneda:      'BSD',
                TipoCambio:  '0.0000',
              }];
            })(),
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
        InfoAdicional: [
          // Actividad Económica (Licencia)
          ...(propRef?.actividad_principal ? [{
            nombre: 'LicenciaActividades',
            valor:  propRef.actividad_principal,
          }] : []),
          // Banco y referencia del pago (si vienen en formasPago)
          ...(formasPago?.[0]?.banco ? [{ nombre: 'Banco', valor: formasPago[0].banco }] : []),
          ...(formasPago?.[0]?.referencia ? [{ nombre: 'Referencia', valor: formasPago[0].referencia }] : []),
        ],
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
          url:              tfhkaResponse.resultado?.urlConsulta || null,
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
