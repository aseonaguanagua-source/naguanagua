'use client';
import React, { useRef, useState, useEffect } from 'react';
import { X, Printer, Send, ShieldCheck, AlertTriangle, QrCode } from 'lucide-react';
import { formatBs } from '@/lib/formatCurrency';
import { supabase } from '@/lib/supabase';

interface DemoFacturaProps {
  isOpen: boolean;
  onClose: () => void;
  pago: any;
  onProcederEmitir?: (pago: any) => void;
}

export function DemoFacturaModal({ isOpen, onClose, pago, onProcederEmitir }: DemoFacturaProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [inmuebleDireccion, setInmuebleDireccion] = useState<string>('');
  const [inmuebleLicencia, setInmuebleLicencia] = useState<string>('');

  const det = pago?.detalles || {};
  const esRetencion = Boolean(
    pago?.conRetencion ||
    pago?.esRetencion ||
    det.conRetencion ||
    det.es_retencion ||
    det.agente_retencion ||
    (parseFloat(String(det.monto_retencion_iva || 0)) > 0)
  );

  const montoPagado = parseFloat(String(pago?.monto || det.montoTotal || 0));

  let totalFactura = 0;
  let baseImponible = 0;
  let iva = 0;
  let retencionIva = 0;
  let exento = parseFloat(String(det.multa_bs || 0)) || 0;

  if (pago?.totalManual && parseFloat(String(pago.totalManual)) > 0) {
    totalFactura = parseFloat(String(pago.totalManual));
    if (esRetencion) {
      baseImponible = parseFloat(((totalFactura - exento) / 1.16).toFixed(2));
      iva = parseFloat((totalFactura - exento - baseImponible).toFixed(2));
      retencionIva = parseFloat((iva * 0.75).toFixed(2));
    } else {
      baseImponible = parseFloat(((totalFactura - exento) / 1.16).toFixed(2));
      iva = parseFloat((totalFactura - exento - baseImponible).toFixed(2));
      retencionIva = 0;
    }
  } else if (det.monto_factura && parseFloat(String(det.monto_factura)) > 0) {
    totalFactura = parseFloat(String(det.monto_factura));
    retencionIva = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || 0));
    baseImponible = parseFloat(((totalFactura - exento) / 1.16).toFixed(2));
    iva = parseFloat((totalFactura - exento - baseImponible).toFixed(2));
  } else if (esRetencion) {
    if (det.monto_retencion_iva && parseFloat(String(det.monto_retencion_iva)) > 0) {
      retencionIva = parseFloat(String(det.monto_retencion_iva));
      totalFactura = parseFloat((montoPagado + retencionIva).toFixed(2));
      baseImponible = parseFloat(((totalFactura - exento) / 1.16).toFixed(2));
      iva = parseFloat((totalFactura - exento - baseImponible).toFixed(2));
    } else {
      // 75% retención sobre IVA 16%: montoPagado = base + 0.25 * 0.16 * base = 1.04 * base
      baseImponible = parseFloat(((montoPagado - exento) / 1.04).toFixed(2));
      iva = parseFloat((baseImponible * 0.16).toFixed(2));
      retencionIva = parseFloat((iva * 0.75).toFixed(2));
      totalFactura = parseFloat((baseImponible + exento + iva).toFixed(2));
    }
  } else {
    totalFactura = montoPagado;
    baseImponible = parseFloat(((totalFactura - exento) / 1.16).toFixed(2));
    iva = parseFloat((totalFactura - exento - baseImponible).toFixed(2));
    retencionIva = 0;
  }

  const montoNetoCobrado = esRetencion ? parseFloat((totalFactura - retencionIva).toFixed(2)) : totalFactura;

  const fechaActual = new Date().toLocaleDateString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const horaActual = new Date().toLocaleTimeString('es-VE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });

  const fechaEmisionDoc = pago?.fechaEmision
    ? new Date(pago.fechaEmision).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : fechaActual;
  const horaEmisionDoc = pago?.fechaEmision
    ? new Date(pago.fechaEmision).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    : horaActual;

  const numeroDoc = pago?.numeroDocumento || det.numero_documento || '00000XXX';
  const numeroCtrl = pago?.numeroControl || det.numero_control || '00-00000XXX';

  const inmuebleCod = det.inmueble || (det.recibos && det.recibos[0]) || (pago?.inmuebles && pago.inmuebles[0]?.inmueble) || (pago?.recibos && pago.recibos[0]) || '';
  const mesAseo = det.mes_aseo || (pago?.mesesServicio && pago.mesesServicio[0]) || 'Mes en Curso';
  const nombreReceptor = pago?.contribuyente || det.contribuyente || det.contribuyente_nombre || 'Contribuyente';
  const rifReceptor = pago?.identidad || det.identidad || '';
  const cajero = det.cajero || det.analista || 'Administrador';
  const banco = pago?.banco && pago.banco !== 'N/A' ? pago.banco : (det.banco && det.banco !== 'N/A' ? det.banco : 'Banesco');
  const referencia = pago?.referencia && pago.referencia !== 'N/A' ? pago.referencia : (det.referencia || 'N/A');
  const tipoPago = pago?.tipo || det.tipo || 'Transferencia';
  const pagoIdCorto = String(pago?.id || det.pagoId || '').slice(0, 8).toUpperCase();

  // Obtener dirección y licencia de la base de datos si no viene en el pago
  useEffect(() => {
    if (!isOpen || !inmuebleCod) return;
    let cancel = false;

    async function loadInmuebleInfo() {
      try {
        const { data: inm } = await supabase
          .from('inmuebles')
          .select('direccion, licencia')
          .eq('inmueble', inmuebleCod)
          .maybeSingle();

        if (!cancel && inm) {
          if (inm.direccion) setInmuebleDireccion(inm.direccion);
          if (inm.licencia) setInmuebleLicencia(inm.licencia);
        }
      } catch (e) {
        console.warn('No se pudo cargar info complementaria del inmueble:', e);
      }
    }

    loadInmuebleInfo();
    return () => { cancel = true; };
  }, [isOpen, inmuebleCod]);

  if (!isOpen || !pago) return null;

  const direccionFinal = det.direccion || inmuebleDireccion || 'AV. DON JULIO CENTENO C.C. SAMBIL NIVEL AUTOPISTA LOCAL L-035 URB. MAÑONGO, NAGUANAGUA EDO. CARABOBO';
  const licenciaFinal = det.licencia || inmuebleLicencia || 'VENTA DE EQUIPOS Y ARTICULOS VARIOS';

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = `Factura_TheFactoryHKA_${rifReceptor}_${numeroDoc}`;
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 1000);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .the-factory-paper, .the-factory-paper * {
            visibility: visible;
          }
          .the-factory-paper {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 10mm !important;
            margin: 0 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-300">
        {/* Barra superior de control (no imprimible) */}
        <div className="no-print px-5 py-3 bg-[#0d2a4a] text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="p-1.5 bg-[#EB5424]/20 text-[#EB5424] rounded-lg border border-[#EB5424]/40">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base tracking-wide text-white">
                  Demo y Formato Oficial — The Factory HKA
                </h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                  Providencia SNAT
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium">
                Plantilla exacta generada por el proveedor autorizado The Factory HKA Venezuela
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-[#EB5424] hover:bg-[#d4481c] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Descargar en PDF o imprimir la vista previa"
            >
              <Printer className="w-4 h-4 text-white" />
              <span className="hidden sm:inline">Imprimir / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hoja de Factura Oficial The Factory HKA (Imprimible y visual) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-200/70 flex justify-center">
          <div
            ref={printAreaRef}
            className="the-factory-paper bg-white w-full max-w-[820px] rounded-lg shadow-xl border border-slate-300 p-6 sm:p-9 text-slate-800 text-xs font-sans relative"
          >
            {/* Marca de agua institucional en el centro idéntica a la factura de Factory */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.05] select-none">
              <img
                src="/logos/IAMEC.png"
                alt="IAMEC Watermark"
                className="w-[420px] max-w-full grayscale"
              />
            </div>

            {/* ══ 1. ENCABEZADO INSTITUCIONAL IAMEC + METADATOS TFHKA ══ */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-3">
              {/* Logo y datos del emisor oficial (IAMEC) */}
              <div className="space-y-0.5 max-w-[480px]">
                <img
                  src="/logos/IAMEC.png"
                  alt="IAMEC"
                  className="h-14 sm:h-16 object-contain"
                />
                <h1 className="text-[12px] sm:text-[13px] font-black text-[#1E3A8A] uppercase tracking-tight pt-1">
                  INSTITUTO AUTONOMO MUNICIPAL DE ECOSOCIALISMO NAGUANAGUA
                </h1>
                <p className="text-[11px] font-bold text-slate-800">
                  G-20008614-9
                </p>
                <p className="text-[8.5px] leading-snug text-slate-600 uppercase font-medium">
                  CTRA NACIONAL VIA LA ENTRADA CC RIO SIL NIVEL 2 LOCAL 37 ZONA RURAL DE BARBULA NAGUANAGUA NAGUANAGUA CARABOBO ZONA POSTAL 2006
                </p>
              </div>

              {/* Título FACTURA y bloque derecho */}
              <div className="text-right sm:min-w-[220px] w-full sm:w-auto self-start">
                <h2 className="text-xl sm:text-2xl font-black text-[#1E3A8A] tracking-wider mb-1.5 uppercase text-right">
                  FACTURA
                </h2>
                <div className="text-[10px] sm:text-[10.5px] space-y-0.5 text-slate-700">
                  <div className="flex justify-between sm:justify-end gap-3">
                    <span className="text-slate-500 font-semibold">N° de Documento:</span>
                    <strong className="font-mono text-slate-900">{numeroDoc}</strong>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-3">
                    <span className="text-slate-500 font-semibold">Fecha de Emisión:</span>
                    <strong className="text-slate-900">{fechaEmisionDoc}</strong>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-3">
                    <span className="text-slate-500 font-semibold">Hora de Emisión:</span>
                    <strong className="text-slate-900">{horaEmisionDoc}</strong>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-3">
                    <span className="text-[#D32F2F] font-bold">N° de Control:</span>
                    <strong className="font-mono text-[#D32F2F] font-black">{numeroCtrl}</strong>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-3">
                    <span className="text-slate-500 font-semibold">Fecha de Asig.:</span>
                    <strong className="text-slate-900">{fechaEmisionDoc}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ══ 2. DATOS DEL CLIENTE (RECEPTOR) EN CUADRO CON BORDE ══ */}
            <div className="my-3 border border-slate-300 rounded-lg p-2.5 sm:p-3 text-[10px] sm:text-[10.5px] space-y-1 bg-white">
              <div className="font-black uppercase text-slate-900 text-[10.5px] tracking-wide pb-0.5">
                DATOS DEL CLIENTE
              </div>
              <div className="flex flex-wrap gap-x-2">
                <span className="font-bold text-slate-800">Cod. Cliente:</span>
                <span className="font-mono font-bold text-slate-900">{inmuebleCod}</span>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <span className="font-bold text-slate-800">Razón Social / Nombre:</span>
                <span className="font-bold text-slate-900 uppercase">{nombreReceptor}</span>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <span className="font-bold text-slate-800">Dirección:</span>
                <span className="text-slate-700 uppercase font-medium">{direccionFinal}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 pt-0.5 text-slate-800">
                <div>
                  <span className="font-bold">RIF/C.I.:</span>{' '}
                  <span className="font-mono font-black text-slate-900">{rifReceptor}</span>
                </div>
                <div>
                  <span className="font-bold">Licencia de Actividades Económicas:</span>{' '}
                  <span className="text-slate-800 uppercase font-semibold">{licenciaFinal}</span>
                </div>
                <div>
                  <span className="font-bold">Caja:</span>{' '}
                  <span className="text-slate-800 font-mono font-bold">{cajero}</span>
                </div>
              </div>
            </div>

            {/* ══ 3. TABLA DE RENGLONES CON CABECERA NARANJA OFICIAL TFHKA ══ */}
            <div className="my-3 border border-slate-300 rounded-sm overflow-hidden">
              <table className="w-full text-left border-collapse text-[10px] sm:text-[10.5px]">
                <thead>
                  <tr className="bg-[#EB5424] text-white font-black text-[10px] sm:text-[10.5px] uppercase">
                    <th className="py-1.5 px-2 text-center w-12 border-r border-[#EB5424]/40">CANT.</th>
                    <th className="py-1.5 px-3">DESCRIPCIÓN</th>
                    <th className="py-1.5 px-3 text-right w-28 sm:w-32">PRECIO UNIT.(Bs.)</th>
                    <th className="py-1.5 px-2 text-center w-24">ALÍCUOTA IVA</th>
                    <th className="py-1.5 px-3 text-right w-28 sm:w-32">TOTAL (Bs.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="align-top">
                    <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">1</td>
                    <td className="py-2.5 px-3 text-slate-900 font-semibold leading-relaxed">
                      Servicio de Aseo Urbano - {inmuebleCod} ({mesAseo})
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                      {formatBs(baseImponible)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono font-black text-slate-800">
                      G
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                      {formatBs(baseImponible)}
                    </td>
                  </tr>

                  {exento > 0 && (
                    <tr className="align-top bg-slate-50/60">
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">1</td>
                      <td className="py-2.5 px-3 text-slate-900 font-semibold leading-relaxed">
                        Multa por Mora - Aseo Urbano {inmuebleCod}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        {formatBs(exento)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-black text-slate-800">
                        (E)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                        {formatBs(exento)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ══ 4. SECCIÓN INFERIOR: FORMAS DE PAGO (IZQ) Y TOTALES (DER) ══ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-3 pt-1">
              {/* Columna Izquierda: NOTAS Y FORMAS DE PAGO */}
              <div className="space-y-2">
                <div>
                  <div className="font-black text-[10px] sm:text-[10.5px] uppercase text-slate-900">
                    NOTAS Y COMENTARIOS
                  </div>
                  <p className="text-[10px] font-mono text-slate-700">
                    Pago {pagoIdCorto} Ref. {referencia}
                  </p>
                  {esRetencion && (
                    <span className="inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      ★ Contribuyente Especial / Agente de Retención (75% IVA)
                    </span>
                  )}
                </div>

                {/* Caja de Formas de Pago */}
                <div className="border border-slate-300 rounded overflow-hidden max-w-[320px]">
                  <div className="bg-slate-100 border-b border-slate-300 py-1 px-2.5 text-[10px] font-black uppercase text-slate-800">
                    Formas de Pago
                  </div>
                  <div className="p-2.5 text-[10px] space-y-0.5 text-slate-700 bg-white">
                    <div>
                      <strong>Forma:</strong> {tipoPago}
                    </div>
                    <div>
                      <strong>Banco:</strong> {banco}
                    </div>
                    <div>
                      <strong>Referencia:</strong> <span className="font-mono">{referencia}</span>
                    </div>
                    <div>
                      <strong>Monto:</strong> Bs. {formatBs(montoNetoCobrado)}
                    </div>
                    {esRetencion && (
                      <div className="text-amber-800 font-bold pt-0.5 border-t border-slate-200 mt-1">
                        <strong>Retención 75% IVA:</strong> Bs. {formatBs(retencionIva)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Columna Derecha: TOTALES DE FACTURA CON LÍNEA VERDE TFHKA */}
              <div className="text-right text-[10px] sm:text-[10.5px] font-mono space-y-1 self-start sm:pl-8">
                <div className="flex justify-between text-slate-700">
                  <span className="text-slate-600 font-sans font-medium">Subtotal</span>
                  <div className="space-x-3">
                    <span className="text-slate-400">BS.</span>
                    <span className="font-bold">{formatBs(baseImponible + exento)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-slate-700">
                  <span className="text-slate-600 font-sans font-medium">Descuento</span>
                  <div className="space-x-3">
                    <span className="text-slate-400">BS.</span>
                    <span className="font-bold">0,00</span>
                  </div>
                </div>

                <div className="flex justify-between text-slate-700">
                  <span className="text-slate-600 font-sans font-medium">Exento</span>
                  <div className="space-x-3">
                    <span className="text-slate-400">BS.</span>
                    <span className="font-bold">{formatBs(exento)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-slate-700">
                  <span className="text-slate-600 font-sans font-medium">Base Imponible (G)</span>
                  <div className="space-x-3">
                    <span className="text-slate-400">BS.</span>
                    <span className="font-bold">{formatBs(baseImponible)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-slate-700">
                  <span className="text-slate-600 font-sans font-medium">Alícuota IVA (16.00%)</span>
                  <div className="space-x-3">
                    <span className="text-slate-400">BS.</span>
                    <span className="font-bold">{formatBs(iva)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-slate-900 font-bold">
                  <span className="text-slate-700 font-sans font-bold">Total Documento</span>
                  <div className="space-x-3">
                    <span className="text-slate-500">BS.</span>
                    <span className="font-black">{formatBs(totalFactura)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-slate-600 text-[9.5px]">
                  <span className="text-slate-500 font-sans">Base Imponible (IGTF)</span>
                  <div className="space-x-3">
                    <span className="text-slate-400">BS.</span>
                    <span>0,00</span>
                  </div>
                </div>

                <div className="flex justify-between text-slate-600 text-[9.5px]">
                  <span className="text-slate-500 font-sans">Alícuota IGTF (3.00%)</span>
                  <div className="space-x-3">
                    <span className="text-slate-400">BS.</span>
                    <span>0,00</span>
                  </div>
                </div>

                {/* Línea verde oscura característica de The Factory HKA */}
                <div className="border-b-2 border-[#2E7D32] my-1.5"></div>

                <div className="flex justify-between items-center text-slate-950 pt-0.5">
                  <span className="text-xs sm:text-sm font-black font-sans uppercase">Total a Pagar</span>
                  <div className="space-x-2 text-sm sm:text-base font-black">
                    <span className="text-slate-600 text-xs font-bold">BS.</span>
                    <span>{formatBs(totalFactura)}</span>
                  </div>
                </div>

                {/* Resumen especial para agente de retención */}
                {esRetencion && (
                  <div className="mt-2 p-2 bg-amber-50/90 border border-amber-300 rounded text-[9.5px] text-right font-sans space-y-1">
                    <div className="flex justify-between text-amber-900 font-semibold">
                      <span>(-) Retención 75% IVA (SENIAT):</span>
                      <strong className="font-mono text-amber-950">- Bs. {formatBs(retencionIva)}</strong>
                    </div>
                    <div className="flex justify-between text-emerald-950 font-black text-xs border-t border-amber-200/80 pt-1">
                      <span>MONTO CANCELADO (NETO):</span>
                      <span className="font-mono font-black text-[#2E7D32]">Bs. {formatBs(montoNetoCobrado)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══ 5. NOTA LEGAL IGTF ══ */}
            <div className="mt-4 pt-2 border-t border-slate-200 text-[8px] leading-tight text-slate-500 text-justify">
              Este pago estará sujeto al cobro adicional del 3% del Impuesto a las Grandes Transacciones Financieras (IGTF), de conformidad con la Providencia Administrativa SNAT/2022/000013 publicada en la G.O N 42.339 del 17-03-2022, en caso de ser cancelado en divisas. No aplica en pago en Bs.
            </div>

            {/* ══ 6. PIE LEGAL Y CÓDIGO QR THE FACTORY HKA ══ */}
            <div className="mt-3 pt-3 border-t border-slate-300 flex items-center justify-between gap-4 text-[8px] sm:text-[8.5px] text-slate-500 leading-tight">
              <div className="w-14 h-14 bg-white border border-slate-300 p-0.5 flex items-center justify-center shrink-0">
                <QrCode className="w-12 h-12 text-slate-800" />
              </div>
              <div className="flex-1 text-center space-y-0.5 px-2">
                <p className="font-bold text-slate-800 uppercase tracking-tight">
                  DOCUMENTO EMITIDO CONFORME A LA PROVIDENCIA ADMINISTRATIVA SNAT/2024/000102
                </p>
                <p className="text-[7.5px] sm:text-[8px] text-slate-500 uppercase">
                  THE FACTORY HKA VENEZUELA, C.A J-402385358, AV DON DIEGO CISNEROS EDIF SIEMENS TORRE SUR PISO 2 OF S/N URB LOS RUICES CARACAS MIRANDA ZONA POSTAL 1071+58(212)202-0811. Imprenta Digital Autorizada mediante Providencia SENIAT/INTI/0000005 de fecha 09/09/2022 Nros de Control desde el N° 00-00000001 hasta el N° 00-00007000 generados digitalmente en fecha {fechaEmisionDoc} {horaEmisionDoc}.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Barra inferior de acciones (no imprimible) */}
        <div className="no-print px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {esRetencion ? (
              <span className="text-amber-900 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Agente de Retención: Factura Fiscal <b>Bs {formatBs(totalFactura)}</b> | Cancelado por el cliente: <b>Bs {formatBs(montoNetoCobrado)}</b>
              </span>
            ) : (
              <span>Factura Fiscal Ordinaria por un total de <b>Bs {formatBs(totalFactura)}</b></span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cerrar Vista Previa
            </button>
            {onProcederEmitir && (
              <button
                onClick={() => {
                  onClose();
                  onProcederEmitir(pago);
                }}
                className="px-5 py-2.5 bg-[#0d2a4a] hover:bg-[#153e6b] text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-[#EB5424]" />
                <span>Proceder a Emitir Factura</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
