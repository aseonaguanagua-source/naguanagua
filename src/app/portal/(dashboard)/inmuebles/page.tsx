'use client';
import { useState, useEffect, useMemo } from 'react';
import { Building2, Search, MapPin, Store, AlertCircle, CheckCircle2, ChevronRight, Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants } from '@/lib/formatters';
import { isResidencialInm, cleanClasificacionActividad } from '@/lib/calculos';
import { groupInmueblesByLocal, InmuebleClusterGroup, InmuebleBasic } from '@/lib/cajaHelpers';

export default function InmueblesPage() {
  const [inmuebles, setInmuebles] = useState<InmuebleBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUso, setFilterUso] = useState('Todos');

  useEffect(() => {
    const fetchInmuebles = async () => {
      setLoading(true);
      try {
        const portalDoc = localStorage.getItem('portal_doc') || '';
        if (!portalDoc) {
          setLoading(false);
          return;
        }

        const variants = getIdentidadVariants(portalDoc);
        const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

        let { data: inmsDB } = await supabase
          .from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,padre_id,estado')
          .or(orFilter)
          .neq('estado', 'Eliminado');

        let inmsFinal: InmuebleBasic[] = inmsDB ? [...inmsDB] : [];

        // Si es condominio, traer las unidades filiales asociadas
        const isCondo = inmsFinal.some(i => i.es_condominio === true || (i.actividad_principal || '').toLowerCase().includes('condominio'));
        if (isCondo) {
          const condoCodes = inmsFinal.map(i => i.inmueble).filter(Boolean);
          if (condoCodes.length > 0) {
            const { data: hijos } = await supabase
              .from('inmuebles')
              .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,padre_id,estado')
              .in('condominio_padre_id', condoCodes)
              .neq('estado', 'Eliminado');
            if (hijos && hijos.length > 0) {
              const ids = new Set(inmsFinal.map(x => x.id));
              hijos.forEach(h => {
                if (!ids.has(h.id)) inmsFinal.push(h);
              });
            }
          }
        }

        setInmuebles(inmsFinal);
      } catch (err) {
        console.error('Error fetching inmuebles portal:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInmuebles();
  }, []);

  // Agrupar por Inmueble / Local Físico (idéntico a Caja)
  const clusters = useMemo(() => {
    return groupInmueblesByLocal(inmuebles);
  }, [inmuebles]);

  const filteredClusters = useMemo(() => {
    return clusters.filter(cl => {
      const q = searchQuery.toLowerCase().trim();
      const matchQ = !q ||
        cl.localId.toLowerCase().includes(q) ||
        cl.direccion.toLowerCase().includes(q) ||
        cl.inms.some(i => (i.inmueble || '').toLowerCase().includes(q) || (i.actividad_principal || '').toLowerCase().includes(q));

      const matchUso = filterUso === 'Todos' ||
        (filterUso === 'Residencial' && cl.tipo === 'RESIDENCIAL') ||
        (filterUso === 'Comercial' && cl.tipo === 'COMERCIAL');

      return matchQ && matchUso;
    });
  }, [clusters, searchQuery, filterUso]);

  const countRes = useMemo(() => clusters.filter(c => c.tipo === 'RESIDENCIAL').length, [clusters]);
  const countCom = useMemo(() => clusters.filter(c => c.tipo === 'COMERCIAL').length, [clusters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative w-full sm:w-96">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código, dirección o actividad..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {[
            { id: 'Todos', label: `Todos (${clusters.length})` },
            { id: 'Comercial', label: `Comercial (${countCom})` },
            { id: 'Residencial', label: `Residencial (${countRes})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterUso(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterUso === tab.id
                  ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-50 px-5 py-3 rounded-xl border border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-700 uppercase flex items-center gap-2 text-sm tracking-wide">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Mis Inmuebles Registrados ({filteredClusters.length} {filteredClusters.length === 1 ? 'Inmueble / Local' : 'Inmuebles / Locales'})
          </h2>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Agrupado por inmueble y local físico (igual que en Caja)
          </span>
        </div>

        {loading ? (
          <div className="bg-white p-12 text-center text-slate-400 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Cargando sus inmuebles registrados...</span>
            </div>
          </div>
        ) : filteredClusters.length === 0 ? (
          <div className="bg-white p-10 text-center text-slate-500 rounded-xl border border-slate-200 shadow-sm">
            No posee inmuebles registrados bajo este criterio de búsqueda.
          </div>
        ) : (
          filteredClusters.map((cluster) => {
            const hasMultiple = cluster.count > 1;

            return (
              <div key={cluster.localId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:border-slate-300 transition-all">
                {/* Cabecera del Inmueble / Local */}
                <div className="bg-slate-50/80 px-4 py-3.5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md text-xs">
                      {cluster.localId}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      cluster.tipo === 'RESIDENCIAL'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {cluster.tipo === 'RESIDENCIAL' ? 'Residencial' : 'Comercial'}
                    </span>
                    {hasMultiple && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        <Layers className="w-3 h-3" />
                        {cluster.count} Actividades Consolidadas
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">
                      Tarifa Local: <b>{cluster.totalMmv.toFixed(2)} MMV</b>
                    </span>
                    {cluster.tieneDeuda ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {cluster.mesesDeudaMax > 0 ? `${cluster.mesesDeudaMax} mes(es) pendientes` : 'Con Deuda'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Al Día
                      </span>
                    )}
                  </div>
                </div>

                {/* Dirección del Inmueble */}
                <div className="px-4 py-2 bg-slate-50/40 border-b border-slate-100 text-xs text-slate-600 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{cluster.direccion || 'Sin dirección registrada'}</span>
                </div>

                {/* Tabla de Actividades de este Inmueble */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-white text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-100">
                        <th className="px-4 py-2.5 font-bold">Código Actividad</th>
                        <th className="px-4 py-2.5 font-bold">Actividad Económica / Ramo</th>
                        <th className="px-4 py-2.5 font-bold text-center">Factor MMV</th>
                        <th className="px-4 py-2.5 font-bold text-center">Unidades</th>
                        <th className="px-4 py-2.5 font-bold text-center">Estatus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cluster.inms.map((inm) => {
                        const cant = parseInt(String(inm.cant_inmuebles || '1'), 10) || 1;
                        const mmv = parseFloat(String(inm.mmv_mes || '0')) || 0;

                        return (
                          <tr key={inm.id || inm.inmueble} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-slate-700">
                              {inm.inmueble}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {cleanClasificacionActividad(inm.actividad_principal) || 'Servicio de Aseo Urbano'}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-700">
                              {mmv.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-500">
                              {cant}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Activo
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
