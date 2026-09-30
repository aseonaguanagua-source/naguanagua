import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

// Helper to convert number to words for the invoice
// Implementación básica (idealmente usar una librería como numero-a-letras)
function numeroALetras(monto: number): string {
  // Solo placeholder para cumplir con el JSON
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
    let propRef = userProps && userProps.length > 0 ? userProps[0] : null;

    if (userProps && userProps.length > 0) {
      isComercial = userProps.some(p => 
        (p.tipo || '').toLowerCase().includes('comercial') || 
        (p.tipo || '').toLowerCase().includes('industrial') ||
        (p.actividad_principal || '').toLowerCase().includes('comercial') ||
        (p.actividad_principal || '').toLowerCase().includes('industrial')
      );
    }
    
    // Fallback: If not explicitly marked commercial, but it's a J or G, it is commercial
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

    // ==========================================
    // CONSTRUCCIÓN DEL JSON TFHKA (V2)
    // ==========================================
    const fechaActual = new Date();
    const horaStr = fechaActual.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
    
    // Obtenemos los recibos reales para sacar el monto exacto por ítem
    const { data: facturasBD } = await supabase.from('facturas').select('*').in('referencia', recibos);
    
    let totalGravado = 0;
    let totalExento = 0;
    let totalIVA = 0;

    const detallesItems = (facturasBD || []).map((fac, idx) => {
      const montoItem = parseFloat(String(fac.monto || '0').replace(/[^0-9.]/g, ''));
      
      let tasaIVA = "0";
      let valorIVA = 0;
      let codigoImpuesto = "E"; // E = Exento
      let valorTotalItem = montoItem;

      if (isComercial) {
        codigoImpuesto = "G"; // G = Gravado General (16%)
        tasaIVA = "16.00";
        valorIVA = montoItem * 0.16;
        valorTotalItem = montoItem + valorIVA;
        
        totalGravado += montoItem;
        totalIVA += valorIVA;
      } else {
        totalExento += montoItem;
      }

      return {
        NumeroLinea: String(idx + 1),
        CodigoCIIU: "0198",
        CodigoPLU: "ASEO001",
        IndicadorBienoServicio: "2",
        Descripcion: `Servicio de Aseo Urbano - Recibo ${fac.referencia}`,
        Cantidad: "1",
        UnidadMedida: "NIU",
        PrecioUnitario: montoItem.toFixed(2),
        PrecioUnitarioDescuento: null,
        MontoBonificacion: null,
        DescripcionBonificacion: null,
        DescuentoMonto: "0.00",
        RecargoMonto: "0",
        PrecioItem: montoItem.toFixed(2),
        PrecioAntesDescuento: montoItem.toFixed(2),
        CodigoImpuesto: codigoImpuesto,
        TasaIVA: tasaIVA,
        ValorIVA: valorIVA.toFixed(2),
        ValorTotalItem: valorTotalItem.toFixed(2),
        InfoAdicionalItem: [],
        ListaItemOTI: null
      };
    });
    const docIdentificacion = identidad.replace(/[^A-Z0-9-]/gi, '');
    const tipoId = docIdentificacion.charAt(0).toUpperCase();
    const numId = docIdentificacion.substring(1).replace(/^-/, ''); // Elimina guion inicial si lo hay

    const jsonTFHKA = {
      documentoElectronico: {
        Encabezado: {
          IdentificacionDocumento: {
            TipoDocumento: "01", // Factura
            NumeroDocumento: `000000${pagoId}`.slice(-8), // Generado internamente si no se manda
            TipoProveedor: null,
            TipoTransaccion: null,
            FechaEmision: formatearFecha(fechaActual.toISOString()),
            FechaVencimiento: formatearFecha(fechaActual.toISOString()),
            HoraEmision: horaStr,
            Anulado: false,
            TipoDePago: "Inmediato",
            Serie: "", // Enviar vacío o "nulo" si no se usan series descentralizadas
            Sucursal: "",
            TipoDeVenta: "Interna"
          },
          Vendedor: null,
          Comprador: {
            TipoIdentificacion: tipoId || "J",
            NumeroIdentificacion: numId,
            RazonSocial: contribuyente || "CONTRIBUYENTE",
            Direccion: propRef?.direccion || "NAGUANAGUA",
            Ubigeo: null,
            Pais: "VE",
            Notificar: "SI",
            Telefono: [], // Could be added later if column exists
            Correo: ["aseonaguanagua@globalgreenca.com"],
            OtrosEnvios: null
          },
          SujetoRetenido: null,
          Tercero: null,
          Totales: {
            NroItems: String(detallesItems.length),
            MontoGravadoTotal: totalGravado.toFixed(2),
            MontoExentoTotal: totalExento.toFixed(2),
            MontoPercibidoTotal: "0.00",
            SubtotalAntesDescuento: (totalGravado + totalExento).toFixed(2),
            TotalDescuento: null,
            TotalRecargos: null,
            Subtotal: (totalGravado + totalExento).toFixed(2),
            TotalIVA: totalIVA.toFixed(2),
            MontoTotalConIVA: (totalGravado + totalExento + totalIVA).toFixed(2),
            TotalAPagar: (totalGravado + totalExento + totalIVA).toFixed(2),
            MontoEnLetras: numeroALetras(totalGravado + totalExento + totalIVA),
            ImpuestosSubtotal: isComercial ? [
              {
                CodigoTotalImp: "G",
                AlicuotaImp: "16.00",
                BaseImponibleImp: totalGravado.toFixed(2),
                ValorTotalImp: totalIVA.toFixed(2)
              }
            ] : [
              {
                CodigoTotalImp: "E",
                AlicuotaImp: "00.00",
                BaseImponibleImp: totalExento.toFixed(2),
                ValorTotalImp: "00.00"
              }
            ],
            FormasPago: [
              {
                Descripcion: "Pago",
                Fecha: formatearFecha(fechaActual.toISOString()),
                Forma: "01", // Depósito/Transferencia (ajustar dinámicamente)
                Monto: (totalGravado + totalExento + totalIVA).toFixed(2),
                Moneda: "VES",
                TipoCambio: "0.0000"
              }
            ]
          }
        },
        DetallesItems: detallesItems
      }
    };

    const isTfhkaEnabled = process.env.TFHKA_ENABLED === 'true';

    // Obtenemos el pago actual para actualizar su JSON de detalles
    const { data: pagoData } = await supabase.from('pagos_reportados').select('detalles').eq('id', pagoId).single();
    let nuevosDetalles = pagoData?.detalles || {};
    if (typeof nuevosDetalles === 'string') {
      try { nuevosDetalles = JSON.parse(nuevosDetalles); } catch(e) { nuevosDetalles = {}; }
    }

    if (isTfhkaEnabled) {
      console.log(`[TFHKA] Enviando Factura Real para pago ${pagoId}`);
      try {
        const tfhkaResponse = await TheFactoryHKA.emitirDocumento(jsonTFHKA.documentoElectronico);
        
        nuevosDetalles.factura_digital = {
          emitida: true,
          url: tfhkaResponse.resultado?.imprentaDigital || null,
          numero_control: tfhkaResponse.resultado?.numeroControl || "ERROR-CONTROL",
          numero_documento: tfhkaResponse.resultado?.numeroDocumento || "ERROR-DOC",
          fecha_emision: new Date().toISOString(),
          raw_response: tfhkaResponse
        };
      } catch (err: any) {
        console.error("[TFHKA] Error en emisión real:", err.message);
        // Si falla, guardamos el error en detalles para revisarlo
        nuevosDetalles.factura_digital_error = err.message;
        await supabase.from('pagos_reportados').update({ detalles: nuevosDetalles }).eq('id', pagoId);
        return NextResponse.json({ error: 'Error en TFHKA: ' + err.message }, { status: 500 });
      }
    } else {
      // === MODO SIMULACIÓN ===
      console.log(`[SIMULACIÓN TFHKA] Generando JSON (no enviado):`, JSON.stringify(jsonTFHKA, null, 2));
      
      const mockUrlConsulta = "https://democonsulta.thefactoryhka.com.ve/?doc=GhQVet4Fbe+vAHltz47VsoKrQ1NOzTmiOLp4jVe5oz4U01Z9FA/OdGcGnU9nU1co";
      const mockNumeroControl = `00-00000${Math.floor(Math.random() * 1000)}`;

      nuevosDetalles.factura_digital = {
        emitida: true,
        url: mockUrlConsulta,
        numero_control: mockNumeroControl,
        fecha_emision: new Date().toISOString(),
        simulated: true,
        payload_generado: jsonTFHKA
      };
    }

    await supabase.from('pagos_reportados').update({ detalles: nuevosDetalles }).eq('id', pagoId);

    return NextResponse.json({ 
      success: true, 
      simulated: !isTfhkaEnabled, 
      url: nuevosDetalles.factura_digital.url
    });

  } catch (err: any) {
    console.error("Error al emitir factura digital:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
