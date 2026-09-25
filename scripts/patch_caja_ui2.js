const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /\{\/\* ── SELECCION DE LOCALES CONDOMINIO ── \*\/\}\s*\{isCondominio && condominioModo === 'Local' && \([\s\S]*?\}\s*\)\s*\}\s*<\/tbody>\s*<\/table>\s*<\/div>\s*\)\}/m;

const newBlock = `{/* ── SELECCION DE LOCALES CONDOMINIO ── */}
          {isCondominio && condominioModo === 'Local' && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6 flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                <h3 className="font-bold text-slate-800 text-lg">Selección de Locales (Condominio)</h3>
                <input 
                  type="text" 
                  placeholder="Buscar código, RIF o actividad..." 
                  value={condominioSearch}
                  onChange={e => setCondominioSearch(e.target.value)}
                  className="border border-slate-300 rounded px-3 py-1 text-sm outline-none focus:border-emerald-500 w-[250px]"
                />
              </div>
              <div className="overflow-y-auto max-h-[350px]">
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 shadow-[0_2px_0_#e2e8f0]">
                    <tr>
                      <th className="text-left py-2 w-10">
                        <input type="checkbox" onChange={(e) => {
                          if (e.target.checked) {
                            const allIds = condominioHijos.map(h => h.id);
                            setSelectedHijos(allIds);
                            setTotalBs(condominioHijos.reduce((acc, h) => acc + ((h.deuda_mmv || 0) * currentBcvRate), 0));
                          } else {
                            setSelectedHijos([]);
                            setTotalBs(0);
                          }
                        }} checked={selectedHijos.length === condominioHijos.length && condominioHijos.length > 0} className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                      </th>
                      <th className="text-left py-2 font-semibold text-slate-600">Inmueble / Local</th>
                      <th className="text-left py-2 font-semibold text-slate-600">Identidad / RIF</th>
                      <th className="text-left py-2 font-semibold text-slate-600">Actividad Comercial</th>
                      <th className="text-right py-2 font-semibold text-slate-600 pr-2">Deuda Bs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {condominioHijos.filter((h: any) => 
                      !condominioSearch || 
                      (h.inmueble || '').toLowerCase().includes(condominioSearch.toLowerCase()) || 
                      (h.identidad || '').toLowerCase().includes(condominioSearch.toLowerCase()) || 
                      (h.actividad_principal || '').toLowerCase().includes(condominioSearch.toLowerCase())
                    ).map((hijo: any) => (
                      <tr key={hijo.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2">
                          <input type="checkbox" checked={selectedHijos.includes(hijo.id)} onChange={(e) => {
                            let newSelected = [];
                            if (e.target.checked) newSelected = [...selectedHijos, hijo.id];
                            else newSelected = selectedHijos.filter(id => id !== hijo.id);
                            setSelectedHijos(newSelected);
                            
                            let sum = 0;
                            newSelected.forEach(id => {
                              const f = condominioHijos.find(h => h.id === id);
                              if (f) sum += ((f.deuda_mmv || 0) * currentBcvRate);
                            });
                            setTotalBs(sum);
                          }} className="w-4 h-4 accent-emerald-600 cursor-pointer mt-1" />
                        </td>
                        <td className="py-2 align-top pt-2.5">
                          <span className="font-semibold text-slate-700">{hijo.inmueble}</span>
                        </td>
                        <td className="py-2 align-top text-slate-600 pt-2.5">{hijo.identidad || 'N/A'}</td>
                        <td className="py-2 align-top text-xs text-slate-500 pt-2.5 pr-4" title={hijo.actividad_principal || 'N/A'}>
                          {hijo.actividad_principal ? hijo.actividad_principal.replace(/\\[HIJO_DE:.*?\\]\\s*/g, '').replace('[CONDOMINIO]', '') : 'N/A'}
                        </td>
                        <td className="text-right py-2 align-top pt-2.5 pr-2 font-bold text-emerald-600 whitespace-nowrap">
                          {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format((parseFloat(hijo.deuda_mmv || '0') * currentBcvRate) || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}`;

content = content.replace(regex, newBlock);
fs.writeFileSync(path, content, 'utf8');
console.log('Patch complete.');
