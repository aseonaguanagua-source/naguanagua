'use client';
import { useState, useEffect, useMemo } from 'react';
import { Building2, Search, MapPin, Store, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariants } from '@/lib/formatters';
import { isResidencialInm } from '@/lib/calculos';

interface InmuebleRow {
  id: string;
  inmueble: string;
  identidad: string;
  direccion: string;
  tipo?: string;
  clasificacion?: string;
  actividad_principal?: string;
  deuda_mmv?: string | number;
  meses_deuda?: string | number;
  es_condominio?: boolean;
  condominio_padre_id?: string;
}

export default function InmueblesPage() {
  const [inmuebles, setInmuebles] = useState<InmuebleRow[]>([]);
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
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
          .or(orFilter);

        let inmsFinal = inmsDB ? [...inmsDB] : [];

        // Si es condominio, traer las unidades filiales asociadas
        const isCondo = inmsFinal.some(i => i.es_condominio === true || (i.actividad_principal || '').toLowerCase().includes('condominio'));
        if (isCondo) {
          const condoCodes = inmsFinal.map(i => i.inmueble).filter(Boolean);
          if (condoCodes.length > 0) {
            const { data: hijos } = await supabase
              .from('inmuebles')
              .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id')
              .in('condominio_padre_id', condoCodes);
            if (hijos && hijos.length > 0) {
              const ids = new Set(inmsFinal.map(x => x.id));
              hijos.forEach(h => {
                if (!ids.has(h.id)) inmsFinal.push(h);
              });
            }
          }
        }

        // Filtrar contenedores N/A que solo envuelven otras actividades (ej: URB033481)
        const naParentCodes = inmsFinal
          .filter((i: any) =>
            (i.actividad_principal || '').trim().toUpperCase() === 'N/A' &&
            (parseInt(i.cant_inmuebles || '0') > 0 || inmsFinal.some((c: any) => c.condominio_padre_id === i.inmueble))
          )
          .map((i: any) => i.inmueble);

        const billableInms = inmsFinal.filter((i: any) => !naParentCodes.includes(i.inmueble));
        setInmuebles(billableInms.length > 0 ? billableInms : inmsFinal);
      } catch (err) {
        console.error('Error fetching inmuebles portal:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInmuebles();
  }, []);

  const filtered = useMemo(() => {
    return inmuebles.filter(inm => {
      const q = searchQuery.toLowerCase().trim();
      const matchQ = !q ||
        (inm.inmueble || '').toLowerCase().includes(q) ||
        (inm.direccion || '').toLowerCase().includes(q) ||
        (inm.actividad_principal || '').toLowerCase().includes(q);

      const esRes = isResidencialInm(inm);
      const matchUso = filterUso === 'Todos' ||
        (filterUso === 'Residencial' && esRes) ||
        (filterUso === 'Comercial' && !esRes);

      return matchQ && matchUso;
    });
  }, [inmuebles, searchQuery, filterUso]);

  const countRes = useMemo(() => inmuebles.filter(i => isResidencialInm(i)).length, [inmuebles]);
  const countCom = useMemo(() => inmuebles.filter(i => !isResidencialInm(i)).length, [inmuebles]);

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
            { id: 'Todos', label: `Todos (${inmuebles.length})` },
            { id: 'Comercial', label: `Comercial (${countCom})` },
            { id: 'Residencial', label: `Residencial (${countRes})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterUso(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-700 uppercase flex items-center gap-2 text-sm tracking-wide">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Mis Inmuebles Registrados ({filtered.length})
          </h2>
          <span className="text-xs text-slate-500">
            Sincronizado con Catastro y Recaudación Municipal
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-bold">Código Inmueble</th>
                <th className="px-6 py-4 font-bold">Uso / Clasificación</th>
                <th className="px-6 py-4 font-bold">Actividad Económica</th>
                <th className="px-6 py-4 font-bold">Dirección Fiscal / Ubicación</th>
                <th className="px-6 py-4 font-bold text-center">Estado de Deuda</th>
                <th className="px-6 py-4 font-bold text-center">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <span>Cargando sus inmuebles registrados...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                    No posee inmuebles registrados bajo este criterio de búsqueda.
                  </td>
                </tr>
              ) : (
                filtered.map((inm) => {
                  const esRes = isResidencialInm(inm);
                  const meses = parseInt(String(inm.meses_deuda || '0'), 10);
                  const tieneDeuda = meses > 0 || parseFloat(String(inm.deuda_mmv || '0')) > 0;

                  return (
                    <tr key={inm.id} className="hover:bg-slate-50/80 transition-colors text-sm">
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-md">
                          {inm.inmueble}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          esRes 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {esRes ? 'Residencial' : 'Comercial'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-medium whitespace-normal max-w-[240px]">
                        {inm.actividad_principal || 'No especificada'}
                      </td>
                      <td className="px-6 py-4 text-slate-600 whitespace-normal min-w-[280px] max-w-[400px]">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-xs">{inm.direccion || 'Sin dirección registrada'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {tieneDeuda ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <AlertCircle className="w-3 h-3" />
                            {meses > 0 ? `${meses} meses pendientes` : 'Con Deuda'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            Al Día
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          Activo
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
