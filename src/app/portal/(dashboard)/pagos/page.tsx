'use client';
import { useState, useEffect } from 'react';
import { CreditCard, FileText, Upload, Send, Building, CheckSquare, AlertCircle, CheckCircle2, MapPin, ArrowRightLeft } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';

type Metodo = 'transferencia' | '';

export default function DondePagarPage() {
  const [metodo, setMetodo] = useState<Metodo>('');
  const [formData, setFormData] = useState({
    bancoOrigen: '',
    referencia: '',
    monto: '',
    fecha: '',
    comprobante: null as File | null
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{type: 'success' | 'approved' | 'error', msg: string} | null>(null);

  const { recibos, convenios, setFacturas, inmuebles, tcmmv } = useAppContext();
  const [pagosPorVerificar, setPagosPorVerificar] = useState<any[]>([]);
  const [deudas, setDeudas] = useState<any[]>([]);

  useEffect(() => {
    const fetchPagos = async () => {
      const portalDoc = localStorage.getItem('portal_doc') || '';
      if (!portalDoc) return;
      const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
      const docFmt = docNorm ? docNorm.charAt(0) + '-' + docNorm.slice(1) : '';
      const soloNum = portalDoc.replace(/\D/g, '');
      const { data } = await supabase.from('pagos_reportados')
        .select('referencia, monto, detalles')
        .or('identidad.eq.' + docFmt + ',identidad.eq.' + docNorm + ',identidad.eq.' + portalDoc.toUpperCase() + ',identidad.eq.' + soloNum)
        .eq('estado', 'Por Verificar');
      setPagosPorVerificar(data || []);
    };
    fetchPagos();
  }, []);

  useEffect(() => {
    const portalDoc = localStorage.getItem('portal_doc') || '';
    const portalUser = localStorage.getItem('portal_user') || '';

    const facturasPendientes = recibos
      .filter((f: any) => (f.estado === 'Pendiente' || f.estado === 'Abonado') && 
        (f.contribuyente === portalUser || f.contribuyente === portalDoc))
      .map((f: any) => {
        let baseMonto = parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
        
        const docNorm = portalDoc.replace(/-/g, '').toUpperCase();
        const docFmt = docNorm ? docNorm.charAt(0) + '-' + docNorm.slice(1) : '';
        const soloNum = portalDoc.replace(/\D/g, '');
        const misInmuebles = inmuebles.filter((inm: any) => {
          const id = (inm.identidad || '').replace(/-/g, '').toUpperCase();
          const idFmt2 = id.charAt(0) + '-' + id.slice(1);
          return portalDoc && (id === docNorm || idFmt2 === docFmt || id === portalDoc.toUpperCase() || id === soloNum);
        });

        if (tcmmv > 0) {
          if (f.referencia?.startsWith('RECIB-')) {
            let totalDeudaMMV = 0;
            misInmuebles.forEach((inm: any) => { totalDeudaMMV += parseFloat(inm.deuda_mmv || 0); });
            if (totalDeudaMMV > 0) baseMonto = totalDeudaMMV * tcmmv;
          } else if (f.referencia?.startsWith('CM-')) {
            let monthlyMMV = 0;
            const matchedInmueble = misInmuebles.find((inm: any) => inm.inmueble && f.referencia.includes(inm.inmueble));
            if (matchedInmueble) {
              const cant = parseFloat(matchedInmueble.cant_inmuebles || 1);
              const mmv  = parseFloat(matchedInmueble.mmv_mes || 0);
              if (mmv > 0) monthlyMMV = cant * mmv;
            } else {
              misInmuebles.forEach((inm: any) => {
                const cant = parseFloat(inm.cant_inmuebles || 1);
                const mmv  = parseFloat(inm.mmv_mes || 0);
                if (mmv > 0) monthlyMMV += cant * mmv;
              });
            }
            if (monthlyMMV > 0) baseMonto = monthlyMMV * tcmmv;
          }
        }

        let montoPendiente = 0;
        pagosPorVerificar.forEach((p) => {
          let det: any = {};
          try { det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch (e) {}
          const refs = det.recibos || [];
          if (refs.includes(f.referencia)) {
            const montoPago = parseFloat(String(p.monto || '0').replace(/[^0-9.]/g, '')) || 0;
            if (refs.length > 0) montoPendiente += (montoPago / refs.length);
          }
        });

        const finalMonto = Math.max(0, baseMonto - montoPendiente);

        return {
          id: f.id,
          dbId: f.id,
          concepto: `Recibo ${f.referencia} - ${f.emision}`,
          monto: finalMonto,
          seleccionado: false,
          tipo: 'recibo'
        };
      });

    const conveniosActivos = convenios
      .filter((c: any) => (c.estado === 'Activo') &&
        (c.contribuyente === portalUser || c.contribuyente === portalDoc))
      .map((c: any) => ({
        id: `conv_${c.id}`,
        dbId: c.id,
        concepto: `Convenio de Pago ${c.numero} (${c.cuotas})`,
        monto: parseFloat((c.monto_total || '0').toString().replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
        seleccionado: false,
        tipo: 'convenio'
      }));

    setDeudas([...facturasPendientes, ...conveniosActivos]);
  }, [recibos, convenios, inmuebles, tcmmv, pagosPorVerificar]);

  const bancos = [
    '100% Banco', 'Bancamiga', 'Bancaribe', 'Banco Activo', 'Banco Bicentenario',
    'Banco Caroní', 'Banco de Venezuela', 'Banco del Tesoro', 'Banco Exterior',
    'Banco Mercantil', 'Banco Nacional de Crédito (BNC)', 'Banco Plaza',
    'Banco Provincial', 'Banco Sofitasa', 'Banesco', 'Banplus', 'Bancrecer',
    'Mi Banco', 'Banco Internacional (BIB)', 'Banco Venezolano de Crédito (BVC)',
    'BanFanb', 'Bancovi', 'Instituto Municipal de Crédito Popular (IMCP)',
    'Fondemi', 'Microfinanzas', 'Pagomovil BDV'
  ].sort();

  const montoTotal = deudas.filter(d => d.seleccionado).reduce((acc, curr) => acc + curr.monto, 0);

  useEffect(() => {
    setFormData(prev => ({ ...prev, monto: montoTotal > 0 ? formatBs(montoTotal) : '' }));
  }, [montoTotal]);

  const toggleDeuda = (id: string | number) => {
    setDeudas(deudas.map(d => d.id === id ? { ...d, seleccionado: !d.seleccionado } : d));
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) { resolve(file); return; }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let [w, h] = [img.width, img.height];
          const MAX = 1000;
          if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
          else { if (h > MAX) { w *= MAX / h; h = MAX; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (blob) resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
            else resolve(file);
          }, 'image/jpeg', 0.6);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (montoTotal === 0) { alert('Debe seleccionar al menos una deuda.'); return; }
    if (!metodo) { alert('Debe seleccionar el método de pago.'); return; }
    if (metodo === 'transferencia' && !formData.bancoOrigen) { alert('Seleccione el banco origen.'); return; }
    if (metodo === 'transferencia' && !formData.referencia) { alert('Ingrese el número de referencia.'); return; }
    if (metodo === 'transferencia' && !formData.comprobante) { alert('Adjunte el comprobante de pago.'); return; }

    setIsSubmitting(true);
    setResult(null);

    const seleccionadas = deudas.filter(d => d.seleccionado);
    const facturaIds = seleccionadas.filter(d => d.tipo === 'recibo').map(d => d.dbId);
    const convenioIds = seleccionadas.filter(d => d.tipo === 'convenio').map(d => d.dbId);
    const identidad = localStorage.getItem('portal_doc') || '';

    try {
      const res = await fetch('/api/contribuyente/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo,
          facturaIds,
          convenioIds,
          monto: montoTotal,
          referencia: formData.referencia,
          banco: formData.bancoOrigen,
          fecha: formData.fecha,
          identidad
        })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.status === 'approved') {
          setResult({ type: 'approved', msg: '¡Pago por Punto de Venta aplicado exitosamente! Su deuda ha sido actualizada.' });
          // Reset deudas seleccionadas y forzar refresh
          setDeudas(prev => prev.map(d => ({ ...d, seleccionado: false })));
          // Optimistically remove paid items from local view
          setDeudas(prev => prev.filter(d => !d.seleccionado));
        } else {
          setResult({ type: 'success', msg: '¡Pago reportado! Su comprobante está en proceso de validación por el equipo administrativo.' });
          setDeudas(prev => prev.map(d => ({ ...d, seleccionado: false })));
        }
        setFormData({ bancoOrigen: '', referencia: '', monto: '', fecha: '', comprobante: null });
        setMetodo('');
      } else {
        setResult({ type: 'error', msg: data.error || 'Error al procesar el pago.' });
      }
    } catch {
      setResult({ type: 'error', msg: 'Error de conexión. Intente de nuevo.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto mt-6 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Cuentas Recaudadoras */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-indigo-50 px-4 py-4 border-b border-indigo-100 flex items-center justify-center">
              <h2 className="font-semibold text-indigo-900 uppercase flex items-center gap-2 text-sm">
                <Building className="w-4 h-4 text-indigo-600" />
                Cuentas Recaudadoras
              </h2>
            </div>
            <div className="p-6 space-y-5 text-sm">
              <div className="space-y-1">
                <span className="text-slate-500 font-medium block text-xs">Banco:</span>
                <span className="text-slate-800 font-bold block">BANESCO (0134)</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500 font-medium block text-xs">Cta Corriente Nro.:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono bg-slate-100 px-2 py-1.5 rounded text-slate-800 font-semibold border border-slate-200 w-full text-center">
                    01340415144151031715
                  </span>
                  <button 
                    className="text-blue-500 hover:text-blue-700 transition-colors p-2 bg-blue-50 hover:bg-blue-100 rounded border border-blue-100" 
                    title="Copiar número"
                    onClick={() => navigator.clipboard?.writeText('01340415144151031715')}
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="pt-5 mt-2 border-t border-slate-200">
                <span className="text-slate-500 font-medium block text-xs mb-1">A nombre de:</span>
                <strong className="text-slate-800 block">Instituto Socialista Municipal para el Ambiente</strong>
                <span className="text-slate-600 block mt-1 font-medium">R.I.F.: G-200076739</span>
              </div>
            </div>
          </div>

          {/* Selección de Deudas */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
              <h2 className="font-semibold text-amber-900 uppercase flex items-center gap-2 text-sm">
                <CheckSquare className="w-4 h-4 text-amber-600" />
                Seleccionar Pagos
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {deudas.map((deuda) => (
                <label key={deuda.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${deuda.seleccionado ? 'border-amber-500 bg-amber-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <div className="pt-0.5">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                      checked={deuda.seleccionado}
                      onChange={() => toggleDeuda(deuda.id)}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-sm text-slate-700 block">{deuda.concepto}</span>
                      <span className="font-bold text-sm text-slate-800 block whitespace-nowrap ml-2">Bs. {formatBs(deuda.monto)}</span>
                    </div>
                    {deuda.tipo === 'convenio' && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold uppercase mt-1 inline-block">Convenio</span>
                    )}
                  </div>
                </label>
              ))}
              {deudas.length === 0 && (
                <div className="text-center py-6 text-slate-500 text-sm">
                  No tiene deudas pendientes.
                </div>
              )}
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center">
              <span className="font-semibold text-slate-600 text-sm">Monto a pagar:</span>
              <span className="font-bold text-lg text-amber-600">Bs. {formatBs(montoTotal)}</span>
            </div>
          </div>
        </div>

        {/* Lado derecho: Formulario de Reporte */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-700 uppercase flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                Reportar Pago
              </h2>
              <p className="text-xs text-slate-500 mt-1">Seleccione el método con el que realizó el pago.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Resultado */}
              {result && (
                <div className={`px-4 py-3 rounded flex items-start gap-2 text-sm animate-in fade-in border ${
                  result.type === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                  result.type === 'success' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                  'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {result.type === 'error' ? <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                  <span className="font-medium">{result.msg}</span>
                </div>
              )}

              {montoTotal === 0 && !result && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Seleccione los conceptos a pagar</span>
                    Marque en la lista de la izquierda las deudas que desea cancelar.
                  </div>
                </div>
              )}

              {/* Selector de Método de Pago */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Método de Pago <span className="text-red-500">*</span></label>

                {/* Aviso: punto de venta solo en oficina */}
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-sm">
                  <MapPin className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-800">Pago con tarjeta de débito</p>
                    <p className="text-amber-700 text-xs mt-0.5">El pago por <strong>Punto de Venta</strong> solo se realiza presencialmente en nuestras oficinas. Diríjase a la sede más cercana con su cédula de identidad.</p>
                  </div>
                </div>

                {/* Solo transferencia disponible en línea */}
                <button
                  type="button"
                  disabled={montoTotal === 0}
                  onClick={() => setMetodo('transferencia')}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all flex items-start gap-3 disabled:opacity-40 disabled:cursor-not-allowed ${
                    metodo === 'transferencia'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <ArrowRightLeft className={`w-5 h-5 mt-0.5 flex-shrink-0 ${metodo === 'transferencia' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div>
                    <p className="font-bold text-sm text-slate-800">Transferencia Bancaria</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Requiere validación administrativa (24-48 hrs)</p>
                  </div>
                </button>
              </div>



              {/* Transferencia: formulario completo */}
              {metodo === 'transferencia' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Monto Transferido (Bs) <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">Bs.</span>
                        <input 
                          type="text"
                          value={formData.monto}
                          placeholder="0.00"
                          className="w-full border border-slate-200 bg-slate-50 rounded pl-9 pr-3 py-2 text-sm text-slate-700 outline-none font-mono cursor-not-allowed font-bold"
                          readOnly
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">Calculado automáticamente.</span>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Banco Origen <span className="text-red-500">*</span></label>
                      <select 
                        value={formData.bancoOrigen}
                        onChange={(e) => setFormData({...formData, bancoOrigen: e.target.value})}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 bg-white"
                        required
                      >
                        <option value="">-- Seleccione el banco --</option>
                        {bancos.map(b => <option key={b} value={b}>{b}</option>)}
                        <option value="OTRO">OTRO BANCO</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nro. de Referencia <span className="text-red-500">*</span></label>
                      <input 
                        type="text"
                        placeholder="Ej. 12345678"
                        value={formData.referencia}
                        onChange={(e) => setFormData({...formData, referencia: e.target.value.replace(/\D/g, '')})}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha de la Transferencia <span className="text-red-500">*</span></label>
                      <input 
                        type="date"
                        value={formData.fecha}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                        className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Comprobante de Pago <span className="text-red-500">*</span></label>
                    <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center relative border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer">
                      <input 
                        type="file"
                        accept="image/*,.pdf"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={async (e) => {
                          if (e.target.files?.[0]) {
                            const file = e.target.files[0];
                            try { setFormData({...formData, comprobante: await compressImage(file)}); }
                            catch { setFormData({...formData, comprobante: file}); }
                          }
                        }}
                        required={!formData.comprobante}
                      />
                      <Upload className={`w-7 h-7 mb-2 ${formData.comprobante ? 'text-emerald-500' : 'text-slate-400'}`} />
                      {formData.comprobante ? (
                        <>
                          <span className="text-sm font-semibold text-emerald-600 truncate max-w-full px-4">{formData.comprobante.name}</span>
                          <span className="text-xs text-slate-500 mt-1">Haz clic para cambiar</span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-slate-700">Haz clic o arrastra tu archivo</span>
                          <span className="text-xs text-slate-500 mt-1">JPG, PNG, PDF (Max. 5MB)</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Botón Enviar */}
              {metodo && (
                <div className="pt-4 border-t border-slate-200 flex justify-end">
                  <button 
                    type="submit"
                    disabled={isSubmitting || montoTotal === 0}
                    className="px-8 py-2.5 rounded text-sm font-semibold flex items-center gap-2 disabled:opacity-50 shadow-sm transition-colors text-white bg-blue-600 hover:bg-blue-700"
                  >
                    {isSubmitting ? 'Procesando...' : <><Send className="w-4 h-4" /> Reportar Transferencia</>}
                  </button>
                </div>
              )}

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
