const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('const [condominioSearch, setCondominioSearch] = useState("");')) {
    content = content.replace('const [isCondominioModalOpen, setIsCondominioModalOpen] = useState(false);', 
        'const [isCondominioModalOpen, setIsCondominioModalOpen] = useState(false);\n  const [condominioSearch, setCondominioSearch] = useState("");');
}

const origTableSearch = `            {condominioHijos.length > 0 && condominioModo === 'Local' && (
              <div className="bg-white rounded-xl shadow p-4 lg:p-6 lg:col-span-12 xl:col-span-12">
                <h3 className="font-bold text-lg text-slate-800 mb-4">Selección de Locales (Condominio)</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2"><input type="checkbox" onChange={e => {
                        if (e.target.checked) setSelectedHijos(condominioHijos.map(h => h.id));
                        else setSelectedHijos([]);
                      }} checked={selectedHijos.length === condominioHijos.length && condominioHijos.length > 0} className="mr-2 accent-emerald-600"/>Inmueble / Local</th>
                      <th className="py-2 text-right">Deuda Bs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {condominioHijos.map(hijo => (
                      <tr key={hijo.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={selectedHijos.includes(hijo.id)} onChange={(e) => {
                                if (e.target.checked) setSelectedHijos([...selectedHijos, hijo.id]);
                                else setSelectedHijos(selectedHijos.filter(id => id !== hijo.id));
                            }} className="accent-emerald-600"/>
                            {hijo.inmueble}
                          </label>
                        </td>
                        <td className="text-right py-2 text-emerald-700 font-bold">{formatBs((hijo.deuda_mmv || 0) * tcmmv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}`;

const newTableBlock = `            {condominioHijos.length > 0 && condominioModo === 'Local' && (
              <div className="bg-white rounded-xl shadow p-4 lg:p-6 lg:col-span-12 xl:col-span-12 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-slate-800">Selección de Locales (Condominio)</h3>
                  <input 
                    type="text" 
                    placeholder="Buscar por código, RIF o actividad..." 
                    value={condominioSearch}
                    onChange={e => setCondominioSearch(e.target.value)}
                    className="border border-slate-300 rounded px-3 py-1.5 text-sm outline-none focus:border-emerald-500 min-w-[250px]"
                  />
                </div>
                <div className="overflow-y-auto max-h-[400px] border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0 shadow-sm">
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 px-3">
                          <input type="checkbox" onChange={e => {
                            if (e.target.checked) setSelectedHijos(condominioHijos.map(h => h.id));
                            else setSelectedHijos([]);
                          }} checked={selectedHijos.length === condominioHijos.length && condominioHijos.length > 0} className="mr-2 accent-emerald-600"/>
                          Inmueble / Local
                        </th>
                        <th className="py-2 px-3">Identidad</th>
                        <th className="py-2 px-3">Actividad Comercial</th>
                        <th className="py-2 px-3 text-right">Deuda Bs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {condominioHijos.filter(h => 
                        !condominioSearch || 
                        (h.inmueble || '').toLowerCase().includes(condominioSearch.toLowerCase()) || 
                        (h.identidad || '').toLowerCase().includes(condominioSearch.toLowerCase()) || 
                        (h.actividad_principal || '').toLowerCase().includes(condominioSearch.toLowerCase())
                      ).map(hijo => (
                        <tr key={hijo.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="py-2 px-3 align-top">
                            <label className="flex items-start gap-2 cursor-pointer mt-1">
                              <input type="checkbox" checked={selectedHijos.includes(hijo.id)} onChange={(e) => {
                                  if (e.target.checked) setSelectedHijos([...selectedHijos, hijo.id]);
                                  else setSelectedHijos(selectedHijos.filter(id => id !== hijo.id));
                              }} className="accent-emerald-600 mt-1"/>
                              <span className="font-semibold text-slate-700">{hijo.inmueble}</span>
                            </label>
                          </td>
                          <td className="py-2 px-3 align-top text-slate-600 mt-1">
                            {hijo.identidad || 'N/A'}
                          </td>
                          <td className="py-2 px-3 align-top text-xs text-slate-500 max-w-[200px] truncate" title={hijo.actividad_principal || 'N/A'}>
                            {hijo.actividad_principal ? hijo.actividad_principal.replace(/\\\[HIJO_DE:.*?\\\]\\s*/g, '').replace('[CONDOMINIO]', '') : 'N/A'}
                          </td>
                          <td className="text-right py-2 px-3 align-top text-emerald-700 font-bold whitespace-nowrap mt-1">
                            {formatBs((hijo.deuda_mmv || 0) * tcmmv)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}`;

content = content.replace(origTableSearch, newTableBlock);

fs.writeFileSync(path, content, 'utf8');
console.log('Patch complete.');
