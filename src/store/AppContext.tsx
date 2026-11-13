'use client';
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import economicActivitiesBase from "@/lib/economicActivitiesBase.json";

import { ordenanzaData } from '@/data/ordenanza';
import { isResidencialInm, isTerrenoInm, calcularMensualidad, actividadConNivel, quitarNivelActividad, resolverFOComercial } from '@/lib/calculos';
import { getFromIndexedDB, saveToIndexedDB, clearAllIndexedDB, CURRENT_CACHE_VERSION } from '@/lib/indexedDbCache';
import { formatPhoneNumber, isFictitiousEmail, getIdentidadVariants } from '@/lib/formatters';
import { logAudit, AuditCategoria, AuditCriticidad } from '@/lib/audit';
import { sanitizeNAParentLinks } from '@/lib/cajaHelpers';

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
  setTcmmv: React.Dispatch<React.SetStateAction<number>>;
  isLoading: boolean;
  cacheStatus: 'cached' | 'syncing' | 'fresh';
  setInmuebles: (inmuebles: any[]) => void;
  updateContribuyente: (id: string, data: any) => Promise<void>;
  addContribuyente: (data: any) => Promise<string | void>;
  aprobarPreRegistro: (item: number) => void;
  addFactura: (recibo: any) => Promise<void>;
  addAuditLog: (action: string, details: string) => Promise<void>;
  auditLogs: any[];
  setPreRegistros: React.Dispatch<React.SetStateAction<any[]>>;
  setFacturas: React.Dispatch<React.SetStateAction<any[]>>;
  refreshData: (forceFresh?: boolean) => Promise<void>;
  refreshUserData: (identidad: string) => Promise<void>;
  siguientesCodigosInmueble: (n: number) => Promise<string[]>;
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
  const tcmmvRef = useRef(tcmmv);
  useEffect(() => {
    tcmmvRef.current = tcmmv;
  }, [tcmmv]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAllData = async (forceFresh = false, silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      
      const isPortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/portal');
      const portalDoc = typeof window !== 'undefined' ? localStorage.getItem('portal_doc') : null;
      
      if (isPortal) {
        // En el portal de contribuyentes cargamos SOLO la data del usuario actual
        let userFacturas = [];
        let userInmuebles = [];
        
        if (portalDoc) {
          const safePortalDoc = portalDoc.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
          const idLimpio = safePortalDoc.replace(/-/g, '');
          const idFmt = idLimpio.charAt(0) + '-' + idLimpio.slice(1);
          const soloNum = safePortalDoc.replace(/\D/g, '');
          const orParts = [
            idFmt ? `identidad.eq.${idFmt}` : '',
            idLimpio ? `identidad.eq.${idLimpio}` : '',
            safePortalDoc ? `identidad.eq.${safePortalDoc}` : '',
            soloNum ? `identidad.eq.${soloNum}` : ''
          ].filter(Boolean).join(',');
          
          if (orParts) {
            const [ { data: facturas }, { data: inmuebles } ] = await Promise.all([
               supabase.from('facturas').select('*').in('estado', ['Pendiente', 'Abonado', 'Por Verificar']).or(orParts),
               supabase.from('inmuebles').select('*').or(orParts)
            ]);
            
            userFacturas = facturas || [];
            userInmuebles = inmuebles || [];
          }
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
            setOrdenanzasConfig({ ...ordenanzaData, ...ordenanza.valor, tiposResidenciales: ordenanzaData.tiposResidenciales });
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
            const eurRes = await fetch('/api/bcv');
            const eurData = await eurRes.json();
            if (eurData && eurData.tcmmv > 10) currentTcmmv = eurData.tcmmv;
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
          // CARGA INSTANTÁNEA (< 50ms) con saneamiento de códigos independientes mal unificados en N/A
          const cleanCachedInms = sanitizeNAParentLinks(cached.inmuebles);
          const detachedCodesMap = new Map<string, any>();
          cached.inmuebles.forEach((orig: any, idx: number) => {
            const after = cleanCachedInms[idx];
            if (orig?.padre_id && !after?.padre_id && after?.inmueble) {
              detachedCodesMap.set(String(after.inmueble).trim().toUpperCase(), after);
            }
          });
          // También verificar si algún inmueble sin padre_id aparece fusionado dentro del CodCont de otro en cached.contribuyentes
          const independentByCode = new Map<string, any>();
          cleanCachedInms.forEach((inm: any) => {
            const c = String(inm?.inmueble || '').trim().toUpperCase();
            if (c && !inm?.padre_id && !['eliminado', 'inactivo', 'desactivado'].includes(String(inm?.estado || '').trim().toLowerCase())) {
              independentByCode.set(c, inm);
            }
          });
          let cleanCachedContribs = Array.isArray(cached.contribuyentes) ? [...cached.contribuyentes] : [];
          if (cleanCachedContribs.length > 0) {
            const extraContribs: any[] = [];
            const primaryCodesExisting = new Set(
              cleanCachedContribs.map((c: any) => String(c?.cod_cont || String(c?.CodCont || '').split(/\s+/)[0] || '').trim().toUpperCase()).filter(Boolean)
            );
            cleanCachedContribs = cleanCachedContribs.map((c: any) => {
              const tokens = String(c?.CodCont || '').split(/\s+/).map((t: string) => t.trim().toUpperCase()).filter(Boolean);
              if (tokens.length <= 1) return c;
              const primary = tokens[0];
              const keptTokens: string[] = [primary];
              for (let i = 1; i < tokens.length; i++) {
                const tk = tokens[i];
                const indInm = detachedCodesMap.get(tk) || independentByCode.get(tk);
                if (indInm && !indInm.padre_id) {
                  if (!primaryCodesExisting.has(tk)) {
                    primaryCodesExisting.add(tk);
                    const rateC = cached.tcmmv || 1000;
                    const esRes = isResidencialInm(indInm);
                    const bMes = calcularMensualidad(indInm, rateC);
                    const m = parseInt(String(indInm.meses_deuda || 0), 10) || 0;
                    const deudaMMV = parseFloat(String(indInm.deuda_mmv || 0)) || 0;
                    const totalMeses = Math.max(0, m > 0 ? m : (deudaMMV > 0 ? 1 : 0));
                    const mesesConMora = Math.max(0, totalMeses - 1);
                    const tasaMora = esRes ? 0.10 : 0.12;
                    const base4 = Math.round((bMes * totalMeses) * 10000) / 10000;
                    const iva4 = esRes ? 0 : Math.round((base4 * 0.16) * 10000) / 10000;
                    const multa4 = Math.round((bMes * tasaMora * mesesConMora) * 10000) / 10000;
                    const ret4 = (!esRes && indInm.agente_retencion === true) ? Math.round((iva4 * 0.75) * 10000) / 10000 : 0;
                    const deudaBs = Math.round(Math.max(0, base4 + iva4 + multa4 - ret4) * 100) / 100;
                    extraContribs.push({
                      ...c,
                      id: indInm.id || `${c.id}-${tk}`,
                      CodCont: tk,
                      cod_cont: tk,
                      Direccion: indInm.direccion || c.Direccion || '',
                      Actividad: indInm.actividad_principal || c.Actividad || 'No aplica',
                      ActividadComercial: indInm.actividad_principal || '',
                      DeudaMMV: deudaMMV,
                      DeudaBs: deudaBs,
                      MesesDeuda: totalMeses,
                      isParentNormal: false,
                      isChildNormal: false,
                      childNormalCount: 0,
                      padre_id: null,
                      isCondoChild: Boolean(indInm.condominio_padre_id),
                      condominio_padre_id: indInm.condominio_padre_id || null,
                      condominio_padre_nombre: null,
                    });
                  }
                } else {
                  keptTokens.push(tk);
                }
              }
              if (keptTokens.length !== tokens.length) {
                return {
                  ...c,
                  CodCont: keptTokens.join(' '),
                  childNormalCount: Math.max(0, keptTokens.length - 1),
                };
              }
              return c;
            });
            if (extraContribs.length > 0) {
              cleanCachedContribs.push(...extraContribs);
            }
          }
          setInmuebles(cleanCachedInms);
          setContribuyentes(cleanCachedContribs);
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
          if (cached.ordenanzasConfig) {
            setOrdenanzasConfig({ ...cached.ordenanzasConfig, tiposResidenciales: ordenanzaData.tiposResidenciales });
          }
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
                cached.tcmmv = apiBcv.tcmmv;
                saveToIndexedDB('naguanagua_full_cache', cached).catch(() => {});
              }
              if (dbPreReg) setPreRegistros(dbPreReg);
              // Sincronizar facturas frescas en vivo desde el servidor para evitar bloqueo RLS
              try {
                const resF = await fetch('/api/admin/facturas?limit=5000');
                const jsonF = await resF.json();
                if (jsonF.success && Array.isArray(jsonF.facturas) && jsonF.facturas.length > 0) {
                  setFacturas(jsonF.facturas);
                }
              } catch (_) {}
            } catch (err) {
              // Silencioso en segundo plano
            }
          })();

          // (Recarga automática en segundo plano DESACTIVADA: saturaba la base de datos con
          //  todas las computadoras descargando ~87.000 registros a la vez. Usar el botón de sincronizar.)

          return;
        }
      }

      setCacheStatus('syncing');

      // Descarga secuencial por cursor. Si la BD está ocupada se detiene y NO guarda caché incompleta.
      let cargaIncompleta = false;
      // Escalonar ligeramente el arranque automático (0–1.5 s) sin demorar cuando el usuario fuerza sincronización manual.
      if (!forceFresh) {
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500)));
      }
      const fetchAllClientParallel = async (table: string, select: string) => {
        const step = 1000;
        // Paginación por cursor (id > último id) usando el índice de la llave primaria:
        // cada bloque cuesta lo mismo sin importar la posición (el OFFSET obligaba a recorrer
        // todas las filas anteriores y saturaba la BD con varias computadoras a la vez).
        const fetchAfter = async (lastId: any): Promise<any[] | null> => {
          for (let intento = 0; intento < 2; intento++) {
            let q = supabase.from(table).select(select).order('id', { ascending: true }).limit(step);
            if (lastId !== null) q = q.gt('id', lastId);
            const { data, error } = await q;
            if (!error) return data || [];
            console.warn(`Reintento ${intento + 1} de ${table}:`, error.message);
            await new Promise(r => setTimeout(r, 3000));
          }
          return null;
        };

        const results: any[] = [];
        let lastId: any = null;
        for (let guard = 0; guard < 200; guard++) {
          const data = await fetchAfter(lastId);
          if (data === null) { cargaIncompleta = true; console.error(`Descarga de ${table} interrumpida (BD ocupada)`); break; }
          if (data.length === 0) break;
          results.push(...data);
          lastId = (data[data.length - 1] as any).id;
          if (data.length < step) break;
        }
        return results;
      };

      // Descarga de facturas activas desde API para bypass de RLS
      let allFacturas: any[] = [];
      try {
        const resF = await fetch('/api/admin/facturas?limit=5000');
        const jsonF = await resF.json();
        if (jsonF.success && Array.isArray(jsonF.facturas)) {
          allFacturas = jsonF.facturas;
        }
      } catch (e) {
        console.error('Error fetching facturas from API in AppContext:', e);
      }

      // Descarga concurrente de Inmuebles y Contribuyentes
      const [rawInmuebles, rawContribuyentes] = await Promise.all([
        fetchAllClientParallel('inmuebles', 'id,identidad,inmueble,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,multa_bs,meses_deuda,agente_retencion,estado,correo_electronico,telefono,es_condominio,condominio_padre_id,padre_id,created_at,notas'),
        fetchAllClientParallel('contribuyentes', '*')
      ]);

      const contribMap = new Map();
      rawContribuyentes.forEach(c => contribMap.set(c.identidad, c));

      const sanitizedRawInmuebles = sanitizeNAParentLinks(rawInmuebles);
      const allInmuebles = sanitizedRawInmuebles.map(inm => ({
        ...inm,
        contribuyentes: contribMap.get(inm.identidad) || null
      }));

      // Contar unidades/locales hijos vinculados por condominio_padre_id
      const hijosCountMap = new Map<string, number>();
      const hijosNormalesCountMap = new Map<string, number>();
      const padresConDeudaEnHijos = new Set<string>();
      allInmuebles.forEach(i => {
        if (i.condominio_padre_id && i.estado !== 'Eliminado') {
          hijosCountMap.set(i.condominio_padre_id, (hijosCountMap.get(i.condominio_padre_id) || 0) + 1);
        }
        if (i.padre_id && i.estado !== 'Eliminado') {
          hijosNormalesCountMap.set(i.padre_id, (hijosNormalesCountMap.get(i.padre_id) || 0) + 1);
          if ((parseFloat(String(i.deuda_mmv || 0)) || 0) > 0 || (parseInt(String(i.meses_deuda || 0), 10) || 0) > 0) {
            padresConDeudaEnHijos.add(i.padre_id);
          }
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
            contribuyente: inm.contribuyente || rawNombre,
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
        supabase.from('pre_registros').select('*').limit(2000),
        supabase.from('documentos').select('*').limit(2000),
        supabase.from('certificados').select('*').limit(2000),
        supabase.from('reclamos').select('*').limit(2000),
        fetch('/api/admin/convenios', { cache: 'no-store' }).then(r => r.json()).then(j => ({ data: j?.data || [] })).catch(() => ({ data: [] as any[] })),
        supabase.from('pre_liquidaciones').select('*').limit(2000),
        fetch('/api/admin/auditoria?limit=200', { cache: 'no-store' }).then(r => r.json()).then(j => ({ data: j?.data || [] })).catch(() => ({ data: [] as any[] })),
        supabase.from('sistema_config').select('*'),
        fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' }).then(res => res.json()).catch(() => ({ tcmmv: 0 }))
      ]);

      let manualTcmmv = 0;
      let semanalTcmmv = 0;
      let ordenanzaConfigValue = ordenanzaData;
      if (dbConfig) {
        const ordenanza = dbConfig.find(c => c.id === 'tarifas_ordenanza');
        if (ordenanza && ordenanza.valor) {
          ordenanzaConfigValue = { ...ordenanzaData, ...ordenanza.valor, tiposResidenciales: ordenanzaData.tiposResidenciales };
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
          const eurRes = await fetch('/api/bcv');
          const eurData = await eurRes.json();
          if (eurData && eurData.tcmmv > 10 && eurData.tcmmv < 100000) {
            currentTcmmv = eurData.tcmmv;
          }
        } catch (e) {
          console.error("BCV API Fallback failed", e);
        }
      }

      setTcmmv(currentTcmmv);
      setAuditLogs(dbAuditLogs || []);

      // Información del padre para condominios (resolver nombre de condominio padre)
      const parentInfoMap = new Map<string, { nombre: string; isComercial: boolean }>();

      (apiCondominios || []).forEach((c: any) => {
        const cCod = c.codigo_inmueble || c.id;
        const cName = c.nombre || c.razon_social || 'Condominio';
        if (cCod) {
          parentInfoMap.set(cCod, { nombre: cName, isComercial: true });
        }
      });

      allInmuebles.forEach((row: any) => {
        const cod = row.inmueble || row.cod_cont;
        if (cod) {
          const rawName = row.contribuyentes?.nombre || row.nombre || row.contribuyente || 'Condominio';
          const isCom = (row.tipo || '').toUpperCase().includes('COMERCIAL') ||
                        (row.clasificacion || '').toUpperCase().includes('COMERCIAL') ||
                        rawName.toUpperCase().includes('COMERCIAL') ||
                        rawName.toUpperCase().includes('C.C.');
          if (!parentInfoMap.has(cod)) {
            parentInfoMap.set(cod, { nombre: rawName, isComercial: isCom });
          }
          if (row.id && !parentInfoMap.has(row.id)) {
            parentInfoMap.set(row.id, { nombre: rawName, isComercial: isCom });
          }
        }
      });

      const mappedInmuebles = allInmuebles.map((row: any) => {
        const pInfo = row.condominio_padre_id ? parentInfoMap.get(row.condominio_padre_id) : null;
        return {
          ...row,
          'Inmueble': row.inmueble || row.cod_cont,
          'Clasificacion': row.clasificacion || 'Residencial',
          'Tipo': 'Urbano',
          'Saldo': (parseFloat(row.deuda_congelada_bs || 0) + (parseFloat(row.deuda_mmv || 0) * 57 * currentTcmmv)).toFixed(2),
          'DeudaMMV': parseFloat(row.deuda_mmv || 0),
          'DeudaCongelada': parseFloat(row.deuda_congelada_bs || 0),
          'Cant Inmuebles': 1,
          'Actividad Principal': row.actividad || 'No aplica',
          'Direccion': row.direccion,
          condominio_padre_id: row.condominio_padre_id || null,
          condominio_padre_nombre: pInfo?.nombre || null,
          padre_id: row.padre_id || null,
          padre_nombre: row.padre_id ? parentInfoMap.get(row.padre_id)?.nombre || null : null
        };
      });
      setInmuebles(mappedInmuebles);
      setCondominios(apiCondominios);

      const identidadesConInmueble = new Set((allInmuebles || []).map((i: any) => i.identidad).filter(Boolean));

      const sortedInmuebles = [...allInmuebles].sort((a: any, b: any) => {
        const aElim = ['eliminado', 'inactivo', 'desactivado'].includes(String(a.estado || '').trim().toLowerCase());
        const bElim = ['eliminado', 'inactivo', 'desactivado'].includes(String(b.estado || '').trim().toLowerCase());
        if (aElim !== bElim) return aElim ? 1 : -1;
        const aIsCondoChild = Boolean(a.condominio_padre_id);
        const bIsCondoChild = Boolean(b.condominio_padre_id);
        if (aIsCondoChild !== bIsCondoChild) return aIsCondoChild ? 1 : -1;
        const aIsNA = a.actividad_principal === 'N/A';
        const bIsNA = b.actividad_principal === 'N/A';
        if (aIsNA !== bIsNA) return aIsNA ? -1 : 1;
        const aIsChild = Boolean(a.padre_id);
        const bIsChild = Boolean(b.padre_id);
        if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
        return String(a.inmueble || '').localeCompare(String(b.inmueble || ''));
      });

      const map = new Map();
      sortedInmuebles.forEach((row: any) => {
        const cod = row.inmueble || row.cod_cont;
        const isCondoChild = Boolean(row.condominio_padre_id);
        const pInfo = row.condominio_padre_id ? parentInfoMap.get(row.condominio_padre_id) : null;
        const isCommercialChild = isCondoChild && (pInfo?.isComercial || (row.tipo || '').toUpperCase().includes('COMERCIAL'));
        const isParentCondo = Boolean(row.es_condominio || row.clasificacion === 'Condominio' || (hijosCountMap.get(cod) || 0) > 0);
        const childCount = hijosCountMap.get(cod) || parseInt(row.cant_inmuebles || '1') || 1;
        
        const childNormalCount = hijosNormalesCountMap.get(cod) || 0;
        const isParentNormal = childNormalCount > 0;
        const isChildNormal = Boolean(row.padre_id);
        const pNormalInfo = row.padre_id ? parentInfoMap.get(row.padre_id) : null;

        // Regla Condominios Comerciales:
        // Aseo urbano se paga separado por condominio (centralizado en el padre).
        // Las multas se pagan por la oficina individual.
        // Inmuebles "Eliminado", "Inactivo" o con actividad TERRENO no suman deuda ni multas (ellos no pagan).
        const esEliminado = ['eliminado', 'inactivo', 'desactivado'].includes(String(row.estado || '').trim().toLowerCase());
        const esTerreno = isTerrenoInm(row);
        // Si es un contenedor matriz N/A cuyos hijos activos ya tienen su deuda desglosada, no sumar el contenedor para evitar duplicar la deuda
        const isNAContainerWithChildDebt = isParentNormal && /^(N\/?A|NA)$/i.test(String(row.actividad_principal || '').trim()) && padresConDeudaEnHijos.has(cod);
        const rowDeudaMMV = (isCommercialChild || esEliminado || esTerreno || isNAContainerWithChildDebt) ? 0 : parseFloat(row.deuda_mmv || 0);
        const rowMultaBs = (isParentCondo || esEliminado || esTerreno || isNAContainerWithChildDebt) ? 0 : parseFloat(row.multa_bs || 0);
        const rowCongelada = (esEliminado || esTerreno || isNAContainerWithChildDebt) ? 0 : parseFloat(row.deuda_congelada_bs || 0);
        
        // Cálculo canónico idéntico a Caja (Base + IVA + Multa - Retención 75% - Saldo a favor)
        let rowDeudaBs = 0;
        if (!esEliminado && !esTerreno && !isNAContainerWithChildDebt) {
          if (isCommercialChild) {
            rowDeudaBs = rowMultaBs + rowCongelada;
          } else {
            const esRes = isResidencialInm(row);
            const bMes = calcularMensualidad(row, currentTcmmv);
            const m = parseInt(String(row.meses_deuda || 0), 10) || 0;
            const deudaMMV = parseFloat(String(row.deuda_mmv || 0)) || 0;
            const totalMeses = Math.max(0, m > 0 ? m : (deudaMMV > 0 ? 1 : 0));
            const mesesConMora = Math.max(0, totalMeses - 1);
            const tasaMora = esRes ? 0.10 : 0.12;

            const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
            const base2 = r2(bMes * totalMeses);
            const iva2 = esRes ? 0 : r2(base2 * 0.16);
            const multa2 = r2(bMes * tasaMora * mesesConMora);
            const ret2 = (!esRes && row.agente_retencion === true) ? r2(iva2 * 0.75) : 0;
            const saldoFavor = parseFloat(String(row.saldo_favor_bs || 0)) || 0;

            rowDeudaBs = r2(Math.max(0, base2 + iva2 + multa2 + rowCongelada + rowMultaBs - ret2 - saldoFavor));
          }
        }

        // Agrupación jerárquica:
        // Se unifican los contenedores N/A con sus actividades hijas vinculadas por padre_id.
        // Los locales de condominios se agrupan en su contenedor local padre_id (NO en el condominio matriz).
        // Los inmuebles independientes NUNCA se unifican entre sí por cédula/RIF.
        const parentKey = row.padre_id && parentInfoMap.has(row.padre_id)
          ? row.padre_id
          : null;
        const groupKey = parentKey || cod || row.id || row.identidad;

        if (groupKey && !map.has(groupKey)) {
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
          const rawEmail = (row.contribuyentes?.email && !isFictitiousEmail(row.contribuyentes.email))
            ? row.contribuyentes.email
            : (row.correo_electronico || row.email || row.correo);
          const cleanEmail = isFictitiousEmail(rawEmail) ? '' : (rawEmail || '').trim();

          map.set(groupKey, {
            id: row.id,
            Identidad: row.identidad,
            Contribuyente: row.contribuyentes?.nombre || row.nombre || row.contribuyente || 'Sin Nombre',
            Telefono: cleanTel || 'No registrado',
            Correo: cleanEmail || 'No registrado',
            CodCont: cod,
            cod_cont: cod,
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
              const dirInm = row.direccion;
              if (dirInm && dirInm.trim().length > 3 && !dirInm.trim().startsWith('0 0') && !dirInm.trim().startsWith('2 000')) {
                return dirInm.trim();
              }
              const dirFiscal = row.contribuyentes?.direccion;
              if (dirFiscal && dirFiscal.trim().length > 3 && !dirFiscal.startsWith('0 0') && !dirFiscal.startsWith('2 000')) {
                return dirFiscal.trim();
              }
              return (dirInm || dirFiscal || '').trim();
            })(),
            Observaciones: row.contribuyentes?.observaciones || '',
            Actividad: act || 'No aplica',
            ActividadComercial: (clase.includes('Comercial') || clase === 'Industrial' || clase === 'Mixto') ? (act || '') : '',
            TipoResidencia: clase === 'Residencial' ? (act || '') : '',
            Clasificacion: clase,
            esAgenteRetencion: row.agente_retencion === true,
            _hasNonCondoInm: !isCondoChild,
            _hasNonCondoAgente: !isCondoChild && row.agente_retencion === true,
            _hasAnyAgente: row.agente_retencion === true,
            SaldoFavor: parseFloat(row.saldo_favor_bs || '0'),
            DeudaMMV: rowDeudaMMV,
            MultaBs: rowMultaBs,
            DeudaCongelada: rowCongelada,
            DeudaBs: rowDeudaBs,
            MesesDeuda: parseInt(row.meses_deuda || '0'),
            Estado: row.estado || 'Activo',
            FechaRegistro: row.created_at || null,
            isCondominio: isParentCondo,
            es_condominio: isParentCondo,
            cant_inmuebles: isParentCondo ? childCount : 1,
            unidadesCount: isParentCondo ? childCount : 1,
            isCondoChild: isCondoChild,
            condominio_padre_id: row.condominio_padre_id || null,
            condominio_padre_nombre: pInfo?.nombre || null,
            isCommercialChild: isCommercialChild,
            padre_id: row.padre_id || null,
            padre_nombre: pNormalInfo?.nombre || null,
            isParentNormal: isParentNormal,
            isChildNormal: isChildNormal,
            childNormalCount: childNormalCount
          });
        } else if (groupKey && map.has(groupKey)) {
          const existing = map.get(groupKey);
          existing.SaldoFavor += parseFloat(row.saldo_favor_bs || '0');
          existing.DeudaMMV += rowDeudaMMV;
          existing.DeudaCongelada += rowCongelada;
          existing.MultaBs = (existing.MultaBs || 0) + rowMultaBs;
          existing.DeudaBs = (existing.DeudaBs || 0) + rowDeudaBs;
          if (!isCondoChild) existing._hasNonCondoInm = true;
          if (!isCondoChild && row.agente_retencion === true) existing._hasNonCondoAgente = true;
          if (row.agente_retencion === true) existing._hasAnyAgente = true;
          existing.esAgenteRetencion = existing._hasNonCondoInm ? Boolean(existing._hasNonCondoAgente) : Boolean(existing._hasAnyAgente);
          if (!existing.condominio_padre_id && row.condominio_padre_id) {
            existing.condominio_padre_id = row.condominio_padre_id;
            existing.condominio_padre_nombre = pInfo?.nombre || null;
            existing.isCondoChild = true;
          }
          if (isParentCondo) {
            existing.isCondominio = true;
            existing.es_condominio = true;
            existing.cant_inmuebles = Math.max(existing.cant_inmuebles || 1, childCount);
            existing.unidadesCount = Math.max(existing.unidadesCount || 1, childCount);
          }
          if (!existing.padre_id && row.padre_id) {
            existing.padre_id = row.padre_id;
            existing.padre_nombre = pNormalInfo?.nombre || null;
            existing.isChildNormal = true;
          }
          if (isParentNormal) {
            existing.isParentNormal = true;
            existing.childNormalCount = Math.max(existing.childNormalCount || 0, childNormalCount);
          }
          const rowEstado = row.estado || 'Activo';
          if (rowEstado === 'Activo') {
            const eraInactivo = existing.Estado !== 'Activo';
            existing.Estado = 'Activo';
            if (eraInactivo || !existing.Actividad || existing.Actividad === 'No aplica') {
              existing.Actividad = row.actividad_principal || existing.Actividad;
              existing.ActividadComercial = row.actividad_principal || existing.ActividadComercial;
              if (row.inmueble) existing.CodCont = row.inmueble;
            }
            if (row.direccion && (!existing.Direccion || existing.Direccion === '0 0')) {
              existing.Direccion = row.direccion;
            }
          } else if (existing.Estado !== 'Activo') {
            if (rowEstado === 'Eliminado') {
              existing.Estado = 'Eliminado';
            } else if (rowEstado === 'Inactivo' && existing.Estado !== 'Eliminado') {
              existing.Estado = 'Inactivo';
            }
          }
          existing.MesesDeuda = Math.max(existing.MesesDeuda || 0, parseInt(row.meses_deuda || '0'));
          const rowIsEliminado = ['eliminado', 'inactivo', 'desactivado', 'baja'].includes(String(row.estado || '').trim().toLowerCase());
          if (cod && !rowIsEliminado && !existing.CodCont.includes(cod)) {
            existing.CodCont += " " + cod;
          }
          map.set(groupKey, existing);
        }
      });

      // Asegurar inclusión de contribuyentes de la tabla 'contribuyentes' que no tengan inmuebles aún o sean recién registrados
      rawContribuyentes.forEach((c: any) => {
        if (c.identidad && !identidadesConInmueble.has(c.identidad) && !map.has(c.identidad)) {
          const idVars = getIdentidadVariants(c.identidad);
          const matchedInm = (allInmuebles || []).find((i: any) => idVars.includes(i.identidad));
          const codigoReal = matchedInm?.inmueble || matchedInm?.cod_cont || (c.cod_cont && c.cod_cont !== c.identidad ? c.cod_cont : null);
          const actReal = matchedInm?.actividad_principal || (c.actividad && c.actividad !== 'No aplica' ? c.actividad : 'Sin Inmueble');
          const claseReal = matchedInm?.clasificacion || matchedInm?.tipo || c.clasificacion || 'Individual';

          const rawEmail = c.email || c.correo_electronico || c.correo;
          const cleanEmail = isFictitiousEmail(rawEmail) ? '' : (rawEmail || '').trim();
          map.set(c.identidad, {
            Identidad: c.identidad,
            Contribuyente: c.nombre || 'Sin Nombre',
            Telefono: formatPhoneNumber(c.telefono) || 'No registrado',
            Correo: cleanEmail || 'No registrado',
            CodCont: codigoReal || 'Pendiente',
            cod_cont: codigoReal || 'Pendiente',
            Direccion: c.direccion || matchedInm?.direccion || '',
            Observaciones: c.observaciones || '',
            Actividad: actReal,
            ActividadComercial: '',
            TipoResidencia: '',
            Clasificacion: claseReal,
            SaldoFavor: parseFloat(matchedInm?.saldo_favor_bs || '0'),
            DeudaMMV: parseFloat(matchedInm?.deuda_mmv || '0'),
            DeudaCongelada: parseFloat(matchedInm?.deuda_congelada_bs || '0'),
            DeudaBs: 0,
            MesesDeuda: parseInt(matchedInm?.meses_deuda || '0'),
            Estado: matchedInm?.estado || c.estado || 'Activo',
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
      const formattedConvenios = (dbConvenios || []).map((c: any) => ({
        ...c,
        contribuyente: (mappedInmuebles || []).find((i: any) => i.identidad === c.identidad)?.contribuyente || c.identidad,
        monto_total: typeof c.monto_total === 'number' ? `${c.monto_total.toFixed(2)} Bs` : (c.monto_total || '0.00 Bs'),
        inicio: c.convenios_cuotas?.[0]?.fecha || (c.created_at ? c.created_at.slice(0, 10) : ''),
        detalle_cuotas: JSON.stringify(c.convenios_cuotas || [])
      }));
      setConvenios(formattedConvenios);
      if (dbPreLiquidaciones) setPreLiquidaciones(dbPreLiquidaciones);

      // Guardar en caché persistente IndexedDB para cargas instantáneas subsiguientes
      // (solo si la descarga fue COMPLETA: una caché con huecos ocultaría contribuyentes)
      if (typeof window !== 'undefined' && !cargaIncompleta) {
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
          convenios: formattedConvenios,
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
        const rateNow = tcmmvRef.current || tcmmv || 1;
        const normalizedFreshInms = freshInms.map((row: any) => ({
          ...row,
          'Inmueble': row.inmueble || row.cod_cont,
          'Contribuyente': row.contribuyente || row.nombre || '',
          'Identidad': row.identidad || '',
          'Direccion': row.direccion || '',
          'Clasificacion': row.clasificacion || 'Residencial',
          'Actividad': row.actividad_principal || row.actividad || 'No aplica',
          'Actividad Principal': row.actividad_principal || row.actividad || 'No aplica',
          'Metros': row.metros || row.area_m2 || 0,
          'Tipo': row.tipo || 'Urbano',
          'Saldo': (parseFloat(row.deuda_congelada_bs || 0) + (parseFloat(row.deuda_mmv || 0) * 57 * rateNow)).toFixed(2),
          'DeudaMMV': parseFloat(row.deuda_mmv || 0),
          'DeudaCongelada': parseFloat(row.deuda_congelada_bs || 0),
          'Cant Inmuebles': parseInt(row.cant_inmuebles || '1') || 1,
          condominio_padre_id: row.condominio_padre_id || null,
          padre_id: row.padre_id || null,
        }));

        const freshCodesSet = new Set(normalizedFreshInms.map((r: any) => String(r.inmueble || '').toUpperCase()).filter(Boolean));
        setInmuebles(prev => {
          const next = [
            ...prev.filter(i =>
              (i.identidad || '').replace(/-/g, '').toUpperCase() !== idClean &&
              !freshCodesSet.has(String(i.inmueble || '').toUpperCase())
            ),
            ...normalizedFreshInms
          ];
          try {
            getFromIndexedDB<any>('naguanagua_full_cache').then(cached => {
              if (cached) {
                cached.inmuebles = next;
                saveToIndexedDB('naguanagua_full_cache', cached).catch(() => {});
              }
            }).catch(() => {});
          } catch (_) {}
          return next;
        });
      }

      // Refrescar también las facturas de este contribuyente
      const { data: freshFacts } = await supabase
        .from('facturas')
        .select('*')
        .in('estado', ['Pendiente', 'Abonado', 'Por Verificar'])
        .or(`identidad.eq.${identidad},identidad.eq.${idClean}`);

      if (freshFacts) {
        setFacturas(prev => {
          const next = [
            ...prev.filter(f =>
              (f.identidad || '').replace(/-/g, '').toUpperCase() !== idClean
            ),
            ...freshFacts
          ];
          try {
            getFromIndexedDB<any>('naguanagua_full_cache').then(cached => {
              if (cached) {
                cached.facturas = next;
                saveToIndexedDB('naguanagua_full_cache', cached).catch(() => {});
              }
            }).catch(() => {});
          } catch (_) {}
          return next;
        });
      }

      // Refrescar también los datos del contribuyente (correo, teléfono, nombre)
      const { data: freshContrib } = await supabase
        .from('contribuyentes')
        .select('*')
        .or(`identidad.eq.${identidad},identidad.eq.${idClean}`)
        .limit(1)
        .maybeSingle();

      if (freshContrib || (freshInms && freshInms.length > 0)) {
        const rateNow = tcmmvRef.current || tcmmv || 1;
        const calcSingleInmDebt = (row: any) => {
          const esElim = ['eliminado', 'inactivo', 'desactivado'].includes(String(row.estado || '').trim().toLowerCase());
          const esTerreno = isTerrenoInm(row);
          const isCondoChild = Boolean(row.condominio_padre_id);
          const isCommercialChild = isCondoChild && (row.tipo || '').toUpperCase().includes('COMERCIAL');
          const isParentCondo = Boolean(row.es_condominio || row.clasificacion === 'Condominio');
          const deudaMMV = (isCommercialChild || esElim || esTerreno) ? 0 : parseFloat(row.deuda_mmv || 0);
          const multaBs = (isParentCondo || esElim || esTerreno) ? 0 : parseFloat(row.multa_bs || 0);
          const congelada = (esElim || esTerreno) ? 0 : parseFloat(row.deuda_congelada_bs || 0);
          const saldoFavor = parseFloat(String(row.saldo_favor_bs || 0)) || 0;
          const meses = (esElim || esTerreno) ? 0 : (parseInt(String(row.meses_deuda || 0), 10) || 0);
          let deudaBs = 0;
          if (!esElim && !esTerreno) {
            if (isCommercialChild) {
              deudaBs = multaBs + congelada;
            } else {
              const esRes = isResidencialInm(row);
              const bMes = calcularMensualidad(row, rateNow);
              const totalMeses = Math.max(0, meses > 0 ? meses : (deudaMMV > 0 ? 1 : 0));
              const mesesConMora = Math.max(0, totalMeses - 1);
              const tasaMora = esRes ? 0.10 : 0.12;
              const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
              const base2 = r2(bMes * totalMeses);
              const iva2 = esRes ? 0 : r2(base2 * 0.16);
              const multa2 = r2(bMes * tasaMora * mesesConMora);
              const ret2 = (!esRes && row.agente_retencion === true) ? r2(iva2 * 0.75) : 0;
              deudaBs = r2(Math.max(0, base2 + iva2 + multa2 + congelada + multaBs - ret2 - saldoFavor));
            }
          }
          return { deudaMMV, multaBs, congelada, saldoFavor, meses, deudaBs };
        };

        const freshInmCodesSet = new Set((freshInms || []).map((i: any) => String(i.inmueble || '').toUpperCase()).filter(Boolean));
        setContribuyentes(prev => {
          const sameIdRows = prev.filter(c => (c.Identidad || '').replace(/-/g, '').toUpperCase() === idClean);
          return prev.map(c => {
            const cId = (c.Identidad || '').replace(/-/g, '').toUpperCase();
            const cCodes = String(c.CodCont || c.cod_cont || '').trim().split(/\s+/).map(s => s.toUpperCase()).filter(Boolean);
            const matchesByCode = cCodes.length > 0 && cCodes.some(code => freshInmCodesSet.has(code));
            if (cId === idClean || matchesByCode) {
              const inmsForRow = (freshInms && freshInms.length > 0)
                ? ((sameIdRows.length > 1 || matchesByCode) && cCodes.length > 0
                    ? freshInms.filter((i: any) => cCodes.includes(String(i.inmueble || '').toUpperCase()) || (i.padre_id && cCodes.includes(String(i.padre_id || '').toUpperCase())))
                    : freshInms)
                : [];
              const targetInms = inmsForRow.length > 0 ? inmsForRow : (freshInms || []);
              let sumDeudaBs = c.DeudaBs ?? 0;
              let maxMeses = c.MesesDeuda ?? 0;
              let sumMMV = c.DeudaMMV ?? 0;
              let sumMulta = c.MultaBs ?? 0;
              let sumCongelada = c.DeudaCongelada ?? 0;
              let sumSaldoFavor = c.SaldoFavor ?? 0;

              if (targetInms.length > 0) {
                const stats = targetInms.map(calcSingleInmDebt);
                sumDeudaBs = Math.round(stats.reduce((acc, s) => acc + s.deudaBs, 0) * 100) / 100;
                maxMeses = stats.reduce((acc, s) => Math.max(acc, s.meses), 0);
                sumMMV = stats.reduce((acc, s) => acc + s.deudaMMV, 0);
                sumMulta = stats.reduce((acc, s) => acc + s.multaBs, 0);
                sumCongelada = stats.reduce((acc, s) => acc + s.congelada, 0);
                sumSaldoFavor = stats.reduce((acc, s) => acc + s.saldoFavor, 0);
              }

              const matchedPrimaryInm = targetInms[0];
              return {
                ...c,
                Identidad: matchedPrimaryInm?.identidad || freshContrib?.identidad || c.Identidad,
                Correo: freshContrib?.email || freshContrib?.correo_electronico || matchedPrimaryInm?.correo_electronico || c.Correo,
                Telefono: freshContrib?.telefono || matchedPrimaryInm?.telefono || c.Telefono,
                Contribuyente: matchedPrimaryInm?.contribuyente || freshContrib?.nombre || c.Contribuyente,
                Direccion: matchedPrimaryInm?.direccion || freshContrib?.direccion || c.Direccion,
                DeudaBs: sumDeudaBs,
                MesesDeuda: maxMeses,
                DeudaMMV: sumMMV,
                MultaBs: sumMulta,
                DeudaCongelada: sumCongelada,
                SaldoFavor: sumSaldoFavor,
                esAgenteRetencion: freshInms ? (
                  freshInms.some((i: any) => !i.condominio_padre_id)
                    ? freshInms.some((i: any) => !i.condominio_padre_id && i.agente_retencion === true)
                    : freshInms.some((i: any) => i.agente_retencion === true)
                ) : c.esAgenteRetencion
              };
            }
            return c;
          });
        });
      }

      // Refrescar convenios de este contribuyente
      const { data: freshConvs } = await fetch(`/api/admin/convenios?identidad=${encodeURIComponent(identidad)}`, { cache: 'no-store' })
        .then(r => r.json())
        .catch(() => ({ data: [] }));

      if (freshConvs) {
        setConvenios(prev => {
          const next = [
            ...prev.filter(c => (c.identidad || '').replace(/-/g, '').toUpperCase() !== idClean),
            ...freshConvs.map((c: any) => ({
              ...c,
              monto_total: typeof c.monto_total === 'number' ? `${c.monto_total.toFixed(2)} Bs` : (c.monto_total || '0.00 Bs'),
              inicio: c.convenios_cuotas?.[0]?.fecha || (c.created_at ? c.created_at.slice(0, 10) : ''),
              detalle_cuotas: JSON.stringify(c.convenios_cuotas || [])
            }))
          ];
          try {
            getFromIndexedDB<any>('naguanagua_full_cache').then(cached => {
              if (cached) {
                cached.convenios = next;
                saveToIndexedDB('naguanagua_full_cache', cached).catch(() => {});
              }
            }).catch(() => {});
          } catch (_) {}
          return next;
        });
      }
    } catch (error) {
      console.error('Error en refreshUserData:', error);
    }
  };

  useEffect(() => {
    loadAllData();

    // ── SUPABASE REALTIME SUBSCRIPTION (SINCRONIZACIÓN EN VIVO MULTI-OPERADOR) ──
    const channel = supabase
      .channel('realtime-multioperador-naguanagua')
      // 1. Facturas y recibos en vivo: cuando un operador cobra, todos los demás lo ven pagado al instante
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'facturas' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setFacturas(prev => {
              if (prev.some(f => f.id === payload.new.id || f.referencia === payload.new.referencia)) return prev;
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setFacturas(prev => prev.map(f => (f.id === payload.new.id || f.referencia === payload.new.referencia) ? { ...f, ...payload.new } : f));
          } else if (payload.eventType === 'DELETE') {
            setFacturas(prev => prev.filter(f => f.id !== payload.old.id && f.referencia !== payload.old.referencia));
          }
        }
      )
      // 2. Inmuebles en vivo: cuando se limpia deuda_mmv, multas o estado
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inmuebles' },
        (payload: any) => {
          const updated = payload.new;
          if (!updated) return;
          const rateNow = tcmmvRef.current || 1;
          const calcInmMetrics = (row: any) => {
            const esElim = ['eliminado', 'inactivo', 'desactivado'].includes(String(row.estado || '').trim().toLowerCase());
            const esTerreno = isTerrenoInm(row);
            const isCondoChild = Boolean(row.condominio_padre_id);
            const isCommercialChild = isCondoChild && (row.tipo || '').toUpperCase().includes('COMERCIAL');
            const isParentCondo = Boolean(row.es_condominio || row.clasificacion === 'Condominio');
            const deudaMMV = (isCommercialChild || esElim || esTerreno) ? 0 : parseFloat(row.deuda_mmv || 0);
            const multaBs = (isParentCondo || esElim || esTerreno) ? 0 : parseFloat(row.multa_bs || 0);
            const congelada = (esElim || esTerreno) ? 0 : parseFloat(row.deuda_congelada_bs || 0);
            const saldoFavor = parseFloat(String(row.saldo_favor_bs || 0)) || 0;
            const meses = (esElim || esTerreno) ? 0 : (parseInt(String(row.meses_deuda || 0), 10) || 0);
            let deudaBs = 0;
            if (!esElim && !esTerreno) {
              if (isCommercialChild) {
                deudaBs = multaBs + congelada;
              } else {
                const esRes = isResidencialInm(row);
                const bMes = calcularMensualidad(row, rateNow);
                const totalMeses = Math.max(0, meses > 0 ? meses : (deudaMMV > 0 ? 1 : 0));
                const mesesConMora = Math.max(0, totalMeses - 1);
                const tasaMora = esRes ? 0.10 : 0.12;

                const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
                const base2 = r2(bMes * totalMeses);
                const iva2 = esRes ? 0 : r2(base2 * 0.16);
                const multa2 = r2(bMes * tasaMora * mesesConMora);
                const ret2 = (!esRes && row.agente_retencion === true) ? r2(iva2 * 0.75) : 0;
                deudaBs = r2(Math.max(0, base2 + iva2 + multa2 + congelada + multaBs - ret2 - saldoFavor));
              }
            }
            return { deudaMMV, multaBs, congelada, saldoFavor, meses, deudaBs };
          };

          setInmuebles(prev => {
            const nextInms = prev.map(inm => (inm.id === updated.id || inm.inmueble === updated.inmueble) ? {
              ...inm,
              ...updated,
              'Inmueble': updated.inmueble || updated.cod_cont || inm['Inmueble'],
              'Saldo': (parseFloat(updated.deuda_congelada_bs || 0) + (parseFloat(updated.deuda_mmv || 0) * 57 * rateNow)).toFixed(2),
              'DeudaMMV': parseFloat(updated.deuda_mmv || 0),
              'DeudaCongelada': parseFloat(updated.deuda_congelada_bs || 0),
            } : inm);

            const updIdClean = (updated.identidad || '').replace(/-/g, '').toUpperCase();
            setContribuyentes(prevCont => {
              const sameIdRows = prevCont.filter(c => (c.Identidad || '').replace(/-/g, '').toUpperCase() === updIdClean);
              return prevCont.map(c => {
                const cIdClean = (c.Identidad || '').replace(/-/g, '').toUpperCase();
                const cCodes = String(c.CodCont || c.cod_cont || '').trim().split(/\s+/).filter(Boolean);
                const matchesCode = updated.inmueble && cCodes.includes(updated.inmueble);
                const matchesId = updIdClean && cIdClean === updIdClean && (sameIdRows.length <= 1 || cCodes.length === 0);

                if (matchesCode || matchesId) {
                  const relevantInms = nextInms.filter(i => {
                    if (sameIdRows.length > 1 && cCodes.length > 0) {
                      return cCodes.includes(i.inmueble) || (i.padre_id && cCodes.includes(i.padre_id));
                    }
                    const iIdClean = (i.identidad || '').replace(/-/g, '').toUpperCase();
                    return (updIdClean && iIdClean === updIdClean) || (updated.inmueble && cCodes.includes(i.inmueble));
                  });
                  const listToSum = relevantInms.length > 0 ? relevantInms : [updated];
                  const metrics = listToSum.map(calcInmMetrics);
                  const totalDeudaMMV = metrics.reduce((acc, m) => acc + m.deudaMMV, 0);
                  const totalMultaBs = metrics.reduce((acc, m) => acc + m.multaBs, 0);
                  const totalCongelada = metrics.reduce((acc, m) => acc + m.congelada, 0);
                  const totalDeudaBs = Math.round(metrics.reduce((acc, m) => acc + m.deudaBs, 0) * 100) / 100;
                  const maxMeses = metrics.reduce((acc, m) => Math.max(acc, m.meses), 0);
                  const totalSaldoFavor = metrics.reduce((acc, m) => acc + m.saldoFavor, 0);

                  return {
                    ...c,
                    DeudaMMV: totalDeudaMMV,
                    MultaBs: totalMultaBs,
                    DeudaCongelada: totalCongelada,
                    DeudaBs: totalDeudaBs,
                    MesesDeuda: maxMeses,
                    SaldoFavor: totalSaldoFavor,
                    Estado: listToSum.some(i => (i.estado || 'Activo') === 'Activo') ? 'Activo' : (updated.estado || c.Estado)
                  };
                }
                return c;
              });
            });

            return nextInms;
          });
        }
      )
      // 3. Pre-registros y solicitudes en tiempo real
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pre_registros' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setPreRegistros(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setPreRegistros(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
          } else if (payload.eventType === 'DELETE') {
            setPreRegistros(prev => prev.filter(p => p.id !== payload.old.id));
          }
        }
      )
      // 4. Convenios de pago en tiempo real
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'convenios_pago' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setConvenios(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setConvenios(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // addAuditLog: integrado con sistema unificado de trazabilidad y auditoría
  const addAuditLog = async (action: string, details: string) => {
    try {
      let cat: AuditCategoria = 'SISTEMA';
      let crit: AuditCriticidad = 'MEDIA';
      const upper = action.toUpperCase();
      if (upper.includes('CONTRIBUYENTE') || upper.includes('PREREGISTRO')) {
        cat = 'CONTRIBUYENTE';
        crit = (upper.includes('ELIMINAR') || upper.includes('DESACTIVAR')) ? 'CRITICA' : 'MEDIA';
      } else if (upper.includes('FACTURA') || upper.includes('RECIBO') || upper.includes('FACTURACION')) {
        cat = 'FACTURACION';
        crit = upper.includes('MASIVA') ? 'ALTA' : 'MEDIA';
      } else if (upper.includes('DEUDA') || upper.includes('AJUST')) {
        cat = 'DEUDA';
        crit = 'CRITICA';
      } else if (upper.includes('CENSO')) {
        cat = 'INMUEBLE';
        crit = 'MEDIA';
      }
      
      let parsedDetails: Record<string, any> = { texto: details };
      try {
        if (typeof details === 'string' && (details.startsWith('{') || details.startsWith('['))) {
          parsedDetails = JSON.parse(details);
        }
      } catch (_) {}

      await logAudit(action, parsedDetails, cat, crit);
    } catch (e) {
      console.error('addAuditLog error:', e);
    }
  };

  // ── Helpers de registro/edición ─────────────────────────────────────────
  const DESOCUPADO_LABEL = 'INMUEBLES Y LOCALES DESOCUPADOS';
  const normalizarIdentidad = (raw: string, tipo: string = 'V'): string => {
    const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    const m = s.match(/^([VJGEP])-?(\d+)$/);
    if (m) return `${m[1]}-${m[2]}`;
    if (/^\d+$/.test(s)) return `${(tipo || 'V').toUpperCase()}-${s}`;
    return s;
  };
  const tipoDeUso = (uso: string) => (uso === 'Residencial' ? 'RESIDENCIAL' : 'COMERCIAL');
  const idxNivel = (nivel: string) => Math.max(0, (ordenanzaData.nivelesMetraje as string[]).findIndex(
    (n: string) => n.toLowerCase().trim() === String(nivel || '').toLowerCase().trim()));
  const actividadDeLocal = (local: any) =>
    local.uso === 'Residencial'
      ? (local.tipoResidencia || 'No aplica')
      : (local.estatus === 'Desocupado' ? DESOCUPADO_LABEL : actividadConNivel(local.actividad || '', idxNivel(local.nivel)));
  /** Siguientes códigos URB###### libres (correlativo del catastro, sin colisiones). */
  const siguientesCodigosInmueble = async (n: number): Promise<string[]> => {
    const { data } = await supabase
      .from('inmuebles')
      .select('inmueble')
      .gte('inmueble', 'URB000000')
      .lt('inmueble', 'URB100000')
      .order('inmueble', { ascending: false })
      .limit(200);
    const max = (data || [])
      .map((r: any) => String(r.inmueble))
      .filter((c: string) => /^URB\d{6}$/.test(c))
      .reduce((mx: number, c: string) => Math.max(mx, parseInt(c.slice(3), 10)), 0);
    const out: string[] = [];
    let next = max + 1;
    while (out.length < n) {
      const cand = `URB${String(next).padStart(6, '0')}`;
      const { data: ex } = await supabase.from('inmuebles').select('id').eq('inmueble', cand).limit(1);
      if (!ex || ex.length === 0) out.push(cand);
      next++;
    }
    return out;
  };

  const updateContribuyente = async (id: string, data: any) => {
    try {
      const notaToSave = data.Notas_Adicionales?.trim() || data.Nota?.trim() || null;
      const orig: any = data.__original || {};
      // SOLO la identidad exacta del contribuyente (nunca variantes V-/J-/G- de otros RIF)
      const identidadExacta = id;
      const codigosPropios: string[] = Array.isArray(data.__inmuebleCodes) && data.__inmuebleCodes.length > 0
        ? data.__inmuebleCodes
        : [];

      // 1. Datos del contribuyente
      const contribRecord: any = {
        identidad: identidadExacta,
        nombre: data.Contribuyente,
        telefono: data.Telefono,
        email: data.Correo,
        direccion: data.Direccion
      };
      if (data.clave_portal !== undefined) {
        contribRecord.clave_portal = String(data.clave_portal || '').trim() || null;
      }
      if (notaToSave) {
        const { data: curC } = await supabase.from('contribuyentes').select('observaciones').eq('identidad', identidadExacta).maybeSingle();
        const obsActual = curC?.observaciones || '';
        const newEntry = `${new Date().toLocaleDateString('es-VE')}: ${notaToSave}`;
        contribRecord.observaciones = obsActual ? `${newEntry}\n---\n${obsActual}` : newEntry;
      }
      const { error: errC } = await supabase.from('contribuyentes').upsert([contribRecord], { onConflict: 'identidad' });
      if (errC) throw new Error('No se pudo guardar el contribuyente: ' + errC.message);

      // 2. Sincronización de datos en inmuebles y tablas del sistema (en CASCADA total):
      // NOTA CRÍTICA (Caso 18): Un contribuyente puede tener múltiples locales independientes con direcciones y teléfonos propios.
      // NUNCA sobreescribir la dirección de todos los locales indiscriminadamente por RIF.
      const idClean = identidadExacta.replace(/-/g, '').toUpperCase();
      const baseNombre: any = { contribuyente: data.Contribuyente };
      if (data.Correo && String(data.Correo).includes('@')) {
        baseNombre.correo_electronico = String(data.Correo).trim().toLowerCase();
      }
      if (data.Telefono && String(data.Telefono).trim().length >= 7) {
        baseNombre.telefono = String(data.Telefono).trim();
      }
      if (data.clave_portal !== undefined) {
        baseNombre.clave_portal = String(data.clave_portal || '').trim() || null;
      }
      if (notaToSave) baseNombre.notas = notaToSave;

      // Actualizar razón social / correo / teléfono del titular en sus inmuebles
      // NOTA CRÍTICA (Item 13): Si el contribuyente tiene múltiples inmuebles (ej: una casa residencial y un comercio con distinta razón social),
      // NO sobrescribir indiscriminadamente el nombre de todos los inmuebles si solo se editó uno o si cada local tiene su propio nombre/RIF.
      const nombreTopCambio = !orig.Contribuyente || String(data.Contribuyente || '').trim().toUpperCase() !== String(orig.Contribuyente || '').trim().toUpperCase();
      if (Array.isArray(data.locales) && data.locales.length > 0) {
        const baseContactOnly: any = {};
        if (data.Correo && String(data.Correo).includes('@')) baseContactOnly.correo_electronico = String(data.Correo).trim().toLowerCase();
        if (data.Telefono && String(data.Telefono).trim().length >= 7) baseContactOnly.telefono = String(data.Telefono).trim();
        if (data.clave_portal !== undefined) baseContactOnly.clave_portal = String(data.clave_portal || '').trim() || null;
        if (notaToSave) baseContactOnly.notas = notaToSave;
        if (Object.keys(baseContactOnly).length > 0) {
          await supabase.from('inmuebles').update(baseContactOnly).or(`identidad.eq.${identidadExacta},identidad.eq.${idClean}`);
        }
      } else {
        await supabase.from('inmuebles').update(baseNombre).or(`identidad.eq.${identidadExacta},identidad.eq.${idClean}`);
      }

      // Actualizar en cascada para todos los módulos solo cuando el cambio aplica a toda la identidad
      if (data.Contribuyente && String(data.Contribuyente).trim() !== '' && (!Array.isArray(data.locales) || data.locales.length <= 1)) {
        const nuevoNom = String(data.Contribuyente).trim().toUpperCase();
        const orIdent = `identidad.eq.${identidadExacta},identidad.eq.${idClean}`;
        await Promise.allSettled([
          supabase.from('facturas').update({ contribuyente: nuevoNom }).or(orIdent),
          supabase.from('servicios_especiales').update({ contribuyente: nuevoNom }).or(orIdent),
          supabase.from('documentos').update({ contribuyente: nuevoNom }).or(orIdent),
          supabase.from('retenciones_iva').update({ contribuyente: nuevoNom }).or(orIdent),
          supabase.from('condominio_unidades').update({ propietario: nuevoNom }).or(orIdent),
          supabase.from('condominios').update({ nombre: nuevoNom }).or(orIdent),
        ]);
      }

      const nuevaClasificacion = data.Clasificacion || 'Residencial';
      let nuevaActividad = '';
      const cambios: string[] = [];
      const identidadesRefrescar = new Set<string>([identidadExacta]);

      if (Array.isArray(data.locales) && data.locales.length > 0) {
        const naParentCodes: string[] = Array.isArray(data.__naParentCodes)
          ? data.__naParentCodes.map((c: string) => String(c || '').trim().toUpperCase()).filter(Boolean)
          : [];
        data.locales.forEach((l: any) => {
          const pid = String(l.padre_id || l.__orig?.padre_id || '').trim().toUpperCase();
          if (pid && !naParentCodes.includes(pid)) naParentCodes.push(pid);
        });

        // 3a. Varios inmuebles/actividades: actualizar SOLO los que cambiaron; insertar los nuevos; dar de baja los eliminados
        const nuevos = data.locales.filter((l: any) => !l.codigo);
        const codigosNuevos = nuevos.length > 0 ? await siguientesCodigosInmueble(nuevos.length) : [];
        let iNuevo = 0;
        
        // Dar de baja (Eliminar) los inmuebles/actividades que fueron removidos en la interfaz (nunca eliminar contenedores N/A padres)
        const codigosActuales = data.locales.map((l: any) => l.codigo).filter(Boolean);
        const codigosEliminados = codigosPropios.filter(c => !codigosActuales.includes(c) && !naParentCodes.includes(String(c || '').trim().toUpperCase()));
        
        for (const codEliminado of codigosEliminados) {
          const { error: eDel } = await supabase.from('inmuebles').update({ estado: 'Eliminado', mmv_mes: 0, deuda_mmv: 0, cant_inmuebles: 0 }).eq('inmueble', codEliminado);
          if (eDel) throw eDel;
          cambios.push(`ELIMINADO: ${codEliminado} dado de baja`);
        }

        if (data.locales.length === 1 && data.locales[0].codigo && naParentCodes.length === 0) {
          try {
            await supabase
              .from('inmuebles')
              .update({ cant_inmuebles: 1 })
              .eq('inmueble', data.locales[0].codigo);
          } catch (_) {}
        }
        
        for (const local of data.locales) {
          const o = local.__orig || {};
          const esContenedorNA =
            local.esContenedorNA === true ||
            naParentCodes.includes(String(local.codigo || '').trim().toUpperCase()) ||
            String(local.actividad || '').trim().toUpperCase() === 'N/A' ||
            String(o.actividad || '').trim().toUpperCase() === 'N/A';
          const act = esContenedorNA ? 'N/A' : actividadDeLocal(local);
          if (local.codigo) {
            const cambioTarifaOAct = !esContenedorNA && (
              o.uso !== local.uso || o.actividad !== local.actividad || o.nivel !== local.nivel ||
              o.tipoResidencia !== local.tipoResidencia || o.estatus !== local.estatus ||
              (local.direccion && local.direccion !== o.direccion)
            );
            
            const updatePayload: any = {};
            if (o.agente_retencion !== local.agente_retencion) {
              updatePayload.agente_retencion = local.agente_retencion === true;
            }
            if (local.contribuyente && String(local.contribuyente).trim() !== '' && local.contribuyente !== o.contribuyente) {
              updatePayload.contribuyente = String(local.contribuyente).trim().toUpperCase();
            } else if (data.locales.length === 1 && data.Contribuyente) {
              updatePayload.contribuyente = String(data.Contribuyente).trim().toUpperCase();
            } else if (nombreTopCambio && (!o.contribuyente || String(o.contribuyente).trim().toUpperCase() === String(orig.Contribuyente || '').trim().toUpperCase())) {
              updatePayload.contribuyente = String(data.Contribuyente).trim().toUpperCase();
            }
            if (local.identidad && String(local.identidad).trim() !== '' && String(local.identidad).trim().toUpperCase() !== String(o.identidad || identidadExacta).trim().toUpperCase()) {
              const nuevaIdLocal = normalizarIdentidad(String(local.identidad).trim().toUpperCase(), String(local.identidad).trim().charAt(0) || 'J');
              updatePayload.identidad = nuevaIdLocal;
              identidadesRefrescar.add(nuevaIdLocal);
              const pidLocal = String(local.padre_id || o.padre_id || '').trim().toUpperCase();
              const hermanosMismoPadre = pidLocal
                ? data.locales.filter((l: any) => String(l.padre_id || l.__orig?.padre_id || '').trim().toUpperCase() === pidLocal)
                : [];
              const todosHermanosMismoRif = pidLocal && hermanosMismoPadre.every((h: any) => {
                const hId = normalizarIdentidad(String(h.identidad || data.Identidad || '').trim().toUpperCase(), String(h.identidad || data.Identidad || 'J').trim().charAt(0) || 'J');
                return hId === nuevaIdLocal;
              });
              // Si pertenece a un contenedor N/A y todas sus actividades cambian al nuevo RIF, conservar padre_id intacto
              if (pidLocal && (todosHermanosMismoRif || naParentCodes.includes(pidLocal))) {
                updatePayload.padre_id = pidLocal;
              } else {
                updatePayload.padre_id = null;
              }
              await supabase.from('contribuyentes').upsert([{
                identidad: nuevaIdLocal,
                nombre: (local.contribuyente || data.Contribuyente || '').trim().toUpperCase(),
                telefono: local.telefono || data.Telefono || null,
                email: local.correo_electronico || data.Correo || null,
                direccion: local.direccion || data.Direccion || null
              }], { onConflict: 'identidad' });
              cambios.push(`${local.codigo}: RIF/Cédula → ${nuevaIdLocal}`);
            }
            const dirTopCambio = Boolean(
              data.Direccion &&
              String(data.Direccion).trim() !== '' &&
              String(data.Direccion).trim() !== String(orig.Direccion || '').trim()
            );
            const dirLocalCambio = Boolean(
              local.direccion &&
              String(local.direccion).trim() !== '' &&
              String(local.direccion).trim() !== String(o.direccion || '').trim()
            );
            if (dirLocalCambio) {
              updatePayload.direccion = local.direccion;
            } else if (local.direccion && String(local.direccion).trim() !== '') {
              // Preservar la dirección física propia de este inmueble/local (no sobreescribir con otros códigos del mismo titular)
              updatePayload.direccion = local.direccion;
            } else if ((data.locales.length === 1 || dirTopCambio) && data.Direccion && String(data.Direccion).trim() !== '') {
              updatePayload.direccion = data.Direccion;
            }
            if (local.telefono) {
              updatePayload.telefono = local.telefono;
            } else if (data.locales.length === 1 && data.Telefono) {
              updatePayload.telefono = data.Telefono;
            }
            if (local.correo_electronico) {
              updatePayload.correo_electronico = local.correo_electronico;
            } else if (data.locales.length === 1 && data.Correo) {
              updatePayload.correo_electronico = data.Correo;
            }

            if (cambioTarifaOAct) {
              const mmv = isTerrenoInm(act) ? 0 : calcularMmvMes({ ...local, actividad: act }, ordenanzasConfig);
              if (local.uso !== 'Residencial' && !isTerrenoInm(act) && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${act}" (${local.codigo}).`);
              updatePayload.actividad_principal = act;
              updatePayload.tipo = tipoDeUso(local.uso);
              updatePayload.mmv_mes = mmv;
              updatePayload.agente_retencion = local.agente_retencion === true;
              local.mmvActual = mmv;
              cambios.push(`${local.codigo}: ${o.actividad || o.tipoResidencia || '-'} → ${act} (${mmv} MMV)`);
            }

            if (Object.keys(updatePayload).length > 0) {
              const { error: eU } = await supabase.from('inmuebles')
                .update(updatePayload)
                .eq('inmueble', local.codigo);
              if (eU) throw eU;
            }
          } else {
            let mmv = isTerrenoInm(act) ? 0 : calcularMmvMes({ ...local, actividad: act }, ordenanzasConfig);
            if (local.uso === 'Residencial' && !(mmv > 0)) {
              mmv = 0.80;
            }
            if (local.uso !== 'Residencial' && !isTerrenoInm(act) && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${act}". Seleccione una actividad válida.`);
            const codigo = codigosNuevos[iNuevo++];
            const padreAsignado = naParentCodes.length === 1 ? naParentCodes[0] : (local.padre_id || null);
            const idNuevoLocal = local.identidad
              ? normalizarIdentidad(String(local.identidad).trim().toUpperCase(), String(local.identidad).trim().charAt(0) || 'J')
              : identidadExacta;
            identidadesRefrescar.add(idNuevoLocal);
            const { error: eI } = await supabase.from('inmuebles').insert([{
              inmueble: codigo,
              identidad: idNuevoLocal,
              contribuyente: (local.contribuyente || data.Contribuyente || '').trim().toUpperCase(),
              telefono: data.Telefono,
              correo_electronico: data.Correo,
              direccion: local.direccion || (local.numeracion ? `${data.Direccion} | ${local.numeracion}` : data.Direccion),
              cod_cont: data.CodCont || data.cod_cont || null,
              padre_id: padreAsignado,
              tipo: tipoDeUso(local.uso),
              clasificacion: 'Individual',
              estado: 'Activo',
              actividad_principal: act,
              mmv_mes: mmv,
              meses_deuda: 0,
              deuda_mmv: 0,
              cant_inmuebles: 1,
              agente_retencion: local.agente_retencion === true,
            }]);
            if (eI) throw eI;
            local.mmvActual = mmv;
            cambios.push(`NUEVO ${codigo}: ${act} (${mmv} MMV)`);
          }
        }

        // Sincronizar contenedor(es) N/A padre (ej. URB033361) con el RIF, Razón Social y suma de MMV de sus actividades hijas
        for (const naCode of naParentCodes) {
          const hijosLocales = data.locales.filter((l: any) =>
            String(l.codigo || '').trim().toUpperCase() !== naCode &&
            (String(l.padre_id || l.__orig?.padre_id || '').trim().toUpperCase() === naCode || naParentCodes.length === 1)
          );
          if (hijosLocales.length > 0) {
            const primerHijo = hijosLocales[0];
            const nombreUnificado = String(
              (nombreTopCambio ? data.Contribuyente : (primerHijo.contribuyente || data.Contribuyente)) || ''
            ).trim().toUpperCase();
            const idUnificada = primerHijo.identidad
              ? normalizarIdentidad(String(primerHijo.identidad).trim().toUpperCase(), String(primerHijo.identidad).trim().charAt(0) || 'J')
              : identidadExacta;
            identidadesRefrescar.add(idUnificada);
            const sumaMmv = Math.round(
              hijosLocales.reduce((acc: number, h: any) => acc + (parseFloat(String(h.mmvActual ?? h.mmv_mes ?? 0)) || 0), 0) * 10000
            ) / 10000;
            const updNa: any = {
              actividad_principal: 'N/A',
              padre_id: null,
              cant_inmuebles: hijosLocales.length,
            };
            if (nombreUnificado) updNa.contribuyente = nombreUnificado;
            if (idUnificada) updNa.identidad = idUnificada;
            if (sumaMmv > 0) updNa.mmv_mes = sumaMmv;
            if (primerHijo.direccion || data.Direccion) updNa.direccion = primerHijo.direccion || data.Direccion;
            if (data.Telefono && String(data.Telefono).trim().length >= 7) updNa.telefono = String(data.Telefono).trim();
            if (data.Correo && String(data.Correo).includes('@')) updNa.correo_electronico = String(data.Correo).trim().toLowerCase();

            await supabase.from('contribuyentes').upsert([{
              identidad: idUnificada,
              nombre: nombreUnificado || data.Contribuyente,
              telefono: updNa.telefono || data.Telefono || null,
              email: updNa.correo_electronico || data.Correo || null,
              direccion: updNa.direccion || data.Direccion || null,
            }], { onConflict: 'identidad' });

            await supabase.from('inmuebles').update(updNa).eq('inmueble', naCode);
            await supabase.from('inmuebles').update({ cant_inmuebles: hijosLocales.length, padre_id: naCode }).in(
              'inmueble',
              hijosLocales.map((h: any) => h.codigo).filter(Boolean)
            );
          }
        }
      } else {
        // 3b. Un solo inmueble: la tarifa SOLO se recalcula si cambió la actividad/clasificación/nivel
        const tarifaCambio = !data.__original ||
          data.Clasificacion !== orig.Clasificacion ||
          (data.ActividadComercial || '') !== (orig.ActividadComercial || '') ||
          (data.TipoResidencia || '') !== (orig.TipoResidencia || '') ||
          (data.NivelMetraje || '') !== (orig.NivelMetraje || '');
        const objetivo = data.Inmueble && data.Inmueble !== 'Principal' ? data.Inmueble : (codigosPropios.length === 1 ? codigosPropios[0] : null);
        const upd: any = {};
        if ((data.Direccion || '') !== (orig.Direccion || '')) {
          upd.direccion = data.DireccionExacta ? `${data.Direccion} | Exacta: ${data.DireccionExacta}` : data.Direccion;
        }
        if (tarifaCambio) {
          nuevaActividad = nuevaClasificacion === 'Residencial' ? (data.TipoResidencia || 'No aplica') : actividadConNivel(data.ActividadComercial || '', idxNivel(data.NivelMetraje));
          const mmv = isTerrenoInm(nuevaActividad) ? 0 : calcularMmvMes(data, ordenanzasConfig);
          if (nuevaClasificacion !== 'Residencial' && !isTerrenoInm(nuevaActividad) && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${nuevaActividad}".`);
          
          if (!objetivo) {
            if (codigosPropios.length > 1) {
              const primerCodigo = codigosPropios[0];
              upd.actividad_principal = nuevaActividad;
              upd.tipo = nuevaClasificacion === 'Residencial' ? 'RESIDENCIAL' : 'COMERCIAL';
              upd.mmv_mes = mmv;
              cambios.push(`${primerCodigo}: ${orig.ActividadComercial || orig.TipoResidencia || '-'} → ${nuevaActividad} (${mmv} MMV)`);
            } else {
              // El contribuyente no tiene ningún inmueble. Creamos uno nuevo.
              const codigos = await siguientesCodigosInmueble(1);
              const nuevoCodigo = codigos[0];
              const { error: eI } = await supabase.from('inmuebles').insert([{
                inmueble: nuevoCodigo,
                identidad: identidadExacta,
                contribuyente: data.Contribuyente,
                telefono: data.Telefono,
                correo_electronico: data.Correo,
                direccion: upd.direccion || data.Direccion,
                tipo: nuevaClasificacion === 'Residencial' ? 'RESIDENCIAL' : 'COMERCIAL',
                clasificacion: 'Individual',
                estado: 'Activo',
                actividad_principal: nuevaActividad,
                mmv_mes: mmv,
                cant_inmuebles: 1,
                agente_retencion: data.esAgenteRetencion === true,
              }]);
              if (eI) throw eI;
              cambios.push(`NUEVO ${nuevoCodigo}: ${nuevaActividad} (${mmv} MMV)`);
            }
          } else {
            upd.actividad_principal = nuevaActividad;
            upd.tipo = nuevaClasificacion === 'Residencial' ? 'RESIDENCIAL' : 'COMERCIAL';
            upd.mmv_mes = mmv;
            cambios.push(`${objetivo}: ${orig.ActividadComercial || orig.TipoResidencia || '-'} → ${nuevaActividad} (${mmv} MMV)`);
          }
        }
        if (data.esAgenteRetencion !== undefined) {
          upd.agente_retencion = data.esAgenteRetencion === true;
        }
        const targetCode = objetivo || (codigosPropios.length > 0 ? codigosPropios[0] : null);
        if (Object.keys(upd).length > 0 && targetCode) {
          const { error: eU } = await supabase.from('inmuebles').update(upd).eq('inmueble', targetCode);
          if (eU) throw eU;
        }
        // Actividades comerciales adicionales → un inmueble nuevo por cada una
        const extras = (data.actividadesExtra || []).filter((a: any) => a?.actividad);
        if (extras.length > 0) {
          const codigos = await siguientesCodigosInmueble(extras.length);
          const rows = extras.map((a: any, i: number) => {
            const mmv = isTerrenoInm(a.actividad) ? 0 : calcularMmvMes({ uso: 'Comercial', actividad: a.actividad, nivel: a.nivel }, ordenanzasConfig);
            if (!isTerrenoInm(a.actividad) && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${a.actividad}".`);
            cambios.push(`NUEVO ${codigos[i]}: ${a.actividad} (${mmv} MMV)`);
            return {
              inmueble: codigos[i], identidad: identidadExacta, contribuyente: data.Contribuyente,
              telefono: data.Telefono, correo_electronico: data.Correo, direccion: data.Direccion,
              tipo: 'COMERCIAL', clasificacion: 'Individual', estado: 'Activo',
              actividad_principal: actividadConNivel(a.actividad, idxNivel(a.nivel)), mmv_mes: mmv, cant_inmuebles: 1,
              agente_retencion: data.esAgenteRetencion === true,
            };
          });
          const { error: eX } = await supabase.from('inmuebles').insert(rows);
          if (eX) throw eX;
        }
      }

      // Sincronizar agente_retencion globalmente SOLO cuando NO se editaron locales individuales
      // (cuando data.locales existe, cada local guarda su propio check local.agente_retencion)
      if (data.esAgenteRetencion !== undefined && !(Array.isArray(data.locales) && data.locales.length > 0)) {
        const esAgenteVal = data.esAgenteRetencion === true;
        await supabase.from('inmuebles').update({ agente_retencion: esAgenteVal }).eq('identidad', identidadExacta).is('condominio_padre_id', null);
        if (codigosPropios.length > 0) {
          await supabase.from('inmuebles').update({ agente_retencion: esAgenteVal }).in('inmueble', codigosPropios);
        }
        try {
          if (codigosPropios.length > 0) {
            await supabase.from('condominios').update({ agente_retencion: esAgenteVal }).in('codigo', codigosPropios);
          }
          await supabase.from('condominios').update({ agente_retencion: esAgenteVal }).eq('identidad', identidadExacta);
        } catch (_) {}
      }

      // Recargar del servidor (fuente de verdad) en lugar de parchear el estado local
      for (const idRef of Array.from(identidadesRefrescar)) {
        if (idRef) await refreshUserData(idRef).catch(() => {});
      }

      let logMsg = `Se actualizaron los datos del contribuyente: ${data.Contribuyente} (Identidad: ${identidadExacta})`;
      if (cambios.length > 0) logMsg += ` | Cambios de tarifa/actividad: ${cambios.join('; ')}`;
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
      // La actividad puede venir con sufijo de nivel "(MEDIA)"; la tarifa se busca por el nombre base
      const act = quitarNivelActividad(localOrData.actividad || localOrData.ActividadComercial || localOrData.actividad_principal || '');
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
      } else {
        // Fallback inteligente mediante el resolvedor oficial de la Ordenanza
        const fo = resolverFOComercial(localOrData.actividad || localOrData.ActividadComercial || localOrData.actividad_principal || '', localOrData.mmvActual || localOrData.mmv_mes);
        if (fo > 0) mmv += fo;
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
      let identidad = normalizarIdentidad(data.Identidad, data.TipoIdentidad || 'V');
      if (!/^[VJGEP]-\d{5,10}$/.test(identidad)) throw new Error(`Identidad inválida: "${data.Identidad}".`);

      // ── Bloqueo de fichas duplicadas ──
      {
        const numero = identidad.split('-')[1].replace(/^0+/, '');
        const formas = Array.from(new Set([numero, numero.padStart(8, '0'), numero.padStart(9, '0')]));
        const candidatos = ['V', 'E', 'J', 'G', 'P'].flatMap(p => formas.flatMap(f => [`${p}-${f}`, `${p}${f}`]));
        const { data: existentes } = await supabase.from('contribuyentes').select('identidad, nombre').in('identidad', candidatos);
        const mismoPrefijo = (existentes || []).find((c: any) => c.identidad[0] === identidad[0]);
        const otroPrefijo = (existentes || []).find((c: any) => c.identidad[0] !== identidad[0]);
        if (mismoPrefijo) {
          identidad = mismoPrefijo.identidad; // misma persona con otro formato (ceros / guion): usar la ficha existente
        } else if (otroPrefijo && !data.__confirmarOtroPrefijo) {
          throw new Error(`Ya existe la ficha ${otroPrefijo.identidad} (${otroPrefijo.nombre}) con el mismo número. ` +
            `Búsquela en Contribuyentes y agregue el inmueble allí, o corrija el prefijo, para no crear una ficha duplicada.`);
        }
      }
      const codCont = data.CodCont || `N-${Math.floor(10000 + Math.random() * 90000)}`;
      const direccionBase = data.DireccionExacta ? `${data.Direccion} | Exacta: ${data.DireccionExacta}` : data.Direccion;

      // Cada unidad a registrar: { uso, actividad, nivel, tipoResidencia, estatus, etiqueta }
      const unidades: any[] = [];
      if (data.isCondominio && data.locales && data.locales.length > 0) {
        data.locales.forEach((local: any, idx: number) => unidades.push({ ...local, etiqueta: local.numeracion || String(idx + 1) }));
      } else {
        const esRes = (data.Clasificacion || 'Residencial') === 'Residencial';
        unidades.push({
          uso: esRes ? 'Residencial' : 'Comercial',
          actividad: data.ActividadComercial,
          nivel: data.NivelMetraje,
          tipoResidencia: data.TipoResidencia,
          estatus: 'Ocupado',
        });
        // Actividades comerciales adicionales (sin modo condominio)
        (data.actividadesExtra || []).filter((a: any) => a?.actividad).forEach((a: any) =>
          unidades.push({ uso: 'Comercial', actividad: a.actividad, nivel: a.nivel, estatus: 'Ocupado' }));
      }

      // Si el contribuyente tenía inmuebles previamente eliminados (ej. dados de baja de un condominio para pagar por fuera)
      // o ya reactivados sin condominio_padre_id, reutilizar su código original para no duplicar fichas
      const { data: inmsPrevios } = await supabase
        .from('inmuebles')
        .select('id, inmueble, estado, condominio_padre_id, meses_deuda')
        .eq('identidad', identidad)
        .order('created_at', { ascending: true });

      const reutilizables = (inmsPrevios || []).filter((r: any) => {
        const est = String(r.estado || '').trim().toLowerCase();
        return ['eliminado', 'inactivo', 'baja', 'desactivado'].includes(est) || (!r.condominio_padre_id && (inmsPrevios || []).length === 1);
      });

      const faltantes = Math.max(0, unidades.length - reutilizables.length);
      const codigosNuevos = faltantes > 0 ? await siguientesCodigosInmueble(faltantes) : [];
      const codigos = unidades.map((_, idx) => reutilizables[idx]?.inmueble || codigosNuevos[idx - reutilizables.length]);

      const rowsToUpsert = unidades.map((u: any, idx: number) => {
        const act = actividadDeLocal(u);
        const mmv = isTerrenoInm(act) ? 0 : calcularMmvMes({ ...u, actividad: act }, ordenanzasConfig);
        if (u.uso !== 'Residencial' && !isTerrenoInm(act) && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para la actividad "${act || '(vacía)'}".`);
        if (u.uso === 'Residencial' && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${act || '(vacío)'}".`);
        const prevMeses = Number(reutilizables[idx]?.meses_deuda) || 0;
        const mesesActivos = prevMeses > 0 ? prevMeses : 1;
        return {
          inmueble: codigos[idx],
          identidad,
          contribuyente: data.Contribuyente,
          telefono: data.Telefono,
          correo_electronico: data.Correo,
          direccion: u.etiqueta ? `${direccionBase} | Local: ${u.etiqueta}` : direccionBase,
          cod_cont: codCont,
          tipo: tipoDeUso(u.uso),
          clasificacion: 'Individual',
          estado: 'Activo',
          condominio_padre_id: null,
          es_condominio: false,
          actividad_principal: act,
          mmv_mes: mmv,
          meses_deuda: mesesActivos,
          deuda_mmv: parseFloat((mesesActivos * mmv).toFixed(5)),
          agente_retencion: data.esAgenteRetencion === true,
          cant_inmuebles: 1,
        };
      });

      // 1. Contribuyente (requerido por la FK inmuebles_identidad_fkey) — si falla, NO seguir
      const { error: errContrib } = await supabase.from('contribuyentes').upsert([{
        identidad,
        nombre: data.Contribuyente,
        telefono: data.Telefono,
        email: data.Correo,
        direccion: data.Direccion,
        observaciones: data.Notas_Adicionales || data.Nota || ''
      }], { onConflict: 'identidad' });
      if (errContrib) throw new Error('No se pudo registrar el contribuyente: ' + errContrib.message);

      // 2. Inmuebles / actividades (upsert por inmueble para reactivar si venía eliminado de condominio)
      const { error } = await supabase.from('inmuebles').upsert(rowsToUpsert, { onConflict: 'inmueble' });
      if (error) throw new Error('No se pudieron registrar los inmuebles: ' + error.message);

      await refreshUserData(identidad).catch(() => {});
      await addAuditLog('NUEVO_CONTRIBUYENTE', `Se registró un nuevo contribuyente: ${data.Contribuyente} (Identidad: ${identidad}) | Inmuebles: ${rowsToUpsert.map(r => `${r.inmueble} ${r.actividad_principal} (${r.mmv_mes} MMV)`).join('; ')}`);
      return identidad;
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
      setTcmmv,
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
      siguientesCodigosInmueble,
      clearLocalCache
    }}>
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
