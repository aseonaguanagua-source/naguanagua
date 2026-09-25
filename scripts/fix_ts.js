const fs = require('fs');

// 1. Fix page.tsx in contribuyentes
let path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let c = fs.readFileSync(path, 'utf8');
if (!c.includes('const [serverSearchTerm')) {
   c = c.replace("const [activeTab, setActiveTab] = useState<'Activos' | 'Inactivos'>('Activos');", 
                 "const [activeTab, setActiveTab] = useState<'Activos' | 'Inactivos'>('Activos');\n  const [serverSearchTerm, setServerSearchTerm] = useState('');\n  const [isSearchingServer, setIsSearchingServer] = useState(false);\n  const [serverResults, setServerResults] = useState<any[]>([]);\n  const [isShowingServerResults, setIsShowingServerResults] = useState(false);");
   fs.writeFileSync(path, c, 'utf8');
}

// 2. Fix empty arrays in ordenanza.ts causing TS 'never'
path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/data/ordenanza.ts';
c = fs.readFileSync(path, 'utf8');
c = c.replace('actividadesIndustriales: []', 'actividadesIndustriales: [] as any[]');
c = c.replace('serviciosEspeciales: []', 'serviciosEspeciales: [] as any[]');
c = c.replace('inspeccionesTecnicas: []', 'inspeccionesTecnicas: [] as any[]');
c = c.replace('vistoBueno: []', 'vistoBueno: [] as any[]');
c = c.replace('serviciosExtraordinarios: []', 'serviciosExtraordinarios: [] as any[]');
fs.writeFileSync(path, c, 'utf8');

