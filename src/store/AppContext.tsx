'use client';
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import economicActivitiesBase from "@/lib/economicActivitiesBase.json";

import { ordenanzaData } from '@/data/ordenanza';
import { isResidencialInm, actividadConNivel, quitarNivelActividad } from '@/lib/calculos';
import { getFromIndexedDB, saveToIndexedDB, clearAllIndexedDB, CURRENT_CACHE_VERSION } from '@/lib/indexedDbCache';
import { formatPhoneNumber, isFictitiousEmail, getIdentidadVariants } from '@/lib/formatters';
import { logAudit, AuditCategoria, AuditCriticidad } from '@/lib/audit';

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

      // Helper concurrente para descargar páginas en paralelo (8 peticiones simultáneas).
      // Cada bloque se reintenta (timeouts de la BD) y se sigue pidiendo hasta agotar la tabla,
      // aunque el conteo estimado de Postgres se quede corto.
      let cargaIncompleta = false;
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
        const fetchChunk = async (from: number, to: number): Promise<any[] | null> => {
          for (let intento = 0; intento < 2; intento++) {
            const { data, error } = await supabase.from(table).select(select).order('id', { ascending: true }).range(from, to);
            if (!error) return data || [];
            console.warn(`Reintento ${intento + 1} bloque ${from}-${to} de ${table}:`, error.message);
            await new Promise(r => setTimeout(r, 2000 * (intento + 1)));
          }
          return null;
        };

        const numBatches = Math.ceil(total / step);
        const results: any[][] = new Array(numBatches);
        const CONCURRENCY = 4;
        for (let i = 0; i < numBatches; i += CONCURRENCY) {
          await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, numBatches - i) }, async (_, idx) => {
              const b = i + idx;
              const data = await fetchChunk(b * step, (b + 1) * step - 1);
              if (data === null) { cargaIncompleta = true; console.error(`Bloque ${b} de ${table} no se pudo descargar`); }
              results[b] = data || [];
            })
          );
        }
        // Cola: filas por encima del conteo (registros nuevos o conteo corto)
        let next = numBatches * step;
        for (let guard = 0; guard < 20; guard++) {
          const data = await fetchChunk(next, next + step - 1);
          if (data === null) { cargaIncompleta = true; break; }
          if (data.length === 0) break;
          results.push(data);
          if (data.length < step) break;
          next += step;
        }
        // Quitar duplicados por id (si se insertaron filas mientras se paginaba)
        const seen = new Set<any>();
        return results.flat().filter((r: any) => (r?.id == null || seen.has(r.id)) ? r?.id == null : (seen.add(r.id), true));
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
        if (i.condominio_padre_id && i.estado !== 'Eliminado') {
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
        supabase.from('pre_registros').select('*'),
        supabase.from('documentos').select('*'),
        supabase.from('certificados').select('*'),
        supabase.from('reclamos').select('*'),
        supabase.from('convenios').select('*'),
        supabase.from('pre_liquidaciones').select('*'),
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
          condominio_padre_nombre: pInfo?.nombre || null
        };
      });
      setInmuebles(mappedInmuebles);
      setCondominios(apiCondominios);

      const map = new Map();
      allInmuebles.forEach((row: any) => {
        const cod = row.inmueble || row.cod_cont;
        const isCondoChild = Boolean(row.condominio_padre_id);
        const pInfo = row.condominio_padre_id ? parentInfoMap.get(row.condominio_padre_id) : null;
        const isCommercialChild = isCondoChild && (pInfo?.isComercial || (row.tipo || '').toUpperCase().includes('COMERCIAL'));
        const isParentCondo = Boolean(row.es_condominio || row.clasificacion === 'Condominio' || (hijosCountMap.get(cod) || 0) > 0);
        const childCount = hijosCountMap.get(cod) || parseInt(row.cant_inmuebles || '1') || 1;

        // Regla Condominios Comerciales:
        // Aseo urbano se paga separado por condominio (centralizado en el padre).
        // Las multas se pagan por la oficina individual.
        const rowDeudaMMV = isCommercialChild ? 0 : parseFloat(row.deuda_mmv || 0);
        const rowMultaBs = isParentCondo ? 0 : parseFloat(row.multa_bs || 0);
        const rowCongelada = parseFloat(row.deuda_congelada_bs || 0);
        const rowDeudaBs = rowCongelada + rowMultaBs + (rowDeudaMMV * 57 * currentTcmmv);

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
              return row.direccion || row.contribuyentes?.direccion || '';
            })(),
            Observaciones: row.contribuyentes?.observaciones || '',
            Actividad: act || 'No aplica',
            ActividadComercial: (clase.includes('Comercial') || clase === 'Industrial' || clase === 'Mixto') ? (act || '') : '',
            TipoResidencia: clase === 'Residencial' ? (act || '') : '',
            Clasificacion: clase,
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
            isCommercialChild: isCommercialChild
          });
        } else if (row.identidad && map.has(row.identidad)) {
          const existing = map.get(row.identidad);
          existing.SaldoFavor += parseFloat(row.saldo_favor_bs || '0');
          existing.DeudaMMV += rowDeudaMMV;
          existing.DeudaCongelada += rowCongelada;
          existing.MultaBs = (existing.MultaBs || 0) + rowMultaBs;
          existing.DeudaBs = (existing.DeudaBs || 0) + rowDeudaBs;
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
          const rowEstado = row.estado || 'Activo';
          if (rowEstado === 'Activo') {
            existing.Estado = 'Activo';
          } else if (existing.Estado !== 'Activo') {
            if (rowEstado === 'Eliminado') {
              existing.Estado = 'Eliminado';
            } else if (rowEstado === 'Inactivo' && existing.Estado !== 'Eliminado') {
              existing.Estado = 'Inactivo';
            }
          }
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
            ActividadComercial: '',
            TipoResidencia: '',
            Clasificacion: 'Individual',
            SaldoFavor: 0,
            DeudaMMV: 0,
            DeudaCongelada: 0,
            DeudaBs: 0,
            MesesDeuda: 0,
            Estado: c.estado || 'Activo',
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
        setInmuebles(prev => {
          const next = [
            ...prev.filter(i =>
              (i.identidad || '').replace(/-/g, '').toUpperCase() !== idClean
            ),
            ...freshInms
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

      if (freshContrib) {
        setContribuyentes(prev => prev.map(c => {
          const cId = (c.Identidad || '').replace(/-/g, '').toUpperCase();
          if (cId === idClean) {
            return {
              ...c,
              Correo: freshContrib.email || freshContrib.correo_electronico || c.Correo,
              Telefono: freshContrib.telefono || c.Telefono,
              Contribuyente: freshContrib.nombre || c.Contribuyente
            };
          }
          return c;
        }));
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
          setInmuebles(prev => prev.map(inm => (inm.id === updated.id || inm.inmueble === updated.inmueble) ? { ...inm, ...updated } : inm));
          setContribuyentes(prev => prev.map(c => {
            if ((c.Identidad && c.Identidad === updated.identidad) || (c.CodCont && c.CodCont.includes(updated.inmueble))) {
              const deudaMMV = parseFloat(updated.deuda_mmv || 0);
              const multaBs = parseFloat(updated.multa_bs || 0);
              const congelada = parseFloat(updated.deuda_congelada_bs || 0);
              return {
                ...c,
                DeudaMMV: deudaMMV,
                MultaBs: multaBs,
                DeudaCongelada: congelada,
                DeudaBs: congelada + multaBs + (deudaMMV * 57 * (tcmmvRef.current || 1)),
                Estado: updated.estado || c.Estado
              };
            }
            return c;
          }));
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
        { event: '*', schema: 'public', table: 'convenios' },
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
      .like('inmueble', 'URB0%')
      .lt('inmueble', 'URB099000')
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
      if (notaToSave) {
        const { data: curC } = await supabase.from('contribuyentes').select('observaciones').eq('identidad', identidadExacta).maybeSingle();
        const obsActual = curC?.observaciones || '';
        const newEntry = `${new Date().toLocaleDateString('es-VE')}: ${notaToSave}`;
        contribRecord.observaciones = obsActual ? `${newEntry}\n---\n${obsActual}` : newEntry;
      }
      const { error: errC } = await supabase.from('contribuyentes').upsert([contribRecord], { onConflict: 'identidad' });
      if (errC) throw new Error('No se pudo guardar el contribuyente: ' + errC.message);

      // 2. Datos de contacto en sus inmuebles (no toca tarifas)
      const contacto: any = { contribuyente: data.Contribuyente, telefono: data.Telefono, correo_electronico: data.Correo };
      if (notaToSave) contacto.notas = notaToSave;
      let qc = supabase.from('inmuebles').update(contacto);
      qc = codigosPropios.length > 0 ? qc.in('inmueble', codigosPropios) : qc.eq('identidad', identidadExacta);
      const { error: errCont } = await qc;
      if (errCont) throw errCont;

      const nuevaClasificacion = data.Clasificacion || 'Residencial';
      let nuevaActividad = '';
      const cambios: string[] = [];

      if (data.isCondominio && Array.isArray(data.locales) && data.locales.length > 0) {
        // 3a. Varios inmuebles/actividades: actualizar SOLO los que cambiaron; insertar los nuevos
        const nuevos = data.locales.filter((l: any) => !l.codigo);
        const codigosNuevos = nuevos.length > 0 ? await siguientesCodigosInmueble(nuevos.length) : [];
        let iNuevo = 0;
        for (const local of data.locales) {
          const act = actividadDeLocal(local);
          if (local.codigo) {
            const o = local.__orig || {};
            const cambio = o.uso !== local.uso || o.actividad !== local.actividad || o.nivel !== local.nivel ||
              o.tipoResidencia !== local.tipoResidencia || o.estatus !== local.estatus;
            if (!cambio) continue;
            const mmv = calcularMmvMes({ ...local, actividad: act }, ordenanzasConfig);
            if (local.uso !== 'Residencial' && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${act}" (${local.codigo}).`);
            const { error: eU } = await supabase.from('inmuebles')
              .update({ actividad_principal: act, tipo: tipoDeUso(local.uso), mmv_mes: mmv })
              .eq('inmueble', local.codigo);
            if (eU) throw eU;
            cambios.push(`${local.codigo}: ${o.actividad || o.tipoResidencia || '-'} → ${act} (${mmv} MMV)`);
          } else {
            const mmv = calcularMmvMes({ ...local, actividad: act }, ordenanzasConfig);
            if (local.uso !== 'Residencial' && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${act}".`);
            const codigo = codigosNuevos[iNuevo++];
            const { error: eI } = await supabase.from('inmuebles').insert([{
              inmueble: codigo,
              identidad: identidadExacta,
              contribuyente: data.Contribuyente,
              telefono: data.Telefono,
              correo_electronico: data.Correo,
              direccion: data.Direccion,
              tipo: tipoDeUso(local.uso),
              clasificacion: 'Individual',
              estado: 'Activo',
              actividad_principal: act,
              mmv_mes: mmv,
              cant_inmuebles: 1,
              agente_retencion: data.esAgenteRetencion === true,
            }]);
            if (eI) throw eI;
            cambios.push(`NUEVO ${codigo}: ${act} (${mmv} MMV)`);
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
          const mmv = calcularMmvMes(data, ordenanzasConfig);
          if (nuevaClasificacion !== 'Residencial' && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${nuevaActividad}".`);
          if (!objetivo) throw new Error('No se pudo determinar qué inmueble modificar. Edite cada inmueble por separado.');
          upd.actividad_principal = nuevaActividad;
          upd.tipo = nuevaClasificacion === 'Residencial' ? 'RESIDENCIAL' : 'COMERCIAL';
          upd.mmv_mes = mmv;
          cambios.push(`${objetivo}: ${orig.ActividadComercial || orig.TipoResidencia || '-'} → ${nuevaActividad} (${mmv} MMV)`);
        }
        if (Object.keys(upd).length > 0 && objetivo) {
          const { error: eU } = await supabase.from('inmuebles').update(upd).eq('inmueble', objetivo);
          if (eU) throw eU;
        }
        // Actividades comerciales adicionales → un inmueble nuevo por cada una
        const extras = (data.actividadesExtra || []).filter((a: any) => a?.actividad);
        if (extras.length > 0) {
          const codigos = await siguientesCodigosInmueble(extras.length);
          const rows = extras.map((a: any, i: number) => {
            const mmv = calcularMmvMes({ uso: 'Comercial', actividad: a.actividad, nivel: a.nivel }, ordenanzasConfig);
            if (!(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${a.actividad}".`);
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

      // Recargar del servidor (fuente de verdad) en lugar de parchear el estado local
      await refreshUserData(identidadExacta).catch(() => {});

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
      const identidad = normalizarIdentidad(data.Identidad, data.TipoIdentidad || 'V');
      if (!/^[VJGEP]-\d{5,10}$/.test(identidad)) throw new Error(`Identidad inválida: "${data.Identidad}".`);
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

      const codigos = await siguientesCodigosInmueble(unidades.length);
      const rowsToInsert = unidades.map((u: any, idx: number) => {
        const act = actividadDeLocal(u);
        const mmv = calcularMmvMes({ ...u, actividad: act }, ordenanzasConfig);
        if (u.uso !== 'Residencial' && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para la actividad "${act || '(vacía)'}".`);
        if (u.uso === 'Residencial' && !(mmv > 0)) throw new Error(`No hay tarifa en la ordenanza para "${act || '(vacío)'}".`);
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
          actividad_principal: act,
          mmv_mes: mmv,
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

      // 2. Inmuebles / actividades
      const { error } = await supabase.from('inmuebles').insert(rowsToInsert);
      if (error) throw new Error('No se pudieron registrar los inmuebles: ' + error.message);

      await refreshUserData(identidad).catch(() => {});
      await addAuditLog('NUEVO_CONTRIBUYENTE', `Se registró un nuevo contribuyente: ${data.Contribuyente} (Identidad: ${identidad}) | Inmuebles: ${rowsToInsert.map(r => `${r.inmueble} ${r.actividad_principal} (${r.mmv_mes} MMV)`).join('; ')}`);
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
