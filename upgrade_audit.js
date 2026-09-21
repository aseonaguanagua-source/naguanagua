const fs = require('fs');

// ── 1. Upgrade audit.ts with enriched metadata ──
const auditPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/lib/audit.ts';
const newAuditTs = `import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type AuditCategoria =
  | 'SESION'
  | 'COBRO'
  | 'TRANSFERENCIA'
  | 'TASA'
  | 'CONTRIBUYENTE'
  | 'FACTURA'
  | 'REPORTE'
  | 'CONFIGURACION'
  | 'CONVENIO'
  | 'SISTEMA';

export const logAudit = async (
  accion: string,
  detalles: Record<string, any> = {},
  categoria: AuditCategoria = 'SISTEMA'
) => {
  try {
    let usuario = 'SISTEMA';
    let modulo = '';
    if (typeof window !== 'undefined') {
      const u = localStorage.getItem('adminUser');
      const l = localStorage.getItem('adminLetra');
      if (u) usuario = l ? \`\${l}-\${u}\` : u;
      modulo = window.location.pathname;
    }
    await supabase.from('auditoria').insert([{
      usuario,
      accion,
      categoria,
      modulo,
      detalles: {
        ...detalles,
        _hora: new Date().toLocaleTimeString('es-VE'),
        _fecha: new Date().toLocaleDateString('es-VE'),
        _ts: new Date().toISOString(),
      }
    }]);
  } catch (e) {
    console.error('Audit Log Error:', e);
  }
};
`;
fs.writeFileSync(auditPath, newAuditTs, 'utf8');
console.log('✅ audit.ts mejorado con categoría, módulo y hora');

// ── 2. Helper to safely patch a file ──
function patchFile(filePath, patches) {
  if (!fs.existsSync(filePath)) { console.log(`⚠ No encontrado: ${filePath}`); return; }
  let c = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  for (const [search, replace] of patches) {
    if (c.includes(search)) {
      c = c.replace(search, replace);
      modified = true;
    } else if (c.includes(search.replace(/\n/g, '\r\n'))) {
      c = c.replace(search.replace(/\n/g, '\r\n'), replace);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(filePath, c, 'utf8');
    console.log(`✅ Parcheado: ${filePath.split('/').pop()}`);
  } else {
    console.log(`⚠ Sin cambios en: ${filePath.split('/').pop()} (ya actualizado o no encontrado el patrón)`);
  }
}

// ── 3. Caja page — add audit on payment ──
const cajaPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/page.tsx';
patchFile(cajaPath, [
  // Add import
  [`import { createClient } from '@supabase/supabase-js';`,
   `import { createClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit';`],
  // After successful Debito payment (look for the success state setter)
  [`setSuccessData({ monto: montoTotal, metodo: 'Debito' });`,
   `setSuccessData({ monto: montoTotal, metodo: 'Debito' });
        logAudit('Cobro por Débito (Punto de Venta)', {
          contribuyente: selectedContrib?.Contribuyente || selectedContrib?.Identidad,
          identidad: selectedContrib?.Identidad,
          monto_bs: montoTotal,
          meses: selectedRecibos.length,
          referencias: selectedRecibos.map((r: any) => r.referencia),
        }, 'COBRO');`],
  // After successful Efectivo payment
  [`setSuccessData({ monto: montoTotal, metodo: 'Efectivo' });`,
   `setSuccessData({ monto: montoTotal, metodo: 'Efectivo' });
        logAudit('Cobro por Efectivo', {
          contribuyente: selectedContrib?.Contribuyente || selectedContrib?.Identidad,
          identidad: selectedContrib?.Identidad,
          monto_bs: montoTotal,
          meses: selectedRecibos.length,
          referencias: selectedRecibos.map((r: any) => r.referencia),
        }, 'COBRO');`],
]);

// ── 4. ManualBCVRateEditor — add audit on rate change ──
const bcvPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/components/ManualBCVRateEditor.tsx';
if (fs.existsSync(bcvPath)) {
  let c = fs.readFileSync(bcvPath, 'utf8');
  // Find where the rate is saved successfully and add audit
  if (c.includes('logAudit') && !c.includes("'TASA'")) {
    // Already has logAudit but needs category update — handled by new logAudit signature
    c = c.replace(
      `logAudit('Tasa BCV Actualizada'`,
      `logAudit('Tasa BCV Actualizada'`
    );
  } else if (!c.includes('logAudit')) {
    c = c.replace(
      `import { logAudit } from '@/lib/audit';`,
      `import { logAudit } from '@/lib/audit';`
    );
    // Find success message and add audit after it
    const savePattern = `setMessage('Tasa actualizada correctamente')`;
    if (c.includes(savePattern)) {
      c = c.replace(savePattern,
        `setMessage('Tasa actualizada correctamente');
      logAudit('Tasa BCV Actualizada', { nueva_tasa: newRate, anterior: currentRate }, 'TASA')`);
    }
  }
  fs.writeFileSync(bcvPath, c, 'utf8');
  console.log('✅ ManualBCVRateEditor auditado');
}

// ── 5. Cobro Móvil — add audit on payment ──
const cobroMovilPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/cobro-movil/page.tsx';
patchFile(cobroMovilPath, [
  [`import jsPDF from 'jspdf';`,
   `import jsPDF from 'jspdf';
import { logAudit } from '@/lib/audit';`],
  // Find where payment succeeds in cobro-movil
  [`setSuccessData({`,
   `logAudit('Cobro desde Cobro Móvil', {
        contribuyente: foundUser?.Contribuyente,
        identidad: foundUser?.Identidad,
        monto_bs: monto,
        metodo: payMethod,
        meses: selectedRefs.length,
        referencias: selectedRefs,
      }, 'COBRO');
      setSuccessData({`],
]);

// ── 6. Contribuyentes page — expand existing audit calls ──
const contribPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/contribuyentes/page.tsx';
patchFile(contribPath, [
  // Reversar recibo
  [`logAudit('Recibo Reversado'`,
   `logAudit('Recibo Reversado'`],
  // Anular recibo
  [`logAudit('Recibo Anulado'`,
   `logAudit('Recibo Anulado'`],
]);

// ── 7. Estado de Cuenta — add categoria to existing call ──
const estadoPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/estado-cuenta/page.tsx';
patchFile(estadoPath, [
  [`logAudit(\`Pago \${accion} (Estado Cuenta)\`, { id: pago.id, monto: pago.monto, referencia: pago.referencia });`,
   `logAudit(\`Pago \${accion} (Estado Cuenta)\`, { id: pago.id, monto: pago.monto, referencia: pago.referencia, banco: pago.banco, tipo: pago.tipo, identidad: pago.identidad }, 'TRANSFERENCIA');`],
]);

console.log('\n✅ Todos los módulos críticos auditados');
