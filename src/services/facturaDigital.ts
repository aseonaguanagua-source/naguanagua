/**
 * Servicio de Factura Digital TFHKA — Lógica de emisión centralizada.
 * 
 * Separa la lógica de negocio de facturación que antes estaba en
 * la API route emitir/route.ts.
 */

import type { Inmueble } from '@/types';
import { esComercial as checkComercial, getInmueblesContribuyente } from './contribuyentes';

/**
 * Determina si se debe emitir factura digital para este contribuyente.
 * Regla de negocio: Solo comerciales (J, G, o clasificación comercial/industrial).
 */
export function debeEmitirFactura(identidad: string, inmuebles: Inmueble[]): boolean {
  return checkComercial(identidad, inmuebles);
}

/**
 * Formatea una fecha ISO a DD/MM/YYYY para el JSON de TFHKA.
 */
export function formatearFechaTFHKA(isoString: string): string {
  const d = new Date(isoString);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

/**
 * Extrae tipo y número de identificación de una cédula/RIF.
 * Ej: "J-12345678-9" → { tipo: "J", numero: "123456789" }
 */
export function parseIdentificacion(identidad: string): { tipo: string; numero: string } {
  const docIdentificacion = identidad.replace(/[^A-Z0-9-]/gi, '');
  const tipoId = docIdentificacion.charAt(0).toUpperCase();
  const numId = docIdentificacion.substring(1).replace(/^-/, '');
  return { tipo: tipoId || 'J', numero: numId };
}

/**
 * Construye el JSON para la API de TFHKA según el technical_reference_api.pdf.
 */
export function construirPayloadTFHKA(params: {
  pagoId: string;
  identidad: string;
  contribuyente: string;
  direccion?: string;
  items: Array<{
    descripcion: string;
    monto: number;
  }>;
  montoTotal: number;
  formasPago?: Array<{
    descripcion: string;
    fecha: string;
    forma: string;
    monto: number;
  }>;
}) {
  const { pagoId, identidad, contribuyente, direccion, items, montoTotal, formasPago } = params;
  const fechaActual = new Date();
  const horaStr = fechaActual.toLocaleTimeString('en-US', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
  }).toLowerCase();
  
  const { tipo: tipoId, numero: numId } = parseIdentificacion(identidad);
  
  let totalExento = 0;
  const detallesItems = items.map((item, idx) => {
    totalExento += item.monto;
    return {
      NumeroLinea: String(idx + 1),
      CodigoCIIU: "0198",
      CodigoPLU: "ASEO001",
      IndicadorBienoServicio: "2", // 2 = Servicio
      Descripcion: item.descripcion,
      Cantidad: "1",
      UnidadMedida: "NIU",
      PrecioUnitario: item.monto.toFixed(2),
      PrecioUnitarioDescuento: null,
      MontoBonificacion: null,
      DescripcionBonificacion: null,
      DescuentoMonto: "0.00",
      RecargoMonto: "0",
      PrecioItem: item.monto.toFixed(2),
      PrecioAntesDescuento: item.monto.toFixed(2),
      CodigoImpuesto: "E", // E = Exento
      TasaIVA: "0",
      ValorIVA: "0.00",
      ValorTotalItem: item.monto.toFixed(2),
      InfoAdicionalItem: [],
      ListaItemOTI: null
    };
  });

  if (totalExento <= 0) totalExento = montoTotal;

  return {
    documentoElectronico: {
      Encabezado: {
        IdentificacionDocumento: {
          TipoDocumento: "01",
          NumeroDocumento: `000000${pagoId}`.slice(-8),
          TipoProveedor: null,
          TipoTransaccion: null,
          FechaEmision: formatearFechaTFHKA(fechaActual.toISOString()),
          FechaVencimiento: formatearFechaTFHKA(fechaActual.toISOString()),
          HoraEmision: horaStr,
          Anulado: false,
          TipoDePago: "Inmediato",
          Serie: "",
          Sucursal: "",
          TipoDeVenta: "Interna"
        },
        Vendedor: null,
        Comprador: {
          TipoIdentificacion: tipoId,
          NumeroIdentificacion: numId,
          RazonSocial: contribuyente || "CONTRIBUYENTE",
          Direccion: direccion || "NAGUANAGUA",
          Ubigeo: null,
          Pais: "VE",
          Notificar: "1",
          Telefono: [],
          Correo: [],
          OtrosEnvios: null
        },
        SujetoRetenido: null,
        Tercero: null,
        Totales: {
          NroItems: String(detallesItems.length),
          MontoGravadoTotal: "0.00",
          MontoExentoTotal: totalExento.toFixed(2),
          MontoPercibidoTotal: "0.00",
          SubtotalAntesDescuento: totalExento.toFixed(2),
          TotalDescuento: null,
          TotalRecargos: null,
          Subtotal: totalExento.toFixed(2),
          TotalIVA: "0.00",
          MontoTotalConIVA: totalExento.toFixed(2),
          TotalAPagar: totalExento.toFixed(2),
          MontoEnLetras: "MONTO EN LETRAS POR IMPLEMENTAR",
          ImpuestosSubtotal: [
            {
              CodigoTotalImp: "E",
              AlicuotaImp: "00.00",
              BaseImponibleImp: totalExento.toFixed(2),
              ValorTotalImp: "00.00"
            }
          ],
          FormasPago: (formasPago || []).map(fp => ({
            Descripcion: fp.descripcion || "Pago",
            Fecha: formatearFechaTFHKA(fp.fecha),
            Forma: fp.forma || "01",
            Monto: fp.monto.toFixed(2),
            Moneda: "VES",
            TipoCambio: "0.0000"
          }))
        }
      },
      DetallesItems: detallesItems
    }
  };
}
