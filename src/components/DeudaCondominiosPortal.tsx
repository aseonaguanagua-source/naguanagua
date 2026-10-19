'use client';

import { useState, useEffect } from 'react';
import { Building2, AlertTriangle, Users, ChevronDown, ChevronUp, Info, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import { formatBs } from '@/lib/formatCurrency';

interface CondoUnitInfo {
  inmueble: string;
  condominioCodigo: string;
  condominioNombre: string;
  propietario?: string;
  actividad?: string;
  multaBs?: number;
  multaMeses?: number;
  numeroLocal?: string;
}

export default function DeudaCondominiosPortal({ identidad }: { identidad: string }) {
  const [condoUnits, setCondoUnits] = useState<CondoUnitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!identidad) {
      setLoading(false);
      return;
    }

    const loadCondoUnits = async () => {
      try {
        const variants = getIdentidadVariantsExact(identidad);
        const orFilter = variants.map(v => `identidad.eq.${v}`).join(',');

        // 1. Inmuebles con condominio_padre_id
        const { data: inms } = await supabase
          .from('inmuebles')
          .select('inmueble, contribuyente, condominio_padre_id, actividad_principal, multa_bs, meses_deuda, numero_local, estado')
          .or(orFilter)
          .not('condominio_padre_id', 'is', null)
          .neq('estado', 'Eliminado');

        // 2. Unidades registradas en condominio_unidades
        const { data: cUnits } = await supabase
          .from('condominio_unidades')
          .select('inmueble, propietario, identidad, actividad, numero, multa_meses, condominios!inner(codigo, nombre)')
          .or(orFilter)
          .neq('estado', 'Eliminada');

        const items: CondoUnitInfo[] = [];
        const condoCodesToFetch = new Set<string>();

        (inms || []).forEach((i: any) => {
          if (i.condominio_padre_id) {
            condoCodesToFetch.add(i.condominio_padre_id.toUpperCase());
            items.push({
              inmueble: i.inmueble,
              condominioCodigo: i.condominio_padre_id,
              condominioNombre: i.condominio_padre_id,
              propietario: i.contribuyente,
              actividad: i.actividad_principal,
              multaBs: parseFloat(i.multa_bs || '0') || 0,
              multaMeses: parseInt(String(i.meses_deuda || '0')) > 1 ? parseInt(String(i.meses_deuda || '0')) - 1 : 0,
              numeroLocal: i.numero_local || undefined
            });
          }
        });

        (cUnits || []).forEach((u: any) => {
          const cCod = u.condominios?.codigo || '';
          const cNom = u.condominios?.nombre || cCod;
          const exist = items.find(it => it.inmueble === u.inmueble);
          if (!exist) {
            items.push({
              inmueble: u.inmueble,
              condominioCodigo: cCod,
              condominioNombre: cNom,
              propietario: u.propietario,
              actividad: u.actividad,
              multaMeses: u.multa_meses || 0,
              numeroLocal: u.numero || undefined
            });
          } else if (cNom) {
            exist.condominioNombre = cNom;
          }
        });

        // Completar nombres de condominios que falten
        if (condoCodesToFetch.size > 0) {
          const { data: condosDb } = await supabase
            .from('condominios')
            .select('codigo, nombre')
            .in('codigo', Array.from(condoCodesToFetch));

          if (condosDb) {
            const mapName: Record<string, string> = {};
            condosDb.forEach(c => { mapName[c.codigo.toUpperCase()] = c.nombre; });
            items.forEach(it => {
              const k = it.condominioCodigo.toUpperCase();
              if (mapName[k]) it.condominioNombre = mapName[k];
            });
          }
        }

        setCondoUnits(items);
      } catch (err) {
        console.error('Error cargando unidades de condominio portal:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCondoUnits();
  }, [identidad]);

  if (loading || condoUnits.length === 0) return null;

  const tieneMultas = condoUnits.some(u => (u.multaBs && u.multaBs > 0) || (u.multaMeses && u.multaMeses > 0));
  const condominiosUnicos = Array.from(new Set(condoUnits.map(u => u.condominioNombre || u.condominioCodigo)));

  return (
    <div className="bg-gradient-to-br from-amber-50 via-orange-50/60 to-amber-100/50 border-2 border-amber-300/80 rounded-2xl p-5 shadow-sm space-y-3 mb-6 transition-all">
      <div className="flex items-start gap-3.5">
        <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs mt-0.5 shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
              Inmueble / Local dentro de Condominio
              <span className="bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {condoUnits.length} {condoUnits.length === 1 ? 'Inmueble filial' : 'Inmuebles filiales'}
              </span>
            </h3>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer bg-amber-200/60 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Ocultar detalles' : 'Ver inmuebles vinculados'}
            </button>
          </div>

          <p className="text-xs text-amber-900/90 leading-relaxed font-medium">
            Estimado contribuyente, usted posee inmuebles o locales comerciales ubicados dentro de:
            <strong className="text-amber-950"> {condominiosUnicos.join(', ')}</strong>.
          </p>

          <div className="bg-white/80 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 space-y-1.5 mt-2">
            <div className="flex items-start gap-2 font-bold text-amber-900">
              <Users className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <span>Aviso Importante sobre su Estado de Cuenta y Multas de Condominio:</span>
            </div>
            <p className="text-[11px] text-slate-700 leading-normal pl-6">
              De acuerdo a la ordenanza municipal tributaria, la facturación general, solvencia y liquidación del servicio de aseo urbano de las áreas del condominio se gestiona <strong>de manera centralizada a través de la Junta o Directiva de su Condominio</strong> ante el IAMEC.
            </p>
            <p className="text-[11px] text-slate-700 leading-normal pl-6">
              Para consultar su estado de cuenta, solicitar aclaratorias de solvencia o gestionar <strong>multas y cuotas correspondientes al condominio</strong>, le recordamos <strong>comunicarse y coordinar directamente con la Directiva o Administradora de su Condominio</strong>, quien representa al inmueble matriz ante la administración tributaria municipal.
            </p>
          </div>

          {tieneMultas && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-900 px-3 py-2 rounded-xl text-xs font-semibold mt-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                Nota sobre multas: Cualquier recargo o multa derivado de períodos pendientes del condominio debe ser regularizado mediante la Directiva de su Condominio en la Dirección de Condominios del IAMEC.
              </span>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="pt-3 border-t border-amber-200/80 mt-3 space-y-2">
          <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
            Detalle de Inmuebles dentro de Condominio:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {condoUnits.map((u, idx) => (
              <div key={idx} className="bg-white/90 border border-amber-200 rounded-lg p-2.5 text-xs flex justify-between items-center">
                <div>
                  <div className="font-mono font-bold text-slate-800">
                    {u.inmueble} {u.numeroLocal ? `· Local ${u.numeroLocal}` : ''}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                    {u.condominioNombre}
                  </div>
                  {u.actividad && (
                    <div className="text-[10px] text-amber-800 font-medium">
                      {u.actividad}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  {u.multaBs && u.multaBs > 0 ? (
                    <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 block">
                      Multa: Bs. {formatBs(u.multaBs)}
                    </span>
                  ) : u.multaMeses && u.multaMeses > 0 ? (
                    <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 block">
                      {u.multaMeses} mes(es) mora
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 block">
                      Al día
                    </span>
                  )}
                  <span className="text-[9px] text-slate-400 block mt-0.5">Directiva Condominio</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
