import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
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
    // 1) Buscar un contribuyente COMERCIAL (identidad J o G) que tenga al menos un pago aprobado
    const { data: pagosComerciales, error: pagErr } = await supabase
      .from('pagos_reportados')
      .select('id, identidad, contribuyente, recibos, multa, monto_total, monto_usd, detalles')
      .like('identidad', 'J%')
      .eq('aprobado', true)
      .not('multa', 'is', null)
      .gt('multa', 0)
      .order('created_at', { ascending: false })
      .limit(1);

    if (pagErr || !pagosComerciales || pagosComerciales.length === 0) {
      // Fallback: cualquier pago comercial aunque no tenga multa
      const { data: fallback } = await supabase
        .from('pagos_reportados')
        .select('id, identidad, contribuyente, recibos, multa, monto_total, monto_usd, detalles')
        .like('identidad', 'J%')
        .eq('aprobado', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!fallback || fallback.length === 0) {
        return NextResponse.json({ error: 'No se encontró ningún contribuyente comercial aprobado.' }, { status: 404 });
      }
      pagosComerciales?.push(...(fallback || []));
    }

    const pago = pagosComerciales![0];
    const recibos: string[] = Array.isArray(pago.recibos) ? pago.recibos : [];

    // 2) Buscar las facturas reales de esos recibos
    const { data: facturasBD } = recibos.length > 0
      ? await supabase.from('facturas').select('*').in('referencia', recibos)
      : { data: [] };

    // 3) Buscar datos del inmueble para la dirección
    const { data: inmuebles } = await supabase
      .from('inmuebles')
      .select('direccion, actividad_principal')
      .eq('identidad', pago.identidad)
      .limit(1);

    const propRef = inmuebles && inmuebles.length > 0 ? inmuebles[0] : null;

    // 4) Procesar identidad: J-12345678 → tipo=J, num=12345678
    const docLimpio = (pago.identidad || 'J000000000').replace(/[^A-Z0-9]/gi, '');
    const tipoId = docLimpio.charAt(0).toUpperCase();
    const numId  = docLimpio.substring(1);

    // 5) Calcular montos
    const fechaActual = new Date();
    const horaStr = fechaActual.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).toLowerCase();

    let totalGravado = 0;
    let totalIVA     = 0;
    const multaMonto = parseFloat(String(pago.multa || '0').replace(/[^0-9.]/g, ''));

    const detallesItems = (facturasBD || []).map((fac: any, idx: number) => {
      const montoItem = parseFloat(String(fac.monto || '0').replace(/[^0-9.]/g, ''));
      const valorIVA  = montoItem * 0.16;
      totalGravado   += montoItem;
      totalIVA       += valorIVA;
      return {
        NumeroLinea:             String(idx + 1),
        CodigoCIIU:              '0198',
        CodigoPLU:               'ASEO001',
        IndicadorBienoServicio:  '2',
        Descripcion:             `Servicio de Aseo Urbano - ${fac.referencia}`,
        Cantidad:                '1',
        UnidadMedida:            'NIU',
        PrecioUnitario:          montoItem.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          '0.00',
        RecargoMonto:            '0',
        PrecioItem:              montoItem.toFixed(2),
        PrecioAntesDescuento:    montoItem.toFixed(2),
        CodigoImpuesto:          'G',
        TasaIVA:                 '16.00',
        ValorIVA:                valorIVA.toFixed(2),
        ValorTotalItem:          (montoItem + valorIVA).toFixed(2),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      };
    });

    // Si no hay recibos en BD, usamos monto_total del pago como fallback
    if (detallesItems.length === 0) {
      const montoFallback = parseFloat(String(pago.monto_total || '100').replace(/[^0-9.]/g, ''));
      const ivaFallback   = montoFallback * 0.16;
      totalGravado = montoFallback;
      totalIVA     = ivaFallback;
      detallesItems.push({
        NumeroLinea:             '1',
        CodigoCIIU:              '0198',
        CodigoPLU:               'ASEO001',
        IndicadorBienoServicio:  '2',
        Descripcion:             `Servicio de Aseo Urbano`,
        Cantidad:                '1',
        UnidadMedida:            'NIU',
        PrecioUnitario:          montoFallback.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          '0.00',
        RecargoMonto:            '0',
        PrecioItem:              montoFallback.toFixed(2),
        PrecioAntesDescuento:    montoFallback.toFixed(2),
        CodigoImpuesto:          'G',
        TasaIVA:                 '16.00',
        ValorIVA:                ivaFallback.toFixed(2),
        ValorTotalItem:          (montoFallback + ivaFallback).toFixed(2),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      });
    }

    // Agregar multa como ítem adicional si existe
    if (multaMonto > 0) {
      const ivaMulra = multaMonto * 0.16;
      totalGravado += multaMonto;
      totalIVA     += ivaMulra;
      detallesItems.push({
        NumeroLinea:             String(detallesItems.length + 1),
        CodigoCIIU:              '0198',
        CodigoPLU:               'MULTA001',
        IndicadorBienoServicio:  '2',
        Descripcion:             'Multa por Mora - Aseo Urbano',
        Cantidad:                '1',
        UnidadMedida:            'NIU',
        PrecioUnitario:          multaMonto.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion:       null,
        DescripcionBonificacion: null,
        DescuentoMonto:          '0.00',
        RecargoMonto:            '0',
        PrecioItem:              multaMonto.toFixed(2),
        PrecioAntesDescuento:    multaMonto.toFixed(2),
        CodigoImpuesto:          'G',
        TasaIVA:                 '16.00',
        ValorIVA:                ivaMulra.toFixed(2),
        ValorTotalItem:          (multaMonto + ivaMulra).toFixed(2),
        InfoAdicionalItem:       [],
        ListaItemOTI:            null,
      });
    }

    const totalAPagar = totalGravado + totalIVA;

    const documentoElectronico = {
      Moneda: 'VES',
      Encabezado: {
        IdentificacionDocumento: {
          TipoDocumento:    '01',
          NumeroDocumento:  `000000${pago.id}`.slice(-8),
          TipoProveedor:    null,
          TipoTransaccion:  null,
          FechaEmision:     formatearFecha(fechaActual.toISOString()),
          FechaVencimiento: formatearFecha(fechaActual.toISOString()),
          HoraEmision:      horaStr,
          Anulado:          false,
          TipoDePago:       'Inmediato',
          Serie:            '',
          Sucursal:         '',
          TipoDeVenta:      'Interna',
        },
        Vendedor: null,
        Comprador: {
          TipoIdentificacion: tipoId || 'J',
          NumeroIdentificacion: numId,
          RazonSocial:   pago.contribuyente || 'CONTRIBUYENTE COMERCIAL',
          Direccion:     propRef?.direccion || 'NAGUANAGUA, CARABOBO',
          Ubigeo:        null,
          Pais:          'VE',
          Notificar:     'Si',
          Telefono:      [],
          Correo:        ['aseonaguanagua@globalgreenca.com'],
          OtrosEnvios:   null,
        },
        SujetoRetenido: null,
        Tercero:        null,
        Totales: {
          NroItems:               String(detallesItems.length),
          MontoGravadoTotal:      totalGravado.toFixed(2),
          MontoExentoTotal:       '0.00',
          MontoPercibidoTotal:    '0.00',
          SubtotalAntesDescuento: totalGravado.toFixed(2),
          TotalDescuento:         null,
          TotalRecargos:          null,
          Subtotal:               totalGravado.toFixed(2),
          TotalIVA:               totalIVA.toFixed(2),
          MontoTotalConIVA:       totalAPagar.toFixed(2),
          TotalAPagar:            totalAPagar.toFixed(2),
          MontoEnLetras:          'MONTO EN LETRAS',
          ImpuestosSubtotal: [
            {
              CodigoTotalImp:  'G',
              AlicuotaImp:     '16.00',
              BaseImponibleImp: totalGravado.toFixed(2),
              ValorTotalImp:   totalIVA.toFixed(2),
            },
          ],
          FormasPago: [
            {
              Descripcion: 'Pago',
              Fecha:       formatearFecha(fechaActual.toISOString()),
              Forma:       '01',
              Monto:       totalAPagar.toFixed(2),
              Moneda:      'VES',
              TipoCambio:  '0.0000',
            },
          ],
        },
      },
      DetallesItems: detallesItems,
    };

    const tfhkaResponse = await TheFactoryHKA.emitirDocumento(documentoElectronico);
    const url = tfhkaResponse.resultado?.imprentaDigital || null;

    if (!url) {
      return NextResponse.json({
        error: 'La API de The Factory HKA no devolvió un enlace.',
        raw: tfhkaResponse,
        datoUsado: { contribuyente: pago.contribuyente, identidad: pago.identidad },
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      url,
      datoUsado: {
        contribuyente: pago.contribuyente,
        identidad:     pago.identidad,
        multa:         multaMonto,
        pagoId:        pago.id,
      },
      raw: tfhkaResponse,
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
