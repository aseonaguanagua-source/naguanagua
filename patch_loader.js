const fs = require('fs');
const path = './src/store/AppContext.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `
      setFacturas,
      refreshData
    }}>
      {isLoading ? (
        <div className="fixed inset-0 bg-slate-900 z-[9999] flex flex-col items-center justify-center">
          <div className="text-white text-2xl font-bold mb-8 flex items-center gap-3">
            <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Iniciando Sistema...
          </div>
          <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" style={{ width: '100%' }}></div>
          </div>
          <p className="text-slate-400 mt-4 text-sm animate-pulse">Sincronizando base de datos...</p>
        </div>
      ) : (
        children
      )}
    </AppContext.Provider>
  );
};
`;

content = content.replace(
  /setFacturas,\n\s*refreshData\n\s*\}\}>\n\s*\{children\}\n\s*<\/AppContext.Provider>\n\s*\);\n\};/g,
  replacement.trim()
);

fs.writeFileSync(path, content);
