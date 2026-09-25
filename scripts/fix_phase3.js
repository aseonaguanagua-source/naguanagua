const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/store/AppContext.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add refreshData to AppState type
content = content.replace(
  /setFacturas: React\.Dispatch<React\.SetStateAction<any\[\]>>;(\r?\n)\};/,
  `setFacturas: React.Dispatch<React.SetStateAction<any[]>>;$1  refreshData: () => Promise<void>;$1};`
);

// 2. Add refreshData function after loadAllData
content = content.replace(
  /} finally \{(\r?\n)\s*setIsLoading\(false\);(\r?\n)\s*\}(\r?\n)\s*\};/,
  `} finally {$1      setIsLoading(false);$2    }$3  };$3$3  const refreshData = async () => {$3    await loadAllData();$3  };`
);

// 3. Add refreshData to provider value
content = content.replace(
  /setPreRegistros,(\r?\n)\s*setFacturas(\r?\n)\s*\}}\>/,
  `setPreRegistros,$1      setFacturas,$2      refreshData$2    }}>`
);

fs.writeFileSync(path, content, 'utf8');
console.log("✅ Fase 3.1 applied to AppContext.tsx");
