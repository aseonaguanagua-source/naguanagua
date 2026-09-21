const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src';

// ── 1. Create the layout file ──
const layoutDir = BASE + '/app/(admin)/admin/cobro-movil';
fs.mkdirSync(layoutDir, { recursive: true });

const layoutContent = `'use client';
import { AppProvider } from '@/store/AppContext';
import AdminAuthWrapper from '@/components/AdminAuthWrapper';
import { Smartphone } from 'lucide-react';

export default function CobroMovilLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthWrapper>
      <AppProvider>
        <div className="min-h-screen bg-slate-900 flex flex-col">
          {/* Mini header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              <span className="text-white font-bold text-sm">Cobro Móvil</span>
              <span className="text-slate-400 text-xs">· Aseo Urbano</span>
            </div>
            <a href="/admin" className="text-slate-400 text-xs underline">Panel Principal</a>
          </div>
          <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
            {children}
          </div>
        </div>
      </AppProvider>
    </AdminAuthWrapper>
  );
}
`;
fs.writeFileSync(layoutDir + '/layout.tsx', layoutContent);
console.log('✅ layout.tsx created');

// ── 2. Create the main page ──
const pageContent = `'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Camera, CreditCard, Landmark, CheckCircle, XCircle, AlertCircle, ChevronLeft, Send, Upload, Building2, Banknote } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';
import { logos } from '@/lib/logosBase64';

type Step = 'search' | 'account' | 'pay' | 'success';
type PayMethod = 'Debito' | 'Transferencia';

const BANCOS = [
  'Banco de Venezuela', 'Banesco', 'Mercantil', 'BBVA Provincial',
  'Bicentenario', 'Venezolano de Crédito', 'Sofitasa', 'Bancaribe',
  'BNC', 'Del Tesoro', 'Agrícola de Venezuela', 'Exterior', 'Otro'
];

const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const mesLabel = (d: string) => {
  if (!d) return '';
  const p = d.split('-');
  return p.length >= 2 ? MESES[parseInt(p[1]) - 1] + ' ' + p[0] : d;
};

export default function CobroMovilPage() {
  const { contribuyentes, inmuebles, convenios, tcmmv } = useAppContext();

  // ── Steps ──
  const [step, setStep] = useState<Step>('search');

  // ── Search ──
  const [docType, setDocType] = useState('V');
  const [docNumber, setDocNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // ── User data ──
  const [foundUser, setFoundUser] = useState<any>(null);
  const [recibos, setRecibos] = useState<any[]>([]);
  const [userInms, setUserInms] = useState<any[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [totalSeleccionado, setTotalSeleccionado] = useState(0);

  // ── Payment ──
  const [payMethod, setPayMethod] = useState<PayMethod>('Debito');
  const [banco, setBanco] = useState('Banco de Venezuela');
  const [referencia, setReferencia] = useState('');
  const [montoIngresado, setMontoIngresado] = useState('');
  const [fechaTx, setFechaTx] = useState(new Date().toISOString().split('T')[0]);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [payError, setPayError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  // ── Calc monto per recibo ──
  const getReciboMonto = (r: any): number => {
    if (r.estado === 'Abonado') return parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0;
    if (!tcmmv || tcmmv <= 0) return parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0;
    if (r.referencia?.startsWith('CM-')) {
      const matched = userInms.find(i => i.inmueble && r.referencia.includes(i.inmueble));
      if (matched) {
        const cant = parseFloat(matched.cant_inmuebles || 1);
        const mmv = parseFloat(matched.mmv_mes || 0);
        if (mmv > 0) return parseFloat((cant * mmv * tcmmv).toFixed(2));
      }
      let total = 0;
      userInms.forEach(i => {
        const cant = parseFloat(i.cant_inmuebles || 1);
        const mmv = parseFloat(i.mmv_mes || 0);
        if (mmv > 0) total += cant * mmv * tcmmv;
      });
      return parseFloat(total.toFixed(2));
    }
    return parseFloat(String(r.monto || '0').replace(/[^\\d.]/g, '')) || 0;
  };

  // ── Update total on selection change ──
  useEffect(() => {
    let t = 0;
    selectedRefs.forEach(ref => {
      const f = recibos.find(r => r.referencia === ref);
      if (f) t += getReciboMonto(f);
    });
    setTotalSeleccionado(parseFloat(t.toFixed(2)));
  }, [selectedRefs, recibos, userInms, tcmmv]);

  // ── Search handler ──
  const handleSearch = async () => {
    if (!docNumber.trim()) return;
    setIsSearching(true);
    setSearchError('');
    setFoundUser(null);
    setRecibos([]);
    setUserInms([]);
    setSelectedRefs([]);

    const idLimpio = docNumber.replace(/-/g, '').toUpperCase();
    const fullDoc = \`\${docType}\${idLimpio}\`;

    let user = contribuyentes.find((c: any) => {
      const idClean = String(c.Identidad || '').replace(/-/g, '').toUpperCase();
      return idClean === fullDoc || idClean === idLimpio ||
        (c.Contribuyente && c.Contribuyente.toUpperCase().includes(docNumber.toUpperCase()));
    });

    if (!user) {
      const { data: inmFb } = await supabase
        .from('inmuebles')
        .select('*')
        .or(\`identidad.eq.\${fullDoc},identidad.eq.\${idLimpio},cod_cont.ilike.\${docNumber}\`)
        .limit(1)
        .maybeSingle();
      if (inmFb) user = {
        Identidad: inmFb.identidad,
        Contribuyente: inmFb.contribuyente,
        Telefono: inmFb.telefono || 'N/A',
        Correo: inmFb.correo_electronico || 'N/A',
        Direccion: inmFb.direccion || 'N/A',
      };
    }

    if (!user) {
      setSearchError('Contribuyente no encontrado. Verifica el número de documento.');
      setIsSearching(false);
      return;
    }

    // Get fresh saldo_favor
    const { data: inmsDB } = await supabase
      .from('inmuebles')
      .select('*')
      .or(\`identidad.eq.\${user.Identidad},identidad.eq.\${fullDoc}\`);

    const saldoFavor = (inmsDB || []).reduce((s: number, i: any) => s + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);
    setFoundUser({ ...user, SaldoFavor: saldoFavor });
    setUserInms(inmsDB || []);

    // Get pending facturas
    const { data: facts } = await supabase
      .from('facturas')
      .select('*')
      .in('estado', ['Pendiente', 'Abonado', 'Por Verificar'])
      .or(\`identidad.eq.\${user.Identidad},identidad.eq.\${fullDoc},identidad.eq.\${idLimpio}\`)
      .order('emision', { ascending: true });

    setRecibos(facts || []);
    setStep('account');
    setIsSearching(false);
  };

  // ── Toggle recibo selection ──
  const toggleRef = (ref: string) => {
    setSelectedRefs(prev =>
      prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]
    );
  };

  // ── Handle photo capture ──
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComprobante(file);
    setComprobantePreview(URL.createObjectURL(file));
  };

  // ── Process payment ──
  const handlePay = async () => {
    if (!referencia.trim()) { setPayError('Ingrese el número de referencia.'); return; }
    if (!montoIngresado || isNaN(parseFloat(montoIngresado))) { setPayError('Ingrese el monto cobrado.'); return; }
    setPayError('');
    setIsProcessing(true);

    const cajero = typeof window !== 'undefined' ? (localStorage.getItem('adminUser') || 'Cobrador') : 'Cobrador';
    const cajeroLetra = typeof window !== 'undefined' ? localStorage.getItem('adminLetra') : null;
    const cajero_id = cajeroLetra ? \`\${cajeroLetra}-\${cajero}\` : cajero;
    const montoReal = parseFloat(montoIngresado);

    try {
      let comprobanteUrl = '';
      if (comprobante) {
        const ext = comprobante.name.split('.').pop() || 'jpg';
        const filePath = \`comprobantes/movil_\${(foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g, '_')}_\${Date.now()}.\${ext}\`;
        const { data: upData, error: upErr } = await supabase.storage
          .from('comprobantes')
          .upload(filePath, comprobante, { upsert: true, contentType: comprobante.type });
        if (!upErr && upData) {
          const { data: pubData } = supabase.storage.from('comprobantes').getPublicUrl(filePath);
          comprobanteUrl = pubData?.publicUrl || '';
        }
      }

      const detalles = {
        recibos: selectedRefs,
        cuotas: [],
        servicios: [],
        tala_poda: [],
        es_abono: montoReal < totalSeleccionado,
        monto_abonado: montoReal,
        total_seleccionado: totalSeleccionado,
        tasa_bcv: tcmmv,
        comprobante_url: comprobanteUrl,
        comprobante_nombre: comprobante?.name || '',
        fecha_transaccion: fechaTx,
        origen: 'cobro_movil',
        cajero: cajero_id
      };

      const estado = payMethod === 'Debito' ? 'Aprobado' : 'Por Verificar';

      const { error: pErr } = await supabase.from('pagos_reportados').insert({
        identidad: foundUser.Identidad,
        monto: montoReal,
        banco,
        referencia,
        tipo: payMethod,
        estado,
        detalles: JSON.stringify(detalles)
      });
      if (pErr) throw pErr;

      if (payMethod === 'Debito') {
        // Mark receipts as Pagado
        let dineroDisponible = montoReal;
        for (const ref of selectedRefs) {
          const fac = recibos.find(r => r.referencia === ref);
          if (!fac) continue;
          const montoFac = getReciboMonto(fac);
          if (dineroDisponible >= montoFac) {
            await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', ref);
            dineroDisponible -= montoFac;
          } else if (dineroDisponible > 0) {
            const restante = (montoFac - dineroDisponible).toFixed(2);
            await supabase.from('facturas').update({ monto: restante, estado: 'Abonado' }).eq('referencia', ref);
            dineroDisponible = 0;
          }
        }
      } else {
        // Mark as Por Verificar
        if (selectedRefs.length > 0) {
          await supabase.from('facturas').update({ estado: 'Por Verificar' }).in('referencia', selectedRefs);
        }
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        usuario: cajero_id,
        accion: 'COBRO_MOVIL',
        detalles: \`\${foundUser.Identidad} | \${payMethod} | Bs. \${montoReal} | Ref: \${referencia} | Estado: \${estado}\`
      });

      setSuccessData({ monto: montoReal, referencia, estado, banco });
      setStep('success');
    } catch (err: any) {
      setPayError('Error procesando pago: ' + (err.message || 'desconocido'));
    }
    setIsProcessing(false);
  };

  // ──────────────────────────────
  // RENDER
  // ──────────────────────────────
  return (
    <div className="flex flex-col flex-1 p-4 gap-4">

      {/* ── STEP: SEARCH ── */}
      {step === 'search' && (
        <div className="flex flex-col gap-4 mt-4">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <Search className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-white text-xl font-bold">Buscar Contribuyente</h1>
            <p className="text-slate-400 text-sm mt-1">Ingresa el RIF, Cédula o Nombre</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="bg-slate-700 text-white rounded-xl px-3 py-3 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500"
              >
                <option value="V">V</option>
                <option value="J">J</option>
                <option value="E">E</option>
                <option value="G">G</option>
                <option value="P">P</option>
              </select>
              <input
                type="text"
                value={docNumber}
                onChange={e => setDocNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Número de documento o nombre..."
                className="flex-1 bg-slate-700 text-white rounded-xl px-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
              />
            </div>

            {searchError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-xl px-3 py-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {searchError}
              </div>
            )}

            <button
              onClick={handleSearch}
              disabled={isSearching || !docNumber.trim()}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl text-base transition-all active:scale-95"
            >
              {isSearching ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: ACCOUNT ── */}
      {step === 'account' && foundUser && (
        <div className="flex flex-col gap-3">
          {/* User card */}
          <div className="bg-slate-800 rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-white font-bold text-base leading-tight">{foundUser.Contribuyente}</div>
                <div className="text-emerald-400 text-sm font-mono mt-0.5">{foundUser.Identidad}</div>
                {foundUser.Telefono && foundUser.Telefono !== 'N/A' && (
                  <div className="text-slate-400 text-xs mt-1">{foundUser.Telefono}</div>
                )}
              </div>
              <button onClick={() => { setStep('search'); setDocNumber(''); }} className="text-slate-500 hover:text-slate-300">
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
            {foundUser.SaldoFavor > 0 && (
              <div className="mt-2 px-2 py-1 bg-emerald-500/20 rounded-lg text-emerald-400 text-xs font-semibold">
                Saldo a favor: Bs. {formatBs(foundUser.SaldoFavor)}
              </div>
            )}
          </div>

          {/* Recibos */}
          <div className="bg-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <span className="text-white font-semibold text-sm">Recibos Pendientes</span>
              <span className="text-slate-400 text-xs">{recibos.length} recibos</span>
            </div>
            {recibos.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Este contribuyente está solvente</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-slate-700/50">
                {recibos.map(r => {
                  const monto = getReciboMonto(r);
                  const isSelected = selectedRefs.includes(r.referencia);
                  const matchedInm = userInms.find(i => i.inmueble && r.referencia.includes(i.inmueble));
                  return (
                    <label key={r.referencia} className={\`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors \${isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-700/50'}\`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRef(r.referencia)}
                        className="w-5 h-5 accent-emerald-500 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-mono truncate">{r.referencia}</div>
                        <div className="text-slate-400 text-xs">{mesLabel(r.emision)}{matchedInm ? \` · \${matchedInm.tipo || matchedInm.actividad_principal || 'Inmueble'}\` : ''}</div>
                      </div>
                      <div className={\`text-sm font-bold \${isSelected ? 'text-emerald-400' : 'text-white'}\`}>
                        Bs. {formatBs(monto)}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Total + CTA */}
          {recibos.length > 0 && (
            <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Seleccionados: {selectedRefs.length}</span>
                <span className="text-white font-bold text-lg">Bs. {formatBs(totalSeleccionado)}</span>
              </div>
              <button
                onClick={() => setStep('pay')}
                disabled={selectedRefs.length === 0}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl text-base transition-all active:scale-95"
              >
                Proceder al Cobro
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP: PAY ── */}
      {step === 'pay' && foundUser && (
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button onClick={() => setStep('account')} className="text-slate-400 hover:text-white">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-white font-bold">Registrar Cobro</span>
          </div>

          {/* Summary */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
            <div className="text-emerald-400 text-xs font-semibold uppercase mb-1">{foundUser.Contribuyente}</div>
            <div className="text-white text-2xl font-bold">Bs. {formatBs(totalSeleccionado)}</div>
            <div className="text-slate-400 text-xs mt-1">{selectedRefs.length} recibo(s) seleccionado(s) · Tasa {tcmmv?.toFixed(2)}</div>
          </div>

          {/* Payment method */}
          <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="text-slate-400 text-xs font-semibold uppercase">Método de Pago</div>
            <div className="grid grid-cols-2 gap-2">
              {(['Debito', 'Transferencia'] as PayMethod[]).map(m => (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className={\`flex flex-col items-center gap-1.5 py-4 rounded-xl border text-sm font-semibold transition-all \${
                    payMethod === m
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }\`}
                >
                  {m === 'Debito' ? <CreditCard className="w-5 h-5" /> : <Landmark className="w-5 h-5" />}
                  {m === 'Debito' ? 'Débito' : 'Transferencia'}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            {/* Banco */}
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase block mb-1">Banco</label>
              <select
                value={banco}
                onChange={e => setBanco(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500"
              >
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Referencia */}
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase block mb-1">Nº de Referencia / Aprobación</label>
              <input
                type="text"
                value={referencia}
                onChange={e => setReferencia(e.target.value)}
                placeholder="Últimos 8 dígitos..."
                className="w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
              />
            </div>

            {/* Monto */}
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase block mb-1">Monto Cobrado (Bs.)</label>
              <input
                type="number"
                value={montoIngresado}
                onChange={e => setMontoIngresado(e.target.value)}
                placeholder={totalSeleccionado.toFixed(2)}
                className="w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-base font-bold border border-slate-600 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
              />
            </div>

            {/* Fecha */}
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase block mb-1">Fecha de la Transacción</label>
              <input
                type="date"
                value={fechaTx}
                onChange={e => setFechaTx(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Photo capture */}
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase block mb-2">Foto del Comprobante / Bauche</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => camRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl text-sm border border-slate-600 transition-all"
                >
                  <Camera className="w-4 h-4" />
                  Tomar Foto
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl text-sm border border-slate-600 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Galería
                </button>
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              {comprobantePreview && (
                <div className="mt-2 relative">
                  <img src={comprobantePreview} alt="Comprobante" className="w-full rounded-xl object-cover max-h-48" />
                  <button onClick={() => { setComprobante(null); setComprobantePreview(''); }}
                    className="absolute top-2 right-2 bg-red-500/80 text-white rounded-full p-1">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {payError && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {payError}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handlePay}
            disabled={isProcessing}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-5 rounded-2xl text-base transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <span>Procesando...</span>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {payMethod === 'Debito' ? 'Confirmar Cobro' : 'Enviar a Verificación'}
              </>
            )}
          </button>

          {payMethod === 'Transferencia' && (
            <p className="text-slate-500 text-xs text-center">
              La transferencia será revisada por el administrador en el módulo de Conciliación Bancaria.
            </p>
          )}
        </div>
      )}

      {/* ── STEP: SUCCESS ── */}
      {step === 'success' && successData && (
        <div className="flex flex-col items-center gap-5 mt-8">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="text-center">
            <h2 className="text-white text-xl font-bold">
              {successData.estado === 'Aprobado' ? '¡Cobro Exitoso!' : 'Pago Enviado a Verificación'}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {successData.estado === 'Aprobado'
                ? 'El pago fue registrado y los recibos actualizados.'
                : 'El pago será conciliado por el administrador.'}
            </p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 w-full flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Contribuyente</span>
              <span className="text-white font-semibold truncate max-w-[60%] text-right">{foundUser?.Contribuyente}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Monto</span>
              <span className="text-emerald-400 font-bold text-lg">Bs. {formatBs(successData.monto)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Referencia</span>
              <span className="text-white font-mono">{successData.referencia}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Banco</span>
              <span className="text-white">{successData.banco}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Estado</span>
              <span className={\`font-semibold \${successData.estado === 'Aprobado' ? 'text-emerald-400' : 'text-yellow-400'}\`}>{successData.estado}</span>
            </div>
          </div>

          <button
            onClick={() => { setStep('search'); setDocNumber(''); setRecibos([]); setFoundUser(null); setSelectedRefs([]); setReferencia(''); setMontoIngresado(''); setComprobante(null); setComprobantePreview(''); }}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-2xl text-base transition-all active:scale-95"
          >
            Nuevo Cobro
          </button>
        </div>
      )}
    </div>
  );
}
`;
fs.writeFileSync(layoutDir + '/page.tsx', pageContent);
console.log('✅ page.tsx created');

// ── 3. Patch Sidebar to add link ──
const sidebarPath = BASE + '/components/Sidebar.tsx';
let sidebar = fs.readFileSync(sidebarPath, 'utf8');

if (!sidebar.includes('cobro-movil')) {
  sidebar = sidebar.replace(
    `import { Home, Search, FileText, FlaskConical, Wrench, UserPlus, Users, FileSpreadsheet, History, Award, Clock, Building2, AlertTriangle, Handshake, LayoutDashboard, Mail, User, PieChart, Truck, Inbox, Calculator, Briefcase, Landmark, BookOpen, Car, Map, Bus, TreePine, ShieldAlert, DollarSign, Wallet, FileCheck, Package, ShoppingCart, Target, BarChart3, ClipboardCheck } from 'lucide-react';`,
    `import { Home, Search, FileText, FlaskConical, Wrench, UserPlus, Users, FileSpreadsheet, History, Award, Clock, Building2, AlertTriangle, Handshake, LayoutDashboard, Mail, User, PieChart, Truck, Inbox, Calculator, Briefcase, Landmark, BookOpen, Car, Map, Bus, TreePine, ShieldAlert, DollarSign, Wallet, FileCheck, Package, ShoppingCart, Target, BarChart3, ClipboardCheck, Smartphone } from 'lucide-react';`
  );
  sidebar = sidebar.replace(
    `{ icon: ShieldAlert, name: 'Auditoría', href: '/admin/auditoria' }`,
    `{ icon: Smartphone, name: 'Cobro Móvil', href: '/admin/cobro-movil' },\n    { icon: ShieldAlert, name: 'Auditoría', href: '/admin/auditoria' }`
  );
  fs.writeFileSync(sidebarPath, sidebar);
  console.log('✅ Sidebar.tsx patched');
} else {
  console.log('ℹ️ Sidebar already has cobro-movil');
}

// ── 4. Patch admin dashboard to add card ──
const dashboardPath = BASE + '/app/(admin)/admin/page.tsx';
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

if (!dashboard.includes('cobro-movil')) {
  dashboard = dashboard.replace(
    `import { MapPin, Phone, Mail, FileText, Download } from 'lucide-react';`,
    `import { MapPin, Phone, Mail, FileText, Download, Smartphone } from 'lucide-react';`
  );
  dashboard = dashboard.replace(
    `<div className="grid grid-cols-1 gap-6">`,
    `<div className="grid grid-cols-1 gap-6">
        {/* Cobro Móvil Card */}
        <a href="/admin/cobro-movil" className="block">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl shadow-lg border border-emerald-500/30 p-6 flex items-center gap-5 hover:from-emerald-500 hover:to-emerald-600 transition-all cursor-pointer group">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Smartphone className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Cobro Móvil</h2>
              <p className="text-emerald-100/80 text-sm">Busca contribuyentes, revisa su estado de cuenta y procesa cobros desde el campo con tu teléfono.</p>
            </div>
            <div className="ml-auto text-white/60 group-hover:text-white transition-colors text-2xl">→</div>
          </div>
        </a>`
  );
  fs.writeFileSync(dashboardPath, dashboard);
  console.log('✅ Admin dashboard patched with cobro-movil card');
} else {
  console.log('ℹ️ Dashboard already has cobro-movil card');
}

console.log('\n🎉 Mobile collection module ready!');
