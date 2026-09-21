const fs = require('fs');

const content = `'use client';
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

function normalizarFormaPago(fp: string): 'PUNTO_VENTA' | 'TRANSFERENCIA' | 'EFECTIVO' | 'OTRO' {
  const v = (fp || '').toLowerCase().trim();
  if (v.includes('debito') || v.includes('punto')) return 'PUNTO_VENTA';
  if (v.includes('transfer')) return 'TRANSFERENCIA';
  if (v.includes('efectivo') || v.includes('cash')) return 'EFECTIVO';
  return 'OTRO';
}

// Hoja Letter Landscape: 279mm x 216mm
// Márgenes 5mm → área útil: 269mm x 206mm
// Media hoja (izquierda): 134mm x 206mm
const HALF_WIDTH = '134mm';
const HALF_HEIGHT = '206mm';

export function ReciboImprimible({ data }: { data: ReciboProps }) {
  const fpNorm = normalizarFormaPago(data.formaPago);
  const totalPagado = data.esAbono && data.montoCancelado !== undefined ? data.montoCancelado : data.total;

  return (
    <>
      <style>{\`
        @media print {
          @page {
            size: Letter landscape;
            margin: 5mm;
          }
          body * { visibility: hidden; }
          .recibo-print-area, .recibo-print-area * { visibility: visible; }
          .recibo-print-area {
            position: fixed;
            top: 0;
            left: 0;
            width: \${HALF_WIDTH};
            max-height: \${HALF_HEIGHT};
            overflow: hidden;
          }
        }

        /* Vista previa en pantalla: media hoja horizontal */
        .recibo-preview-wrapper {
          width: 100%;
          overflow-x: auto;
        }
        .recibo-sheet-preview {
          /* Simulamos la media hoja landscape: proporción 134/206 ≈ 0.65 */
          width: 720px;
          border: 2px dashed #94a3b8;
          background: #f8fafc;
          padding: 4px;
          position: relative;
        }
        .recibo-cut-line {
          position: absolute;
          top: 0; right: 0; bottom: 0;
          width: 2px;
          background: repeating-linear-gradient(to bottom, #64748b 0, #64748b 6px, transparent 6px, transparent 12px);
        }
        .recibo-cut-label {
          position: absolute;
          top: 50%;
          right: -36px;
          transform: translateY(-50%) rotate(90deg);
          font-size: 10px;
          color: #64748b;
          white-space: nowrap;
          font-family: Arial, sans-serif;
        }
      \`}</style>

      {/* Vista previa en pantalla */}
      <div className="recibo-preview-wrapper">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'Arial,sans-serif' }}>
            📄 Vista previa — Media hoja Letter landscape (134mm × 206mm) · La otra mitad queda libre para otro recibo
          </span>
        </div>
        <div className="recibo-sheet-preview">
          <ReciboContenido data={data} fpNorm={fpNorm} totalPagado={totalPagado} />
          <div className="recibo-cut-line" />
          <div className="recibo-cut-label">✂ cortar</div>
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
  const cell = { padding: '2px 5px', borderRight: B, borderBottom: '1px solid #eee', fontSize: 8.5 } as React.CSSProperties;

  return (
    <div style={{
      background: '#fff', color: '#000', border: B,
      fontFamily: 'Arial, sans-serif', fontSize: 8.5,
      /* En pantalla ocupa todo el .recibo-sheet-preview;
         en impresión el wrapper ya está a 134mm */
      width: '100%',
    }}>

      {/* ── ENCABEZADO ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: B, padding:'3px 6px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo_alcaldia.png" alt="" style={{ width:30, height:30, objectFit:'contain' }} />
          <div>
            <div style={{ fontWeight:'bold', fontSize:8, lineHeight:1.2 }}>
              INSTITUTO SOCIALISTA MUNICIPAL PARA EL AMBIENTE (I.S.M.A)
            </div>
            <div style={{ fontSize:7, lineHeight:1.2 }}>
              AV LIBERTADOR CC GRILL NIVEL 01 OF 03 BARRIO LIBERTADOR TUCACAS FALCON 2054
            </div>
            <div style={{ fontSize:7.5, fontWeight:'bold' }}>RIF: G-200076739</div>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo_isma.png" alt="" style={{ width:60, height:22, objectFit:'contain' }} />
      </div>

      {/* ── TÍTULO ── */}
      <div style={{ textAlign:'center', fontWeight:'bold', fontSize:9.5, letterSpacing:'0.05em', borderBottom: B, padding:'2px 0' }}>
        {data.esAbono ? 'RECIBO DE ABONO / PAGO PARCIAL' : 'RECIBO DE ASEO URBANO'}
      </div>

      {/* ── DATOS CONTRIBUYENTE + Nro ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', borderBottom: B }}>
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
          <div>{data.reciboNo}</div>
          {data.controlWeb && (
            <><div style={{ marginTop:2 }}><strong>N°WEB</strong></div><div style={{ fontSize:7 }}>{data.controlWeb}</div></>
          )}
          <div style={{ marginTop:2 }}><strong>CAJERO:</strong></div>
          <div style={{ fontSize:7 }}>{data.caja}</div>
        </div>
      </div>

      {/* ── TABLA CONCEPTOS ── */}
      <table style={{ width:'100%', borderCollapse:'collapse', borderBottom: B }}>
        <thead>
          <tr style={{ borderBottom: B }}>
            <th style={{ ...cell, textAlign:'left', width:'55%', borderBottom:'none', fontWeight:'bold' }}>CONCEPTO</th>
            <th style={{ ...cell, textAlign:'right', width:'22%', borderBottom:'none', fontWeight:'bold' }}>PRECIO UNIT</th>
            <th style={{ padding:'2px 5px', textAlign:'right', width:'23%', fontWeight:'bold', fontSize:8.5 }}>TOTAL</th>
          </tr>
          <tr style={{ borderBottom: B, background:'#f1f5f9' }}>
            <td style={{ ...cell, borderBottom: B }}></td>
            <td style={{ ...cell, textAlign:'center', fontWeight:'bold', borderBottom: B }}>Bs.</td>
            <td style={{ padding:'2px 5px', textAlign:'center', fontWeight:'bold', borderBottom: B, fontSize:8.5 }}>Bs.</td>
          </tr>
        </thead>
        <tbody>
          {data.conceptos.map((c, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign:'left' }}>{c.descripcion}</td>
              <td style={{ ...cell, textAlign:'right' }}>Bs. {formatBs(c.precioUnit)}</td>
              <td style={{ padding:'2px 5px', textAlign:'right', borderBottom:'1px solid #eee', fontSize:8.5 }}>Bs. {formatBs(c.total)}</td>
            </tr>
          ))}
          <tr style={{ height:8 }}>
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
          <div style={{ display:'flex', gap:8, marginBottom:2 }}>
            <span>PUNTO DE VENTA <strong style={{ display:'inline-block', width:12, textAlign:'center', border: B }}>{fpNorm==='PUNTO_VENTA'?'X':''}</strong></span>
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
`;

fs.writeFileSync('c:/Users/david/Desktop/tucacas/global_green_tucacas/src/components/ReciboImprimible.tsx', content);
console.log('✅ ReciboImprimible: 1 recibo, media hoja Letter landscape (134mm x 206mm), línea de corte visible en pantalla');
