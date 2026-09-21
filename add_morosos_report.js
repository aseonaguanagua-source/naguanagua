const fs = require('fs');
const path = require('path');

const generatorPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/reportes/generators/Morosos.ts';
const reportesPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/reportes/page.tsx';

// ── 1. Create Morosos.ts generator ──
const generatorContent = `import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generarMorososExcel(
  facturasPendientes: any[],
  contribuyentes: any[],
  tcmmv: number
): Promise<void> {
  const grouped: Record<string, { facturas: any[]; contrib: any }> = {};
  for (const f of facturasPendientes) {
    const id = (f.identidad || '').replace(/-/g, '').toUpperCase();
    if (!id) continue;
    if (!grouped[id]) {
      const contrib = contribuyentes.find((c: any) =>
        (c.Identidad || '').replace(/-/g, '').toUpperCase() === id
      );
      grouped[id] = { facturas: [], contrib };
    }
    grouped[id].facturas.push(f);
  }
  const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const getMes = (d: string) => {
    const p = d?.split('-');
    return p?.length >= 2 ? \`\${MESES[parseInt(p[1])-1]}-\${p[0]}\` : d || '—';
  };
  const rows = Object.values(grouped)
    .filter(g => g.facturas.length > 0)
    .map(g => {
      const { facturas, contrib } = g;
      let totalDeudaBs = 0;
      for (const f of facturas) totalDeudaBs += parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
      const periodos = facturas
        .sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime())
        .map((f: any) => getMes(f.emision)).join(', ');
      return {
        cod_cont: contrib?.CodCont || contrib?.cod_cont || '—',
        contribuyente: contrib?.Contribuyente || facturas[0]?.contribuyente || '—',
        identidad: contrib?.Identidad || facturas[0]?.identidad || '—',
        clasificacion: contrib?.Clasificacion || '—',
        mesesPendientes: facturas.length,
        periodos,
        totalDeudaBs,
      };
    })
    .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);

  const today = new Date().toLocaleDateString('es-VE');
  const wsData = [
    ['REPORTE DE MOROSOS — ISMA (MUNICIPIO SILVA)'],
    [\`Fecha: \${today}  |  Tasa BCV: \${tcmmv ? tcmmv + ' Bs/EUR' : 'N/D'}  |  Total morosos: \${rows.length}\`],
    [],
    ['N°','CÓDIGO','CONTRIBUYENTE','IDENTIDAD','CLASIFICACIÓN','MESES PENDIENTES','PERÍODOS','DEUDA TOTAL (Bs)'],
    ...rows.map((r, i) => [i+1, r.cod_cont, r.contribuyente, r.identidad, r.clasificacion, r.mesesPendientes, r.periodos,
      r.totalDeudaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })]),
    [],
    ['','','','','','TOTAL MOROSOS:', rows.length, ''],
    ['','','','','','TOTAL DEUDA (Bs):','', rows.reduce((s, r) => s + r.totalDeudaBs, 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })],
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:5},{wch:12},{wch:40},{wch:15},{wch:18},{wch:18},{wch:50},{wch:20}];
  ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }, { s:{r:1,c:0}, e:{r:1,c:7} }];
  xlsx.utils.book_append_sheet(wb, ws, 'Morosos');
  xlsx.writeFile(wb, \`Reporte_Morosos_\${today.replace(/\\//g, '-')}.xlsx\`);
}

export async function generarMorososPDF(
  facturasPendientes: any[],
  contribuyentes: any[],
  tcmmv: number
): Promise<void> {
  const grouped: Record<string, { facturas: any[]; contrib: any }> = {};
  for (const f of facturasPendientes) {
    const id = (f.identidad || '').replace(/-/g, '').toUpperCase();
    if (!id) continue;
    if (!grouped[id]) {
      const contrib = contribuyentes.find((c: any) =>
        (c.Identidad || '').replace(/-/g, '').toUpperCase() === id
      );
      grouped[id] = { facturas: [], contrib };
    }
    grouped[id].facturas.push(f);
  }
  const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const getMes = (d: string) => {
    const p = d?.split('-');
    return p?.length >= 2 ? \`\${MESES[parseInt(p[1])-1]}-\${p[0]}\` : d || '—';
  };
  const rows = Object.values(grouped)
    .filter(g => g.facturas.length > 0)
    .map(g => {
      const { facturas, contrib } = g;
      let totalDeudaBs = 0;
      for (const f of facturas) totalDeudaBs += parseFloat(String(f.monto || '0').replace(/[^\\d.]/g, '')) || 0;
      const periodos = facturas
        .sort((a: any, b: any) => new Date(a.emision).getTime() - new Date(b.emision).getTime())
        .map((f: any) => getMes(f.emision)).join(', ');
      return {
        cod_cont: contrib?.CodCont || '—',
        contribuyente: contrib?.Contribuyente || facturas[0]?.contribuyente || '—',
        identidad: contrib?.Identidad || facturas[0]?.identidad || '—',
        clasificacion: contrib?.Clasificacion || '—',
        mesesPendientes: facturas.length,
        periodos,
        totalDeudaBs,
      };
    })
    .sort((a, b) => b.mesesPendientes - a.mesesPendientes || b.totalDeudaBs - a.totalDeudaBs);

  const today = new Date();
  const todayStr = today.toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'numeric' });
  const doc = new jsPDF({ unit:'mm', format:'a4', orientation:'landscape' });

  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE MOROSOS', 148, 14, { align:'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('INSTITUTO SOCIAL MUNICIPAL DEL AMBIENTE (ISMA) — MUNICIPIO SILVA', 148, 20, { align:'center' });
  doc.setTextColor(100,100,100); doc.setFontSize(8);
  doc.text(\`Fecha: \${todayStr}  |  Tasa BCV: \${tcmmv ? tcmmv + ' Bs/EUR' : 'N/D'}  |  Total morosos: \${rows.length}\`, 148, 25, { align:'center' });
  doc.setTextColor(0,0,0); doc.setLineWidth(0.5); doc.line(14, 28, 282, 28);

  const totalDeuda = rows.reduce((s, r) => s + r.totalDeudaBs, 0);

  autoTable(doc, {
    startY: 32,
    head: [['N°','CÓDIGO','CONTRIBUYENTE / RAZÓN SOCIAL','IDENTIDAD','CLASIFICACIÓN','MESES\\nPENDIENTES','PERÍODOS ADEUDADOS','DEUDA TOTAL (Bs)']],
    body: [
      ...rows.map((r, i) => [
        i+1, r.cod_cont, r.contribuyente, r.identidad, r.clasificacion,
        r.mesesPendientes, r.periodos,
        r.totalDeudaBs.toLocaleString('es-VE', { minimumFractionDigits:2 }),
      ]),
      ['','','','','',
        { content: \`TOTAL: \${rows.length} morosos\`, colSpan:2, styles:{ fontStyle:'bold', halign:'right' } },
        { content: \`Bs. \${totalDeuda.toLocaleString('es-VE', { minimumFractionDigits:2 })}\`, styles:{ fontStyle:'bold', halign:'right', textColor:[220,38,38] } }
      ],
    ],
    theme: 'striped',
    headStyles: { fillColor:[15,23,42], textColor:[255,255,255], fontStyle:'bold', fontSize:8, halign:'center' },
    styles: { fontSize:7.5, cellPadding:2 },
    columnStyles: {
      0:{ cellWidth:8, halign:'center' },
      1:{ cellWidth:20 },
      2:{ cellWidth:70 },
      3:{ cellWidth:22 },
      4:{ cellWidth:22 },
      5:{ cellWidth:16, halign:'center', fontStyle:'bold' },
      6:{ cellWidth:70 },
      7:{ cellWidth:30, halign:'right', fontStyle:'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index < rows.length) {
        const r = rows[data.row.index];
        if (r && r.mesesPendientes >= 3) data.cell.styles.textColor = [185, 28, 28];
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(7); doc.setFont('helvetica','italic'); doc.setTextColor(100,100,100);
  doc.text('* Contribuyentes en rojo tienen 3 o más meses pendientes.', 14, finalY);
  doc.text(\`Generado: \${todayStr} | Sistema ISMA\`, 282, finalY, { align:'right' });
  doc.save(\`Morosos_\${todayStr.replace(/\\//g, '-')}.pdf\`);
}
`;

fs.writeFileSync(generatorPath, generatorContent, 'utf8');
console.log('✅ Morosos.ts creado');

// ── 2. Update reportes/page.tsx ──
let p = fs.readFileSync(reportesPath, 'utf8');

// Add import
const importTarget = `import { generarCuadreCajaPDF } from './generators/CuadreCaja';`;
const importReplacement = `import { generarCuadreCajaPDF } from './generators/CuadreCaja';
import { generarMorososExcel, generarMorososPDF } from './generators/Morosos';`;
p = p.replace(importTarget, importReplacement);

// Add to ActiveView type
p = p.replace(
  `type ActiveView = null | 'ingresos' | 'corte' | 'libro-ventas' | 'fiscalizacion' | 'empleados' | 'saldos' | 'ingreso-bancario';`,
  `type ActiveView = null | 'ingresos' | 'corte' | 'libro-ventas' | 'fiscalizacion' | 'empleados' | 'saldos' | 'ingreso-bancario' | 'morosos';`
);

// Add to CARDS array
const cardsEnd = `  { id: 'empleados' as ActiveView,      label: 'Gestion Empleados',       emoji: '👥',  desc: 'Reporte mensual del personal',                 adminOnly: true  },
];`;
const cardsEndNew = `  { id: 'empleados' as ActiveView,      label: 'Gestion Empleados',       emoji: '👥',  desc: 'Reporte mensual del personal',                 adminOnly: true  },
  { id: 'morosos' as ActiveView,        label: 'Reporte Morosos',         emoji: '🔴',  desc: 'Contribuyentes con deuda pendiente',           adminOnly: true  },
];`;
p = p.replace(cardsEnd, cardsEndNew);

// Add morosos state and function after generarEmpleados function
const fnTarget = `  if (activeView === 'saldos') return (`;
const fnInsert = `  const [morososData, setMorososData] = useState<{total: number; deudaTotal: number} | null>(null);
  const [loadingMorosos, setLoadingMorosos] = useState(false);

  const cargarMorosos = async () => {
    setLoadingMorosos(true);
    try {
      let all: any[] = []; let from = 0;
      while (true) {
        const { data: chunk } = await supabase.from('facturas').select('*')
          .in('estado', ['Pendiente', 'Abonado']).range(from, from + 999);
        if (!chunk || chunk.length === 0) break;
        all = [...all, ...chunk];
        from += 1000;
        if (chunk.length < 1000) break;
      }
      const ids = new Set(all.map((f: any) => (f.identidad || '').replace(/-/g,'').toUpperCase()).filter(Boolean));
      const totalDeuda = all.reduce((s: number, f: any) => s + (parseFloat(String(f.monto || '0').replace(/[^\\d.]/g,'')) || 0), 0);
      setMorososData({ total: ids.size, deudaTotal: totalDeuda });
      return all;
    } catch(e) { console.error(e); return []; }
    finally { setLoadingMorosos(false); }
  };

  const exportarMorososExcel = async () => {
    const facturas = await cargarMorosos();
    if (facturas.length > 0) await generarMorososExcel(facturas, contribuyentes, tcmmv || 0);
  };

  const exportarMorososPDF = async () => {
    const facturas = await cargarMorosos();
    if (facturas.length > 0) await generarMorososPDF(facturas, contribuyentes, tcmmv || 0);
  };

  if (activeView === 'morosos') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setActiveView(null)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">← Regresar</button>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-bold text-slate-800">🔴 Reporte de Morosos</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-lg space-y-4">
        <p className="text-sm text-slate-600">Genera el listado de todos los contribuyentes con facturas <strong>Pendiente</strong> o <strong>Abonado</strong>, ordenados por mayor deuda y meses adeudados.</p>
        {morososData && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-red-700">{morososData.total}</div>
              <div className="text-xs text-red-600 mt-1 font-medium">Contribuyentes Morosos</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-red-700">Bs. {morososData.deudaTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
              <div className="text-xs text-red-600 mt-1 font-medium">Deuda Total Pendiente</div>
            </div>
          </div>
        )}
        <div className="space-y-3">
          <button
            onClick={exportarMorososExcel}
            disabled={loadingMorosos}
            className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold text-emerald-800 transition-colors disabled:opacity-50"
          >
            {loadingMorosos ? 'Generando...' : 'Exportar a Excel (.xlsx)'} <Download className="w-4 h-4 text-emerald-600" />
          </button>
          <button
            onClick={exportarMorososPDF}
            disabled={loadingMorosos}
            className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-sm font-semibold text-red-800 transition-colors disabled:opacity-50"
          >
            {loadingMorosos ? 'Generando...' : 'Exportar a PDF (landscape)'} <Download className="w-4 h-4 text-red-500" />
          </button>
        </div>
        <p className="text-[11px] text-slate-400">* Los contribuyentes con 3+ meses aparecen destacados en rojo en el PDF.</p>
      </div>
    </div>
  );

  if (activeView === 'saldos') return (`;

p = p.replace(fnTarget, fnInsert);

// Add useState import for the new state
p = p.replace(
  `import { useState, useEffect } from 'react';`,
  `import { useState, useEffect } from 'react';`
);

fs.writeFileSync(reportesPath, p, 'utf8');
console.log('✅ reportes/page.tsx actualizado con tarjeta y vista de Morosos');
