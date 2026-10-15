'use client';
import React, { useRef } from 'react';
import { X, Printer, Send, ShieldCheck, CheckCircle2, AlertTriangle, Building2, QrCode } from 'lucide-react';
import { formatBs } from '@/lib/formatCurrency';

interface DemoFacturaProps {
  isOpen: boolean;
  onClose: () => void;
  pago: any;
  onProcederEmitir?: (pago: any) => void;
}

function numeroALetras(monto: number): string {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const especiales: Record<number, string> = {
    11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
    16: 'DIECISEIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
    21: 'VEINTIUN', 22: 'VEINTIDOS', 23: 'VEINTITRES', 24: 'VEINTICUATRO', 25: 'VEINTICINCO',
    26: 'VEINTISEIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE'
  };
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertirGrupo(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    if (especiales[n]) return especiales[n];
    if (n < 10) return unidades[n];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    const c = Math.floor(n / 100);
    const resto = n % 100;
    return resto === 0 ? centenas[c] : `${centenas[c]} ${convertirGrupo(resto)}`;
  }

  const entero = Math.floor(Math.abs(monto));
  const decimales = Math.round((Math.abs(monto) - entero) * 100);
  
  if (entero === 0) return `CERO BOLÍVARES CON ${String(decimales).padStart(2, '0')}/100`;

  let resultado = '';
  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;

  if (millones > 0) {
    resultado += millones === 1 ? 'UN MILLÓN' : `${convertirGrupo(millones)} MILLONES`;
    if (miles > 0 || resto > 0) resultado += ' ';
  }
  if (miles > 0) {
    resultado += miles === 1 ? 'MIL' : `${convertirGrupo(miles)} MIL`;
    if (resto > 0) resultado += ' ';
  }
  if (resto > 0) {
    resultado += convertirGrupo(resto);
  }

  return `${resultado} BOLÍVARES CON ${String(decimales).padStart(2, '0')}/100`;
}

export function DemoFacturaModal({ isOpen, onClose, pago, onProcederEmitir }: DemoFacturaProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !pago) return null;

  const det = pago.detalles || {};
  const esRetencion = Boolean(
    pago.conRetencion ||
    pago.esRetencion ||
    det.conRetencion ||
    det.es_retencion ||
    det.agente_retencion ||
    (parseFloat(String(det.monto_retencion_iva || 0)) > 0)
  );

  const montoPagado = parseFloat(String(pago.monto || det.montoTotal || 0));

  let totalFactura = 0;
  let baseImponible = 0;
  let iva = 0;
  let retencionIva = 0;

  if (det.monto_factura && parseFloat(String(det.monto_factura)) > 0) {
    totalFactura = parseFloat(String(det.monto_factura));
    retencionIva = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || 0));
    baseImponible = parseFloat((totalFactura / 1.16).toFixed(2));
    iva = parseFloat((totalFactura - baseImponible).toFixed(2));
  } else if (esRetencion) {
    if (det.monto_retencion_iva && parseFloat(String(det.monto_retencion_iva)) > 0) {
      retencionIva = parseFloat(String(det.monto_retencion_iva));
      totalFactura = parseFloat((montoPagado + retencionIva).toFixed(2));
      baseImponible = parseFloat((totalFactura / 1.16).toFixed(2));
      iva = parseFloat((totalFactura - baseImponible).toFixed(2));
    } else {
      // 75% retención: pagado = base + 0.25 * 0.16 * base = 1.04 * base
      baseImponible = parseFloat((montoPagado / 1.04).toFixed(2));
      iva = parseFloat((baseImponible * 0.16).toFixed(2));
      retencionIva = parseFloat((iva * 0.75).toFixed(2));
      totalFactura = parseFloat((baseImponible + iva).toFixed(2));
    }
  } else {
    totalFactura = montoPagado;
    baseImponible = parseFloat((totalFactura / 1.16).toFixed(2));
    iva = parseFloat((totalFactura - baseImponible).toFixed(2));
    retencionIva = 0;
  }

  const montoNetoCobrado = esRetencion ? parseFloat((totalFactura - retencionIva).toFixed(2)) : totalFactura;
  const montoEnLetras = numeroALetras(totalFactura);

  const fechaActual = new Date().toLocaleDateString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const horaActual = new Date().toLocaleTimeString('es-VE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });

  const fechaPagoStr = det.fecha_pago || det.fecha_transaccion || (pago.created_at ? pago.created_at.slice(0, 10) : fechaActual);
  const inmuebleCod = det.inmueble || (det.recibos && det.recibos[0]) || 'URB016119';
  const mesAseo = det.mes_aseo || 'Septiembre 2026';
  const nombreReceptor = pago.contribuyente || det.contribuyente || 'CONTRIBUYENTE';
  const rifReceptor = pago.identidad || det.identidad || 'J-000000000';
  const correoReceptor = pago.correo || det.correo || 'facturacion.comercial@globalgreenca.com';
  const banco = pago.banco || det.banco || 'Banesco';
  const referencia = pago.referencia || det.referencia || 'N/A';

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = `Demo_Factura_${rifReceptor}_${fechaActual.replace(/\//g, '-')}`;
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 1000);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .demo-factura-paper, .demo-factura-paper * {
            visibility: visible;
          }
          .demo-factura-paper {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Barra superior de control (no imprimible) */}
        <div className="no-print px-6 py-3.5 bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-900 text-white flex items-center justify-between border-b border-emerald-800/40">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-emerald-500/20 text-[#c8e64c] rounded-lg border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base tracking-wide text-white">
                  Demo y Vista Previa de Factura Electrónica
                </h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                  Borrador Previo SENIAT
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/90 font-medium">
                Visualización idéntica al documento fiscal emitido ante The Factory HKA (Providencia SNAT)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Descargar en PDF o imprimir la vista previa"
            >
              <Printer className="w-4 h-4 text-[#c8e64c]" />
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

        {/* Hoja de Factura (Imprimible y visual) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
          <div
            ref={printAreaRef}
            className="demo-factura-paper bg-white w-full max-w-[820px] rounded-xl shadow-lg border border-slate-300 p-6 sm:p-8 text-slate-800 text-xs font-sans relative"
          >
            {/* Marca de agua DEMO / BORRADOR */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.04] select-none">
              <span className="text-8xl sm:text-9xl font-black text-slate-900 -rotate-45 uppercase tracking-widest">
                DEMO FACTURA
              </span>
            </div>

            {/* ENCABEZADO INSTITUCIONAL */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b-2 border-emerald-700">
              <div className="space-y-1 max-w-[460px]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-emerald-800 text-white flex items-center justify-center font-black text-xs">
                    GG
                  </div>
                  <h1 className="text-base font-black text-emerald-950 uppercase tracking-tight">
                    GLOBAL GREEN C.A.
                  </h1>
                </div>
                <p className="text-[11px] font-bold text-slate-700">
                  R.I.F.: J-408107872 | NIT: 0621458900
                </p>
                <p className="text-[10px] text-slate-600 leading-tight">
                  Concesionario Autorizado para el Servicio Autónomo de Gestión Integral de Desechos Sólidos y Disposición Final del Municipio Naguanagua, Estado Carabobo.
                </p>
                <p className="text-[10px] text-slate-500">
                  Av. Universidad, C.C. Naguanagua Plaza, Nivel 1. Naguanagua — Edo. Carabobo.
                </p>
              </div>

              <div className="sm:text-right bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 w-full sm:w-auto min-w-[240px]">
                <span className="text-[10px] font-black uppercase text-emerald-900 tracking-wider block">
                  FACTURA ELECTRÓNICA
                </span>
                <span className="text-xs font-mono font-bold text-slate-800 block">
                  N° Control: <span className="text-emerald-700 font-extrabold">00-00000XXX</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500 block">
                  (Asignado al emitir en The Factory)
                </span>
                <div className="mt-2 pt-2 border-t border-emerald-200/60 text-[10px] space-y-0.5">
                  <p><strong>Fecha Emisión:</strong> {fechaActual}</p>
                  <p><strong>Hora:</strong> {horaActual}</p>
                  <p><strong>Condición:</strong> Contado</p>
                </div>
              </div>
            </div>

            {/* DATOS DEL CLIENTE / RECEPTOR */}
            <div className="my-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="text-[11px] font-black uppercase text-slate-800 tracking-wider">
                  Datos del Contribuyente (Receptor)
                </span>
                {esRetencion ? (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                    ★ AGENTE DE RETENCIÓN DE IVA (75%)
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                    Contribuyente Ordinario
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px]">Nombre o Razón Social</span>
                  <strong className="text-slate-900 text-xs">{nombreReceptor}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px]">R.I.F. / Cédula de Identidad</span>
                  <strong className="text-slate-900 font-mono text-xs">{rifReceptor}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px]">Dirección Fiscal / Inmueble</span>
                  <span className="text-slate-700 font-medium">Inmueble: <b>{inmuebleCod}</b> — Naguanagua, Carabobo</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[9px]">Correo Electrónico de Envío</span>
                  <span className="text-slate-700 font-mono text-[10px]">{correoReceptor}</span>
                </div>
              </div>
            </div>

            {/* TABLA DE RENGLONES / SERVICIOS */}
            <div className="my-4 border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-800 text-white font-bold text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3 text-center w-10">#</th>
                    <th className="py-2 px-3">Código</th>
                    <th className="py-2 px-3">Descripción / Concepto</th>
                    <th className="py-2 px-3 text-center w-14">Cant.</th>
                    <th className="py-2 px-3 text-right">Precio Unitario</th>
                    <th className="py-2 px-3 text-center w-14">Alícuota</th>
                    <th className="py-2 px-3 text-right">Total Bs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500">1</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">SERV-ASEO</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      Tasa por Servicio de Gestión Integral y Manejo de Desechos Sólidos (Aseo Urbano)
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Inmueble: <span className="font-mono font-bold text-slate-700">{inmuebleCod}</span> | Período: <span className="font-bold text-emerald-800">{mesAseo}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">1</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {formatBs(baseImponible)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-700">16% (G)</td>
                    <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900">
                      {formatBs(baseImponible)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECCIÓN INFERIOR: FORMA DE PAGO + TOTALES FISCALES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 pt-2">
              {/* Información de Pago y Monto en Letras */}
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] space-y-1">
                  <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider block border-b border-slate-200 pb-1">
                    Información de Pago Registrado
                  </span>
                  <div className="flex justify-between text-slate-600 pt-1">
                    <span>Método:</span>
                    <strong className="text-slate-800">Transferencia Bancaria</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Banco:</span>
                    <strong className="text-slate-800">{banco}</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>N° Referencia:</span>
                    <strong className="font-mono text-emerald-800">{referencia}</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Fecha de Pago:</span>
                    <strong className="text-slate-800">{fechaPagoStr}</strong>
                  </div>
                </div>

                <div className="text-[10px] text-slate-600 bg-emerald-50/50 border border-emerald-200 rounded-lg p-2.5">
                  <span className="font-bold uppercase text-emerald-950 block text-[9px]">Monto en Letras:</span>
                  <span className="italic font-semibold text-slate-800">&laquo;{montoEnLetras}&raquo;</span>
                </div>
              </div>

              {/* Liquidación de Totales */}
              <div className="border border-slate-300 rounded-xl p-3.5 bg-slate-50/70 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Base Imponible Gravada (16%):</span>
                  <span className="font-bold">Bs {formatBs(baseImponible)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Monto Total Exento:</span>
                  <span>Bs 0,00</span>
                </div>
                <div className="flex justify-between text-blue-700 font-bold border-b border-slate-200 pb-1.5">
                  <span>Impuesto al Valor Agregado (IVA 16%):</span>
                  <span>Bs {formatBs(iva)}</span>
                </div>

                <div className="flex justify-between text-slate-900 font-black text-sm pt-1">
                  <span>TOTAL FACTURA FISCAL:</span>
                  <span className="text-emerald-800">Bs {formatBs(totalFactura)}</span>
                </div>

                {esRetencion && (
                  <>
                    <div className="flex justify-between text-amber-800 font-bold bg-amber-50 border border-amber-200 rounded-md p-1.5 text-[11px] my-1">
                      <span>(-) Retención 75% IVA (SENIAT):</span>
                      <span>- Bs {formatBs(retencionIva)}</span>
                    </div>

                    <div className="flex justify-between text-slate-900 font-black text-sm bg-emerald-100/70 border border-emerald-300 rounded-lg p-2 text-emerald-950">
                      <span>MONTO CANCELADO (NETO):</span>
                      <span className="font-extrabold">Bs {formatBs(montoNetoCobrado)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* PIE FISCAL Y CÓDIGO QR DEMO */}
            <div className="mt-6 pt-4 border-t-2 border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-slate-500">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-white border border-slate-300 rounded-lg p-1 flex items-center justify-center shrink-0">
                  <QrCode className="w-14 h-14 text-slate-700" />
                </div>
                <div className="space-y-0.5 leading-tight">
                  <p className="font-bold text-slate-700 uppercase">
                    The Factory HKA Venezuela, C.A. — Imprenta Digital
                  </p>
                  <p>Autorizada mediante Providencia SENIAT/INTI/0000005 de fecha 09/09/2022</p>
                  <p className="text-[9px] text-slate-400">
                    Documento de previsualización técnica previa a la transmisión con firma electrónica digital.
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="inline-block px-3 py-1 rounded-md bg-slate-200 text-slate-700 font-bold font-mono text-[10px]">
                  DEMO — VISTA PREVIA
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Barra inferior de acciones (no imprimible) */}
        <div className="no-print px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {esRetencion ? (
              <span className="text-amber-800 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Agente de retención: Total fiscal <b>Bs {formatBs(totalFactura)}</b> | Pagado: <b>Bs {formatBs(montoNetoCobrado)}</b>
              </span>
            ) : (
              <span>Factura Ordinaria por un total de <b>Bs {formatBs(totalFactura)}</b></span>
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
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-[#c8e64c]" />
                <span>Proceder a Emitir Factura</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
