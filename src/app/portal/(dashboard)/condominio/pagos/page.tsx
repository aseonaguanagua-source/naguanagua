'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, CloudUpload, CheckCircle2, AlertTriangle, Building2, Upload } from 'lucide-react';
import { bancosVenezuela, BancoOficial } from '@/lib/bancos';

export default function CondominioPagosPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bancoOrigen, setBancoOrigen] = useState(bancosVenezuela[0].codigo);
  const [bancoDestino, setBancoDestino] = useState('0102'); // IAMEC default BDV
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [montoBs, setMontoBs] = useState('');
  
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [relacionFile, setRelacionFile] = useState<File | null>(null);

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  const [tcmmv, setTcmmv] = useState(0);

  useEffect(() => {
    fetch('/api/bcv').then(r => r.json()).then(d => setTcmmv(d.tcmmv)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referencia || !montoBs || !fecha) {
      alert("Por favor, complete todos los campos requeridos.");
      return;
    }
    if (!comprobanteFile) {
      alert("Es obligatorio subir el comprobante de pago bancario.");
      return;
    }
    if (!relacionFile) {
      alert("Es obligatorio subir la 'Relación de Pago' en formato PDF descargada en la sección anterior.");
      return;
    }

    setLoading(true);
    try {
      const portalDoc = localStorage.getItem('portal_doc');
      const contrib = localStorage.getItem('portal_user') || 'Condominio Desconocido';
      
      // 1. Subir archivos
      const compExt = comprobanteFile.name.split('.').pop();
      const compPath = `pagos/${portalDoc}/COMP_${referencia}_${Date.now()}.${compExt}`;
      await supabase.storage.from('documentos').upload(compPath, comprobanteFile);
      const { data: compData } = supabase.storage.from('documentos').getPublicUrl(compPath);

      const relExt = relacionFile.name.split('.').pop();
      const relPath = `pagos/${portalDoc}/REL_${referencia}_${Date.now()}.${relExt}`;
      await supabase.storage.from('documentos').upload(relPath, relacionFile);
      const { data: relData } = supabase.storage.from('documentos').getPublicUrl(relPath);

      // 2. Insertar Recibo Pre-Conciliación
      // "Por Verificar" y tipo especial para que Caja sepa que es una relación de condominio
      const recibo = {
        referencia: `PRE-${referencia}`,
        identidad: portalDoc,
        contribuyente: contrib,
        monto: montoBs,
        emision: fecha,
        vencimiento: fecha,
        estado: 'Por Verificar',
        notas: `PRE-CONCILIACIÓN CONDOMINIO. Banco Origen: ${bancoOrigen}. Relación Adjunta.`,
      };

      const { error } = await supabase.from('recibos').insert([recibo]);
      if (error) throw error;

      // 3. Registrar documento en tabla de documentos
      await supabase.from('documentos').insert([
        {
          identidad: portalDoc,
          tipo_documento: 'Comprobante y Relación de Condominio',
          url_documento: `${compData.publicUrl} | ${relData.publicUrl}`,
          estado: 'Pendiente',
          usuario_carga: contrib
        }
      ]);

      setSuccess(true);
      setBancoOrigen(bancosVenezuela[0].codigo);
      setReferencia('');
      setMontoBs('');
      setComprobanteFile(null);
      setRelacionFile(null);

    } catch (error: any) {
      console.error(error);
      alert("Error enviando pre-conciliación: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Reporte de Pago (Condominios)</h1>
            <p className="text-sm text-slate-500 font-medium">Pre-conciliación de múltiples unidades</p>
          </div>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex gap-3 items-start animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Reporte de Pago Enviado Exitosamente</h3>
            <p className="text-xs mt-1 text-emerald-700/80">
              El departamento de Caja revisará la Relación de Pago y el comprobante adjunto. Una vez validado, se emitirá la factura definitiva con el concepto de Servicio de Aseo Comercial según relación.
            </p>
            <button 
              onClick={() => setSuccess(false)}
              className="mt-3 text-xs font-semibold bg-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition-colors"
            >
              Reportar Otro Pago
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="font-semibold text-slate-700">1. Detalles de la Transferencia / Pago Múltiple</h2>
          <p className="text-xs text-slate-500 mt-1">Ingrese los datos exactos del comprobante bancario que cubre los locales seleccionados.</p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Banco de Origen</label>
            <select 
              value={bancoOrigen} 
              onChange={e => setBancoOrigen(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
            >
              {bancosVenezuela.map((b: BancoOficial) => (
                <option key={b.codigo} value={b.codigo}>{b.codigo} - {b.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Banco de Destino (Cuenta IAMEC)</label>
            <select 
              value={bancoDestino} 
              onChange={e => setBancoDestino(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
            >
              <option value="0102">0102 - BANCO DE VENEZUELA S.A.C.A.</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Número de Referencia</label>
            <input 
              type="text" 
              placeholder="Ej: 12345678"
              value={referencia}
              onChange={e => setReferencia(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Fecha del Pago</label>
            <input 
              type="date" 
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Monto Total Transferido (Bs.)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">Bs.</span>
              <input 
                type="number" 
                step="0.01"
                placeholder="0.00"
                value={montoBs}
                onChange={e => setMontoBs(e.target.value)}
                className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-lg text-lg font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                required
              />
            </div>
            {montoBs && tcmmv > 0 && (
              <p className="text-[10px] text-slate-500 mt-1.5 font-medium text-right">
                Equivalente aproximado: {(parseFloat(montoBs) / tcmmv).toFixed(2)} TCMMV-BCV
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 p-6">
          <h2 className="font-semibold text-slate-700 mb-4">2. Archivos Requeridos</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Comprobante Bancario */}
            <div 
              className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all ${
                comprobanteFile ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30'
              }`}
              onClick={() => fileInputRef1.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef1} 
                className="hidden" 
                accept="image/*,.pdf"
                onChange={e => e.target.files && setComprobanteFile(e.target.files[0])}
              />
              {comprobanteFile ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-semibold text-emerald-800 truncate max-w-[200px]">{comprobanteFile.name}</p>
                  <p className="text-[10px] text-emerald-600/80 mt-1">Comprobante Bancario Listo</p>
                </>
              ) : (
                <>
                  <CloudUpload className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Subir Comprobante</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">Capture la pantalla de la transferencia o suba el comprobante PDF.</p>
                </>
              )}
            </div>

            {/* Relación de Pago */}
            <div 
              className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all ${
                relacionFile ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30'
              }`}
              onClick={() => fileInputRef2.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef2} 
                className="hidden" 
                accept=".pdf"
                onChange={e => e.target.files && setRelacionFile(e.target.files[0])}
              />
              {relacionFile ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-semibold text-emerald-800 truncate max-w-[200px]">{relacionFile.name}</p>
                  <p className="text-[10px] text-emerald-600/80 mt-1">Relación PDF Lista</p>
                </>
              ) : (
                <>
                  <FileText className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Subir Relación PDF</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">Cargue el PDF generado en "Gestión de Locales".</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
          <button 
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-sm shadow-indigo-200"
          >
            {loading ? 'Procesando...' : <><Upload className="w-5 h-5" /> Enviar Reporte a Caja</>}
          </button>
        </div>
      </form>
    </div>
  );
}
