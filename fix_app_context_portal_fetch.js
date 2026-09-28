const fs = require('fs');
const file = 'src/store/AppContext.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `      const isPortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal');
      if (isPortal) {
        // En el portal de contribuyentes NO cargamos toda la base de datos (10,000+ recibos)
        const [ { data: dbConfig }, apiBcv ] = await Promise.all([
           supabase.from('sistema_config').select('*'),
           fetch(\`/api/bcv?t=\${Date.now()}\`, { cache: 'no-store' }).then(res => res.json()).catch(() => ({ tcmmv: 0 }))
        ]);`;

const replacement = `      const isPortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal');
      const portalDoc = typeof window !== 'undefined' ? localStorage.getItem('portal_doc') : null;
      
      if (isPortal) {
        // En el portal de contribuyentes cargamos SOLO la data del usuario actual
        let userFacturas = [];
        let userInmuebles = [];
        
        if (portalDoc) {
          const idLimpio = portalDoc.replace(/-/g, '').toUpperCase();
          const idFmt = idLimpio.charAt(0) + '-' + idLimpio.slice(1);
          const soloNum = portalDoc.replace(/\\D/g, '');
          
          const [ { data: facturas }, { data: inmuebles } ] = await Promise.all([
             supabase.from('facturas').select('*').in('estado', ['Pendiente', 'Abonado', 'Por Verificar']).or('identidad.eq.' + idFmt + ',identidad.eq.' + idLimpio + ',identidad.eq.' + portalDoc.toUpperCase() + ',identidad.eq.' + soloNum),
             supabase.from('inmuebles').select('*').or('identidad.eq.' + idFmt + ',identidad.eq.' + idLimpio + ',identidad.eq.' + portalDoc.toUpperCase() + ',identidad.eq.' + soloNum)
          ]);
          
          userFacturas = facturas || [];
          userInmuebles = inmuebles || [];
        }

        const [ { data: dbConfig }, apiBcv ] = await Promise.all([
           supabase.from('sistema_config').select('*'),
           fetch(\`/api/bcv?t=\${Date.now()}\`, { cache: 'no-store' }).then(res => res.json()).catch(() => ({ tcmmv: 0 }))
        ]);

        setRecibos(userFacturas);
        setInmuebles(userInmuebles);
`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log("Fixed AppContext with localized portal fetch");
