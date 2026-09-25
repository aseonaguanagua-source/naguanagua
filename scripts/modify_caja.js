const fs = require('fs');

let content = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', 'utf8');

// 1. Add States
if (!content.includes('isCondominio')) {
  const stateInjection = `
  // Condominio State
  const [isCondominio, setIsCondominio] = useState(false);
  const [condominioHijos, setCondominioHijos] = useState<any[]>([]);
  const [condominioModo, setCondominioModo] = useState<'Total' | 'Local' | 'Abono'>('Total');
  const [selectedHijos, setSelectedHijos] = useState<string[]>([]);
  
  // Impuestos y Retenciones
  const [ivaPercent, setIvaPercent] = useState<number>(0); // 0 o 0.16
  const [retencionIVA, setRetencionIVA] = useState<number>(0); // 0, 75 o 100
  const [comprobanteRetencion, setComprobanteRetencion] = useState<string>('');
  const [montoRetencionIVA, setMontoRetencionIVA] = useState<number>(0);
`;
  content = content.replace('  // Debt State', stateInjection + '\n  // Debt State');
}

// 2. Modify handleSearch to fetch hijos
if (!content.includes('const fetchHijos = async () =>')) {
  const searchInjection = `
      // Buscar si es un Condominio (Padre)
      if (user.CodCont) {
        const { data: hijosData } = await supabase
          .from('inmuebles')
          .select('id, identidad, inmueble, tipo, deuda_mmv')
          .ilike('actividad_principal', \`%[HIJO_DE:\${user.CodCont}]%\`);
        
        if (hijosData && hijosData.length > 0) {
          setIsCondominio(true);
          setCondominioHijos(hijosData);
          setSelectedHijos(hijosData.map(h => h.id)); // Seleccionar todos por defecto
        } else {
          setIsCondominio(false);
          setCondominioHijos([]);
          setSelectedHijos([]);
        }
      }
      
      // Calcular IVA inicial
      if (user.Clasificacion === 'Residencial') {
        setIvaPercent(0);
      } else {
        setIvaPercent(0.16); // 16% por defecto si no es residencial
      }
`;
  content = content.replace("setPagosPendientes(pagosPendData || []);", "setPagosPendientes(pagosPendData || []);\n" + searchInjection);
}

// 3. Modificar useEffect del Total
if (!content.includes('// Recalculate Total with Condominio')) {
  const totalEffectOld = `  // Recalculate Total
  useEffect(() => {
    let total = 0;
    
    selectedRecibos.forEach(ref => {
      const f = recibos.find(r => r.referencia === ref);
      if (f) total += parseFloat(getReciboMonto(f) || '0');
    });
    
    selectedCuotas.forEach(sc => {
      const c = cuotas.find(cq => cq.convId === sc.convId && cq.cuotaId === sc.cuotaId);
      if (c) total += parseFloat(c.monto || '0');
    });

    selectedServicios.forEach(ref => {
      const s = serviciosEsp.find(ss => ss.referencia === ref);
      if (s) total += parseFloat(s.monto || '0');
    });

    selectedTalaPoda.forEach(ref => {
      const s = talaPoda.find(ss => ss.referencia === ref);
      if (s) total += parseFloat(s.monto || '0');
    });
    
    setTotalBs(total);
  }, [selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda]);`;

  const totalEffectNew = `  // Recalculate Total with Condominio
  useEffect(() => {
    let total = 0;
    
    if (isCondominio && condominioModo !== 'Abono') {
      const tasaActual = (customBcvRate && !isNaN(parseFloat(customBcvRate))) ? parseFloat(customBcvRate) : (tcmmv || 0);
      let deudaHijosMMV = 0;
      condominioHijos.forEach(h => {
        if (condominioModo === 'Total' || selectedHijos.includes(h.id)) {
           deudaHijosMMV += parseFloat(h.deuda_mmv || '0');
        }
      });
      total = deudaHijosMMV * tasaActual;
    } else {
      selectedRecibos.forEach(ref => {
        const f = recibos.find(r => r.referencia === ref);
        if (f) total += parseFloat(getReciboMonto(f) || '0');
      });
      
      selectedCuotas.forEach(sc => {
        const c = cuotas.find(cq => cq.convId === sc.convId && cq.cuotaId === sc.cuotaId);
        if (c) total += parseFloat(c.monto || '0');
      });

      selectedServicios.forEach(ref => {
        const s = serviciosEsp.find(ss => ss.referencia === ref);
        if (s) total += parseFloat(s.monto || '0');
      });

      selectedTalaPoda.forEach(ref => {
        const s = talaPoda.find(ss => ss.referencia === ref);
        if (s) total += parseFloat(s.monto || '0');
      });
    }
    
    setTotalBs(total);
  }, [selectedRecibos, selectedCuotas, selectedServicios, selectedTalaPoda, recibos, cuotas, serviciosEsp, talaPoda, isCondominio, condominioHijos, condominioModo, selectedHijos, customBcvRate, tcmmv]);

  // Recalcular Retención IVA
  useEffect(() => {
    if (totalBs > 0 && ivaPercent > 0) {
      const ivaAmount = totalBs * ivaPercent;
      setMontoRetencionIVA(ivaAmount * (retencionIVA / 100));
    } else {
      setMontoRetencionIVA(0);
    }
  }, [totalBs, ivaPercent, retencionIVA]);
`;
  content = content.replace(totalEffectOld, totalEffectNew);
}

// 4. Modificar UI para incluir opciones de Condominio y Totales
if (!content.includes('Opciones de Condominio')) {
  // Find where to inject the UI. Probably right after foundUser is rendered.
  const uiInjection = `
          {isCondominio && (
            <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <h3 className="text-lg font-bold text-indigo-900 mb-3 flex items-center gap-2">
                <Landmark className="w-5 h-5" /> Opciones de Pago de Condominio
              </h3>
              
              <div className="flex gap-4 mb-4">
                <button
                  onClick={() => setCondominioModo('Total')}
                  className={\`px-4 py-2 rounded font-medium \${condominioModo === 'Total' ? 'bg-indigo-600 text-white' : 'bg-white border text-indigo-700'}\`}
                >
                  Pago Total
                </button>
                <button
                  onClick={() => setCondominioModo('Local')}
                  className={\`px-4 py-2 rounded font-medium \${condominioModo === 'Local' ? 'bg-indigo-600 text-white' : 'bg-white border text-indigo-700'}\`}
                >
                  Pago por Local (Hijos)
                </button>
                <button
                  onClick={() => setCondominioModo('Abono')}
                  className={\`px-4 py-2 rounded font-medium \${condominioModo === 'Abono' ? 'bg-indigo-600 text-white' : 'bg-white border text-indigo-700'}\`}
                >
                  Abono Libre
                </button>
              </div>

              {condominioModo === 'Local' && (
                <div className="bg-white p-3 rounded border max-h-60 overflow-y-auto">
                  <p className="text-sm text-slate-500 mb-2">Seleccione los locales/apartamentos a pagar:</p>
                  {condominioHijos.map(h => (
                    <label key={h.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer border-b last:border-0">
                      <input 
                        type="checkbox" 
                        checked={selectedHijos.includes(h.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedHijos([...selectedHijos, h.id]);
                          else setSelectedHijos(selectedHijos.filter(id => id !== h.id));
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-slate-700">{h.inmueble || 'Sin código'}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded ml-auto">
                        Deuda: {parseFloat(h.deuda_mmv || '0').toFixed(2)} UCD
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
`;
  content = content.replace(/(<div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm mt-6">[\s\S]*?<\/div>)/, "$1\n" + uiInjection);
}

// 5. Update panel de facturación for IVA
if (!content.includes('Base Imponible')) {
  const panelCobroOld = `            <div className="p-4 bg-slate-50 border-t border-slate-200">
              <div className="flex justify-between items-center text-lg font-bold text-slate-800">
                <span>Total a Pagar (Bs):</span>
                <span>{formatBs(totalBs)}</span>
              </div>
            </div>`;
  const panelCobroNew = `            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span>Base Imponible:</span>
                <span>{formatBs(totalBs)}</span>
              </div>
              
              <div className="flex justify-between items-center text-slate-600">
                <div className="flex items-center gap-2">
                  <span>IVA ({ivaPercent * 100}%):</span>
                  {foundUser?.Clasificacion !== 'Residencial' && (
                    <select 
                      className="text-xs border rounded px-1"
                      value={ivaPercent}
                      onChange={(e) => setIvaPercent(parseFloat(e.target.value))}
                    >
                      <option value={0.16}>16%</option>
                      <option value={0}>0%</option>
                    </select>
                  )}
                  {foundUser?.Clasificacion === 'Residencial' && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-1 rounded">Exento (Residencial)</span>
                  )}
                </div>
                <span>{formatBs(totalBs * ivaPercent)}</span>
              </div>
              
              {ivaPercent > 0 && (
                <div className="flex flex-col border-l-2 border-amber-300 pl-3 py-1 my-2 bg-amber-50 rounded-r">
                  <div className="flex justify-between items-center text-amber-800 text-sm mb-1">
                    <span className="font-medium">Retención IVA:</span>
                    <select 
                      className="border-amber-200 rounded text-xs bg-white"
                      value={retencionIVA}
                      onChange={(e) => setRetencionIVA(Number(e.target.value))}
                    >
                      <option value={0}>Sin Retención (0%)</option>
                      <option value={75}>75%</option>
                      <option value={100}>100%</option>
                    </select>
                  </div>
                  {retencionIVA > 0 && (
                    <div className="flex items-center justify-between text-sm text-amber-900 mt-1">
                      <input 
                        type="text" 
                        placeholder="N° Comprobante" 
                        value={comprobanteRetencion}
                        onChange={(e) => setComprobanteRetencion(e.target.value)}
                        className="text-xs p-1 border border-amber-300 rounded w-32"
                      />
                      <span className="font-bold text-red-600">- {formatBs(montoRetencionIVA)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center text-xl font-black text-indigo-900 pt-2 border-t border-slate-200 mt-2">
                <span>Total a Cobrar:</span>
                <span>{formatBs((totalBs + (totalBs * ivaPercent)) - montoRetencionIVA)}</span>
              </div>
            </div>`;
  content = content.replace(panelCobroOld, panelCobroNew);
  
  // Need to update the variable used for payment `totalBs` -> `finalTotalWithTaxes` in handlePayment
  content = content.replace(/const finalTotal = Math\.max\(0, totalBs - descuentoSaldoFavor\);/g, 
    "const totalConImpuestos = (totalBs + (totalBs * ivaPercent)) - montoRetencionIVA;\n    const finalTotal = Math.max(0, totalConImpuestos - descuentoSaldoFavor);");
  content = content.replace(/totalBs <= 0/g, "totalBs <= 0 && (!isCondominio || condominioModo === 'Abono')"); // Allow Condominio to bypass 0 check if they pay via Local mode
  content = content.replace(/totalBs/g, "totalConImpuestos"); 
  
  // Note: the last replace of totalBs -> totalConImpuestos is too broad. Let me undo it.
  content = content.replace(/totalConImpuestos/g, "totalBs"); // REVERT
  // Safe replacement:
  content = content.replace(/const finalTotal = Math\.max\(0, totalBs - descuentoSaldoFavor\);/g, 
    "const totalConImpuestos = (totalBs + (totalBs * ivaPercent)) - montoRetencionIVA;\n    const finalTotal = Math.max(0, totalConImpuestos - descuentoSaldoFavor);");
}

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx', content);
console.log('Script aplicado exitosamente');
