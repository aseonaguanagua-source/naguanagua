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

// ── Recibo único — media hoja landscape ──
export function ReciboImprimible({ data }: { data: ReciboProps }) {
  const fpNorm = normalizarFormaPago(data.formaPago);
  const totalPagado = data.esAbono && data.montoCancelado !== undefined ? data.montoCancelado : data.total;

  return (
    <>
      <style>{\`
        @media print {
          @page { size: Letter landscape; margin: 6mm; }
          body * { visibility: hidden; }
          .recibo-print-area, .recibo-print-area * { visibility: visible; }
          .recibo-print-area {
            position: fixed; top: 0; left: 0;
            /* Media hoja landscape: cabe 1 recibo por mitad,
               el navegador apila el siguiente en la 2da mitad */
            width: 49%;
          }
          .recibo-bloque { break-inside: avoid; }
          .print\\:hidden { display: none !important; }
        }
      \`}</style>

      <div className="recibo-print-area">
        <div
          className="recibo-bloque bg-white text-black border border-black"
          style={{ fontFamily: 'Arial, sans-serif', fontSize: 9 }}
        >
          {/* ENCABEZADO */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #000', padding:'3px 6px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo_alcaldia.png" alt="" style={{ width:32, height:32, objectFit:'contain' }} />
              <div>
                <div style={{ fontWeight:'bold', fontSize:8.5, lineHeight:1.2 }}>INSTITUTO SOCIALISTA MUNICIPAL PARA EL AMBIENTE (I.S.M.A)</div>
                <div style={{ fontSize:7.5, lineHeight:1.2, maxWidth:280 }}>AV LIBERTADOR CC GRILL NIVEL 01 OF 03 BARRIO LIBERTADOR TUCACAS FALCON 2054</div>
                <div style={{ fontSize:8, fontWeight:'bold' }}>RIF: G-200076739</div>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo_isma.png" alt="" style={{ width:65, height:25, objectFit:'contain' }} />
          </div>

          {/* TÍTULO */}
          <div style={{ textAlign:'center', fontWeight:'bold', fontSize:10, letterSpacing:'0.06em', borderBottom:'1px solid #000', padding:'2px 0' }}>
            {data.esAbono ? 'RECIBO DE ABONO / PAGO PARCIAL' : 'RECIBO DE ASEO URBANO'}
          </div>

          {/* DATOS CONTRIBUYENTE */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', borderBottom:'1px solid #000' }}>
            <div style={{ padding:'3px 6px', borderRight:'1px solid #000', lineHeight:1.55, fontSize:9 }}>
              <div><strong>Fecha de Emisión:</strong> {data.fechaEmision}{data.tasaBcv ? \` | Tasa BCV: Bs. \${data.tasaBcv}\` : ''}</div>
              <div><strong>Cod. Contribuyente:</strong> {data.codContribuyente}</div>
              <div><strong>Razón Social/Nombre:</strong> {data.razonSocial}</div>
              <div><strong>Domicilio Fiscal:</strong> <span style={{ fontSize:8 }}>{data.domicilioFiscal}</span></div>
              <div><strong>RIF / C.I.:</strong> {data.rifCi}</div>
            </div>
            <div style={{ padding:'3px 6px', minWidth:84, lineHeight:1.7, fontSize:9 }}>
              <div><strong>RECIBO N°</strong></div>
              <div>{data.reciboNo}</div>
              {data.controlWeb && (<><div style={{ marginTop:3 }}><strong>N° CONTROL WEB</strong></div><div style={{ fontSize:8 }}>{data.controlWeb}</div></>)}
              <div style={{ marginTop:3 }}><strong>CAJERO:</strong></div>
              <div style={{ fontSize:8 }}>{data.caja}</div>
            </div>
          </div>

          {/* TABLA CONCEPTOS — desglose por mes */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:8.5, borderBottom:'1px solid #000' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #000' }}>
                <th style={{ textAlign:'left', padding:'2px 5px', borderRight:'1px solid #000', width:'58%', fontWeight:'bold' }}>CONCEPTO</th>
                <th style={{ textAlign:'right', padding:'2px 5px', borderRight:'1px solid #000', width:'21%', fontWeight:'bold' }}>PRECIO UNIT</th>
                <th style={{ textAlign:'right', padding:'2px 5px', width:'21%', fontWeight:'bold' }}>TOTAL</th>
              </tr>
              <tr style={{ borderBottom:'1px solid #000', background:'#f1f5f9' }}>
                <td style={{ padding:'2px 5px', borderRight:'1px solid #000' }}></td>
                <td style={{ padding:'2px 5px', textAlign:'center', fontWeight:'bold', borderRight:'1px solid #000' }}>Bs.</td>
                <td style={{ padding:'2px 5px', textAlign:'center', fontWeight:'bold' }}>Bs.</td>
              </tr>
            </thead>
            <tbody>
              {data.conceptos.map((c, i) => (
                <tr key={i}>
                  <td style={{ padding:'2px 5px', borderRight:'1px solid #000', borderBottom:'1px solid #eee', textAlign:'left' }}>{c.descripcion}</td>
                  <td style={{ padding:'2px 5px', borderRight:'1px solid #000', borderBottom:'1px solid #eee', textAlign:'right' }}>Bs. {formatBs(c.precioUnit)}</td>
                  <td style={{ padding:'2px 5px', borderBottom:'1px solid #eee', textAlign:'right' }}>Bs. {formatBs(c.total)}</td>
                </tr>
              ))}
              <tr style={{ height:10 }}>
                <td style={{ borderRight:'1px solid #000' }}></td>
                <td style={{ borderRight:'1px solid #000' }}></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          {/* ABONO */}
          {data.esAbono && data.montoCancelado !== undefined && data.montoPendiente !== undefined && (
            <div style={{ borderBottom:'1px solid #000', fontSize:8.5 }}>
              <div style={{ background:'#fefce8', padding:'2px 6px', fontWeight:'bold', textAlign:'center', borderBottom:'1px solid #000' }}>INFORMACIÓN DE PAGO PARCIAL</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
                <div style={{ padding:'2px 6px', borderRight:'1px solid #000' }}><strong>Monto Cancelado en este Abono:</strong></div>
                <div style={{ padding:'2px 6px', textAlign:'right', fontWeight:'bold', color:'#166534' }}>Bs. {formatBs(data.montoCancelado)}</div>
                <div style={{ padding:'2px 6px', borderRight:'1px solid #000', borderTop:'1px solid #000' }}><strong>Saldo Pendiente por Pagar:</strong></div>
                <div style={{ padding:'2px 6px', textAlign:'right', fontWeight:'bold', color:'#b91c1c', borderTop:'1px solid #000' }}>Bs. {formatBs(data.montoPendiente)}</div>
              </div>
            </div>
          )}

          {/* PIE: FORMA DE PAGO + TOTALES */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto' }}>
            <div style={{ padding:'3px 6px', borderRight:'1px solid #000', fontSize:8.5 }}>
              <div style={{ fontWeight:'bold', marginBottom:2 }}>Forma de Pago:</div>
              <div style={{ display:'flex', gap:10, marginBottom:2 }}>
                <span>PUNTO DE VENTA <strong style={{ display:'inline-block', width:14, textAlign:'center', border:'1px solid #000' }}>{fpNorm==='PUNTO_VENTA'?'X':''}</strong></span>
                <span>TRANSFERENCIA <strong style={{ display:'inline-block', width:14, textAlign:'center', border:'1px solid #000' }}>{fpNorm==='TRANSFERENCIA'?'X':''}</strong></span>
              </div>
              <div style={{ fontSize:8.5 }}>
                <strong>Banco:</strong> {data.banco}&nbsp;&nbsp;
                <strong>Referencia:</strong> {data.referencia}&nbsp;&nbsp;
                <strong>Monto:</strong> Bs. {formatBs(totalPagado)}
              </div>
            </div>
            <div style={{ minWidth:120, fontSize:8.5 }}>
              {([['Sub-Total',data.subTotal],['Exento',data.exento],['Iva (16%)',data.iva]] as [string,number][]).map(([label,val])=>(
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'2px 5px', borderBottom:'1px solid #eee' }}>
                  <span style={{ fontWeight:'bold' }}>{label}</span>
                  <span>Bs. {formatBs(val)}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 5px', background:'#f1f5f9', fontWeight:'bold', borderTop:'1px solid #000' }}>
                <span>Total</span><span>Bs. {formatBs(data.total)}</span>
              </div>
              {data.esAbono && data.montoCancelado !== undefined && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 5px', background:'#f0fdf4', fontWeight:'bold', color:'#166534', borderTop:'1px solid #000' }}>
                  <span>Abonado</span><span>Bs. {formatBs(data.montoCancelado)}</span>
                </div>
              )}
            </div>
          </div>

          {/* HISTORIAL */}
          {data.historialPagos && data.historialPagos.length > 0 && (
            <div style={{ borderTop:'1px solid #000', fontSize:8 }}>
              <div style={{ background:'#f1f5f9', padding:'2px 6px', fontWeight:'bold', textAlign:'center', borderBottom:'1px solid #000' }}>DESGLOSE DE PAGOS REALIZADOS</div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #000' }}>
                    {['FECHA','MÉTODO','BANCO','REFERENCIA','MONTO CANCELADO'].map((h,i)=>(
                      <th key={h} style={{ padding:'1px 4px', borderRight:i<4?'1px solid #000':'none', textAlign:i===4?'right':'left', fontWeight:'bold' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.historialPagos.map((hp,idx)=>(
                    <tr key={idx} style={{ borderBottom:'1px solid #eee' }}>
                      <td style={{ padding:'1px 4px', borderRight:'1px solid #000' }}>{hp.fecha}</td>
                      <td style={{ padding:'1px 4px', borderRight:'1px solid #000' }}>{hp.formaPago}</td>
                      <td style={{ padding:'1px 4px', borderRight:'1px solid #000' }}>{hp.banco}</td>
                      <td style={{ padding:'1px 4px', borderRight:'1px solid #000' }}>{hp.referencia}</td>
                      <td style={{ padding:'1px 4px', textAlign:'right', fontWeight:'bold', color:'#166534' }}>Bs. {formatBs(hp.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
`;

fs.writeFileSync('c:/Users/david/Desktop/tucacas/global_green_tucacas/src/components/ReciboImprimible.tsx', content);
console.log('✅ ReciboImprimible: 1 sola copia, media hoja landscape (2 recibos distintos caben en 1 hoja)');
