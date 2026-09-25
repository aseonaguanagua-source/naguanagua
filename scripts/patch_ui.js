const fs = require('fs');
let path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
`            Usuarios Inactivos / Eliminados
          </button>
        </div>
        
        <div className="flex items-center gap-2 mb-2">
          <input 
            type="checkbox"`,
`            Usuarios Inactivos / Eliminados
          </button>
        </div>
        
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder="Búsqueda Profunda (BD)..."
            value={serverSearchTerm}
            onChange={(e) => setServerSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleServerSearch(); }}
            className="border border-slate-300 rounded-md px-3 py-1 text-sm outline-none focus:border-emerald-500 w-[240px]"
          />
          <button onClick={handleServerSearch} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-md text-sm border border-slate-300 font-medium">
            {isSearchingServer ? 'Buscando...' : 'Buscar'}
          </button>
          {isShowingServerResults && (
             <button onClick={() => { setIsShowingServerResults(false); setServerSearchTerm(""); }} className="text-red-500 hover:text-red-700 text-xs font-bold underline mx-2">Limpiar</button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input 
            type="checkbox"`
);

fs.writeFileSync(path, c, 'utf8');
