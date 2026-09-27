const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetRegex = /<div className="p-4">\s*\{recibos\.length === 0 \? \(\s*<p className="text-sm text-slate-500">No hay recibos pendientes\.</p>\s*\) : \(\s*<div className="space-y-2">\s*\{recibos\.map\(r => \([\s\S]*?\}\s*<\/div>\s*\)\}\s*<\/div>/;

const replacement = `<div className="p-4 bg-slate-50 border-t border-slate-200">
                {recibos.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-white p-4 rounded-lg border border-slate-200">No hay recibos pendientes.</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(
                      recibos.reduce((acc: any, r: any) => {
                        const userInms = (inmuebles || []).filter((i: any) => {
                          if (!foundUser) return false;
                          const id = (i.identidad || '').replace(/-/g,'').toUpperCase();
                          const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
                          return id === fid;
                        });
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
                      <div key={key} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="bg-slate-100/50 px-3 py-2.5 border-b border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{group.id}</span>
                            <span className="text-[10px] text-slate-500 font-semibold">{[group.tipo, group.act].filter(Boolean).join(' • ')}</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{group.items.length} recibos</span>
                        </div>
                        <div className="p-2 space-y-2">
                          {group.items.map((r: any) => (
                            <label key={r.referencia} className={\`flex items-center justify-between p-2.5 border rounded transition-colors \${selectedRecibos.includes(r.referencia) ? 'bg-emerald-50 border-emerald-200 ring-1 ring-emerald-400' : isItemPending(r.referencia) ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 border-slate-200 hover:border-slate-300'}\`}>
                              <div className="flex items-center gap-3">
                                <input type="checkbox" checked={selectedRecibos.includes(r.referencia)} disabled={isItemPending(r.referencia)} onChange={() => toggleRecibo(r.referencia)}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                />
                                <div>
                                  <p className="font-bold text-sm text-slate-700">{r.referencia}</p>
                                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                                    {(() => {
                                      const M = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
                                      if (!r.emision) return 'Sin fecha';
                                      const p = r.emision.split('-');
                                      return p.length >= 2 ? \`\${M[parseInt(p[1])-1] || p[1]} \${p[0]}\` : r.emision;
                                    })()}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-slate-800">
                                  Bs. {(() => {
                                    const baseBs = parseFloat(getReciboMonto(r) || '0');
                                    return formatBs(baseBs);
                                  })()}
                                </p>
                                {isItemPending(r.referencia) && <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide mt-1 inline-block">Por Verificar</span>}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>`;

if(content.match(targetRegex)){
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync(file, content);
    console.log("Success");
} else {
    console.log("Regex not found");
}
