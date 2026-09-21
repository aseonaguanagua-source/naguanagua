const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/conciliacion/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// 1. Find variables section near montoConciliadoNum - add deudaFacturas and diferencia
// Add computed variables after montoConciliadoNum is defined
const OLD_VARS = `  const montoConciliadoNum = parseFloat(montoConciliado) || 0;`;
const NEW_VARS = `  const montoConciliadoNum = parseFloat(montoConciliado) || 0;
  const deudaFacturas = recibos.reduce((s, ref) => {
    const found = (det.recibos || []).find((r: any) => (typeof r === 'string' ? r : r.referencia || r.ref) === ref);
    return s;
  }, 0);
  // Diferencia = deuda total contribuyente - monto conciliado (si monto < deuda)
  const deudaTotalContrib = contribInfo?.DeudaTotal ? parseFloat(String(contribInfo.DeudaTotal).replace(/[^0-9.]/g,'')) : 0;
  const diferenciaPendiente = montoConciliadoNum > 0 && deudaTotalContrib > 0 ? Math.max(0, deudaTotalContrib - montoConciliadoNum) : 0;`;

// Try both CRLF/LF
const OLD_V_CRLF = OLD_VARS.replace(/\n/g, '\r\n');
if (c.includes(OLD_V_CRLF)) {
  c = c.replace(OLD_V_CRLF, NEW_VARS.replace(/\n/g, '\r\n'));
  console.log('✅ Vars added (CRLF)');
} else if (c.includes(OLD_VARS)) {
  c = c.replace(OLD_VARS, NEW_VARS);
  console.log('✅ Vars added (LF)');
} else {
  console.log('⚠ Could not find montoConciliadoNum line for vars - skipping');
}

// 2. Add diferencia row in summary after "Total a Pagar" row
const OLD_SUMMARY_END = `              {estatus === 'Con Diferencia' && parseFloat(montoConciliado) > 0 && (
                <div className="flex justify-between text-sm border-t pt-1 mt-1 text-amber-700 font-bold">
                  <span>Saldo a Favor a Acreditar</span>
                  <span>+ {fmt(parseFloat(montoConciliado))}</span>
                </div>
              )}`;

const NEW_SUMMARY_END = `              {/* Diferencia pendiente cuando monto conciliado < deuda total */}
              {estatus === 'Aprobado' && montoConciliadoNum > 0 && montoReportadoNum < deudaTotalContrib - 0.01 && (
                <div className="flex justify-between text-sm border-t pt-2 mt-1">
                  <span className="text-red-700 font-bold">⚠ Diferencia Pendiente (Saldo Negativo)</span>
                  <span className="text-red-700 font-bold">- {fmt(deudaTotalContrib - montoReportadoNum)}</span>
                </div>
              )}
              {estatus === 'Con Diferencia' && parseFloat(montoConciliado) > 0 && (
                <div className="flex justify-between text-sm border-t pt-1 mt-1 text-amber-700 font-bold">
                  <span>Saldo a Favor a Acreditar</span>
                  <span>+ {fmt(parseFloat(montoConciliado))}</span>
                </div>
              )}`;

const OLD_SE_CRLF = OLD_SUMMARY_END.replace(/\n/g, '\r\n');
if (c.includes(OLD_SE_CRLF)) {
  c = c.replace(OLD_SE_CRLF, NEW_SUMMARY_END.replace(/\n/g, '\r\n'));
  console.log('✅ Summary diferencia row added (CRLF)');
} else if (c.includes(OLD_SUMMARY_END)) {
  c = c.replace(OLD_SUMMARY_END, NEW_SUMMARY_END);
  console.log('✅ Summary diferencia row added (LF)');
} else {
  console.log('⚠ Could not find summary end - skipping visual indicator');
}

fs.writeFileSync(path, c, 'utf8');
console.log('✅ Guardado');
