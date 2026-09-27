const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetList = `              <div className="p-4">
                {recibos.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay recibos pendientes.</p>
                ) : (
                  <div className="space-y-2">
                    {recibos.map(r => (
                      <label key={r.referencia} className={\`flex items-center justify-between p-3 border rounded-lg transition-colors \${selectedRecibos.includes(r.referencia) ? 'bg-emerald-50 border-emerald-200' : isItemPending(r.referencia) ? 'bg-slate-100 border-slate-300 opacity-75 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 border-slate-200'}\`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={selectedRecibos.includes(r.referencia)} disabled={isItemPending(r.referencia)} onChange={() => toggleRecibo(r.referencia)}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                          />
                          <div>
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
                              const userInms = inmuebles.filter((i: any) => {
                                if (!foundUser) return false;
                                const id = (i.identidad || '').replace(/-/g,'').toUpperCase();
                                const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
                                return id === fid;
                              });
                              const matchedInm = userInms.find((i: any) => i.inmueble && r.referencia.includes(i.inmueble));
                              if (!matchedInm) return null;
                              return <p className="text-[10px] font-medium text-emerald-600 uppercase mt-1">{matchedInm.inmueble} • {matchedInm.clasificacion || ''} • {matchedInm.actividad_principal || ''}</p>
                            })()}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-800">
                            Bs. {(() => {
                              const baseBs = parseFloat(getReciboMonto(r) || '0');
                              return formatBs(baseBs);
                            })()}
                          </p>
                          {isItemPending(r.referencia) && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded uppercase font-bold">Por Verificar</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>`;

const replaceList = `              <div className="p-4">
                {recibos.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay recibos pendientes.</p>
                ) : (
                  <div className="space-y-6">
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
                      <div key={key} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-700 uppercase">Inmueble: {group.id}</span>
                            {group.tipo && <span className="text-[10px] ml-2 text-slate-500 uppercase font-medium">{group.tipo} • {group.act}</span>}
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600">{group.items.length} recibos</span>
                        </div>
                        <div className="p-2 space-y-2">
                          {group.items.map((r: any) => (
                            <label key={r.referencia} className={\`flex items-center justify-between p-3 border rounded transition-colors \${selectedRecibos.includes(r.referencia) ? 'bg-emerald-50 border-emerald-200' : isItemPending(r.referencia) ? 'bg-slate-50 border-slate-200 opacity-75 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 border-slate-200'}\`}>
                              <div className="flex items-center gap-3">
                                <input type="checkbox" checked={selectedRecibos.includes(r.referencia)} disabled={isItemPending(r.referencia)} onChange={() => toggleRecibo(r.referencia)}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                />
                                <div>
                                  <p className="font-semibold text-sm text-slate-800">{r.referencia}</p>
                                  <p className="text-xs text-slate-500">
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
                                {isItemPending(r.referencia) && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded uppercase font-bold">Por Verificar</span>}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>`;

if(content.includes(targetList)){
    content = content.replace(targetList, replaceList);
    fs.writeFileSync(file, content);
    console.log("Success");
} else {
    console.log("Target not found");
}
