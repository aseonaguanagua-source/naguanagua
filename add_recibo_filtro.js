const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/page.tsx';
let c = fs.readFileSync(path, 'utf8');

// --- 1. Add filter states next to reciboData state ---
const oldReciboState = `  // Recibo imprimible post-pago\r\n  const [reciboData, setReciboData] = React.useState<any>(null);`;
const newReciboState = `  // Recibo imprimible post-pago
  const [reciboData, setReciboData] = React.useState<any>(null);
  // Filtro de meses para el recibo
  const [reciboFiltro, setReciboFiltro] = React.useState<'todos' | 'rango'>('todos');
  const [reciboDesde, setReciboDesde] = React.useState<string>('');   // 'YYYY-MM' e.g. '2026-07'
  const [reciboHasta, setReciboHasta] = React.useState<string>('');`;

c = c.replace(oldReciboState, newReciboState);

// --- 2. Replace the modal block ---
const oldModal = `      {/* ── MODAL RECIBO AUTOMÁTICO POST-PAGO ── */}
      {reciboData && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-6 px-2 print:bg-white print:items-start print:py-0">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full print:shadow-none print:rounded-none">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl print:hidden">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
                <span className="text-slate-800 font-bold text-lg">¡Pago Procesado! — Recibo</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button
                  onClick={() => setReciboData(null)}
                  className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  <X className="w-4 h-4" /> Cerrar
                </button>
              </div>
            </div>
            <div className="p-4">
              <ReciboImprimible data={reciboData} />
            </div>
          </div>
        </div>
      )}`;

const newModal = `      {/* ── MODAL RECIBO AUTOMÁTICO POST-PAGO ── */}
      {reciboData && (() => {
        // ── Parsear meses de los conceptos para el filtro ──
        // Cada concepto tiene desc como: "...Correspondiente al mes de: SEPTIEMBRE 2026"
        const MESES_IDX: Record<string, number> = {
          'ENERO':1,'FEBRERO':2,'MARZO':3,'ABRIL':4,'MAYO':5,'JUNIO':6,
          'JULIO':7,'AGOSTO':8,'SEPTIEMBRE':9,'OCTUBRE':10,'NOVIEMBRE':11,'DICIEMBRE':12
        };
        const parseConceptoMes = (desc: string): string | null => {
          const m = desc.match(/mes de:\\s*([A-Z]+)\\s*(\\d{4})/i);
          if (!m) return null;
          const mon = MESES_IDX[m[1].toUpperCase()];
          if (!mon) return null;
          return \`\${m[2]}-\${String(mon).padStart(2,'0')}\`; // 'YYYY-MM'
        };

        // Filtrar conceptos según filtro seleccionado
        const conceptosFiltrados = reciboFiltro === 'todos'
          ? reciboData.conceptos
          : reciboData.conceptos.filter((cp: any) => {
              const ym = parseConceptoMes(cp.descripcion);
              if (!ym) return true; // concepto sin mes -> siempre incluir
              const ok1 = !reciboDesde || ym >= reciboDesde;
              const ok2 = !reciboHasta || ym <= reciboHasta;
              return ok1 && ok2;
            });

        const totalFiltrado = conceptosFiltrados.reduce((s: number, cp: any) => s + (cp.total || 0), 0);
        const reciboParaImprimir = {
          ...reciboData,
          conceptos: conceptosFiltrados,
          subTotal: totalFiltrado,
          exento: totalFiltrado,
          total: totalFiltrado,
        };

        // Opciones de mes para los selectores (en orden)
        const opcionesMeses = Array.from(new Set(
          reciboData.conceptos.map((cp: any) => parseConceptoMes(cp.descripcion)).filter(Boolean)
        )).sort() as string[];

        const mesLabel = (ym: string) => {
          const [y, m] = ym.split('-');
          const nombres = ['','ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
          return \`\${nombres[parseInt(m)]} \${y}\`;
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-6 px-2">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl">

              {/* ── BARRA DE CONTROLES (oculta al imprimir) ── */}
              <div className="print:hidden px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span className="font-bold text-slate-800">¡Pago Procesado! — Vista Previa del Recibo</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      <Printer className="w-4 h-4" /> Imprimir
                    </button>
                    <button
                      onClick={() => { setReciboData(null); setReciboFiltro('todos'); setReciboDesde(''); setReciboHasta(''); }}
                      className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      <X className="w-4 h-4" /> Cerrar
                    </button>
                  </div>
                </div>

                {/* ── PANEL FILTRO MESES ── */}
                {opcionesMeses.length > 1 && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-1 mb-2 text-blue-800 font-semibold text-sm">
                      <FileText className="w-4 h-4" />
                      Filtro de meses a incluir en el recibo
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Opción: Todos */}
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                        <input
                          type="radio"
                          name="reciboFiltro"
                          checked={reciboFiltro === 'todos'}
                          onChange={() => { setReciboFiltro('todos'); setReciboDesde(''); setReciboHasta(''); }}
                          className="accent-emerald-600"
                        />
                        Todos los meses ({reciboData.conceptos.length})
                      </label>
                      {/* Opción: Rango */}
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                        <input
                          type="radio"
                          name="reciboFiltro"
                          checked={reciboFiltro === 'rango'}
                          onChange={() => setReciboFiltro('rango')}
                          className="accent-emerald-600"
                        />
                        Rango de meses
                      </label>

                      {/* Selectores de rango */}
                      {reciboFiltro === 'rango' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-slate-600 font-medium">Desde:</span>
                          <select
                            value={reciboDesde}
                            onChange={e => setReciboDesde(e.target.value)}
                            className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                          >
                            <option value="">-- Inicio --</option>
                            {opcionesMeses.map(ym => (
                              <option key={ym} value={ym}>{mesLabel(ym)}</option>
                            ))}
                          </select>
                          <span className="text-sm text-slate-600 font-medium">Hasta:</span>
                          <select
                            value={reciboHasta}
                            onChange={e => setReciboHasta(e.target.value)}
                            className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                          >
                            <option value="">-- Fin --</option>
                            {opcionesMeses.map(ym => (
                              <option key={ym} value={ym}>{mesLabel(ym)}</option>
                            ))}
                          </select>
                          <span className="text-xs text-blue-700 font-semibold bg-blue-100 px-2 py-1 rounded">
                            {conceptosFiltrados.length} mes(es) — Bs. {totalFiltrado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── VISTA PREVIA DEL RECIBO (filtrado) ── */}
              <div className="p-4">
                <ReciboImprimible data={reciboParaImprimir} />
              </div>
            </div>
          </div>
        );
      })()}`;

if (!c.includes(`{/* ── MODAL RECIBO AUTOMÁTICO POST-PAGO ── */}`)) {
  console.log('❌ Cannot find modal block');
  process.exit(1);
}

c = c.replace(oldModal, newModal);
fs.writeFileSync(path, c);
console.log('✅ Modal de recibo actualizado con filtro de meses (todos / rango desde-hasta)');
