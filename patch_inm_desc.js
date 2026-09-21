const fs = require('fs');

// ── PATCH 1: admin/caja/page.tsx ──
// Add property name/type below the reference in each receipt item
const cajaPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/page.tsx';
let caja = fs.readFileSync(cajaPath, 'utf8');

const oldRecibo = `                          <div>
                            <p className="font-semibold text-sm text-slate-800">{r.referencia}</p>
                            <p className="text-xs text-slate-500">
                              {(() => {
                                const M = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
                                if (!r.emision) return 'Sin fecha';
                                const p = r.emision.split('-');
                                return p.length >= 2 ? \`\${M[parseInt(p[1])-1] || p[1]} \${p[0]}\` : r.emision;
                              })()}
                            </p>
                          </div>`;

const newRecibo = `                          <div>
                            <p className="font-semibold text-sm text-slate-800">{r.referencia}</p>
                            <p className="text-xs text-slate-500">
                              {(() => {
                                const M = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
                                if (!r.emision) return 'Sin fecha';
                                const p = r.emision.split('-');
                                return p.length >= 2 ? \`\${M[parseInt(p[1])-1] || p[1]} \${p[0]}\` : r.emision;
                              })()}
                            </p>
                            {(() => {
                              // Extraer código de inmueble de la referencia CM-I-000080-09-2026
                              const userInms = inmuebles.filter((i: any) => {
                                if (!foundUser) return false;
                                const id = (i.identidad || '').replace(/-/g,'').toUpperCase();
                                const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
                                return id === fid;
                              });
                              const matchedInm = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
                              if (!matchedInm) return null;
                              const desc = [matchedInm.tipo, matchedInm.actividad_principal].filter(Boolean).join(' · ') || matchedInm.clasificacion || '';
                              return desc ? <p className="text-[10px] text-emerald-700 font-medium mt-0.5 truncate max-w-[200px]">{matchedInm.inmueble}{desc ? \` · \${desc}\` : ''}</p> : null;
                            })()}
                          </div>`;

if (caja.includes(oldRecibo)) {
  caja = caja.replace(oldRecibo, newRecibo);
  fs.writeFileSync(cajaPath, caja);
  console.log('✅ admin/caja/page.tsx patched — property description added to receipts');
} else {
  console.log('⚠️ Target not found in caja/page.tsx (may already be patched or content changed)');
}

// ── PATCH 2: portal/estado-cuenta/page.tsx ──
// Add property description to each receipt row in the pending list
const portalPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/portal/(dashboard)/estado-cuenta/page.tsx';
let portal = fs.readFileSync(portalPath, 'utf8');

// In the recibos pendientes table, update the Mes column to also show inmueble info
const oldPortalRow = `                  {pendientes.sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime()).map((f: any, i: number) => (
                  <tr key={i} className="hover:bg-red-50/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-700">{f.referencia}</td>
                    <td className="px-4 py-3 font-medium">{mesLabel(f.emision)}</td>
                    <td className="px-4 py-3 text-center text-red-600 text-xs">{f.vencimiento || 'N/A'}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-700">{getReciboMonto(f)}</td>
                  </tr>
                ))}`;

const newPortalRow = `                  {pendientes.sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime()).map((f: any, i: number) => {
                    const matchedInm = misInmuebles.find((inm: any) => inm.inmueble && f.referencia.includes(inm.inmueble));
                    const inmuDesc = matchedInm ? [matchedInm.tipo, matchedInm.actividad_principal].filter(Boolean).join(' · ') || matchedInm.clasificacion || '' : '';
                    return (
                    <tr key={i} className="hover:bg-red-50/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-700 text-xs">{f.referencia}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{mesLabel(f.emision)}</div>
                        {matchedInm && <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">{matchedInm.inmueble}{inmuDesc ? \` · \${inmuDesc}\` : ''}</div>}
                      </td>
                      <td className="px-4 py-3 text-center text-red-600 text-xs">{f.vencimiento || 'N/A'}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">Bs. {parseFloat(getReciboMonto(f)).toLocaleString('es-VE', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    </tr>
                    );
                  })}`;

if (portal.includes(oldPortalRow)) {
  portal = portal.replace(oldPortalRow, newPortalRow);
  fs.writeFileSync(portalPath, portal);
  console.log('✅ portal/estado-cuenta/page.tsx patched — property description + formatted Bs. amount');
} else {
  console.log('⚠️ Target not found in portal estado-cuenta (checking alternate pattern)...');
  // Try a more targeted replacement - just the monto column
  const oldMonto = `                    <td className="px-4 py-3 text-right font-bold text-red-700">{getReciboMonto(f)}</td>`;
  const newMonto = `                    <td className="px-4 py-3 text-right font-bold text-red-700">Bs. {parseFloat(getReciboMonto(f)).toLocaleString('es-VE', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>`;
  if (portal.includes(oldMonto)) {
    portal = portal.replace(oldMonto, newMonto);
    fs.writeFileSync(portalPath, portal);
    console.log('✅ Fixed monto format in portal/estado-cuenta');
  }
}

console.log('Done!');
