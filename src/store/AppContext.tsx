'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import economicActivitiesBase from "@/lib/economicActivitiesBase.json";

import { ordenanzaData } from '@/data/ordenanza';
import { isResidencialInm } from '@/lib/calculos';
import { getFromIndexedDB, saveToIndexedDB, clearAllIndexedDB, CURRENT_CACHE_VERSION } from '@/lib/indexedDbCache';
import { formatPhoneNumber, isFictitiousEmail } from '@/lib/formatters';

type AppState = {
  inmuebles: any[];
  contribuyentes: any[];
  preRegistros: any[];
  recibos: any[];
  documentos: any[];
  certificados: any[];
  condominios: any[];
  reclamos: any[];
  convenios: any[];
  preLiquidaciones: any[];
  ordenanzasConfig: typeof ordenanzaData;
  addCertificado: (cert: any) => void;
  tcmmv: number;
  isLoading: boolean;
  cacheStatus: 'cached' | 'syncing' | 'fresh';
  setInmuebles: (inmuebles: any[]) => void;
  updateContribuyente: (id: string, data: any) => void;
  addContribuyente: (data: any) => void;
  aprobarPreRegistro: (item: number) => void;
  addFactura: (recibo: any) => Promise<void>;
  addAuditLog: (action: string, details: string) => Promise<void>;
  auditLogs: any[];
  setPreRegistros: React.Dispatch<React.SetStateAction<any[]>>;
  setFacturas: React.Dispatch<React.SetStateAction<any[]>>;
  refreshData: (forceFresh?: boolean) => Promise<void>;
  refreshUserData: (identidad: string) => Promise<void>;
  clearLocalCache: () => Promise<void>;
};

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [inmuebles, setInmuebles] = useState<any[]>([]);
  const [contribuyentes, setContribuyentes] = useState<any[]>([]);
  const [preRegistros, setPreRegistros] = useState<any[]>([]);
  const [recibos, setFacturas] = useState<any[]>([]);
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [condominios, setCondominios] = useState<any[]>([]);
  const [cacheStatus, setCacheStatus] = useState<'cached' | 'syncing' | 'fresh'>('cached');
  const [reclamos, setReclamos] = useState<any[]>([]);
  const [convenios, setConvenios] = useState<any[]>([]);
  const [preLiquidaciones, setPreLiquidaciones] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [ordenanzasConfig, setOrdenanzasConfig] = useState<any>(ordenanzaData);
  const [tcmmv, setTcmmv] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadAllData = async (forceFresh = false) => {
    try {
      setIsLoading(true);
      
      const isPortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal');
      const portalDoc = typeof window !== 'undefined' ? localStorage.getItem('portal_doc') : null;
      
      if (isPortal) {
        // En el portal de contribuyentes cargamos SOLO la data del usuario actual
        let userFacturas = [];
        let userInmuebles = [];
        
        if (portalDoc) {
          const idLimpio = portalDoc.replace(/-/g, '').toUpperCase();
          const idFmt = idLimpio.charAt(0) + '-' + idLimpio.slice(1);
          const soloNum = portalDoc.replace(/\D/g, '');
          
          const [ { data: facturas }, { data: inmuebles } ] = await Promise.all([
             supabase.from('facturas').select('*').in('estado', ['Pendiente', 'Abonado', 'Por Verificar']).or('identidad.eq.' + idFmt + ',identidad.eq.' + idLimpio + ',identidad.eq.' + portalDoc.toUpperCase() + ',identidad.eq.' + soloNum),
             supabase.from('inmuebles').select('*').or('identidad.eq.' + idFmt + ',identidad.eq.' + idLimpio + ',identidad.eq.' + portalDoc.toUpperCase() + ',identidad.eq.' + soloNum)
          ]);
          
          userFacturas = facturas || [];
          userInmuebles = inmuebles || [];
        }

        const [ { data: dbConfig }, apiBcv ] = await Promise.all([
           supabase.from('sistema_config').select('*'),
           fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' }).then(res => res.json()).catch(() => ({ tcmmv: 0 }))
        ]);

        setFacturas(userFacturas);
        setInmuebles(userInmuebles);

        let manualTcmmv = 0;
        let semanalTcmmv = 0;
        if (dbConfig) {
          const ordenanza = dbConfig.find(c => c.id === 'tarifas_ordenanza');
          if (ordenanza && ordenanza.valor) {
            setOrdenanzasConfig({ ...ordenanzaData, ...ordenanza.valor });
          }
          const manual = dbConfig.find(c => c.id === 'tasa_bcv_manual');
          if (manual && manual.valor) manualTcmmv = parseFloat(manual.valor);
          const semanal = dbConfig.find(c => c.id === 'tasa_bcv_semanal');
          if (semanal && semanal.valor) semanalTcmmv = parseFloat(semanal.valor);
        }

        const bcvData = apiBcv;
        let currentTcmmv = manualTcmmv > 0 ? manualTcmmv : (bcvData?.tcmmv > 0 ? bcvData.tcmmv : semanalTcmmv);

        if (currentTcmmv <= 0) {
          try {
            const eurRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial');
            const eurData = await eurRes.json();
            if (eurData && eurData.promedio > 0) currentTcmmv = eurData.promedio;
          } catch (e) {
            console.error(e);
          }
        }
        setTcmmv(currentTcmmv);
        setIsLoading(false);
        return; // Salimos de loadAllData temprano para el portal
      }

      // ======================================================================
      // 1. CARGA INSTANTÁNEA DESDE INDEXEDDB (Caché local en el navegador)
      // ======================================================================
      if (!forceFresh && typeof window !== 'undefined') {
        const cached = await getFromIndexedDB<any>('naguanagua_full_cache');
        if (cached && cached.version === CURRENT_CACHE_VERSION && Array.isArray(cached.inmuebles) && cached.inmuebles.length > 0) {
          // CARGA INSTANTÁNEA (< 50ms)
          setInmuebles(cached.inmuebles);
          setContribuyentes(cached.contribuyentes || []);
          setCondominios(cached.condominios || []);
          setFacturas(cached.facturas || []);
          setPreRegistros(cached.preRegistros || []);
          setDocumentos(cached.documentos || []);
          setCertificados(cached.certificados || []);
          setReclamos(cached.reclamos || []);
          setConvenios(cached.convenios || []);
          setPreLiquidaciones(cached.preLiquidaciones || []);
          setAuditLogs(cached.auditLogs || []);
          setTcmmv(cached.tcmmv || 0);
          if (cached.ordenanzasConfig) setOrdenanzasConfig(cached.ordenanzasConfig);
          setIsLoading(false);
          setCacheStatus('cached');

          // Revalidación ligera en segundo plano (tasa BCV y pre-registros) sin bloquear la pantalla
          (async () => {
            try {
              const [{ data: dbCfg }, apiBcv, { data: dbPreReg }] = await Promise.all([
                supabase.from('sistema_config').select('*'),
                fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ tcmmv: 0 })),
                supabase.from('pre_registros').select('*')
              ]);
              if (apiBcv?.tcmmv && apiBcv.tcmmv !== cached.tcmmv) {
                setTcmmv(apiBcv.tcmmv);
              }
              if (dbPreReg) setPreRegistros(dbPreReg);
            } catch (err) {
              // Silencioso en segundo plano
            }
          })();

          return;
        }
      }

      setCacheStatus('syncing');

      // Helper concurrente para descargar páginas en paralelo (8 peticiones simultáneas)
      const fetchAllClientParallel = async (table: string, select: string) => {
        let total = 0;
        try {
          const { count, error: countErr } = await supabase.from(table).select('*', { count: 'planned', head: true });
          if (!countErr && count && count > 0) total = count;
        } catch (e) {}

        if (!total) {
          try {
            const { count: estCount } = await supabase.from(table).select('*', { count: 'estimated', head: true });
            if (estCount && estCount > 0) total = estCount;
          } catch (e) {}
        }

        if (!total) {
          total = table === 'inmuebles' ? 52000 : 36000;
        }

        const step = 1000;
        const numBatches = Math.ceil(total / step);
        const ranges = [];
        for (let i = 0; i < numBatches; i++) {
          ranges.push({ from: i * step, to: Math.min((i + 1) * step - 1, total - 1) });
        }

        const results: any[] = new Array(numBatches);
        const CONCURRENCY = 8;
        for (let i = 0; i < ranges.length; i += CONCURRENCY) {
          const chunkRanges = ranges.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunkRanges.map(async (r, idx) => {
              const batchIndex = i + idx;
              const { data, error } = await supabase.from(table).select(select).range(r.from, r.to);
              if (error) console.error(`Error fetching chunk ${batchIndex} from ${table}:`, error);
              results[batchIndex] = data || [];
            })
          );
        }
        return results.flat();
      };

      // Descarga de facturas activas
      let allFacturas: any[] = [];
      let fetchMore = true;
      let from = 0;
      const stepFacturas = 999;
      while (fetchMore) {
        const { data: chunk } = await supabase.from('facturas').select('*')
          .in('estado', ['Pendiente', 'Abonado', 'Por Verificar'])
          .range(from, from + stepFacturas);
        if (chunk && chunk.length > 0) {
          allFacturas.push(...chunk);
          from += stepFacturas + 1;
        } else {
          fetchMore = false;
        }
      }

      // Descarga concurrente de Inmuebles y Contribuyentes
      const [rawInmuebles, rawContribuyentes] = await Promise.all([
        fetchAllClientParallel('inmuebles', 'id,identidad,inmueble,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,multa_bs,meses_deuda,agente_retencion,estado,correo_electronico,telefono,es_condominio,condominio_padre_id,created_at'),
        fetchAllClientParallel('contribuyentes', '*')
      ]);

      const contribMap = new Map();
      rawContribuyentes.forEach(c => contribMap.set(c.identidad, c));

      const allInmuebles = rawInmuebles.map(inm => ({
        ...inm,
        contribuyentes: contribMap.get(inm.identidad) || null
      }));

      // Contar unidades/locales hijos vinculados por condominio_padre_id
      const hijosCountMap = new Map<string, number>();
      allInmuebles.forEach(i => {
        if (i.condominio_padre_id) {
          hijosCountMap.set(i.condominio_padre_id, (hijosCountMap.get(i.condominio_padre_id) || 0) + 1);
        }
      });

      const apiCondominios = allInmuebles
        .filter(i => i.es_condominio === true)
        .map(inm => {
          const numHijos = hijosCountMap.get(inm.inmueble) || 0;
          const contribObj = contribMap.get(inm.identidad);
          const rawNombre = contribObj?.nombre || inm.contribuyente || '';
          const cleanNombre = rawNombre && !rawNombre.toUpperCase().includes('CONDOMINIO')
            ? `${rawNombre} (${inm.inmueble})`
            : `Condominio ${inm.inmueble}`;

          return {
            id: inm.id,
            codigo: inm.inmueble,
            identidad: inm.identidad,
            nombre: cleanNombre,
            direccion: inm.direccion || '',
            unidades: numHijos > 0 ? numHijos : parseInt(inm.cant_inmuebles || '0'),
            representante: contribObj?.nombre || inm.contribuyente || 'N/A',
            estado: inm.estado || 'Activo',
            created_at: inm.created_at
          };
        });

      const [
        { data: dbPreRegistros },
        { data: dbDocumentos },
        { data: dbCertificados },
        { data: dbReclamos },
        { data: dbConvenios },
        { data: dbPreLiquidaciones },
        { data: dbAuditLogs },
        { data: dbConfig },
        apiBcv
      ] = await Promise.all([
        supabase.from('pre_registros').select('*'),
        supabase.from('documentos').select('*'),
        supabase.from('certificados').select('*'),
        supabase.from('reclamos').select('*'),
        supabase.from('convenios').select('*'),
        supabase.from('pre_liquidaciones').select('*'),
        supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('sistema_config').select('*'),
        fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' }).then(res => res.json()).catch(() => ({ tcmmv: 0 }))
      ]);

      let manualTcmmv = 0;
      let semanalTcmmv = 0;
      let ordenanzaConfigValue = ordenanzaData;
      if (dbConfig) {
        const ordenanza = dbConfig.find(c => c.id === 'tarifas_ordenanza');
        if (ordenanza && ordenanza.valor) {
          ordenanzaConfigValue = { ...ordenanzaData, ...ordenanza.valor };
          setOrdenanzasConfig(ordenanzaConfigValue);
        }
        const manual = dbConfig.find(c => c.id === 'tasa_bcv_manual');
        if (manual && manual.valor) manualTcmmv = parseFloat(manual.valor);
        const semanal = dbConfig.find(c => c.id === 'tasa_bcv_semanal');
        if (semanal && semanal.valor) semanalTcmmv = parseFloat(semanal.valor);
      }

      const bcvData = apiBcv as any;
      let currentTcmmv = manualTcmmv > 0 ? manualTcmmv : (bcvData?.tcmmv > 0 ? bcvData.tcmmv : semanalTcmmv);
      if (currentTcmmv <= 0) {
        try {
          const eurRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial');
          const eurData = await eurRes.json();
          if (eurData && eurData.promedio > 0 && eurData.promedio < 2000) {
            currentTcmmv = eurData.promedio;
          }
        } catch (e) {
          console.error("DolarAPI Frontend Fallback failed", e);
        }
      }

      setTcmmv(currentTcmmv);
      setAuditLogs(dbAuditLogs || []);

      const mappedInmuebles = allInmuebles.map((row: any) => ({
        ...row,
        'Inmueble': row.inmueble || row.cod_cont,
        'Clasificacion': row.clasificacion || 'Residencial',
        'Tipo': 'Urbano',
        'Saldo': (parseFloat(row.deuda_congelada_bs || 0) + (parseFloat(row.deuda_mmv || 0) * 57 * currentTcmmv)).toFixed(2),
        'DeudaMMV': parseFloat(row.deuda_mmv || 0),
        'DeudaCongelada': parseFloat(row.deuda_congelada_bs || 0),
        'Cant Inmuebles': 1,
        'Actividad Principal': row.actividad || 'No aplica',
        'Direccion': row.direccion
      }));
      setInmuebles(mappedInmuebles);
      setCondominios(apiCondominios);

      const map = new Map();
      allInmuebles.forEach((row: any) => {
        if (row.identidad && !map.has(row.identidad)) {
          const act = row.actividad_principal || '';
          let clase = 'Residencial';
          if (isResidencialInm(row)) {
            clase = 'Residencial';
          } else if ((row.tipo || '').toUpperCase().includes('COMERCIAL')) {
            clase = 'Comercial';
          } else if ((row.tipo || '').toUpperCase().includes('INDUSTRIAL')) {
            clase = 'Industrial';
          } else if (row.clasificacion && row.clasificacion !== 'Individual' && row.clasificacion !== 'Condominio') {
            clase = row.clasificacion;
          }

          const rawTel = row.contribuyentes?.telefono || row.telefono;
          const cleanTel = formatPhoneNumber(rawTel);
          const rawEmail = row.contribuyentes?.email || row.email || row.correo_electronico || row.correo;
          const cleanEmail = isFictitiousEmail(rawEmail) ? '' : (rawEmail || '').trim();

          map.set(row.identidad, {
            Identidad: row.identidad,
            Contribuyente: row.contribuyentes?.nombre || row.nombre || row.contribuyente || 'Sin Nombre',
            Telefono: cleanTel || 'No registrado',
            Correo: cleanEmail || 'No registrado',
            CodCont: row.inmueble || row.cod_cont,
            cod_cont: row.inmueble || row.cod_cont,
            Direccion: (function() {
              if (act.includes('[HIJO_DE:')) {
                const match = act.match(/\[HIJO_DE:(.*?)\]/);
                if (match) {
                  const padreUrb = match[1];
                  const padre = allInmuebles.find((i: any) => i.inmueble === padreUrb);
                  if (padre && padre.direccion && padre.direccion !== '') {
                    return padre.direccion;
                  }
                }
              }
              return row.direccion || row.contribuyentes?.direccion || '';
            })(),
            Observaciones: row.contribuyentes?.observaciones || '',
            Actividad: act || 'No aplica',
            Clasificacion: clase,
            SaldoFavor: parseFloat(row.saldo_favor_bs || '0'),
            DeudaMMV: parseFloat(row.deuda_mmv || 0),
            DeudaCongelada: parseFloat(row.deuda_congelada_bs || 0),
            DeudaBs: (parseFloat(row.deuda_congelada_bs || 0) + (parseFloat(row.deuda_mmv || 0) * 57 * currentTcmmv)),
            MesesDeuda: parseInt(row.meses_deuda || '0'),
            Estado: row.estado || 'Activo',
            FechaRegistro: row.created_at || null
          });
        } else if (row.identidad && map.has(row.identidad)) {
          const existing = map.get(row.identidad);
          existing.SaldoFavor += parseFloat(row.saldo_favor_bs || '0');
          existing.DeudaMMV += parseFloat(row.deuda_mmv || 0);
          existing.DeudaCongelada += parseFloat(row.deuda_congelada_bs || 0);
          existing.DeudaBs = (existing.DeudaCongelada + (existing.DeudaMMV * 57 * currentTcmmv));
          if (row.estado === 'Eliminado' || (row.estado === 'Inactivo' && existing.Estado !== 'Eliminado')) {
            existing.Estado = row.estado;
          }
          const cod = row.inmueble || row.cod_cont;
          if (cod && !existing.CodCont.includes(cod)) {
            existing.CodCont += " " + cod;
          }
          map.set(row.identidad, existing);
        }
      });

      // Asegurar inclusión de contribuyentes de la tabla 'contribuyentes' que no tengan inmuebles aún o sean recién registrados
      rawContribuyentes.forEach((c: any) => {
        if (c.identidad && !map.has(c.identidad)) {
          const rawEmail = c.email || c.correo_electronico || c.correo;
          const cleanEmail = isFictitiousEmail(rawEmail) ? '' : (rawEmail || '').trim();
          map.set(c.identidad, {
            Identidad: c.identidad,
            Contribuyente: c.nombre || 'Sin Nombre',
            Telefono: formatPhoneNumber(c.telefono) || 'No registrado',
            Correo: cleanEmail || 'No registrado',
            CodCont: c.identidad,
            cod_cont: c.identidad,
            Direccion: c.direccion || '',
            Observaciones: c.observaciones || '',
            Actividad: 'No aplica',
            Clasificacion: 'Individual',
            SaldoFavor: 0,
            DeudaMMV: 0,
            DeudaCongelada: 0,
            DeudaBs: 0,
            MesesDeuda: 0,
            Estado: 'Activo',
            FechaRegistro: c.created_at || null
          });
        }
      });

      const finalContribuyentes = Array.from(map.values());
      setContribuyentes(finalContribuyentes);

      if (dbPreRegistros) setPreRegistros(dbPreRegistros);
      if (allFacturas) setFacturas(allFacturas);
      if (dbDocumentos) setDocumentos(dbDocumentos);
      if (dbCertificados) setCertificados(dbCertificados);
      if (dbReclamos) setReclamos(dbReclamos);
      if (dbConvenios) setConvenios(dbConvenios);
      if (dbPreLiquidaciones) setPreLiquidaciones(dbPreLiquidaciones);

      // Guardar en caché persistente IndexedDB para cargas instantáneas subsiguientes
      if (typeof window !== 'undefined') {
        await saveToIndexedDB('naguanagua_full_cache', {
          version: CURRENT_CACHE_VERSION,
          timestamp: Date.now(),
          inmuebles: mappedInmuebles,
          contribuyentes: finalContribuyentes,
          condominios: apiCondominios,
          facturas: allFacturas,
          preRegistros: dbPreRegistros || [],
          documentos: dbDocumentos || [],
          certificados: dbCertificados || [],
          reclamos: dbReclamos || [],
          convenios: dbConvenios || [],
          preLiquidaciones: dbPreLiquidaciones || [],
          auditLogs: dbAuditLogs || [],
          tcmmv: currentTcmmv,
          ordenanzasConfig: ordenanzaConfigValue
        });
      }

      setCacheStatus('fresh');

    } catch (error) {
      console.error("Error loading data from Supabase:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = async (forceFresh = false) => {
    await loadAllData(forceFresh);
  };

  const clearLocalCache = async () => {
    setIsLoading(true);
    await clearAllIndexedDB();
    await loadAllData(true);
  };

  /**
   * Refresca SOLO los inmuebles de un contribuyente específico en el estado global.
   * Evita recargar todo el AppContext después de un pago en caja.
   * 
   * Uso: después de acreditar/descontar saldo a favor, llamar con la identidad
   * del contribuyente pagado en lugar de refreshData() completo.
   */
  const refreshUserData = async (identidad: string) => {
    try {
      const idClean = (identidad || '').replace(/-/g, '').toUpperCase();
      const { data: freshInms } = await supabase
        .from('inmuebles')
        .select('*')
        .or(`identidad.eq.${identidad},identidad.eq.${idClean}`);

      if (freshInms) {
        setInmuebles(prev => [
          ...prev.filter(i =>
            (i.identidad || '').replace(/-/g, '').toUpperCase() !== idClean
          ),
          ...freshInms
        ]);
      }

      // Refrescar también las facturas de este contribuyente
      const { data: freshFacts } = await supabase
        .from('facturas')
        .select('*')
        .in('estado', ['Pendiente', 'Abonado', 'Por Verificar'])
        .or(`identidad.eq.${identidad},identidad.eq.${idClean}`);

      if (freshFacts) {
        setFacturas(prev => [
          ...prev.filter(f =>
            (f.identidad || '').replace(/-/g, '').toUpperCase() !== idClean
          ),
          ...freshFacts
        ]);
      }
    } catch (error) {
      console.error('Error en refreshUserData:', error);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // addAuditLog: migrado a tabla 'auditoria' (sistema unificado)
  const addAuditLog = async (action: string, details: string) => {
    try {
      const user = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || 'Administrador';
      const letra = (typeof window !== 'undefined' ? localStorage.getItem('adminLetra') : null);
      const usuario = letra && user !== 'Administrador' ? `${letra}-${user}` : user;
      const modulo = (typeof window !== 'undefined') ? window.location.pathname : '';
      await supabase.from('auditoria').insert([{
        usuario,
        accion: action,
        categoria: 'SISTEMA',
        modulo,
        detalles: { _categoria: 'SISTEMA', _modulo: modulo, texto: details },
      }]);
    } catch (e) {
      console.error('addAuditLog error:', e);
    }
  };

  const updateContribuyente = async (id: string, data: any) => {
    try {
      const parseLevelToArea = (nivel: string) => {
        if (!nivel) return null;
        if (nivel.includes('0 - 50')) return 50;
        if (nivel.includes('51 - 100')) return 100;
        if (nivel.includes('101 - 200')) return 200;
        if (nivel.includes('201')) return 201;
        return null;
      };

      const isComercial = data.Clasificacion === 'Comercial' || data.Clasificacion === 'Industrial';

      const { error } = await supabase
        .from('inmuebles')
        .update({
          contribuyente: data.Contribuyente,
          telefono: data.Telefono,
          correo_electronico: data.Correo,
          direccion: data.DireccionExacta ? `${data.Direccion} | Exacta: ${data.DireccionExacta}` : data.Direccion,
          clasificacion: data.Clasificacion || 'Residencial',
          actividad_principal: data.Clasificacion === 'Residencial' ? data.TipoResidencia : data.ActividadComercial,
          area: isComercial ? parseLevelToArea(data.NivelMetraje) : null,
          mmv_mes: calcularMmvMes(data, ordenanzasConfig),
          agente_retencion: data.esAgenteRetencion === true
        })
        .eq('identidad', id);
        
      if (error) throw error;
      
      // Update local state immediately for better UX
      setContribuyentes(prev => prev.map(c => c.Identidad === id ? { ...c, ...data } : c));
      
      let logMsg = `Se actualizaron los datos del contribuyente: ${data.Contribuyente} (Identidad: ${id})`;
      if (data.Nota?.trim()) logMsg += ` | Nota Simple: ${data.Nota}`;
      if (data.Notas_Adicionales?.trim()) logMsg += ` | Notas Adicionales: ${data.Notas_Adicionales}`;
      
      await addAuditLog('ACTUALIZAR_CONTRIBUYENTE', logMsg);
    } catch (e) {
      console.error("Error updating contribuyente in Supabase:", e);
      throw e;
    }
  };

  const calcularMmvMes = (localOrData: any, config: any) => {
    let mmv = 0;
    const clasificacion = localOrData.uso || localOrData.Clasificacion || localOrData.clasificacion || 'Residencial';
    
    if (clasificacion === 'Residencial') {
      const tipo = localOrData.tipoResidencia || localOrData.TipoResidencia || localOrData.tipo_residencia;
      // Búsqueda exacta primero, luego case-insensitive
      const tarifa = config.tiposResidenciales?.find((t: any) => t.label === tipo)
        || config.tiposResidenciales?.find((t: any) => t.label.toLowerCase().trim() === (tipo || '').toLowerCase().trim());
      if (tarifa) mmv = tarifa.factor;
    } else {
      const act = localOrData.actividad || localOrData.ActividadComercial || localOrData.actividad_principal;
      // Búsqueda case-insensitive de actividad
      const tarifa = config.actividadesComerciales?.find((t: any) => t.label === act)
        || config.actividadesComerciales?.find((t: any) => t.label.toLowerCase().trim() === (act || '').toLowerCase().trim())
        || config.actividadesIndustriales?.find((t: any) => t.label === act)
        || config.actividadesIndustriales?.find((t: any) => t.label.toLowerCase().trim() === (act || '').toLowerCase().trim());
      
      const nivel = localOrData.nivel || localOrData.NivelMetraje || localOrData.nivel_metraje;
      const index = config.nivelesMetraje?.findIndex(
        (n: string) => n.toLowerCase().trim() === (nivel || '').toLowerCase().trim()
      ) ?? -1;
      const safeIndex = index >= 0 ? index : 0;

      if (tarifa && tarifa.factores) {
        mmv += (tarifa.factores[safeIndex] ?? tarifa.factores[0]);
      }

      // Sumar MMV de las actividades adicionales (Nietos)
      const nietosStr = localOrData.actividad_economica_id || localOrData.ActividadEconomicaId || localOrData.actividadesEconomicas;
      if (nietosStr && String(nietosStr) !== '0') {
        const nietos = String(nietosStr).split(',');
        nietos.forEach(nId => {
          // @ts-ignore
          const nName = economicActivitiesBase[nId];
          if (nName) {
            const tarifaN = config.actividadesComerciales?.find((t: any) => t.label === nName)
              || config.actividadesComerciales?.find((t: any) => t.label.toLowerCase().trim() === nName.toLowerCase().trim())
              || config.actividadesIndustriales?.find((t: any) => t.label === nName)
              || config.actividadesIndustriales?.find((t: any) => t.label.toLowerCase().trim() === nName.toLowerCase().trim());
            if (tarifaN && tarifaN.factores) {
              mmv += (tarifaN.factores[safeIndex] ?? tarifaN.factores[0]);
            }
          }
        });
      }
    }
    return mmv;
  };

  const addContribuyente = async (data: any) => {
    try {
      const codCont = data.CodCont || `N-${Math.floor(Math.random() * 100000)}`;
      const rowsToInsert = [];
      
      if (data.isCondominio && data.locales && data.locales.length > 0) {
        data.locales.forEach((local: any) => {
          rowsToInsert.push({
            identidad: data.Identidad,
            contribuyente: data.Contribuyente,
            telefono: data.Telefono,
            correo_electronico: data.Correo,
            direccion: data.DireccionExacta ? `${data.Direccion} | Exacta: ${data.DireccionExacta}` : data.Direccion,
            cod_cont: codCont,
            clasificacion: local.uso === 'Comercial' ? 'Comercial' : 'Residencial',
            actividad_principal: local.uso === 'Comercial' ? local.actividad : (local.tipoResidencia || 'No aplica'),
            inmueble: local.numeracion,
            mmv_mes: calcularMmvMes(local, ordenanzasConfig),
            agente_retencion: data.esAgenteRetencion === true
          });
        });
      } else {
        rowsToInsert.push({
          identidad: data.Identidad,
          contribuyente: data.Contribuyente,
          telefono: data.Telefono,
          correo_electronico: data.Correo,
          direccion: data.DireccionExacta ? `${data.Direccion} | Exacta: ${data.DireccionExacta}` : data.Direccion,
          cod_cont: codCont,
          clasificacion: data.Clasificacion || 'Residencial',
          actividad_principal: data.Clasificacion === 'Residencial' ? data.TipoResidencia : data.ActividadComercial,
          inmueble: 'Principal',
          mmv_mes: calcularMmvMes(data, ordenanzasConfig),
          agente_retencion: data.esAgenteRetencion === true
        });
      }
      
      const { error } = await supabase.from('inmuebles').insert(rowsToInsert);
      
      if (error) throw error;
      
      // Update local state
      await loadAllData();
      await addAuditLog('NUEVO_CONTRIBUYENTE', `Se registró un nuevo contribuyente: ${data.Contribuyente} (Identidad: ${data.Identidad})`);
    } catch (e) {
      console.error("Error adding contribuyente to Supabase:", e);
      throw e;
    }
  };

  const addCertificado = (cert: any) => {
    setCertificados(prev => [cert, ...prev]);
  };

  const aprobarPreRegistro = async (item: number) => {
    try {
      const { error } = await supabase
        .from('pre_registros')
        .delete()
        .eq('id', item);
        
      if (error) throw error;
      setPreRegistros(prev => prev.filter(r => r.id !== item));
      await addAuditLog('APROBAR_PREREGISTRO', `Se procesó el pre-registro ID: ${item}`);
    } catch (e) {
      console.error("Error approving pre-registro:", e);
      throw e;
    }
  };

  const addFactura = async (data: any) => {
    try {
      const { data: result, error } = await supabase
        .from('facturas')
        .insert([{
          referencia: data.referencia || `RECIB-${Math.floor(Math.random() * 1000000)}`,
          contribuyente: data.contribuyente,
          monto: data.monto.toString(),
          emision: data.emision || new Date().toISOString().split('T')[0],
          vencimiento: data.vencimiento || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          estado: 'Pendiente'
        }])
        .select()
        .single();
        
      if (error) throw error;
      if (result) {
        setFacturas(prev => [result, ...prev]);
        await addAuditLog('GENERAR_FACTURA', `Se generó la recibo ${result.referencia} para ${result.contribuyente} por Bs. ${result.monto}`);
      }
    } catch (e) {
      console.error("Error adding recibo:", e);
      throw e;
    }
  };

  return (
    <AppContext.Provider value={{
      inmuebles,
      contribuyentes,
      preRegistros,
      recibos,
      documentos,
      certificados,
      condominios,
      reclamos,
      convenios,
      preLiquidaciones,
      ordenanzasConfig,
      addCertificado,
      addAuditLog,
      auditLogs,
      tcmmv,
      isLoading,
      cacheStatus,
      setInmuebles,
      updateContribuyente,
      addContribuyente,
      aprobarPreRegistro,
      addFactura,
      setPreRegistros,
      setFacturas,
      refreshData,
      refreshUserData,
      clearLocalCache
    }}>
      {/* Barra de progreso discreta — no bloquea la UI (fix: pantalla negra entre módulos) */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-slate-200">
          <div className="h-full bg-blue-500 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '100%' }} />
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
