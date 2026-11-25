'use client';

import { useState, useEffect } from 'react';
import { Building2, AlertTriangle, Users, ChevronDown, ChevronUp, Info, ShieldAlert, Snowflake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import { formatBs } from '@/lib/formatCurrency';
import { isCondominioPagoIndividual } from '@/lib/calculos';

const fmtDMY = (ymd?: string | null) => {
  const s = String(ymd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

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
  const [tasasCongeladas, setTasasCongeladas] = useState<Record<string, any>>({});
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
        const portalCodigo = typeof window !== 'undefined' ? (localStorage.getItem('portal_codigo') || '') : '';
        const isCondoMasterSession = typeof window !== 'undefined' && sessionStorage.getItem('portal_condo_key') === 'Sehile18-';

        // 0. Verificar si la sesión actual es el propio Condominio Padre Matriz
        const orCondoMatriz = [orFilter, ...(portalCodigo ? [`codigo.eq.${portalCodigo}`] : [])].filter(Boolean).join(',');
        const { data: ownCondoRows } = await supabase
          .from('condominios')
          .select('codigo, nombre, modalidad, permite_abonos, permite_pago_por_unidad')
          .neq('estado', 'Eliminado')
          .or(orCondoMatriz);
        const ownCondoCodesSet = new Set(
          (ownCondoRows || []).map((c: any) => String(c?.codigo || '').trim().toUpperCase()).filter(Boolean)
        );
        if (isCondoMasterSession && ownCondoRows && ownCondoRows.length > 0) {
          const ownMatch = ownCondoRows.find((r: any) => portalCodigo && String(r.codigo || '').toUpperCase() === portalCodigo.toUpperCase()) || ownCondoRows[0];
          const esAbonoOIndiv = Boolean(
            ownMatch?.permite_abonos !== false ||
            ownMatch?.permite_pago_por_unidad ||
            String(ownMatch?.modalidad || '').toUpperCase() === 'INDIVIDUAL' ||
            String(ownMatch?.modalidad || '').toUpperCase() === 'MIXTO_COMERCIAL'
          );
          if (esAbonoOIndiv) {
            setCondoUnits([{
              inmueble: ownMatch.codigo,
              condominioCodigo: ownMatch.codigo,
              condominioNombre: ownMatch.nombre || ownMatch.codigo,
              propietario: ownMatch.nombre || ownMatch.codigo,
              actividad: `CONDOMINIO (${String(ownMatch.modalidad || 'CENTRALIZADO').replace('_', ' ')})`,
            }]);
          } else {
            setCondoUnits([]);
          }
          setLoading(false);
          return;
        }

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
            const pCodUpper = String(i.condominio_padre_id).trim().toUpperCase();
            if (ownCondoCodesSet.has(pCodUpper)) return;
            condoCodesToFetch.add(pCodUpper);
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
          const cCodUpper = String(cCod).trim().toUpperCase();
          if (cCod && ownCondoCodesSet.has(cCodUpper)) return;
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

        // Completar nombres y modalidades de condominios que falten
        const mapModalidad: Record<string, { modalidad: string; permite_abonos: boolean; permite_pago_por_unidad: boolean }> = {};
        const allCodesToCheck = Array.from(new Set([
          ...Array.from(condoCodesToFetch),
          ...items.map(it => String(it.condominioCodigo || '').trim().toUpperCase()).filter(Boolean)
        ]));
        if (allCodesToCheck.length > 0) {
          const { data: condosDb } = await supabase
            .from('condominios')
            .select('codigo, nombre, modalidad, permite_abonos, permite_pago_por_unidad')
            .in('codigo', allCodesToCheck);

          if (condosDb) {
            const mapName: Record<string, string> = {};
            condosDb.forEach((c: any) => {
              const cu = String(c.codigo || '').toUpperCase();
              mapName[cu] = c.nombre;
              mapModalidad[cu] = {
                modalidad: String(c.modalidad || '').toUpperCase(),
                permite_abonos: c.permite_abonos !== false,
                permite_pago_por_unidad: Boolean(c.permite_pago_por_unidad),
              };
            });
            items.forEach(it => {
              const k = it.condominioCodigo.toUpperCase();
              if (mapName[k]) it.condominioNombre = mapName[k];
            });
          }
        }

        // Mostrar el aviso con enlace a WhatsApp únicamente para condominios que se cancelan por abono o por individual y a los hijos de ellos
        const itemsFiltrados = items.filter(it => {
          const k = String(it.condominioCodigo || '').toUpperCase();
          const cfg = mapModalidad[k];
          if (!cfg) return true;
          return cfg.permite_abonos || cfg.modalidad === 'INDIVIDUAL' || cfg.modalidad === 'MIXTO_COMERCIAL' || cfg.permite_pago_por_unidad;
        });

        setCondoUnits(itemsFiltrados);
        const allCondoCodes = Array.from(new Set(items.map(it => String(it.condominioCodigo || '').trim().toUpperCase()).filter(Boolean)));
        if (allCondoCodes.length > 0) {
          try {
            const rTc = await fetch(`/api/admin/condominios/congelar-tasa?codigos=${encodeURIComponent(allCondoCodes.join(','))}`, { cache: 'no-store' });
            const jTc = await rTc.json();
            if (jTc?.tasas) setTasasCongeladas(jTc.tasas);
          } catch {}
        }
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

          {Object.entries(tasasCongeladas)
            .filter(([, v]) => v?.activa)
            .map(([cod, v]) => {
              const nom = condoUnits.find(u => u.condominioCodigo.toUpperCase() === cod)?.condominioNombre || cod;
              return (
                <div key={cod} className="bg-sky-50 border border-sky-300 text-sky-950 rounded-xl px-3 py-2 text-xs flex items-center gap-2 font-bold">
                  <Snowflake className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>
                    ❄️ {nom}: Tasa congelada en <b>Bs. {formatBs(v.activa.tasa)} / €</b> vigente por el período del <b>{fmtDMY(v.activa.desde)}</b> al <b>{fmtDMY(v.activa.hasta)}</b>.
                  </span>
                </div>
              );
            })}

          <div className="bg-white/90 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-2.5 mt-2">
            <div className="flex items-start gap-2 font-bold text-amber-900">
              <Users className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <span>Verificación de Multas y Gestión de Pagos de Unidad en Condominio:</span>
            </div>
            <p className="text-[11px] text-slate-700 leading-normal pl-6">
              De acuerdo a la normativa municipal tributaria, el servicio ordinario de aseo urbano de las unidades dentro de este condominio se gestiona de manera centralizada. Para <strong>verificar posibles multas, consultar el estado de cuenta de su unidad o realizar un pago pendiente</strong>, comuníquese directamente con nuestro <strong>Call Center de Atención al Contribuyente</strong>:
            </p>
            <div className="pl-6 pt-1">
              <a
                href="https://wa.me/584244282365?text=Hola%2C%20deseo%20verificar%20mi%20estado%20de%20cuenta%20y%20multas%20pendientes%20de%20mi%20inmueble%20en%20condominio."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs shadow-xs transition-colors"
              >
                <span>💬 Comunícate con el Call Center vía WhatsApp (+58 424-4282365)</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="pt-3 border-t border-amber-200/80 mt-3 space-y-2">
          <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
            Detalle de Inmuebles dentro de Condominio:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {condoUnits.map((u, idx) => (
              <div key={idx} className="bg-white/90 border border-amber-200 rounded-lg p-2.5 text-xs flex justify-between items-center gap-2">
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
                <div className="text-right shrink-0">
                  <a
                    href={`https://wa.me/584244282365?text=${encodeURIComponent(`Hola, deseo verificar multas o pagos pendientes de mi unidad ${u.inmueble} en ${u.condominioNombre}.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded border border-emerald-300 inline-block transition-colors"
                  >
                    Verificar en Call Center →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
