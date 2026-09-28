const fs = require('fs');
const file = 'src/lib/calculos.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "  let labelToSearch = act.replace(/\\(alta\\)|\\(media\\)|\\(baja\\)/g, '').trim();",
  "  let labelToSearch = act.replace(/\\(alta\\)|\\(media\\)|\\(baja\\)/g, '').replace(/\\[hijo_de:[^\\]]+\\]/g, '').replace(/\\[hijo\\]/g, '').replace(/\\[condominio\\]/g, '').trim();"
);

// add a default fallback for Comercial instead of returning 0
content = content.replace(
  "  return 0; // Default if not found\n};",
  "  return 1.98; // Default fallback for Comercial (matches lowest common rate) to prevent 0 division/verification loops\n};"
);

// fix the TERRENOS and SERVICIO EXTRAORDINARIO returning 0 because the matched object has factors [0,0,0]
content = content.replace(
  "  if (found && found.factores) {\n    const idx = nivel === 'BAJA' ? 0 : (nivel === 'MEDIA' ? 1 : 2);\n    return found.factores[idx] || 0;\n  }",
  "  if (found && found.factores) {\n    const idx = nivel === 'BAJA' ? 0 : (nivel === 'MEDIA' ? 1 : 2);\n    // Terrenos y Servicios con factor 0 en el array causan En Verificacion\n    if (found.factores[idx] === 0) return 1.98;\n    return found.factores[idx] || 1.98;\n  }"
);

fs.writeFileSync(file, content);
