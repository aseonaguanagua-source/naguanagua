'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { ordenanzaData } from '@/data/ordenanza';

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
  setInmuebles: (inmuebles: any[]) => void;
  updateContribuyente: (id: string, data: any) => void;
  addContribuyente: (data: any) => void;
  aprobarPreRegistro: (item: number) => void;
  addFactura: (recibo: any) => Promise<void>;
  addAuditLog: (action: string, details: string) => Promise<void>;
  auditLogs: any[];
  setPreRegistros: React.Dispatch<React.SetStateAction<any[]>>;
  setFacturas: React.Dispatch<React.SetStateAction<any[]>>;
  refreshData: () => Promise<void>;
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
  const [reclamos, setReclamos] = useState<any[]>([]);
  const [convenios, setConvenios] = useState<any[]>([]);
  const [preLiquidaciones, setPreLiquidaciones] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [ordenanzasConfig, setOrdenanzasConfig] = useState<any>(ordenanzaData);
  const [tcmmv, setTcmmv] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch recibos con paginación para superar el límite de 1000
      let allFacturas: any[] = [];
      let fetchMore = true;
      let from = 0;
      let step = 999;
      while (fetchMore) {
        const { data: chunk } = await supabase.from('facturas').select('*')
          .in('estado', ['Pendiente', 'Abonado', 'Por Verificar']) // Solo recibos activas - excluye Pagado/Anulado/Reversado
          .range(from, from + step);
        if (chunk && chunk.length > 0) {
          allFacturas = [...allFacturas, ...chunk];
          from += step + 1;
        } else {
          fetchMore = false;
        }
      }

      let allInmuebles: any[] = [];
      let apiCondominios: any[] = [];
      try {
        const fetchAllClient = async (table: string, select: string) => {
          let all: any[] = [];
          let from = 0;
          const step = 999;
          while (true) {
            const { data } = await supabase.from(table).select(select).range(from, from + step);
            if (data && data.length > 0) {
              all = [...all, ...data];
              from += step + 1;
              if (data.length < step + 1) break;
            } else {
              break;
            }
          }
          return all;
        };
        const [rawInmuebles, rawContribuyentes] = await Promise.all([
          fetchAllClient('inmuebles', 'id,identidad,inmueble,contribuyente,tipo,clasificacion,direccion,actividad_principal,mmv_mes,cant_inmuebles,deuda_mmv,deuda_congelada_bs,saldo_favor_bs,estado,correo_electronico,telefono,es_condominio,condominio_padre_id,created_at'),
          fetchAllClient('contribuyentes', '*')
        ]);
        const contribMap = new Map();
        rawContribuyentes.forEach(c => contribMap.set(c.identidad, c));
        allInmuebles = rawInmuebles.map(inm => ({
          ...inm,
          contribuyentes: contribMap.get(inm.identidad) || null
        }));
        apiCondominios = allInmuebles
          .filter(i => i.es_condominio === true)
          .map(inm => ({
            id: inm.id,
            codigo: inm.inmueble,
            identidad: inm.identidad,
            nombre: 'Condominio ' + inm.inmueble,
            direccion: inm.direccion || '',
            unidades: parseInt(inm.cant_inmuebles || '0'),
            representante: contribMap.get(inm.identidad)?.nombre || 'N/A',
            estado: inm.estado || 'Activo',
            created_at: inm.created_at
          }));
      } catch (err) {
        console.error('Error fetching fast data:', err);
      }

      const [
        { data: dbInmuebles },
        { data: dbPreRegistros },
        { data: dbDocumentos },
        { data: dbCertificados },
        { data: dbCondominios },
        { data: dbReclamos },
        { data: dbConvenios },
        { data: dbPreLiquidaciones },
        { data: dbAuditLogs },
        { data: dbConfig },
        apiBcv
      ] = await Promise.all([
        Promise.resolve({ data: allInmuebles }),
        supabase.from('pre_registros').select('*'),
        supabase.from('documentos').select('*'),
        supabase.from('certificados').select('*'),
        Promise.resolve({ data: [] }), // Placeholder for dbCondominios to keep indices correct
        supabase.from('reclamos').select('*'),
        supabase.from('convenios').select('*'),
        supabase.from('pre_liquidaciones').select('*'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('sistema_config').select('*'),
        fetch(`/api/bcv?t=${Date.now()}`, { cache: 'no-store' }).then(res => res.json()).catch(() => ({ tcmmv: 0 }))
      ]);

      let manualTcmmv = 0;
      if (dbConfig && dbConfig.length > 0) {
        manualTcmmv = parseFloat(dbConfig[0].tcmmv || '0');
      }

      const dbFacturas = allFacturas;
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

      const bcvData = apiBcv as any;
      let currentTcmmv = manualTcmmv > 0 ? manualTcmmv : (bcvData?.tcmmv > 0 ? bcvData.tcmmv : semanalTcmmv);

      // Si aAon es 0 (por ejemplo si el API de Nextjs estA! caA-do en Amplify), intentamos directo desde el cliente
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
      
      // Let's just fetch it normally since I can't guarantee arguments:
      const { data: fetchAuditLogs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
      setAuditLogs(fetchAuditLogs || []);

      if (dbInmuebles) {
        const mappedInmuebles = dbInmuebles.map((row: any) => ({
          ...row,
          'Inmueble': row.inmueble || row.cod_cont,
          'Clasificacion': row.clasificacion || 'Residencial',
          'Tipo': 'Urbano',
          'Saldo': (parseFloat(row.deuda_congelada_bs || 0) + (parseFloat(row.deuda_mmv || 0) * currentTcmmv)).toFixed(2),
          'DeudaMMV': parseFloat(row.deuda_mmv || 0),
          'DeudaCongelada': parseFloat(row.deuda_congelada_bs || 0),
          'Cant Inmuebles': 1,
          'Actividad Principal': row.actividad || 'No aplica',
          'Direccion': row.direccion
        }));
        setInmuebles(mappedInmuebles);
        
        setCondominios(apiCondominios);
        
        const map = new Map();
        dbInmuebles.forEach((row: any) => {
          if (row.identidad && !map.has(row.identidad)) {
            let clase = row.clasificacion;
            const act = row.actividad_principal || '';
            
            if (!clase) {
              clase = 'Residencial';
              if (ordenanzaData.actividadesIndustriales.some(a => a.label === act)) {
                clase = 'Industrial';
              } else if (ordenanzaData.actividadesComerciales.some(a => a.label === act)) {
                clase = 'Comercial';
              } else if (act && act !== 'No aplica') {
                if (!act.toLowerCase().includes('condominio') && !act.toLowerCase().includes('residencial')) {
                   clase = 'Comercial';
                }
              }
            }

            map.set(row.identidad, {
              Identidad: row.identidad,
              Contribuyente: row.contribuyentes?.nombre || row.nombre || row.contribuyente || 'Sin Nombre',
              Telefono: row.contribuyentes?.telefono || row.telefono || 'No registrado',
              Correo: row.contribuyentes?.email || row.email || row.correo_electronico || row.correo || 'No registrado',
              CodCont: row.inmueble || row.cod_cont,
              cod_cont: row.inmueble || row.cod_cont,
              Direccion: (function() {
                if (act.includes('[HIJO_DE:')) {
                  const match = act.match(/\[HIJO_DE:(.*?)\]/);
                  if (match) {
                    const padreUrb = match[1];
                    const padre = dbInmuebles.find((i: any) => i.inmueble === padreUrb);
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
              DeudaBs: (parseFloat(row.deuda_congelada_bs || 0) + (parseFloat(row.deuda_mmv || 0) * currentTcmmv)),
              MesesDeuda: parseInt(row.meses_deuda || '0'),
              Estado: row.estado || 'Activo',
              FechaRegistro: row.created_at || null
            });
          } else if (row.identidad && map.has(row.identidad)) {
            // Si ya existe, sumar saldo a favor
            const existing = map.get(row.identidad);
            existing.SaldoFavor += parseFloat(row.saldo_favor_bs || '0');
            existing.DeudaMMV += parseFloat(row.deuda_mmv || 0);
            existing.DeudaCongelada += parseFloat(row.deuda_congelada_bs || 0);
            existing.DeudaBs = (existing.DeudaCongelada + (existing.DeudaMMV * currentTcmmv));
            // Mantener el estado más severo si hay múltiples (Eliminado > Inactivo > Activo)
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
        setContribuyentes(Array.from(map.values()));
      }

      if (dbPreRegistros) setPreRegistros(dbPreRegistros);
      if (dbFacturas) setFacturas(dbFacturas);
      if (dbDocumentos) setDocumentos(dbDocumentos);
      if (dbCertificados) setCertificados(dbCertificados);
      // Removed overwriting of setCondominios
      if (dbReclamos) setReclamos(dbReclamos);
      if (dbConvenios) setConvenios(dbConvenios);
      if (dbPreLiquidaciones) setPreLiquidaciones(dbPreLiquidaciones);

    } catch (error) {
      console.error("Error loading data from Supabase:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = async () => {
    await loadAllData();
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const addAuditLog = async (action: string, details: string) => {
    try {
      const user = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || 'Administrador';
      const letra = (typeof window !== 'undefined' ? localStorage.getItem('adminLetra') : null);
      const user_id = letra && user !== 'Administrador' ? `${letra}-${user}` : user;
      
      const { error } = await supabase.from('audit_logs').insert([{
        user_id,
        action,
        ip_address: 'Registrado por Sistema',
        details
      }]);
      if (error) console.error("Error logging audit:", error);
      else {
        // Refetch audit logs ideally, but we can just reload them in the component or rely on DB
      }
    } catch (e) {
      console.error(e);
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
          mmv_mes: calcularMmvMes(data, ordenanzasConfig)
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
    const clasificacion = localOrData.uso || localOrData.Clasificacion || 'Residencial';
    
    if (clasificacion === 'Residencial') {
      const tipo = localOrData.tipoResidencia || localOrData.TipoResidencia;
      // Búsqueda exacta primero, luego case-insensitive
      const tarifa = config.tiposResidenciales?.find((t: any) => t.label === tipo)
        || config.tiposResidenciales?.find((t: any) => t.label.toLowerCase().trim() === (tipo || '').toLowerCase().trim());
      if (tarifa) mmv = tarifa.factor;
    } else {
      const act = localOrData.actividad || localOrData.ActividadComercial;
      // Búsqueda case-insensitive de actividad
      const tarifa = config.actividadesComerciales?.find((t: any) => t.label === act)
        || config.actividadesComerciales?.find((t: any) => t.label.toLowerCase().trim() === (act || '').toLowerCase().trim())
        || config.actividadesIndustriales?.find((t: any) => t.label === act)
        || config.actividadesIndustriales?.find((t: any) => t.label.toLowerCase().trim() === (act || '').toLowerCase().trim());
      
      if (tarifa && tarifa.factores) {
        const nivel = localOrData.nivel || localOrData.NivelMetraje;
        // Búsqueda case-insensitive del nivel de generación
        const index = config.nivelesMetraje?.findIndex(
          (n: string) => n.toLowerCase().trim() === (nivel || '').toLowerCase().trim()
        ) ?? -1;
        const safeIndex = index >= 0 ? index : 0;
        mmv = tarifa.factores[safeIndex] ?? tarifa.factores[0];
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
            mmv_mes: calcularMmvMes(local, ordenanzasConfig)
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
          mmv_mes: calcularMmvMes(data, ordenanzasConfig)
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
      setInmuebles,
      updateContribuyente,
      addContribuyente,
      aprobarPreRegistro,
      addFactura,
      setPreRegistros,
      setFacturas,
      refreshData
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
