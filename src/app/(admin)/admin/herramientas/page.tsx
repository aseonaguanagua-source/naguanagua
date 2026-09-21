'use client';
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Loader2, BarChart3, ChevronDown, ChevronUp, FileText, CheckSquare, Square, RefreshCw, AlertCircle, Building2, User } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

interface ContribGroup {
  identidad: string;
  contribuyente: string;
  codCont: string;
  totalMmvMes: number;
  totalDeudaMMV: number;
  mesesAdeudados: number;
  mesesDetalle: any[];
  isCondominio: boolean;
  unidades: number;
  facturasPendientes: any[];
}

export default function HerramientasPage() {
  const [tcmmv, setTcmmv] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [grupos, setGrupos] = useState<ContribGroup[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [seleccionados, setSeleccionados] = useState<Record<string, Set<number>>>({});
  const [msg, setMsg] = useState('');
  const [filtro, setFiltro] = useState<'con_deuda' | 'todos'>('con_deuda');

  useEffect(() => {
    fetch('/api/bcv?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (d?.tcmmv > 0) setTcmmv(d.tcmmv); }).catch(() => {});
  }, []);

  const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const cargarDatos = async () => {
    setLoading(true);
    setMsg('');
    setSeleccionados({});
    setGrupos([]);
    try {
      // 1. Cargar inmuebles
      const { data: inms, error: e1 } = await supabase
        .from('inmuebles')
        .select('id, identidad, contribuyente, cod_cont, clasificacion, mmv_mes, cant_inmuebles, deuda_mmv, deuda_congelada_bs, estado')
        .neq('estado', 'Eliminado')
        .order('contribuyente');
      if (e1) throw e1;

      // 2. Cargar TODAS las recibos CM- pendientes con paginacion (limite 1000 filas de Supabase)
      let allFacts: any[] = [];
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data: pageFacts, error: e2 } = await supabase
          .from('facturas')
          .select('referencia, identidad, monto, emision, estado')
          .like('referencia', 'CM-%')
          .eq('estado', 'Pendiente')
          .order('emision')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (e2) throw e2;
        if (!pageFacts || pageFacts.length === 0) break;
        allFacts = allFacts.concat(pageFacts);
        if (pageFacts.length < PAGE_SIZE) break;
        page++;
      }

      // Agrupar recibos por identidad
      const factsByIdent: Record<string, any[]> = {};
      for (const f of allFacts) {
        const k = (f.identidad || '').trim();
        if (!factsByIdent[k]) factsByIdent[k] = [];
        factsByIdent[k].push(f);
      }

      // Agrupar inmuebles por identidad
      const mapa: Record<string, any> = {};
      for (const row of (inms || [])) {
        const key = (row.identidad || '').trim();
        if (!key) continue;
        if (!mapa[key]) {
          mapa[key] = {
            identidad: key, contribuyente: row.contribuyente, codCont: row.cod_cont || '',
            rows: [], totalMmvMes: 0, totalDeudaMMV: 0,
          };
        }
        mapa[key].rows.push(row);
        mapa[key].totalMmvMes += (parseFloat(row.cant_inmuebles || 1) * parseFloat(row.mmv_mes || 0));
        // Para deuda: tomar el max de deuda_mmv (evitar multiplicar por N en COB)
        const d = parseFloat(row.deuda_mmv || 0);
        if (d > mapa[key].totalDeudaMMV) mapa[key].totalDeudaMMV = d;
      }

      const result: ContribGroup[] = Object.values(mapa).map((g: any) => {
        const unidades = g.rows.reduce((s: number, r: any) => s + parseFloat(r.cant_inmuebles || 1), 0);
        const isCondominio = g.rows.length > 1 || unidades > 1;
        const recibos = factsByIdent[g.identidad] || [];

        // FUENTE DE VERDAD: contar recibos CM- pendientes
        const mesesAdeudados = recibos.length;

        return {
          ...g, unidades, isCondominio,
          mesesAdeudados,
          mesesDetalle: recibos, // las recibos ya son los meses
          facturasPendientes: recibos,
        };
      });

      result.sort((a, b) => b.mesesAdeudados - a.mesesAdeudados || b.totalDeudaMMV - a.totalDeudaMMV);
      setGrupos(result);
      setMsg(`${result.filter(g => g.mesesAdeudados > 0).length} contribuyentes con recibos pendientes de ${result.length} total.`);
    } catch (e: any) {
      setMsg('Error: ' + e.message);
    }
    setLoading(false);
  };

  const toggleFact = (key: string, idx: number) => {
    setSeleccionados(prev => {
      const set = new Set(prev[key] || []);
      set.has(idx) ? set.delete(idx) : set.add(idx);
      return { ...prev, [key]: set };
    });
  };

  const toggleTodos = (key: string, total: number) => {
    setSeleccionados(prev => {
      const set = prev[key] || new Set();
      return { ...prev, [key]: set.size === total ? new Set() : new Set(Array.from({ length: total }, (_, i) => i)) };
    });
  };

  const marcarPagadas = async (g: ContribGroup) => {
    const sel = seleccionados[g.identidad] || new Set();
    if (sel.size === 0) { alert('Selecciona al menos una recibo.'); return; }
    setSaving(true);
    setMsg('');
    try {
      const refs = Array.from(sel).map(i => g.facturasPendientes[i].referencia);
      const { error } = await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', refs);
      if (error) throw error;
      setMsg(`Marcadas como pagadas: ${refs.length} recibos de ${g.contribuyente}`);
      setSeleccionados(prev => ({ ...prev, [g.identidad]: new Set() }));
      await cargarDatos();
    } catch (e: any) {
      setMsg('Error: ' + e.message);
    }
    setSaving(false);
  };

  const filtrados = grupos.filter(g => filtro === 'con_deuda' ? g.mesesAdeudados > 0 : true);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 size={28} />
          <h1 className="text-2xl font-black">Deuda por Meses — Recibos Pendientes</h1>
        </div>
        <p className="text-indigo-200 text-sm">
          Muestra las recibos individuales por mes ya generadas. Cada tarjeta = 1 mes adeudado.<br />
          Las recibos CM- en estado "Pendiente" son la fuente de verdad de la deuda.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-indigo-300 text-xs">TCMMV:</span>
          <span className="bg-indigo-600 px-2 py-0.5 rounded font-bold text-sm">{tcmmv > 0 ? `Bs. ${fmt(tcmmv)}` : 'N/D'}</span>
          {tcmmv === 0 && <input type="number" placeholder="Ingresa TCMMV" className="ml-2 px-2 py-1 rounded text-slate-800 text-xs w-36" onChange={e => setTcmmv(parseFloat(e.target.value) || 0)} />}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center justify-between">
        <button onClick={cargarDatos} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-lg text-sm">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {loading ? 'Cargando...' : 'Cargar Recibos Pendientes'}
        </button>
        {grupos.length > 0 && (
          <div className="flex gap-2">
            {(['con_deuda', 'todos'] as const).map(f => (
              <button key={f} onClick={() => setFiltro(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filtro === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}>
                {f === 'con_deuda' ? `Con Deuda (${grupos.filter(g => g.mesesAdeudados > 0).length})` : `Todos (${grupos.length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {grupos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { l: 'Contribuyentes', v: grupos.length, c: 'indigo' },
            { l: 'Con Recibos Pendientes', v: grupos.filter(g => g.mesesAdeudados > 0).length, c: 'red' },
            { l: 'Total Meses Adeudados', v: grupos.reduce((s, g) => s + g.mesesAdeudados, 0), c: 'orange' },
            { l: 'Solventes', v: grupos.filter(g => g.mesesAdeudados === 0).length, c: 'green' },
          ].map(({ l, v, c }) => (
            <div key={l} className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-500 mb-1 uppercase">{l}</p>
              <p className={`text-3xl font-black text-${c}-700`}>{v.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className={`rounded-xl p-3 text-sm border ${msg.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>{msg}</div>
      )}

      <div className="space-y-3">
        {filtrados.map(g => {
          const sel = seleccionados[g.identidad] || new Set();
          const isOpen = expandedKey === g.identidad;
          const totalSelBs = Array.from(sel).reduce((s, i) => s + parseFloat(g.facturasPendientes[i]?.monto || 0), 0);

          return (
            <div key={g.identidad} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${g.mesesAdeudados >= 12 ? 'border-red-200' : g.mesesAdeudados >= 6 ? 'border-orange-200' : g.mesesAdeudados > 0 ? 'border-amber-200' : 'border-slate-100'}`}>
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedKey(isOpen ? null : g.identidad)}>
                <div className="flex items-center gap-3 min-w-0">
                  {isOpen ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
                  {g.isCondominio ? <Building2 size={14} className="text-blue-500 flex-shrink-0" /> : <User size={14} className="text-slate-400 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{g.contribuyente}</p>
                    <p className="text-xs text-slate-500">{g.identidad} · Cód: {g.codCont || '—'}{g.isCondominio && <span className="text-blue-600 font-semibold"> · {g.unidades} uds</span>}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  {g.totalMmvMes > 0 && tcmmv > 0 && (
                    <div className="text-right hidden md:block">
                      <p className="text-[10px] text-slate-400 uppercase">Tarifa/mes</p>
                      <p className="text-xs font-bold text-slate-700">Bs. {fmt(g.totalMmvMes * tcmmv)}</p>
                    </div>
                  )}
                  <div className={`text-center rounded-lg px-3 py-1.5 min-w-[60px] ${g.mesesAdeudados >= 12 ? 'bg-red-100 text-red-700' : g.mesesAdeudados >= 6 ? 'bg-orange-100 text-orange-700' : g.mesesAdeudados > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    <p className="text-2xl font-black leading-none">{g.mesesAdeudados > 0 ? g.mesesAdeudados : '✓'}</p>
                    <p className="text-[10px] font-semibold">{g.mesesAdeudados > 0 ? 'meses' : 'solvente'}</p>
                  </div>
                  {sel.size > 0 && (
                    <button onClick={e => { e.stopPropagation(); marcarPagadas(g); }} disabled={saving}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center gap-1">
                      <FileText size={11} /> Pagar {sel.size}
                    </button>
                  )}
                </div>
              </div>

              {isOpen && g.mesesAdeudados > 0 && (
                <div className="border-t border-slate-100 px-4 py-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-600 uppercase">Recibos pendientes por mes:</p>
                    <button onClick={() => toggleTodos(g.identidad, g.facturasPendientes.length)} className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                      {sel.size === g.facturasPendientes.length ? <CheckSquare size={13} /> : <Square size={13} />}
                      {sel.size === g.facturasPendientes.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {g.facturasPendientes.map((f: any, idx: number) => {
                      const isSel = sel.has(idx);
                      const emision = new Date(f.emision + 'T00:00:00');
                      const label = `${MESES[emision.getMonth()]} ${emision.getFullYear()}`;
                      return (
                        <button key={f.referencia} onClick={() => toggleFact(g.identidad, idx)}
                          className={`rounded-lg p-2.5 border-2 text-left transition-all ${isSel ? 'border-indigo-500 bg-indigo-50 shadow' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                          <div className="flex justify-end mb-1">
                            {isSel ? <CheckSquare size={12} className="text-indigo-600" /> : <Square size={12} className="text-slate-300" />}
                          </div>
                          <p className={`text-[11px] font-bold leading-tight ${isSel ? 'text-indigo-800' : 'text-slate-700'}`}>{label}</p>
                          <p className={`text-[10px] mt-0.5 font-semibold ${isSel ? 'text-indigo-600' : 'text-slate-400'}`}>Bs. {fmt(parseFloat(f.monto))}</p>
                        </button>
                      );
                    })}
                  </div>
                  {sel.size > 0 && (
                    <div className="mt-3 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
                      <span className="text-sm text-indigo-700 font-medium">
                        {sel.size} mes{sel.size > 1 ? 'es' : ''} · Total: <strong>Bs. {fmt(totalSelBs)}</strong>
                      </span>
                      <button onClick={() => marcarPagadas(g)} disabled={saving}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg flex items-center gap-1">
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                        Registrar Pago
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isOpen && g.mesesAdeudados === 0 && (
                <div className="border-t px-4 py-4 bg-green-50 text-center text-green-700 font-medium text-sm">✅ Solvente — sin recibos CM- pendientes.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

