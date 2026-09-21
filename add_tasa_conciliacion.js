const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/conciliacion/page.tsx';
let c = fs.readFileSync(path, 'utf8');
const crlf = c.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';

// ── 1. Add state for tasaCustom + recalculatedDebt after existing states ──
const OLD_STATES = `  const [showComp, setShowComp] = useState(false);
  const [showEdo, setShowEdo] = useState(false);`;
const NEW_STATES = `  const [showComp, setShowComp] = useState(false);
  const [showEdo, setShowEdo] = useState(false);
  // Tasa personalizada para recalculo exclusivo de esta conciliacion
  const tasaOriginal = det.tasa_bcv ? Number(det.tasa_bcv) : 0;
  const [tasaCustom, setTasaCustom] = useState<string>(tasaOriginal ? tasaOriginal.toFixed(2) : '');
  const [facturasParaConciliar, setFacturasParaConciliar] = useState<any[]>([]);`;

// Try both
[OLD_STATES, OLD_STATES.replace(/\n/g, '\r\n')].forEach((pattern, idx) => {
  if (c.includes(pattern)) {
    c = c.replace(pattern, idx === 0 ? NEW_STATES : NEW_STATES.replace(/\n/g, '\r\n'));
    console.log('✅ States added (idx=' + idx + ')');
  }
});

// ── 2. Add useEffect to load invoices for recalculation ──
// Insert after the contribuyente useEffect (after the closing }, [pago.identidad]); line)
const OLD_AFTER_EFFECT = `  // Auto-fill monto conciliado cuando cambia estatus
  const handleEstatusChange = (val: string) => {`;
const NEW_AFTER_EFFECT = `  // Cargar facturas de los recibos seleccionados para recalculo con nueva tasa
  const recibosParaCalc: string[] = det.recibos || [];
  useEffect(() => {
    if (recibosParaCalc.length === 0) return;
    (async () => {
      const { data: facs } = await supabase.from('facturas')
        .select('referencia, monto, emision, mmv_mes, cant_inmuebles')
        .in('referencia', recibosParaCalc);
      setFacturasParaConciliar(facs || []);
    })();
  }, []);

  // Recalcular deuda cuando cambia la tasa
  const tasaNum = parseFloat(tasaCustom) || 0;
  const tasaCambio = tasaOriginal > 0 && tasaNum > 0 ? tasaNum / tasaOriginal : 1;
  const deudaRecalculada = facturasParaConciliar.length > 0 && tasaNum > 0 && tasaOriginal > 0
    ? facturasParaConciliar.reduce((sum, f) => {
        const montoOriginal = parseFloat(f.monto || '0');
        return sum + parseFloat((montoOriginal * tasaCambio).toFixed(2));
      }, 0)
    : 0;
  const hayRecalculo = tasaNum > 0 && tasaOriginal > 0 && Math.abs(tasaNum - tasaOriginal) > 0.01;

  // Auto-fill monto conciliado cuando cambia estatus
  const handleEstatusChange = (val: string) => {`;

[OLD_AFTER_EFFECT, OLD_AFTER_EFFECT.replace(/\n/g, '\r\n')].forEach((pattern, idx) => {
  if (c.includes(pattern)) {
    c = c.replace(pattern, idx === 0 ? NEW_AFTER_EFFECT : NEW_AFTER_EFFECT.replace(/\n/g, '\r\n'));
    console.log('✅ Recalc effect added (idx=' + idx + ')');
  }
});

// ── 3. Make Tasa field editable with recalc UI ──
const OLD_TASA_FIELD = `              <div>
                <label className={lc}>Tasa Utilizada</label>
                <input value={det.tasa_bcv ? 'Bs. ' + Number(det.tasa_bcv).toFixed(2) : '---'} readOnly className={icRO + ' text-slate-600'}/>
              </div>`;

const NEW_TASA_FIELD = `              <div>
                <label className={lc}>
                  Tasa BCV (editable)
                  {hayRecalculo && <span className="ml-1 text-amber-600 font-bold text-[10px]">⚡ RECALCULANDO</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Bs.</span>
                  <input
                    value={tasaCustom}
                    onChange={e => setTasaCustom(e.target.value)}
                    className={ic + ' pl-7 ' + (hayRecalculo ? 'border-amber-400 bg-amber-50 font-bold text-amber-800' : '')}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={tasaOriginal ? tasaOriginal.toFixed(2) : 'Ingrese tasa...'}
                  />
                </div>
                {tasaOriginal > 0 && <p className="text-[10px] text-slate-400 mt-0.5">Original: Bs. {tasaOriginal.toFixed(2)}</p>}
              </div>`;

[OLD_TASA_FIELD, OLD_TASA_FIELD.replace(/\n/g, '\r\n')].forEach((pattern, idx) => {
  if (c.includes(pattern)) {
    c = c.replace(pattern, idx === 0 ? NEW_TASA_FIELD : NEW_TASA_FIELD.replace(/\n/g, '\r\n'));
    console.log('✅ Tasa field made editable (idx=' + idx + ')');
  }
});

// ── 4. Add recalculo summary card next to Deuda Total ──
const OLD_DEUDA_CARD = `              <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                  <p className="text-[10px] text-red-500 font-bold uppercase">Deuda Total en Sistema</p>
                  <p className="text-sm font-black text-red-700">Bs. {fmt(parseFloat(deudaTotal))}</p>
                </div>`;

const NEW_DEUDA_CARD = `              <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                  <p className="text-[10px] text-red-500 font-bold uppercase">Deuda Total en Sistema</p>
                  <p className="text-sm font-black text-red-700">Bs. {fmt(parseFloat(deudaTotal))}</p>
                  {hayRecalculo && deudaRecalculada > 0 && (
                    <p className="text-[10px] font-bold text-amber-700 mt-0.5 border-t border-red-200 pt-0.5">
                      ⚡ Con tasa {tasaNum.toFixed(2)}: Bs. {fmt(deudaRecalculada)}
                    </p>
                  )}
                </div>`;

[OLD_DEUDA_CARD, OLD_DEUDA_CARD.replace(/\n/g, '\r\n')].forEach((pattern, idx) => {
  if (c.includes(pattern)) {
    c = c.replace(pattern, idx === 0 ? NEW_DEUDA_CARD : NEW_DEUDA_CARD.replace(/\n/g, '\r\n'));
    console.log('✅ Deuda card updated with recalc (idx=' + idx + ')');
  }
});

// ── 5. Save tasaCustom in updatedDet and update facturas with new amounts ──
const OLD_UPDATED_DET = `      const updatedDet = {
        ...det,
        correo: correoResponsable,
        telefono: telefonoResponsable,
        fecha_transaccion: fechaTransaccion,
        fecha_banco: fechaBanco,
        monto_conciliado: montoConciliado,
        observaciones,
        enviar_correo: enviarCorreo,
        cod_inmueble: det.cod_inmueble || pago.cod_inmueble || contribInfo?.codigo,
        analista: typeof window !== 'undefined' ? localStorage.getItem('adminUser') || 'Administrador' : 'Administrador',
        banco_destino: bancoReceptor,
      };`;

const NEW_UPDATED_DET = `      const tasaParaGuardar = parseFloat(tasaCustom) || tasaOriginal;
      const updatedDet = {
        ...det,
        correo: correoResponsable,
        telefono: telefonoResponsable,
        fecha_transaccion: fechaTransaccion,
        fecha_banco: fechaBanco,
        monto_conciliado: montoConciliado,
        observaciones,
        enviar_correo: enviarCorreo,
        cod_inmueble: det.cod_inmueble || pago.cod_inmueble || contribInfo?.codigo,
        analista: typeof window !== 'undefined' ? localStorage.getItem('adminUser') || 'Administrador' : 'Administrador',
        banco_destino: bancoReceptor,
        tasa_bcv: tasaParaGuardar,
        tasa_bcv_conciliacion: tasaParaGuardar,
        tasa_bcv_original: tasaOriginal || undefined,
      };

      // Si la tasa cambió, actualizar montos de las facturas seleccionadas
      if (estatus === 'Aprobado' && hayRecalculo && facturasParaConciliar.length > 0) {
        const tasaCambioFinal = tasaParaGuardar / (tasaOriginal || tasaParaGuardar);
        for (const fac of facturasParaConciliar) {
          const montoOriginal = parseFloat(fac.monto || '0');
          const nuevoMonto = parseFloat((montoOriginal * tasaCambioFinal).toFixed(2));
          await supabase.from('facturas').update({ monto: nuevoMonto }).eq('referencia', fac.referencia);
        }
      }`;

[OLD_UPDATED_DET, OLD_UPDATED_DET.replace(/\n/g, '\r\n')].forEach((pattern, idx) => {
  if (c.includes(pattern)) {
    c = c.replace(pattern, idx === 0 ? NEW_UPDATED_DET : NEW_UPDATED_DET.replace(/\n/g, '\r\n'));
    console.log('✅ handleConciliar updated with tasa save (idx=' + idx + ')');
  }
});

fs.writeFileSync(path, c, 'utf8');
console.log('✅ Archivo guardado');

// Verify key additions
const checks = ['tasaCustom', 'hayRecalculo', 'deudaRecalculada', 'tasa_bcv_conciliacion'];
checks.forEach(k => {
  if (c.includes(k)) console.log('✅ ' + k + ' presente');
  else console.log('❌ ' + k + ' NO encontrado');
});
