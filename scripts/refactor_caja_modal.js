const fs = require('fs');
let content = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', 'utf8');

// 1. Add `isCondominioModalOpen` state
content = content.replace(
  /const \[condominioModo, setCondominioModo\] = useState\<'Total' \| 'Local' \| 'Abono'\>\('Total'\);/,
  `const [condominioModo, setCondominioModo] = useState<'Total' | 'Local' | 'Abono'>('Total');
  const [isCondominioModalOpen, setIsCondominioModalOpen] = useState(false);`
);

// 2. Open modal on search
content = content.replace(
  /setIsCondominio\(true\);\s*setCondominioHijos\(hijosData\);\s*setSelectedHijos\(hijosData\.map\(h => h\.id\)\);/g,
  `setIsCondominio(true);
          setCondominioHijos(hijosData);
          setSelectedHijos(hijosData.map(h => h.id));
          setIsCondominioModalOpen(true); // Abrir modal automáticamente`
);

// 3. Remove inline UI
const inlineUIStart = `{isCondominio && (
            <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">`;
const inlineUIEnd = `            </div>
          )}`;
// Find the exact text block and delete it. (Using regex to match the whole block)
content = content.replace(
  /\{\s*isCondominio\s*&&\s*\(\s*<div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">[\s\S]*?<\/div>\s*\)\s*\}/,
  `{/* Opciones de condominio movidas a un Modal */}`
);

// 4. Add Modal at the end of the return statement
const modalUI = `
      {isCondominioModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Landmark className="w-6 h-6" /> Opciones de Pago (Condominio)
              </h3>
              <button onClick={() => setIsCondominioModalOpen(false)} className="text-indigo-200 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-slate-600 mb-6 text-center text-lg">
                Se ha detectado que este contribuyente es un Condominio. ¿Cómo desea procesar el cobro?
              </p>
              
              <div className="grid grid-cols-1 gap-4 mb-6">
                <button
                  onClick={() => setCondominioModo('Total')}
                  className={\`p-4 rounded-xl border-2 font-bold text-left transition-all \${condominioModo === 'Total' ? 'border-indigo-600 bg-indigo-50 text-indigo-800 shadow-md ring-2 ring-indigo-200 ring-offset-1' : 'border-slate-200 hover:border-indigo-300 text-slate-700'}\`}
                >
                  <div className="text-lg">Pago Total</div>
                  <div className="text-sm font-normal text-slate-500 mt-1">Cancela la deuda completa de todos los locales/apartamentos.</div>
                </button>
                
                <button
                  onClick={() => setCondominioModo('Local')}
                  className={\`p-4 rounded-xl border-2 font-bold text-left transition-all \${condominioModo === 'Local' ? 'border-indigo-600 bg-indigo-50 text-indigo-800 shadow-md ring-2 ring-indigo-200 ring-offset-1' : 'border-slate-200 hover:border-indigo-300 text-slate-700'}\`}
                >
                  <div className="text-lg">Pago por Local (Hijos)</div>
                  <div className="text-sm font-normal text-slate-500 mt-1">Selecciona cuáles locales están pagando.</div>
                </button>
                
                <button
                  onClick={() => setCondominioModo('Abono')}
                  className={\`p-4 rounded-xl border-2 font-bold text-left transition-all \${condominioModo === 'Abono' ? 'border-indigo-600 bg-indigo-50 text-indigo-800 shadow-md ring-2 ring-indigo-200 ring-offset-1' : 'border-slate-200 hover:border-indigo-300 text-slate-700'}\`}
                >
                  <div className="text-lg">Abono Libre</div>
                  <div className="text-sm font-normal text-slate-500 mt-1">Realiza un abono genérico a la deuda consolidada.</div>
                </button>
              </div>

              {condominioModo === 'Local' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-60 overflow-y-auto mb-6">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Seleccione los locales a pagar:</p>
                  <div className="space-y-2">
                    {condominioHijos.map(h => (
                      <label key={h.id} className="flex items-center gap-3 p-3 bg-white hover:bg-indigo-50 rounded-lg cursor-pointer border border-slate-100 shadow-sm transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedHijos.includes(h.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedHijos([...selectedHijos, h.id]);
                            else setSelectedHijos(selectedHijos.filter(id => id !== h.id));
                          }}
                          className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                        />
                        <span className="font-medium text-slate-800 flex-1">{h.inmueble || 'Sin código'}</span>
                        <span className="text-sm font-bold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full">
                          {parseFloat(h.deuda_mmv || '0').toFixed(2)} UCD
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="text-center italic text-sm text-slate-400 bg-slate-100 p-3 rounded-lg mt-4 border border-slate-200">
                "¡Por favor, ponte de acuerdo con los vecinos antes de pagar que el sistema no hace milagros! 😅"
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsCondominioModalOpen(false)}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all w-full flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" /> Aplicar Selección
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(/(<\/div>\s*)$/, modalUI + "\n$1");

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', content);
console.log('Modal script aplicado');
