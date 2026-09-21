const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// 1. Add ReciboImprimible import (if not already there)
if (!c.includes("import { ReciboImprimible }")) {
  c = c.replace(
    `import { formatBs } from '@/lib/formatCurrency';`,
    `import { formatBs } from '@/lib/formatCurrency';\r\nimport { ReciboImprimible } from '@/components/ReciboImprimible';`
  );
}

// 2. Add Printer & X icons (if not already there)
if (!c.includes('Printer,')) {
  c = c.replace(
    `import { TreePine, Search, CreditCard, Landmark, CheckCircle, XCircle, FileText, Handshake, Calendar as CalendarIcon, Wrench, ShieldCheck, ClipboardCheck, FlaskConical } from 'lucide-react';`,
    `import { TreePine, Search, CreditCard, Landmark, CheckCircle, XCircle, FileText, Handshake, Calendar as CalendarIcon, Wrench, ShieldCheck, ClipboardCheck, FlaskConical, Printer, X } from 'lucide-react';`
  );
}

// 3. Add reciboData state after sessionPagos state (if not already there)
if (!c.includes('reciboData')) {
  c = c.replace(
    `  // Notas de Crédito`,
    `  // Recibo imprimible post-pago\r\n  const [reciboData, setReciboData] = React.useState<any>(null);\r\n\r\n  // Notas de Crédito`
  );
}

// 4. Find setSuccessMsg inside the isAutoAprobado block and insert recibo generation after it
// The key text to find (CRLF version):
const findKey = "setSuccessMsg(esAbonoDebito";
const idx = c.indexOf(findKey);
if (idx === -1) { console.log('❌ Cannot find setSuccessMsg'); process.exit(1); }

// Find the end of this statement (closing );)
const stmtEnd = c.indexOf(');', idx);
if (stmtEnd === -1) { console.log('❌ Cannot find end of setSuccessMsg'); process.exit(1); }

const insertPos = stmtEnd + 2; // after );

const insertCode = `\r\n\r\n        // ── RECIBO AUTOMÁTICO DESPUÉS DEL PAGO DÉBITO ──\r\n        if (!esAbonoDebito) {\r\n          try {\r\n            const cajeroRecibo = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || 'Administrador';\r\n            const letraRecibo = (typeof window !== 'undefined' ? localStorage.getItem('adminLetra') : null);\r\n            const cajero_id_recibo = letraRecibo && cajeroRecibo !== 'Administrador' ? \`\${letraRecibo}-\${cajeroRecibo}\` : cajeroRecibo;\r\n            const userInmsRec = (inmuebles as any[]).filter((i: any) =>\r\n              (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()\r\n            );\r\n            const primerInm = userInmsRec[0];\r\n            const MESES_REC = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];\r\n            const getMesRec = (emision: string) => {\r\n              if (!emision) return '---';\r\n              const p = emision.split('-');\r\n              return p.length >= 2 ? \`\${MESES_REC[parseInt(p[1])-1]} \${p[0]}\` : emision;\r\n            };\r\n            const conceptos = selectedRecibos.map((ref: string) => {\r\n              const f = recibos.find((r: any) => r.referencia === ref);\r\n              const montoF = f ? parseFloat(getReciboMonto(f) || '0') : 0;\r\n              return {\r\n                descripcion: \`Servicio Aseo Residencial/Comercial. Correspondiente al mes de: \${getMesRec(f?.emision || '')}\`,\r\n                precioUnit: montoF,\r\n                total: montoF\r\n              };\r\n            });\r\n            const totalConceptos = conceptos.reduce((s: number, cpt: any) => s + cpt.total, 0);\r\n            setReciboData({\r\n              reciboNo: selectedRecibos[0]?.split('-').pop()?.padStart(7, '0') || '0000001',\r\n              controlWeb: 'WEB-0000001',\r\n              fechaEmision: new Date().toISOString().split('T')[0],\r\n              codContribuyente: primerInm?.cod_cont || foundUser.Identidad,\r\n              razonSocial: primerInm?.contribuyente || foundUser.Contribuyente || '',\r\n              domicilioFiscal: ((primerInm?.direccion || 'TUCACAS MUNICIPIO SILVA, FALCÓN') as string).toUpperCase(),\r\n              rifCi: foundUser.Identidad,\r\n              caja: cajero_id_recibo,\r\n              conceptos,\r\n              subTotal: totalConceptos,\r\n              exento: totalConceptos,\r\n              iva: 0,\r\n              total: montoReal,\r\n              formaPago: 'PUNTO DE VENTA',\r\n              banco: 'Debito',\r\n              referencia: reqRef ? referencia : referenciaDebito,\r\n              tasaBcv: currentBcvRate || tcmmv || undefined,\r\n            });\r\n          } catch(rErr) { console.warn('Error al generar recibo automático:', rErr); }\r\n        }`;

c = c.substring(0, insertPos) + insertCode + c.substring(insertPos);

// 5. Add modal render before the last ); } closing
const modalHtml = `\r\n\r\n      {/* ── MODAL RECIBO AUTOMÁTICO POST-PAGO ── */}\r\n      {reciboData && (\r\n        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-6 px-2 print:bg-white print:items-start print:py-0">\r\n          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full print:shadow-none print:rounded-none">\r\n            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl print:hidden">\r\n              <div className="flex items-center gap-3">\r\n                <CheckCircle className="w-6 h-6 text-emerald-600" />\r\n                <span className="text-slate-800 font-bold text-lg">¡Pago Procesado! — Recibo</span>\r\n              </div>\r\n              <div className="flex items-center gap-2">\r\n                <button\r\n                  onClick={() => window.print()}\r\n                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"\r\n                >\r\n                  <Printer className="w-4 h-4" /> Imprimir\r\n                </button>\r\n                <button\r\n                  onClick={() => setReciboData(null)}\r\n                  className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"\r\n                >\r\n                  <X className="w-4 h-4" /> Cerrar\r\n                </button>\r\n              </div>\r\n            </div>\r\n            <div className="p-4">\r\n              <ReciboImprimible data={reciboData} />\r\n            </div>\r\n          </div>\r\n        </div>\r\n      )}`;

// Insert before the last );
const lastClose = c.lastIndexOf('\n  );\n}');
if (lastClose === -1) {
  // try CRLF
  const lastCloseCRLF = c.lastIndexOf('\r\n  );\r\n}');
  if (lastCloseCRLF === -1) { console.log('❌ Cannot find closing'); process.exit(1); }
  c = c.substring(0, lastCloseCRLF) + modalHtml + c.substring(lastCloseCRLF);
} else {
  c = c.substring(0, lastClose) + modalHtml + c.substring(lastClose);
}

fs.writeFileSync(path, c);
console.log('✅ Auto-print recibo after debit payment added to Caja');
