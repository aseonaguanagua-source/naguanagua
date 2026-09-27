const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/admin/caja/page.tsx', 'utf8');
if (!c.includes("import { calcularMensualidad } from '@/lib/calculos';")) {
  c = c.replace(
    "import { logAudit } from '@/lib/audit';",
    "import { logAudit } from '@/lib/audit';\nimport { calcularMensualidad } from '@/lib/calculos';"
  );
  fs.writeFileSync('src/app/(admin)/admin/caja/page.tsx', c);
}
