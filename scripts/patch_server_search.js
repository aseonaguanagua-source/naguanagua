const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add states
if (!content.includes('const [serverSearchTerm, setServerSearchTerm] = useState("");')) {
    content = content.replace('const [activeTab, setActiveTab] = useState(\'Activos\');',
        'const [activeTab, setActiveTab] = useState(\'Activos\');\n  const [serverSearchTerm, setServerSearchTerm] = useState("");\n  const [isSearchingServer, setIsSearchingServer] = useState(false);\n  const [serverResults, setServerResults] = useState<any[]>([]);\n  const [isShowingServerResults, setIsShowingServerResults] = useState(false);');
}

// 2. Add search function
const searchFunc = `
  const handleServerSearch = async () => {
    if (!serverSearchTerm.trim()) {
      setIsShowingServerResults(false);
      return;
    }
    setIsSearchingServer(true);
    setIsShowingServerResults(true);
    try {
      const term = serverSearchTerm.trim();
      const { data, error } = await supabase.from('inmuebles')
        .select('*')
        .or(\`identidad.ilike.%\${term}%,inmueble.ilike.%\${term}%\`)
        .limit(50);
        
      if (error) throw error;
      
      const mapped = (data || []).map((row: any) => ({
          Identidad: row.identidad,
          Contribuyente: row.contribuyente || row.nombre || 'Sin Nombre',
          Telefono: row.telefono || 'No registrado',
          Correo: row.email || row.correo_electronico || 'No registrado',
          CodCont: row.inmueble || row.cod_cont,
          cod_cont: row.inmueble || row.cod_cont,
          Direccion: row.direccion || '',
          Observaciones: '',
          Actividad: row.actividad_principal || 'No aplica',
          Clasificacion: row.clasificacion || 'Residencial',
          SaldoFavor: parseFloat(row.saldo_favor_bs || '0'),
          Estado: row.estado || 'Activo',
          FechaRegistro: row.created_at || null
      }));
      setServerResults(mapped);
    } catch (e: any) {
      alert("Error en la busqueda: " + e.message);
    } finally {
      setIsSearchingServer(false);
    }
  };
`;
if (!content.includes('handleServerSearch')) {
    content = content.replace('const handleExport = () => {', searchFunc + '\n  const handleExport = () => {');
    // Also try another place if handleExport is not there
    if (!content.includes('handleServerSearch')) {
       content = content.replace('const exportarExcelContribuyentes = () => {', searchFunc + '\n  const exportarExcelContribuyentes = () => {');
    }
}

// 3. Update the filtered data effect
if (content.includes('let result = contribuyentes;')) {
    content = content.replace(
        'let result = contribuyentes;',
        'let result = isShowingServerResults ? serverResults : contribuyentes;'
    );
    // Also update dependency array
    content = content.replace(
        '  }, [activeTab, contribuyentes, showWithNotes]);',
        '  }, [activeTab, contribuyentes, showWithNotes, isShowingServerResults, serverResults]);'
    );
}

// 4. Add the search bar in the UI
const searchBarUI = `
        <div className="flex gap-4">
          <button
`;
const newSearchBarUI = `
        <div className="flex flex-col sm:flex-row gap-4 justify-between w-full">
          <div className="flex gap-4">
            <button
`;
if (content.includes(searchBarUI)) {
    content = content.replace(searchBarUI, newSearchBarUI);
    
    // Add the search box after the tabs
    const tabsEnd = `            Inactivos
          </button>
        </div>`;
        
    const searchBox = `            Inactivos
          </button>
        </div>
        <div className="flex items-center gap-2 mb-2 sm:mb-0">
          <input
            type="text"
            placeholder="Búsqueda Profunda (Base de Datos)..."
            value={serverSearchTerm}
            onChange={(e) => setServerSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleServerSearch(); }}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm outline-none focus:border-emerald-500 w-[280px]"
          />
          <button onClick={handleServerSearch} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md text-sm border border-slate-300 font-medium">
            {isSearchingServer ? 'Buscando...' : 'Buscar'}
          </button>
          {isShowingServerResults && (
             <button onClick={() => { setIsShowingServerResults(false); setServerSearchTerm(""); }} className="text-red-500 hover:text-red-700 text-xs font-bold underline ml-2">Limpiar Búsqueda</button>
          )}
        </div>`;
    content = content.replace(tabsEnd, searchBox);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Patched contribuyentes page for server search');
