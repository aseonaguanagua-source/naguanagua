const fs = require('fs');

const content = `'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Camera, CreditCard, Landmark, CheckCircle2, XCircle, AlertCircle, ChevronLeft, Send, Upload, ArrowRight } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';

type Step = 'search' | 'account' | 'pay' | 'success';
type PayMethod = 'Debito' | 'Transferencia';

const BANCOS = [
  'Banco de Venezuela','Banesco','Mercantil','BBVA Provincial',
  'Bicentenario','Venezolano de Crédito','Sofitasa','Bancaribe',
  'BNC','Del Tesoro','Agrícola de Venezuela','Exterior','Otro'
];
const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const mesLabel = (d) => {
  if (!d) return '';
  const p = d.split('-');
  return p.length >= 2 ? MESES[parseInt(p[1]) - 1] + ' ' + p[0] : d;
};
const fmtBs = (n) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CobroMovilPage() {
  const { contribuyentes, inmuebles, tcmmv } = useAppContext();
  const [step, setStep] = useState('search');
  const [docType, setDocType] = useState('V');
  const [docNumber, setDocNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [recibos, setRecibos] = useState([]);
  const [userInms, setUserInms] = useState([]);
  const [selectedRefs, setSelectedRefs] = useState([]);
  const [totalSel, setTotalSel] = useState(0);
  const [payMethod, setPayMethod] = useState('Debito');
  const [banco, setBanco] = useState('Banco de Venezuela');
  const [referencia, setReferencia] = useState('');
  const [montoIngresado, setMontoIngresado] = useState('');
  const [fechaTx, setFechaTx] = useState(new Date().toISOString().split('T')[0]);
  const [comprobante, setComprobante] = useState(null);
  const [comprobantePreview, setComprobantePreview] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [payError, setPayError] = useState('');
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const getReciboMonto = (r) => {
    if (r.estado === 'Abonado') return parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0;
    if (!tcmmv || tcmmv <= 0) return parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0;
    if (r.referencia?.startsWith('CM-')) {
      const matched = userInms.find(i => i.inmueble && r.referencia.includes(i.inmueble));
      if (matched) {
        const cant = parseFloat(matched.cant_inmuebles || 1);
        const mmv = parseFloat(matched.mmv_mes || 0);
        if (mmv > 0) return parseFloat((cant * mmv * tcmmv).toFixed(2));
      }
      return userInms.reduce((s, i) => {
        const cant = parseFloat(i.cant_inmuebles || 1);
        const mmv = parseFloat(i.mmv_mes || 0);
        return s + (mmv > 0 ? cant * mmv * tcmmv : 0);
      }, 0);
    }
    return parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0;
  };

  useEffect(() => {
    const t = selectedRefs.reduce((s, ref) => {
      const f = recibos.find(r => r.referencia === ref);
      return s + (f ? getReciboMonto(f) : 0);
    }, 0);
    setTotalSel(parseFloat(t.toFixed(2)));
  }, [selectedRefs, recibos, userInms, tcmmv]);

  const handleSearch = async () => {
    if (!docNumber.trim()) return;
    setIsSearching(true); setSearchError('');
    const idLimpio = docNumber.replace(/-/g, '').toUpperCase();
    const fullDoc = docType + idLimpio;
    let user = contribuyentes.find(c => {
      const id = (c.Identidad || '').replace(/-/g, '').toUpperCase();
      return id === fullDoc || id === idLimpio || (c.Contribuyente || '').toUpperCase().includes(docNumber.toUpperCase());
    });
    if (!user) {
      const { data } = await supabase.from('inmuebles').select('*')
        .or('identidad.eq.' + fullDoc + ',identidad.eq.' + idLimpio).limit(1).maybeSingle();
      if (data) user = { Identidad: data.identidad, Contribuyente: data.contribuyente, Telefono: data.telefono };
    }
    if (!user) { setSearchError('Contribuyente no encontrado'); setIsSearching(false); return; }
    const { data: inmsDB } = await supabase.from('inmuebles').select('*')
      .or('identidad.eq.' + user.Identidad + ',identidad.eq.' + fullDoc);
    const saldoFavor = (inmsDB || []).reduce((s, i) => s + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);
    setFoundUser({ ...user, SaldoFavor: saldoFavor }); setUserInms(inmsDB || []);
    const { data: facts } = await supabase.from('facturas').select('*')
      .in('estado', ['Pendiente', 'Abonado', 'Por Verificar'])
      .or('identidad.eq.' + user.Identidad + ',identidad.eq.' + fullDoc + ',identidad.eq.' + idLimpio)
      .order('emision', { ascending: true });
    setRecibos(facts || []); setStep('account'); setIsSearching(false);
  };

  const toggleRef = (ref) => setSelectedRefs(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]);
  const handleFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setComprobante(file); setComprobantePreview(URL.createObjectURL(file));
  };

  const handlePay = async () => {
    if (!referencia.trim()) { setPayError('Ingrese el número de referencia'); return; }
    if (!montoIngresado || isNaN(parseFloat(montoIngresado))) { setPayError('Ingrese el monto cobrado'); return; }
    setPayError(''); setIsProcessing(true);
    const cajero = localStorage.getItem('adminUser') || 'Cobrador';
    const montoReal = parseFloat(montoIngresado);
    try {
      let comprobanteUrl = '';
      if (comprobante) {
        const ext = comprobante.name.split('.').pop() || 'jpg';
        const fp = 'comprobantes/movil_' + (foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.' + ext;
        const { data: up, error: upE } = await supabase.storage.from('comprobantes').upload(fp, comprobante, { upsert: true });
        if (!upE && up) comprobanteUrl = supabase.storage.from('comprobantes').getPublicUrl(fp).data?.publicUrl || '';
      }
      const estado = payMethod === 'Debito' ? 'Aprobado' : 'Por Verificar';
      await supabase.from('pagos_reportados').insert({
        identidad: foundUser.Identidad, monto: montoReal, banco, referencia,
        tipo: payMethod, estado,
        detalles: JSON.stringify({ recibos: selectedRefs, comprobante_url: comprobanteUrl, origen: 'cobro_movil', cajero })
      });
      if (payMethod === 'Debito') {
        let dinero = montoReal;
        for (const ref of selectedRefs) {
          const fac = recibos.find(r => r.referencia === ref); if (!fac) continue;
          const mFac = getReciboMonto(fac);
          if (dinero >= mFac) { await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', ref); dinero -= mFac; }
          else if (dinero > 0) { await supabase.from('facturas').update({ monto: (mFac - dinero).toFixed(2), estado: 'Abonado' }).eq('referencia', ref); dinero = 0; }
        }
      } else {
        if (selectedRefs.length > 0) await supabase.from('facturas').update({ estado: 'Por Verificar' }).in('referencia', selectedRefs);
      }
      setSuccessData({ monto: montoReal, referencia, estado, banco }); setStep('success');
    } catch (err) { setPayError('Error: ' + (err.message || 'desconocido')); }
    setIsProcessing(false);
  };

  const reset = () => {
    setStep('search'); setDocNumber(''); setRecibos([]); setFoundUser(null);
    setSelectedRefs([]); setReferencia(''); setMontoIngresado('');
    setComprobante(null); setComprobantePreview('');
  };

  const inp = 'w-full bg-slate-800 text-white rounded-2xl px-5 py-4 text-base border border-slate-700 focus:outline-none focus:border-emerald-500 placeholder-slate-500';

  return (
    <div style={{ WebkitTapHighlightColor: 'transparent' }} className="flex flex-col flex-1">

      {step === 'search' && (
        <div className="flex flex-col flex-1 px-5 pt-8 pb-6 gap-5">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <Search className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-white text-xl font-bold">Buscar Contribuyente</h1>
            <p className="text-slate-400 text-sm mt-1">Cédula, RIF o nombre</p>
          </div>
          <div className="flex gap-2">
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="bg-slate-800 text-white rounded-2xl px-3 py-4 text-base font-bold border border-slate-700 focus:outline-none focus:border-emerald-500 text-center min-w-[64px]">
              {['V','J','E','G','P'].map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="text" value={docNumber} onChange={e => setDocNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Número o nombre..." className={inp} autoComplete="off" />
          </div>
          {searchError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-2xl px-4 py-3 text-sm">
              <XCircle className="w-5 h-5 shrink-0" />{searchError}
            </div>
          )}
          <button onClick={handleSearch} disabled={isSearching || !docNumber.trim()}
            className="w-full bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-5 rounded-2xl text-lg transition-all active:scale-95 flex items-center justify-center gap-2">
            {isSearching
              ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Search className="w-5 h-5" />Buscar</>}
          </button>
        </div>
      )}

      {step === 'account' && foundUser && (
        <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-start gap-3">
            <button onClick={() => { setStep('search'); setDocNumber(''); }} className="mt-0.5 text-slate-400">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-base truncate">{foundUser.Contribuyente}</div>
              <div className="text-emerald-400 text-sm font-mono">{foundUser.Identidad}</div>
              {foundUser.SaldoFavor > 0 && <div className="text-xs text-emerald-300 mt-0.5">Saldo a favor: Bs. {fmtBs(foundUser.SaldoFavor)}</div>}
            </div>
            <div className="text-slate-400 text-xs shrink-0 mt-0.5">{recibos.length} recibos</div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
            {recibos.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                <p className="text-white font-semibold text-lg">Contribuyente solvente</p>
                <p className="text-slate-400 text-sm mt-1">No hay recibos pendientes</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button onClick={() => selectedRefs.length === recibos.length ? setSelectedRefs([]) : setSelectedRefs(recibos.map(r => r.referencia))}
                  className="flex items-center justify-between bg-slate-800/60 rounded-2xl px-4 py-3 border border-slate-700">
                  <span className="text-slate-300 text-sm font-medium">
                    {selectedRefs.length === recibos.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </span>
                  <span className="text-emerald-400 text-sm font-bold">{selectedRefs.length}/{recibos.length}</span>
                </button>
                {recibos.map(r => {
                  const monto = getReciboMonto(r);
                  const sel = selectedRefs.includes(r.referencia);
                  const inm = userInms.find(i => i.inmueble && r.referencia.includes(i.inmueble));
                  const inDesc = inm ? [inm.tipo, inm.actividad_principal].filter(Boolean).join(' · ') || inm.clasificacion || '' : '';
                  return (
                    <button key={r.referencia} onClick={() => toggleRef(r.referencia)}
                      className={'w-full flex items-center gap-4 px-4 py-4 rounded-2xl border transition-all active:scale-[0.98] text-left ' +
                        (sel ? 'bg-emerald-500/15 border-emerald-500/60' : 'bg-slate-800 border-slate-700')}>
                      <div className={'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ' +
                        (sel ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600')}>
                        {sel && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-mono text-sm font-semibold truncate">{r.referencia}</div>
                        <div className="text-slate-400 text-xs mt-0.5">{mesLabel(r.emision)}</div>
                        {inm && <div className="text-emerald-400 text-[11px] mt-0.5 truncate">{inm.inmueble}{inDesc ? ' · ' + inDesc : ''}</div>}
                      </div>
                      <div className={'text-base font-bold shrink-0 ' + (sel ? 'text-emerald-400' : 'text-white')}>
                        {fmtBs(monto)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {recibos.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 px-5 py-4">
              <div className="max-w-lg mx-auto flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-slate-400 text-xs">{selectedRefs.length} seleccionado(s)</div>
                  <div className="text-white font-bold text-xl">Bs. {fmtBs(totalSel)}</div>
                </div>
                <button onClick={() => setStep('pay')} disabled={selectedRefs.length === 0}
                  className="bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 px-6 rounded-2xl text-base active:scale-95 flex items-center gap-2">
                  Cobrar <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'pay' && foundUser && (
        <div className="flex flex-col flex-1">
          <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
            <button onClick={() => setStep('account')} className="text-slate-400"><ChevronLeft className="w-6 h-6" /></button>
            <span className="text-white font-bold text-base">Registrar Cobro</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pt-5 pb-36 flex flex-col gap-5">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
              <div className="text-emerald-400 text-xs font-bold uppercase tracking-wide truncate">{foundUser.Contribuyente}</div>
              <div className="text-white font-black mt-1" style={{ fontSize: 28 }}>Bs. {fmtBs(totalSel)}</div>
              <div className="text-slate-400 text-xs mt-1">{selectedRefs.length} recibo(s) · Tasa {tcmmv?.toFixed(2)}</div>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Método de Pago</label>
              <div className="grid grid-cols-2 gap-3">
                {['Debito', 'Transferencia'].map(m => (
                  <button key={m} onClick={() => setPayMethod(m)}
                    className={'flex flex-col items-center gap-2 py-5 rounded-2xl border text-sm font-bold active:scale-95 ' +
                      (payMethod === m ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300')}>
                    {m === 'Debito' ? <CreditCard className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
                    {m === 'Debito' ? 'Débito' : 'Transferencia'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Banco</label>
              <select value={banco} onChange={e => setBanco(e.target.value)} className={inp} style={{ fontSize: 16 }}>
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Nº de Referencia</label>
              <input type="tel" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Ej. 00012345" className={inp} style={{ fontSize: 20 }} />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Monto Cobrado (Bs.)</label>
              <input type="number" inputMode="decimal" value={montoIngresado} onChange={e => setMontoIngresado(e.target.value)}
                placeholder={totalSel.toFixed(2)} className={inp} style={{ fontSize: 24, fontWeight: 700 }} />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Fecha de Transacción</label>
              <input type="date" value={fechaTx} onChange={e => setFechaTx(e.target.value)} className={inp} style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Foto del Comprobante</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => camRef.current?.click()}
                  className="flex flex-col items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl py-5 text-slate-300 text-sm font-semibold active:bg-slate-700">
                  <Camera className="w-7 h-7" />Tomar Foto
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl py-5 text-slate-300 text-sm font-semibold active:bg-slate-700">
                  <Upload className="w-7 h-7" />Galería
                </button>
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              {comprobantePreview && (
                <div className="mt-3 relative">
                  <img src={comprobantePreview} alt="Comprobante" className="w-full rounded-2xl object-cover max-h-56" />
                  <button onClick={() => { setComprobante(null); setComprobantePreview(''); }}
                    className="absolute top-2 right-2 bg-red-500/90 text-white rounded-full p-1.5">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
            {payError && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-2xl px-4 py-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />{payError}
              </div>
            )}
            {payMethod === 'Transferencia' && (
              <p className="text-slate-500 text-xs text-center">La transferencia será revisada en Conciliación Bancaria.</p>
            )}
          </div>
          <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 px-5 py-4">
            <div className="max-w-lg mx-auto">
              <button onClick={handlePay} disabled={isProcessing}
                className="w-full bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-5 rounded-2xl text-lg active:scale-95 flex items-center justify-center gap-2">
                {isProcessing
                  ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Send className="w-5 h-5" />{payMethod === 'Debito' ? 'Confirmar Cobro' : 'Enviar a Verificación'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'success' && successData && (
        <div className="flex flex-col flex-1 items-center justify-between px-5 py-8">
          <div className="flex flex-col items-center gap-4 flex-1 justify-center w-full">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-white text-2xl font-black text-center">
              {successData.estado === 'Aprobado' ? '¡Cobro Exitoso!' : 'Enviado a Verificación'}
            </h2>
            <p className="text-slate-400 text-sm text-center max-w-xs">
              {successData.estado === 'Aprobado'
                ? 'El pago fue registrado y los recibos actualizados.'
                : 'La transferencia será revisada por el administrador.'}
            </p>
            <div className="w-full bg-slate-800 rounded-2xl p-5 border border-slate-700 flex flex-col gap-4">
              {[
                ['Contribuyente', foundUser?.Contribuyente, 'text-white font-semibold'],
                ['Monto', 'Bs. ' + fmtBs(successData.monto), 'text-emerald-400 font-black text-xl'],
                ['Referencia', successData.referencia, 'text-white font-mono'],
                ['Banco', successData.banco, 'text-white'],
                ['Estado', successData.estado, successData.estado === 'Aprobado' ? 'text-emerald-400 font-bold' : 'text-yellow-400 font-bold'],
              ].map(([label, value, cls]) => (
                <div key={label} className="flex justify-between items-center gap-3">
                  <span className="text-slate-400 text-sm shrink-0">{label}</span>
                  <span className={'text-sm text-right truncate ' + cls}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={reset}
            className="w-full bg-emerald-500 text-white font-bold py-5 rounded-2xl text-lg active:scale-95 mt-6">
            Nuevo Cobro
          </button>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync('c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/cobro-movil/page.tsx', content);
console.log('✅ cobro-movil/page.tsx rewritten with full mobile optimization');
