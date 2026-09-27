const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/cobro-movil/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `              {/* RESUMEN DE PAGO */}
              <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700">`;

const replacement = `              {/* DESGLOSE POR INMUEBLE */}
              <div className="space-y-3">
                {Object.entries(
                  recibos.reduce((acc: any, r: any) => {
                    let inmId = 'Facturación General';
                    let tipo = '';
                    let act = '';
                    if (r.referencia?.startsWith('RECIB-HIST-')) {
                      const parts = r.referencia.split('-');
                      if (parts.length > 2) {
                        const match = userInms.find((i: any) => i.inmueble === parts[2]);
                        if (match) { inmId = match.inmueble; tipo = match.clasificacion || ''; act = match.actividad_principal || ''; }
                        else inmId = parts[2];
                      }
                    } else if (r.referencia?.startsWith('CM-')) {
                      const match = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
                      if (match) { inmId = match.inmueble; tipo = match.clasificacion || ''; act = match.actividad_principal || ''; }
                      else inmId = 'Acumulados';
                    } else {
                      if (userInms.length === 1) { inmId = userInms[0].inmueble; tipo = userInms[0].clasificacion || ''; act = userInms[0].actividad_principal || ''; }
                    }
                    const key = \`\${inmId}|\${tipo}|\${act}\`;
                    if (!acc[key]) acc[key] = { items: [], id: inmId, tipo, act };
                    acc[key].items.push(r);
                    return acc;
                  }, {})
                ).map(([key, group]: [string, any]) => (
                  <div key={key} className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                    <div className="bg-slate-700/50 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                      <div>
                        <span className="text-emerald-400 font-bold text-sm">{group.id}</span>
                        {group.tipo && <div className="text-xs text-slate-400 mt-0.5">{group.tipo} {group.act && \`• \${group.act}\`}</div>}
                      </div>
                      <span className="bg-slate-700 text-slate-300 text-xs font-bold px-3 py-1 rounded-full">{group.items.length} meses</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {group.items.map((r: any) => (
                        <div key={r.referencia} className="flex justify-between items-center text-sm">
                          <div>
                            <div className="text-slate-300 font-medium">{r.referencia}</div>
                            <div className="text-slate-500 text-xs mt-0.5">
                              {(() => {
                                const M = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
                                if (!r.emision) return 'Sin fecha';
                                const p = r.emision.split('-');
                                return p.length >= 2 ? \`\${M[parseInt(p[1])-1] || p[1]} \${p[0]}\` : r.emision;
                              })()}
                            </div>
                          </div>
                          <div className="text-white font-bold">Bs. {fmtBs(getReciboMonto(r))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* RESUMEN DE PAGO */}
              <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700">`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("Success");
} else {
  console.log("Target not found");
}
