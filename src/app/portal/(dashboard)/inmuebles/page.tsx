'use client';
import { useState, useEffect, useMemo } from 'react';
import { Building2, Search, MapPin, Store, AlertCircle, CheckCircle2, ChevronRight, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import { isResidencialInm, cleanClasificacionActividad } from '@/lib/calculos';
import { groupInmueblesByLocal, InmuebleClusterGroup, InmuebleBasic } from '@/lib/cajaHelpers';

export default function InmueblesPage() {
  const [inmuebles, setInmuebles] = useState<InmuebleBasic[]>([]);
  const [condoNames, setCondoNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUso, setFilterUso] = useState('Todos');
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});

  const toggleCluster = (localId: string) => {
    setExpandedClusters(prev => ({ ...prev, [localId]: !prev[localId] }));
  };

  useEffect(() => {
    const fetchInmuebles = async () => {
      setLoading(true);
      try {
        const portalDoc = localStorage.getItem('portal_doc') || '';
        if (!portalDoc) {
          setLoading(false);
          return;
        }

        // Búsqueda por coincidencia exacta de prefijo (V, J, G, etc.)
        const variants = getIdentidadVariantsExact(portalDoc);
        const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

        let { data: inmsDB } = await supabase
          .from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,padre_id,estado')
          .or(orFilter)
          .neq('estado', 'Eliminado');

        const isActivo = (i: any) => {
          const est = (i.estado || 'Activo').trim().toLowerCase();
          return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
        };

        let inmsFinal: InmuebleBasic[] = inmsDB ? inmsDB.filter(isActivo) : [];

        // Si es condominio, traer las unidades filiales asociadas
        const isCondo = inmsFinal.some(i => i.es_condominio === true || (i.actividad_principal || '').toLowerCase().includes('condominio'));
        if (isCondo) {
          const condoCodes = inmsFinal.map(i => i.inmueble).filter(Boolean);
          if (condoCodes.length > 0) {
            const { data: hijos } = await supabase
              .from('inmuebles')
              .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,padre_id,estado')
              .in('condominio_padre_id', condoCodes);
            if (hijos && hijos.length > 0) {
              const ids = new Set(inmsFinal.map(x => x.id));
              hijos.filter(isActivo).forEach(h => {
                if (!ids.has(h.id)) inmsFinal.push(h);
              });
            }
          }
        }

        // Si hay locales contenedores o inmuebles padre, traer sus actividades hijas vinculadas por padre_id
        const parentCodes = inmsFinal.map(i => i.inmueble).filter(Boolean);
        if (parentCodes.length > 0) {
          const { data: hijosPadre } = await supabase
            .from('inmuebles')
            .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,padre_id,estado')
            .in('padre_id', parentCodes);
          if (hijosPadre && hijosPadre.length > 0) {
            const ids = new Set(inmsFinal.map(x => x.id));
            hijosPadre.filter(isActivo).forEach(h => {
              if (!ids.has(h.id)) inmsFinal.push(h);
            });
          }
        }

        // Cargar nombres oficiales de los condominios asociados
        const condoPadres = Array.from(new Set(
          inmsFinal.map(i => (i as any).condominio_padre_id).filter(Boolean)
        ));
        if (condoPadres.length > 0) {
          const { data: condoRows } = await supabase
            .from('condominios')
            .select('codigo, nombre')
            .in('codigo', condoPadres);
          if (condoRows) {
            const map: Record<string, string> = {};
            condoRows.forEach(c => { if (c.codigo && c.nombre) map[c.codigo] = c.nombre; });
            setCondoNames(map);
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
            const isExpanded = expandedClusters[cluster.localId] ?? false;

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
                      <button
                        type="button"
                        onClick={() => toggleCluster(cluster.localId)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-200 transition-colors cursor-pointer"
                        title={isExpanded ? 'Ocultar actividades' : 'Ver actividades'}
                      >
                        <Layers className="w-3 h-3 text-purple-600" />
                        <span>{cluster.count} Actividades Consolidadas</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-purple-700" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-purple-700" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">
                      Tarifa Local: <b>{cluster.totalMmv.toFixed(2)} MMV</b>
                    </span>
                    {cluster.esCondominio ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        <Building2 className="w-3.5 h-3.5" />
                        Cancela por Condominio
                      </span>
                    ) : cluster.tieneDeuda ? (
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

                    {hasMultiple && (
                      <button
                        type="button"
                        onClick={() => toggleCluster(cluster.localId)}
                        className="flex items-center gap-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold py-1 px-2.5 rounded-lg transition-colors cursor-pointer"
                        title={isExpanded ? 'Ocultar actividades' : 'Desplegar actividades'}
                      >
                        <span>{isExpanded ? 'Ocultar' : 'Ver'} ({cluster.count})</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-purple-700" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-purple-700" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner de Condominio Informativo */}
                {cluster.esCondominio && (
                  <div className="px-4 py-3 bg-amber-50/90 border-b border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <strong className="text-amber-900">Inmueble / Local dentro de Condominio:</strong> Este inmueble pertenece a{' '}
                      <span className="font-bold text-amber-900 underline">{condoNames[cluster.condominioPadreId || ''] || cluster.condominioPadreId || 'su Condominio'}</span>.
                      <p className="text-[11px] text-amber-900/90 leading-relaxed">
                        Para consultar su estado de cuenta oficial, verificar solvencia o gestionar <strong>multas y cuotas correspondientes al condominio</strong>, debe <strong>comunicarse y coordinar directamente con la Directiva o Administración de su Condominio</strong>, quien representa al inmueble matriz ante el IAMEC.
                      </p>
                    </div>
                  </div>
                )}

                {/* Dirección del Inmueble */}
                <div className="px-4 py-2 bg-slate-50/40 border-b border-slate-100 text-xs text-slate-600 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{cluster.direccion || 'Sin dirección registrada'}</span>
                </div>

                {/* Contenido: Si tiene múltiples actividades y está colapsado, mostrar barra interactiva */}
                {hasMultiple && !isExpanded ? (
                  <div
                    onClick={() => toggleCluster(cluster.localId)}
                    className="px-4 py-3 bg-slate-50/60 hover:bg-purple-50/60 cursor-pointer flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>
                        Este local consolida <b>{cluster.count} actividades comerciales</b> ({cluster.totalMmv.toFixed(2)} MMV total). Haga clic para ver el desglose individual.
                      </span>
                    </div>
                    <span className="text-xs font-bold text-purple-700 group-hover:text-purple-900 flex items-center gap-1 shrink-0 ml-2">
                      <span>Desplegar actividades ({cluster.count})</span>
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
                    </span>
                  </div>
                ) : (
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
                                {cluster.esCondominio ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                    Cancela por Condominio
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Activo
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {hasMultiple && (
                      <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Mostrando las <b>{cluster.count}</b> actividades consolidadas de este local.</span>
                        <button
                          type="button"
                          onClick={() => toggleCluster(cluster.localId)}
                          className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Ocultar actividades</span>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
