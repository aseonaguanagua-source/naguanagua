'use client';
import React from 'react';
import { formatBs } from '@/lib/formatCurrency';

interface ReciboProps {
  reciboNo: string;
  controlWeb?: string;
  fechaEmision: string;
  codContribuyente: string;
  razonSocial: string;
  domicilioFiscal: string;
  rifCi: string;
  caja: string;
  tipoContribuyente?: string;
  /** Período cancelado, p. ej. "OCTUBRE 2026" o "DESDE JULIO 2026 HASTA OCTUBRE 2026" */
  periodo?: string;
  conceptos: {
    descripcion: string;
    precioUnit: number;
    total: number;
  }[];
  subTotal: number;
  exento: number;
  iva: number;
  total: number;
  formaPago: string;
  banco: string;
  referencia: string;
  esAbono?: boolean;
  montoCancelado?: number;
  montoPendiente?: number;
  tasaBcv?: number;
  historialPagos?: {
    formaPago: string;
    banco: string;
    referencia: string;
    monto: number;
    fecha: string;
  }[];
}

function normalizarFormaPago(fp: string): 'PUNTO_VENTA' | 'TMD' | 'TVD' | 'TRANSFERENCIA' | 'EFECTIVO' | 'OTRO' {
  const v = (fp || '').toLowerCase().trim();
  if (v.includes('tmd') || v.includes('master')) return 'TMD';
  if (v.includes('tvd') || v.includes('visa')) return 'TVD';
  if (v.includes('credito')) return 'TMD';
  if (v.includes('debito') || v.includes('punto')) return 'PUNTO_VENTA';
  if (v.includes('transfer')) return 'TRANSFERENCIA';
  if (v.includes('efectivo') || v.includes('cash')) return 'EFECTIVO';
  return 'OTRO';
}

// Hoja Letter Portrait: 216mm x 279mm
// Márgenes 5mm → área útil: 206mm x 269mm
// Hoja Letter Portrait: 216mm x 279mm
// Márgenes 5mm → área útil: 206mm x 269mm
// Media hoja (superior): 206mm x 134mm
const HALF_WIDTH = '206mm';
const HALF_HEIGHT = '134mm';

export function ReciboImprimible({ data }: { data: ReciboProps }) {
  const fpNorm = normalizarFormaPago(data.formaPago);
  const totalPagado = data.esAbono && data.montoCancelado !== undefined ? data.montoCancelado : data.total;

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: Letter portrait;
            margin: 5mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * { visibility: hidden; }
          .recibo-print-area, .recibo-print-area * { visibility: visible; }
          .recibo-print-area {
            position: relative !important;
            display: block !important;
            top: auto !important;
            left: auto !important;
            width: 100% !important;
            max-width: ${HALF_WIDTH} !important;
            min-height: auto !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            page-break-inside: auto !important;
            page-break-after: auto !important;
            margin-bottom: 6mm !important;
          }
          .recibo-print-area table {
            page-break-inside: auto !important;
          }
          .recibo-print-area tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          .recibo-preview-wrapper {
            display: none !important;
          }
        }

        /* Vista previa en pantalla */
        .recibo-preview-wrapper {
          width: 100%;
          overflow-x: auto;
        }
        .recibo-sheet-preview {
          width: 580px;
          border: 2px dashed #94a3b8;
          background: #f8fafc;
          padding: 6px;
          position: relative;
          min-height: auto;
        }
        .recibo-cut-line {
          margin-top: 10px;
          height: 2px;
          background: repeating-linear-gradient(to right, #64748b 0, #64748b 6px, transparent 6px, transparent 12px);
          position: relative;
        }
        .recibo-cut-label {
          text-align: center;
          font-size: 10px;
          color: #64748b;
          font-family: Arial, sans-serif;
          margin-top: 2px;
        }
        /* Ocultar el area de impresion en pantalla para evitar duplicados */
        .recibo-print-area {
          display: none;
        }
        @media print {
          .recibo-print-area {
            display: block !important;
          }
          .recibo-preview-wrapper {
            display: none !important;
          }
        }
      `}</style>

      {/* Vista previa en pantalla */}
      <div className="recibo-preview-wrapper">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'Arial,sans-serif' }}>
            📄 Vista previa del Recibo de Cobro (Aseo Urbano)
          </span>
        </div>
        <div className="recibo-sheet-preview">
          <ReciboContenido data={data} fpNorm={fpNorm} totalPagado={totalPagado} />
          <div className="recibo-cut-line" />
          <div className="recibo-cut-label">✂ cortar al finalizar</div>
        </div>
      </div>

      {/* Área de impresión real */}
      <div className="recibo-print-area">
        <ReciboContenido data={data} fpNorm={fpNorm} totalPagado={totalPagado} />
      </div>
    </>
  );
}

function ReciboContenido({
  data, fpNorm, totalPagado
}: {
  data: ReciboProps;
  fpNorm: string;
  totalPagado: number;
}) {
  const B = '1px solid #000';
  const numConceptos = data.conceptos?.length || 0;
  const isCompact = numConceptos > 5;
  const isUltraCompact = numConceptos > 10;

  const baseFontSize = isUltraCompact ? 7.5 : (isCompact ? 8 : 8.5);
  const cellPadding = isUltraCompact ? '1px 3px' : (isCompact ? '1.5px 4px' : '2px 5px');

  const cell = {
    padding: cellPadding,
    borderRight: B,
    borderBottom: '1px solid #eee',
    fontSize: baseFontSize
  } as React.CSSProperties;

  return (
    <div style={{
      background: '#fff', color: '#000', border: B,
      fontFamily: 'Arial, sans-serif', fontSize: baseFontSize,
      width: '100%',
      boxSizing: 'border-box'
    }}>

      {/* ── ENCABEZADO OFICIAL MUNICIPAL ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: B, padding:'4px 8px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/NAGUANAGUATEQUIERO.png" alt="Naguanagua Te Quiero" style={{ width:42, height:36, objectFit:'contain' }} />
          <div>
            <div style={{ fontWeight:'bold', fontSize:8.5, lineHeight:1.2, color:'#064e3b' }}>
              ALCALDÍA BOLIVARIANA DE NAGUANAGUA
            </div>
            <div style={{ fontWeight:'bold', fontSize:7.5, lineHeight:1.2 }}>
              INSTITUTO AUTÓNOMO MUNICIPAL DE ECOSOCIALISMO (IAMEC)
            </div>
            <div style={{ fontSize:7, lineHeight:1.2, color:'#475569' }}>
              ESTADO CARABOBO · RIF: G-20012028-2 · GESTIÓN INTEGRAL DE RESIDUOS
            </div>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/IAMEC.png" alt="IAMEC" style={{ width:50, height:28, objectFit:'contain' }} />
      </div>

      {/* ── TÍTULO (EN RESIDENCIAL SIEMPRE ES RECIBO DE COBRO) ── */}
      <div style={{ textAlign:'center', fontWeight:'bold', fontSize:9.5, letterSpacing:'0.05em', borderBottom: B, padding:'2.5px 0', background: '#f8fafc' }}>
        {data.esAbono 
          ? 'RECIBO DE ABONO / PAGO PARCIAL' 
          : 'RECIBO DE COBRO - ASEO URBANO'}
      </div>

      {/* ── DATOS CONTRIBUYENTE + Nro ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 85px', borderBottom: B }}>
        <div style={{ padding:'3px 6px', borderRight: B, lineHeight:1.55 }}>
          <div style={{ fontSize:8 }}>
            <strong>Fecha de Emisión:</strong> {data.fechaEmision}
            {data.tasaBcv ? <span style={{ color:'#b91c1c' }}> | Tasa BCV: Bs. {data.tasaBcv}</span> : ''}
          </div>
          <div style={{ fontSize:8 }}><strong>Cod.:</strong> {data.codContribuyente}</div>
          <div style={{ fontSize:8 }}><strong>Nombre:</strong> {data.razonSocial}</div>
          <div style={{ fontSize:7.5 }}><strong>Domicilio:</strong> {data.domicilioFiscal}</div>
          <div style={{ fontSize:8 }}><strong>RIF / C.I.:</strong> {data.rifCi}</div>
        </div>
        <div style={{ padding:'3px 5px', fontSize:8, lineHeight:1.7 }}>
          <div><strong>RECIBO N°</strong></div>
          <div style={{ fontWeight: 'bold' }}>{data.reciboNo}</div>
          {data.controlWeb && (
            <><div style={{ marginTop:2 }}><strong>N°WEB</strong></div><div style={{ fontSize:7 }}>{data.controlWeb}</div></>
          )}
          <div style={{ marginTop:2 }}><strong>CAJERO:</strong></div>
          <div style={{ fontSize:7.5 }}>{data.caja}</div>
        </div>
      </div>

      {/* ── PERÍODO CANCELADO ── */}
      {data.periodo && (
        <div style={{ borderBottom: B, padding:'2.5px 6px', fontSize:8.5, background:'#ecfdf5' }}>
          <strong>PERÍODO CANCELADO:</strong> {data.periodo}
        </div>
      )}
      <table style={{ width:'100%', borderCollapse:'collapse', borderBottom: B }}>
        <thead>
          <tr style={{ borderBottom: B }}>
            <th style={{ ...cell, textAlign:'left', width:'55%', borderBottom:'none', fontWeight:'bold' }}>CONCEPTO</th>
            <th style={{ ...cell, textAlign:'right', width:'22%', borderBottom:'none', fontWeight:'bold' }}>PRECIO UNIT</th>
            <th style={{ padding: cellPadding, textAlign:'right', width:'23%', fontWeight:'bold', fontSize: baseFontSize }}>TOTAL</th>
          </tr>
          <tr style={{ borderBottom: B, background:'#f1f5f9' }}>
            <td style={{ ...cell, borderBottom: B }}></td>
            <td style={{ ...cell, textAlign:'center', fontWeight:'bold', borderBottom: B }}>Bs.</td>
            <td style={{ padding: cellPadding, textAlign:'center', fontWeight:'bold', borderBottom: B, fontSize: baseFontSize }}>Bs.</td>
          </tr>
        </thead>
        <tbody>
          {data.conceptos.map((c, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign:'left' }}>{c.descripcion}</td>
              <td style={{ ...cell, textAlign:'right' }}>Bs. {formatBs(c.precioUnit)}</td>
              <td style={{ padding: cellPadding, textAlign:'right', borderBottom:'1px solid #eee', fontSize: baseFontSize }}>Bs. {formatBs(c.total)}</td>
            </tr>
          ))}
          <tr style={{ height:4 }}>
            <td style={{ borderRight: B }}></td>
            <td style={{ borderRight: B }}></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      {/* ── ABONO ── */}
      {data.esAbono && data.montoCancelado !== undefined && data.montoPendiente !== undefined && (
        <div style={{ borderBottom: B, fontSize:8 }}>
          <div style={{ background:'#fefce8', padding:'2px 6px', fontWeight:'bold', textAlign:'center', borderBottom: B }}>
            INFORMACIÓN DE PAGO PARCIAL
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
            <div style={{ padding:'2px 6px', borderRight: B }}><strong>Monto Cancelado:</strong></div>
            <div style={{ padding:'2px 6px', textAlign:'right', fontWeight:'bold', color:'#166534' }}>Bs. {formatBs(data.montoCancelado)}</div>
            <div style={{ padding:'2px 6px', borderRight: B, borderTop: B }}><strong>Saldo Pendiente:</strong></div>
            <div style={{ padding:'2px 6px', textAlign:'right', fontWeight:'bold', color:'#b91c1c', borderTop: B }}>Bs. {formatBs(data.montoPendiente)}</div>
          </div>
        </div>
      )}

      {/* ── PIE: FORMA DE PAGO + TOTALES ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 110px' }}>
        <div style={{ padding:'3px 6px', borderRight: B, fontSize:8 }}>
          <div style={{ fontWeight:'bold', marginBottom:2 }}>Forma de Pago:</div>
          <div style={{ display:'flex', gap:6, marginBottom:2, flexWrap:'wrap' }}>
            <span>PUNTO DE VENTA <strong style={{ display:'inline-block', width:12, textAlign:'center', border: B }}>{fpNorm==='PUNTO_VENTA'?'X':''}</strong></span>
            <span>TMD (MASTER) <strong style={{ display:'inline-block', width:12, textAlign:'center', border: B }}>{fpNorm==='TMD'?'X':''}</strong></span>
            <span>TVD (VISA) <strong style={{ display:'inline-block', width:12, textAlign:'center', border: B }}>{fpNorm==='TVD'?'X':''}</strong></span>
            <span>TRANSFERENCIA <strong style={{ display:'inline-block', width:12, textAlign:'center', border: B }}>{fpNorm==='TRANSFERENCIA'?'X':''}</strong></span>
          </div>
          <div>
            <strong>Banco:</strong> {data.banco}&nbsp;
            <strong>Ref:</strong> {data.referencia}&nbsp;
            <strong>Monto:</strong> Bs. {formatBs(totalPagado)}
          </div>
        </div>
        <div style={{ fontSize:8 }}>
          {([['Sub-Total', data.subTotal], ['Exento', data.exento], ['Iva (16%)', data.iva]] as [string,number][]).map(([label,val]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'1px 5px', borderBottom:'1px solid #eee' }}>
              <span style={{ fontWeight:'bold' }}>{label}</span>
              <span>Bs. {formatBs(val)}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 5px', background:'#f1f5f9', fontWeight:'bold', borderTop: B }}>
            <span>Total</span><span>Bs. {formatBs(data.total)}</span>
          </div>
          {data.esAbono && data.montoCancelado !== undefined && (
            <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 5px', background:'#f0fdf4', fontWeight:'bold', color:'#166534', borderTop: B }}>
              <span>Abonado</span><span>Bs. {formatBs(data.montoCancelado)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── HISTORIAL ── */}
      {data.historialPagos && data.historialPagos.length > 0 && (
        <div style={{ borderTop: B, fontSize:7.5 }}>
          <div style={{ background:'#f1f5f9', padding:'1px 6px', fontWeight:'bold', textAlign:'center', borderBottom: B }}>
            DESGLOSE DE PAGOS REALIZADOS
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom: B }}>
                {['FECHA','MÉTODO','BANCO','REFERENCIA','MONTO'].map((h,i) => (
                  <th key={h} style={{ padding:'1px 3px', borderRight:i<4?B:'none', textAlign:i===4?'right':'left', fontWeight:'bold' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.historialPagos.map((hp,idx) => (
                <tr key={idx} style={{ borderBottom:'1px solid #eee' }}>
                  <td style={{ padding:'1px 3px', borderRight: B }}>{hp.fecha}</td>
                  <td style={{ padding:'1px 3px', borderRight: B }}>{hp.formaPago}</td>
                  <td style={{ padding:'1px 3px', borderRight: B }}>{hp.banco}</td>
                  <td style={{ padding:'1px 3px', borderRight: B }}>{hp.referencia}</td>
                  <td style={{ padding:'1px 3px', textAlign:'right', fontWeight:'bold', color:'#166534' }}>Bs. {formatBs(hp.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

