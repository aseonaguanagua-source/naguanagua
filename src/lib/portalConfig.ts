import { createClient } from '@supabase/supabase-js';
import { getIdentidadVariantsExact } from '@/lib/formatters';

/**
 * Valor por defecto para el interruptor del portal "Soy Contribuyente".
 * Si la tabla system_config existe, se usará el valor de ahí en lugar de este.
 */
export const PORTAL_EN_MANTENIMIENTO = true;

export const MENSAJE_MANTENIMIENTO_PORTAL =
  'El portal Soy Contribuyente se encuentra en mantenimiento. Por favor intente más tarde o diríjase a nuestras oficinas de Aseo Urbano.';

export async function checkSystemConfig(key: string, defaultValue: boolean): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (supabaseUrl && supabaseKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabaseAdmin
        .from('system_config')
        .select('value')
        .eq('key', key)
        .limit(1)
        .maybeSingle();
        
      if (!error && data) {
        return data.value === 'true';
      }
    }
  } catch (err) {
    console.error(`Error reading system_config for ${key}`, err);
  }
  
  return defaultValue;
}

export async function checkPortalMantenimiento(): Promise<boolean> {
  return checkSystemConfig('PORTAL_EN_MANTENIMIENTO', PORTAL_EN_MANTENIMIENTO);
}

export const MENSAJE_CONDOMINIO_BLOQUEADO =
  'Error de conexión (ERR-CONN-R). Por favor revise su conexión a internet. Si persiste la falla por favor comunicarse con los números de atención del IAMEC:\n• Aseo Comercial: 0424-4282365\n• Aseo Residencial: 0424-4282364\n• Atención Mixta (Residencial y Comercial): 0424-4526080 / 0414-5952927';

export async function esCondominioDoc(doc: string): Promise<boolean> {
  if (!doc) return false;
  const raw = String(doc).trim();
  const rawUpper = raw.toUpperCase();
  if (!rawUpper) return false;

  // Variantes exactas de identidad (V, E, J, G, P con/sin guion y con/sin ceros a la izquierda)
  const variantesSet = new Set<string>([
    ...getIdentidadVariantsExact(rawUpper),
    rawUpper,
  ]);
  const variantes = Array.from(variantesSet).filter(Boolean);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) return false;
  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Consultar en paralelo condominios, unidades de condominio (condominio_unidades) e inmuebles asociados al documento
    const orCondo = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `codigo.eq.${rawUpper}`
    ].join(',');

    const orUnidades = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `inmueble.eq.${rawUpper}`
    ].join(',');

    const orInm = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `inmueble.eq.${rawUpper}`
    ].join(',');

    const [{ data: cMatches }, { data: uMatches }, { data: inms }] = await Promise.all([
      sb
        .from('condominios')
        .select('id, codigo, identidad, estado')
        .or(orCondo)
        .limit(20),
      sb
        .from('condominio_unidades')
        .select('id, inmueble, condominio_id, estado')
        .or(orUnidades)
        .neq('estado', 'Eliminada')
        .limit(50),
      sb
        .from('inmuebles')
        .select('inmueble, tipo, clasificacion, actividad_principal, es_condominio, condominio_padre_id, padre_id, contribuyente, estado')
        .or(orInm)
        .limit(100),
    ]);

    // Códigos de inmuebles que fueron desactivados o eliminados en la tabla maestra `inmuebles`
    const codigosInactivosEnPadron = new Set<string>(
      (inms || [])
        .filter(i => {
          const est = String(i.estado || 'Activo').trim().toLowerCase();
          return est === 'eliminado' || est === 'inactivo' || est === 'desactivado';
        })
        .map(i => String(i.inmueble || '').trim().toUpperCase())
        .filter(Boolean)
    );

    const condominiosActivosReales = (cMatches || []).filter(c => {
      const est = String(c.estado || 'Activo').trim().toLowerCase();
      if (est === 'eliminado' || est === 'inactivo' || est === 'desactivado') return false;
      const code = String(c.codigo || '').trim().toUpperCase();
      if (code && codigosInactivosEnPadron.has(code)) return false;
      return true;
    });

    const activos = (inms || []).filter(i => {
      const est = String(i.estado || 'Activo').trim().toLowerCase();
      return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
    });

    if (activos.length > 0) {
      // Recopilar todos los códigos de inmueble y padres para cruzar con condominio_unidades y condominios
      const inmCodes = Array.from(
        new Set(
          activos
            .flatMap(i => [String(i.inmueble || '').trim().toUpperCase(), String(i.padre_id || '').trim().toUpperCase()])
            .filter(Boolean)
        )
      );

      const condoCodesSet = new Set<string>();
      condominiosActivosReales.forEach(c => {
        const code = String(c.codigo || '').trim().toUpperCase();
        if (code) condoCodesSet.add(code);
      });
      (uMatches || []).forEach(u => {
        const c = String(u.inmueble || '').trim().toUpperCase();
        if (c && !codigosInactivosEnPadron.has(c)) condoCodesSet.add(c);
      });

      if (inmCodes.length > 0) {
        const [{ data: unitByInm }, { data: condoByCode }] = await Promise.all([
          sb.from('condominio_unidades').select('inmueble').in('inmueble', inmCodes).neq('estado', 'Eliminada').limit(100),
          sb.from('condominios').select('codigo, estado').in('codigo', inmCodes).limit(20),
        ]);

        (unitByInm || []).forEach(u => {
          const c = String(u.inmueble || '').trim().toUpperCase();
          if (c && !codigosInactivosEnPadron.has(c)) condoCodesSet.add(c);
        });

        (condoByCode || []).forEach(c => {
          const est = String(c.estado || 'Activo').trim().toLowerCase();
          const code = String(c.codigo || '').trim().toUpperCase();
          if (est !== 'eliminado' && est !== 'inactivo' && code && !codigosInactivosEnPadron.has(code)) {
            condoCodesSet.add(code);
          }
        });
      }

      // Identificar cuáles inmuebles del usuario son condominios o filiales de condominio
      // NOTA: "OFICINAS DE CONDOMINIO" es una actividad económica comercial individual de la Ordenanza, NO un condominio.
      activos.forEach(i => {
        const code = String(i.inmueble || '').trim().toUpperCase();
        const clasif = String(i.clasificacion || '').toLowerCase();
        const act = String(i.actividad_principal || '').toLowerCase();
        const contrib = String(i.contribuyente || '').toLowerCase();
        const condoPadre = String(i.condominio_padre_id || '').trim();
        const esActOficinaCondominio = act.includes('oficina');
        const esActCondominioMatriz = act.includes('condominio') && !esActOficinaCondominio;

        if (
          i.es_condominio === true ||
          Boolean(condoPadre) ||
          clasif.includes('condominio') ||
          esActCondominioMatriz ||
          act.includes('padre en sigyr: urb') ||
          (!esActOficinaCondominio && (contrib.includes('condominio') || contrib.includes('junta de cond')))
        ) {
          if (code) condoCodesSet.add(code);
        }
      });

      const esInmDeCondominio = (i: any): boolean => {
        const code = String(i.inmueble || '').trim().toUpperCase();
        const padre = String(i.padre_id || '').trim().toUpperCase();
        if (code && condoCodesSet.has(code)) return true;
        if (padre && (condoCodesSet.has(padre) || padre.startsWith('CONDO-'))) return true;
        return false;
      };

      // Si el contribuyente tiene al menos un inmueble individual independiente (que NO pertenece a condominio)
      // y además tiene algún inmueble de condominio: permitir el acceso al portal para que gestione su inmueble individual.
      const tieneInmuebleIndividualIndependiente = activos.some(i => {
        if (esInmDeCondominio(i)) return false;
        const code = String(i.inmueble || '').trim().toUpperCase();
        const isNA = String(i.actividad_principal || '').trim().toUpperCase() === 'N/A';
        if (isNA && code) {
          const hijos = activos.filter(h => String(h.padre_id || '').trim().toUpperCase() === code);
          if (hijos.length > 0 && hijos.every(esInmDeCondominio)) return false;
        }
        return true;
      });

      const tieneAlgunCondominio = activos.some(esInmDeCondominio) || (uMatches && uMatches.length > 0);
      if (tieneAlgunCondominio && !tieneInmuebleIndividualIndependiente) {
        return true;
      }
      return false;
    }

    if (uMatches && uMatches.length > 0) {
      return true;
    }
  } catch (err) {
    console.error('Error en esCondominioDoc:', err);
  }

  return false;
}

