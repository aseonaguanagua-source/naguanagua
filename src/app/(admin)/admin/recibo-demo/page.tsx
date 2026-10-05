'use client';
import React, { useState } from 'react';
import { ReciboImprimible } from '@/components/ReciboImprimible';
import { Printer, ArrowLeft, RefreshCw, CheckCircle2, SplitSquareVertical } from 'lucide-react';
import Link from 'next/link';

export default function ReciboDemoPage() {
  const [esAbono, setEsAbono] = useState(false);
  const [formaPago, setFormaPago] = useState('Punto de Venta');

  const demoDataNormal = {
    reciboNo: 'REC-2026-008942',
    controlWeb: 'NAG-RES-846079',
    fechaEmision: '05/10/2026 10:45 AM',
    codContribuyente: 'AURI001149',
    razonSocial: 'IVÁN MANUEL CARDOZO FRAGACHÁN',
    domicilioFiscal: 'URB. LAS QUINTAS I, AV. VALENCIA, CALLE 178, CASA NRO. 96-79, NAGUANAGUA, EDO. CARABOBO',
    rifCi: 'V-0846079',
    caja: 'A-cajero',
    tipoContribuyente: 'Residencial',
    tasaBcv: 48.50,
    conceptos: [
      {
        descripcion: 'Tasa por Servicio de Aseo Urbano y Domiciliario - Mes de Septiembre 2026 (Quinta Zona B)',
        precioUnit: 1198.44,
        total: 1198.44
      },
      {
        descripcion: 'Mantenimiento del Sistema de Disposición Final y Relleno Sanitario',
        precioUnit: 150.00,
        total: 150.00
      }
    ],
    subTotal: 1348.44,
    exento: 0,
    iva: 0,
    total: 1348.44,
    formaPago: formaPago,
    banco: formaPago === 'Punto de Venta' ? 'BANESCO (PUNTO BANCARIO)' : 'BANCO DE VENEZUELA',
    referencia: '00984214',
    esAbono: false,
    historialPagos: [
      {
        fecha: '05/10/2026',
        formaPago: formaPago,
        banco: 'BANESCO',
        referencia: '00984214',
        monto: 1348.44
      }
    ]
  };

  const demoDataAbono = {
    ...demoDataNormal,
    reciboNo: 'ABO-2026-001205',
    esAbono: true,
    montoCancelado: 800.00,
    montoPendiente: 548.44,
    formaPago: formaPago,
    historialPagos: [
      {
        fecha: '05/10/2026',
        formaPago: formaPago,
        banco: 'BANESCO',
        referencia: '00984214',
        monto: 800.00
      }
    ]
  };

  const dataActual = esAbono ? demoDataAbono : demoDataNormal;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Barra superior de navegación y controles (Oculta al imprimir) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/caja"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Volver a Caja"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              📄 Demostración de Recibo Residencial
            </h1>
            <p className="text-xs text-slate-500">
              Formato oficial municipal IAMEC para impresión en media hoja carta (Letter Portrait)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de modo: Total vs Abono */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setEsAbono(false)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                !esAbono
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pago Completo
            </button>
            <button
              onClick={() => setEsAbono(true)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                esAbono
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Abono Parcial
            </button>
          </div>

          {/* Selector de Forma de pago */}
          <select
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value)}
            className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 outline-none"
          >
            <option value="Punto de Venta">Punto de Venta (Débito)</option>
            <option value="Transferencia">Transferencia Bancaria</option>
            <option value="Efectivo">Efectivo</option>
          </select>

          {/* Botón Imprimir */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all hover:scale-105 cursor-pointer"
          >
            <Printer size={16} />
            <span>Imprimir Recibo</span>
          </button>
        </div>
      </div>

      {/* Contenedor central de la vista previa del recibo */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
        <div className="mb-4 text-center print:hidden">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 size={13} /> Formato Media Página Oficial
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Al pulsar <b>Imprimir</b>, el recibo ocupará únicamente la mitad superior (206mm × 134mm) y dejará la mitad inferior libre para corte.
          </p>
        </div>

        {/* Componente del recibo */}
        <div className="w-full flex justify-center">
          <ReciboImprimible data={dataActual} />
        </div>
      </div>
    </div>
  );
}
