'use client';

import React, { useMemo, useState } from 'react';
import { Save, X, RefreshCw, Plus, Trash2, Home, Store, AlertTriangle } from 'lucide-react';
import { ordenanzaData } from '@/data/ordenanza';
import { actividadConNivel, nivelActividad, quitarNivelActividad, resolverFOComercial } from '@/lib/calculos';
import { mesesPendientes } from '@/lib/condominios/motor';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NIVELES = ['Baja', 'Media', 'Alta'];
const RESIDENCIALES = ordenanzaData.tiposResidenciales.map(t => ({ label: t.label.toUpperCase(), factor: t.factor }));
const COMERCIALES: string[] = ordenanzaData.actividadesComerciales.map((a: any) => a.label);

const esActRes = (a: string) => RESIDENCIALES.some(r => r.label === String(a || '').toUpperCase().trim());

/**
 * Editor de una unidad del condominio (o alta de una nueva).
 * Permite cambiar datos, clasificación, actividad, tarifa, meses pendientes, multas, torre y estado.
 */
export default function EditorUnidad({ condo, unidad, unidades, multas, renglon, usuario, porActividad, onClose, onSaved }: {
  condo: any; unidad: any | null; unidades: any[]; multas: any[]; renglon: any | null; usuario: string; porActividad: boolean;
  onClose: () => void; onSaved: (cerrar: boolean) => void;
}) {
  const nueva = !unidad;
  const actIni = String(unidad?.actividad || '');
  const claseIni: 'RES' | 'COM' = unidad
    ? (esActRes(actIni) || /APARTAMENTO|APTO|CASA|QUINTA|TOWN ?HOUSE|VIVIENDA/i.test(actIni) || (condo.tipo === 'RESIDENCIAL' && !actIni) ? 'RES' : 'COM')
    : (condo.tipo === 'RESIDENCIAL' ? 'RES' : 'COM');
  const [clase, setClase] = useState<'RES' | 'COM'>(claseIni);
  const [f, setF] = useState<any>({
    inmueble: unidad?.inmueble || '', numero: unidad?.numero || '', propietario: unidad?.propietario || '', identidad: unidad?.identidad || '',
    estado: unidad?.estado || 'Activa', padre_unidad_id: unidad?.padre_unidad_id || '', es_grupo: !!unidad?.es_grupo,
    meses: unidad ? mesesPendientes(unidad.aseo_pendiente_desde) : 0, multa_meses: unidad?.multa_meses || 0,
    tarifa_mmv: unidad?.tarifa_mmv ?? '',
  });
  const [actRes, setActRes] = useState(claseIni === 'RES' && actIni ? actIni.toUpperCase() : RESIDENCIALES[1].label);
  const [actCom, setActCom] = useState(claseIni === 'COM' ? quitarNivelActividad(actIni) : '');
  const [nivel, setNivel] = useState(claseIni === 'COM' ? nivelActividad(actIni) : 1);
  // Unidad existente con tarifa guardada: se respeta hasta que el administrador cambie la actividad.
  const [tarifaManual, setTarifaManual] = useState(!!unidad && unidad.tarifa_mmv != null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  // Multas: siempre por meses — 10% (residencial) o 12% (comercial) de la mensualidad por cada mes
  const multasPend = useMemo(() => (unidad ? multas.filter(m => m.unidad_id === unidad.id && m.estado === 'Pendiente') : []), [multas, unidad]);
  const esRes = renglon ? !!renglon.residencial : clase === 'RES';
  const pctMulta = esRes ? 0.10 : 0.12;
  const mensualBs = Number(renglon?.mensualBs) || 0;
  const multaPorMesBs = Math.round(mensualBs * pctMulta * 100) / 100;
  const multaMesesN = Math.max(0, parseInt(f.multa_meses) || 0);

  const actividad = clase === 'RES' ? actRes : (actCom.trim() ? actividadConNivel(actCom.trim().toUpperCase(), nivel) : '');
  const tarifaSugerida = clase === 'RES'
    ? (RESIDENCIALES.find(r => r.label === actRes)?.factor ?? 0.91)
    : (actCom.trim() ? resolverFOComercial(actividad) : null);
  const tarifa = tarifaManual ? f.tarifa_mmv : (tarifaSugerida ?? f.tarifa_mmv);

  const torres = unidades.filter(u => u.id !== unidad?.id && u.estado !== 'Eliminada' && (u.es_grupo || unidades.some(h => h.padre_unidad_id === u.id)));
  const resEnCondoComercial = clase === 'RES' && condo.tipo === 'COMERCIAL';
  const comEnCondoResidencial = clase === 'COM' && condo.tipo === 'RESIDENCIAL';

  const guardar = async () => {
    setErr('');
    if (motivo.trim().length < 5) { setErr('Escriba el motivo del cambio (queda en la Auditoría).'); return; }
    if (clase === 'COM' && !actCom.trim() && f.estado !== 'Desocupada' && !f.es_grupo) { setErr('Indique la actividad comercial.'); return; }
    const datos: any = {
      inmueble: f.inmueble, numero: f.numero, propietario: f.propietario, identidad: f.identidad, estado: f.estado,
      padre_unidad_id: f.padre_unidad_id || null, es_grupo: f.es_grupo, meses: f.meses, multa_meses: f.multa_meses,
      actividad: f.estado === 'Desocupada' && clase === 'COM' && !actCom.trim() ? 'INMUEBLES DESOCUPADOS' : actividad,
      tarifa_mmv: tarifa === '' ? null : tarifa,
    };
    let cambios = datos;
    if (!nueva) {
      cambios = {};
      const antes: any = { ...unidad, meses: mesesPendientes(unidad.aseo_pendiente_desde), padre_unidad_id: unidad.padre_unidad_id || null };
      for (const k of Object.keys(datos)) if (String(datos[k] ?? '').toUpperCase() !== String(antes[k] ?? '').toUpperCase()) cambios[k] = datos[k];
      if (!Object.keys(cambios).length) { onClose(); return; }
    }
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/condominios/unidades', {
        method: nueva ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nueva ? { codigo: condo.codigo, unidad: datos, usuario, motivo } : { id: unidad.id, cambios, usuario, motivo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar');
      onSaved(true);
    } catch (e: any) { setErr(e.message); } finally { setGuardando(false); }
  };


  const quitarTodas = async () => {
    setErr('');
    if (motivo.trim().length < 5) { setErr('Escriba el motivo (abajo) para quitar las multas.'); return; }
    if (!confirm('¿Quitar TODAS las multas de esta unidad? (multas de los meses pendientes, meses de multa y multas fijas)')) return;
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/condominios/quitar-multas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: condo.codigo, unidad_id: unidad.id, usuario, motivo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudieron quitar');
      onSaved(true);
    } catch (e: any) { setErr(e.message); } finally { setGuardando(false); }
  };

  const anularMulta = async (m: any) => {
    const mot = prompt(`Motivo para anular la multa "${m.concepto}":`);
    if (!mot || mot.trim().length < 5) return;
    setGuardando(true);
    try {
      const r = await fetch('/api/admin/condominios/multas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, usuario, motivo: mot }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo anular');
      onSaved(false);
    } catch (e: any) { setErr(e.message); } finally { setGuardando(false); }
  };

  const inp = 'mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm';
  const lbl = 'text-xs font-bold text-slate-700';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between">
          <div className="font-extrabold">{nueva ? `Agregar unidad a ${condo.nombre}` : `Editar ${unidad.inmueble || ''}${unidad.numero ? ` · ${unidad.numero}` : ''}`}</div>
          <button onClick={onClose} className="text-white/70 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto text-sm">
          {/* Datos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block"><span className={lbl}>Código del inmueble</span>
              <input id="unidad-inmueble" value={f.inmueble} onChange={e => setF({ ...f, inmueble: e.target.value })} placeholder="Ej. AURI012345 (opcional)" className={inp + ' font-mono'} /></label>
            <label className="block"><span className={lbl}>Número (apto / local / oficina)</span>
              <input id="unidad-numero" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} placeholder="Ej. Local 12 / Apto 4-B" className={inp} /></label>
            <label className="block"><span className={lbl}>Propietario / contribuyente</span>
              <input id="unidad-propietario" value={f.propietario} onChange={e => setF({ ...f, propietario: e.target.value })} className={inp} /></label>
            <label className="block"><span className={lbl}>Cédula / RIF</span>
              <input id="unidad-identidad" value={f.identidad} onChange={e => setF({ ...f, identidad: e.target.value })} placeholder="V-12345678 / J-123456789" className={inp + ' font-mono'} /></label>
          </div>

          {/* Clasificación y actividad */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className={lbl}>Clasificación:</span>
              {([['RES', 'Residencial', Home], ['COM', 'Comercial', Store]] as const).map(([k, l, I]) => (
                <button key={k} type="button" onClick={() => { setClase(k); setTarifaManual(false); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border cursor-pointer ${clase === k ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                  <I className="w-3.5 h-3.5" /> {l}
                </button>
              ))}
            </div>
            {clase === 'RES' ? (
              <label className="block"><span className={lbl}>Tipo de vivienda</span>
                <select id="unidad-tipo-res" value={actRes} onChange={e => { setActRes(e.target.value); setTarifaManual(false); }} className={inp}>
                  {actRes && !esActRes(actRes) && <option value={actRes}>{actRes} (actual)</option>}
                  {RESIDENCIALES.map(r => <option key={r.label} value={r.label}>{r.label} — F.O. {r.factor}</option>)}
                </select></label>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                <label className="block"><span className={lbl}>Actividad comercial (ordenanza)</span>
                  <input id="unidad-actividad" list="lista-actividades" value={actCom} onChange={e => { setActCom(e.target.value); setTarifaManual(false); }} placeholder="Escriba para buscar…" className={inp} />
                  <datalist id="lista-actividades">{COMERCIALES.map(a => <option key={a} value={a} />)}</datalist></label>
                <label className="block"><span className={lbl}>Generación</span>
                  <select id="unidad-nivel" value={nivel} onChange={e => { setNivel(Number(e.target.value)); setTarifaManual(false); }} className={inp}>
                    {NIVELES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                  </select></label>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <label className="block"><span className={lbl}>Tarifa (F.O. en MMV)</span>
                <input id="unidad-tarifa" type="number" step="0.01" value={tarifa ?? ''} onChange={e => { setTarifaManual(true); setF({ ...f, tarifa_mmv: e.target.value }); }} className={inp} /></label>
              <div className="text-[11px] text-slate-500 pb-2">
                {tarifaManual ? <>Tarifa escrita a mano. <button type="button" onClick={() => setTarifaManual(false)} className="text-emerald-700 font-bold underline cursor-pointer">Usar la de la ordenanza</button></> : 'Calculada con la ordenanza según la actividad.'}
              </div>
            </div>
            {(resEnCondoComercial || comEnCondoResidencial) && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                El condominio está marcado como <b>{condo.tipo === 'RESIDENCIAL' ? 'Residencial' : 'Comercial'}</b>. Para que esta unidad se cobre como {clase === 'RES' ? 'residencial' : 'comercial'}, cambie el tipo del condominio a <b>Mixto</b> en Opciones.
              </div>
            )}
          </div>

          {/* Deuda */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block"><span className={lbl}>Meses pendientes de aseo</span>
              <input id="unidad-meses" type="number" min={0} value={f.meses} onChange={e => setF({ ...f, meses: e.target.value })} className={inp} /></label>
            <label className="block"><span className={lbl}>Estado</span>
              <select id="unidad-estado" value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })} className={inp}>
                <option value="Activa">Activa</option><option value="Desocupada">Desocupada</option><option value="Eliminada">Eliminada (no cobra)</option>
              </select></label>
          </div>
          {!porActividad && (
            <div className="text-[11px] text-slate-500 -mt-2">Este condominio paga centralizado: los meses que cuentan son los del condominio (botón Opciones).</div>
          )}

          {/* Estructura y Retención */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block"><span className={lbl}>Pertenece a la torre / local</span>
              <select id="unidad-torre" value={f.padre_unidad_id} onChange={e => setF({ ...f, padre_unidad_id: e.target.value })} className={inp}>
                <option value="">— Directo en el condominio —</option>
                {torres.map(t => <option key={t.id} value={t.id}>{t.inmueble || ''} {t.numero || ''} {t.propietario ? `· ${t.propietario}` : ''}</option>)}
              </select></label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 self-end w-full">
                <input type="checkbox" checked={f.es_grupo} onChange={e => setF({ ...f, es_grupo: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
                <span className="text-xs font-bold text-slate-700">Es una torre / local (no cobra)</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 cursor-pointer hover:bg-blue-100 self-end w-full">
                <input type="checkbox" checked={f.agente_retencion} onChange={e => setF({ ...f, agente_retencion: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                <span className="text-xs font-bold text-blue-900">Agente de retención (75% IVA)</span>
              </label>
            </div>
          </div>

          {/* Multas */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-amber-800">Multa por meses ({esRes ? '10% residencial' : '12% comercial'})</span>
              <div className="flex items-center gap-3">
                {renglon && <span className="text-[11px] text-slate-500">Deuda actual: <b className="text-red-700">Bs {fmtBs(renglon.totalBs)}</b></span>}
                {!nueva && (
                  <button id="btn-quitar-multas-unidad" type="button" onClick={quitarTodas} disabled={guardando} className="px-2.5 py-1 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> Quitar todas las multas</button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-end">
              <label className="block"><span className={lbl}>Meses de multa</span>
                <div className="mt-1 flex items-center gap-1">
                  <button type="button" onClick={() => setF({ ...f, multa_meses: Math.max(0, multaMesesN - 1) })} className="w-9 h-9 rounded-lg border border-slate-300 bg-white font-black cursor-pointer hover:bg-slate-50">−</button>
                  <input id="unidad-multa-meses" type="number" min={0} value={f.multa_meses} onChange={e => setF({ ...f, multa_meses: e.target.value })} className="w-16 h-9 text-center border border-slate-300 rounded-lg text-sm" />
                  <button type="button" onClick={() => setF({ ...f, multa_meses: multaMesesN + 1 })} className="w-9 h-9 rounded-lg border border-slate-300 bg-white font-black cursor-pointer hover:bg-slate-50">+</button>
                </div></label>
              <div className="text-xs text-slate-700">
                {mensualBs > 0 ? (
                  <>{multaMesesN} mes(es) × Bs {fmtBs(multaPorMesBs)} <span className="text-slate-500">({esRes ? '10' : '12'}% de la mensualidad Bs {fmtBs(mensualBs)})</span> = <b className="text-red-700">Bs {fmtBs(multaPorMesBs * multaMesesN)}</b></>
                ) : (
                  <>Cada mes de multa = {esRes ? '10' : '12'}% de la mensualidad de la unidad.</>
                )}
              </div>
            </div>
            <div className="text-[11px] text-slate-500">Los meses de aseo pendientes ya llevan su multa automática (todos menos el más reciente). Aquí se agregan multas de meses adicionales; se guardan con “Guardar cambios”.</div>
            {multasPend.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-600">Multas anteriores con monto fijo:</div>
                {multasPend.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-white border border-amber-200 px-3 py-1.5 text-xs">
                    <span><b>{m.concepto}</b> · {m.monto_bs != null ? `Bs ${fmtBs(m.monto_bs)}` : `${m.monto_mmv} MMV`} <span className="text-slate-500">({m.creada_por})</span></span>
                    <button onClick={() => anularMulta(m)} disabled={guardando} className="text-red-700 hover:text-red-900 font-bold flex items-center gap-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /> Anular</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="block"><span className="text-xs font-bold text-red-700">Motivo del cambio (obligatorio)</span>
            <input id="unidad-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Queda registrado en la Auditoría" className="mt-1 w-full border border-red-200 rounded-xl px-3 py-2" /></label>
          {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2">{err}</div>}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cerrar</button>
          <button id="btn-guardar-unidad" onClick={guardar} disabled={guardando} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-50">
            {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {nueva ? 'Agregar unidad' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
