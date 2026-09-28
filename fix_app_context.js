const fs = require('fs');
const file = 'src/store/AppContext.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `  const loadAllData = async () => {
    try {
      setIsLoading(true);`;
      
const replacement = `  const loadAllData = async () => {
    try {
      setIsLoading(true);
      
      const isPortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal');
      if (isPortal) {
        // En el portal de contribuyentes NO cargamos toda la base de datos (10,000+ recibos)
        const [ { data: dbConfig }, apiBcv ] = await Promise.all([
           supabase.from('sistema_config').select('*'),
           fetch(\`/api/bcv?t=\${Date.now()}\`, { cache: 'no-store' }).then(res => res.json()).catch(() => ({ tcmmv: 0 }))
        ]);

        let manualTcmmv = 0;
        let semanalTcmmv = 0;
        if (dbConfig) {
          const ordenanza = dbConfig.find(c => c.id === 'tarifas_ordenanza');
          if (ordenanza && ordenanza.valor) {
            setOrdenanzasConfig({ ...ordenanzaData, ...ordenanza.valor });
          }
          const manual = dbConfig.find(c => c.id === 'tasa_bcv_manual');
          if (manual && manual.valor) manualTcmmv = parseFloat(manual.valor);
          const semanal = dbConfig.find(c => c.id === 'tasa_bcv_semanal');
          if (semanal && semanal.valor) semanalTcmmv = parseFloat(semanal.valor);
        }

        const bcvData = apiBcv;
        let currentTcmmv = manualTcmmv > 0 ? manualTcmmv : (bcvData?.tcmmv > 0 ? bcvData.tcmmv : semanalTcmmv);

        if (currentTcmmv <= 0) {
          try {
            const eurRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial');
            const eurData = await eurRes.json();
            if (eurData && eurData.promedio > 0) currentTcmmv = eurData.promedio;
          } catch (e) {
            console.error(e);
          }
        }
        setTcmmv(currentTcmmv);
        setIsLoading(false);
        return; // Salimos de loadAllData temprano, ahorrando toda la carga masiva
      }
`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log("Fixed AppContext");
