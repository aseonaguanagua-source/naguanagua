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
    // 1. Verificar si está registrado en la tabla oficial de condominios (residencial o comercial, cualquier modalidad)
    const orCondo = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `codigo.eq.${rawUpper}`
    ].join(',');

    const { data: cMatches } = await sb
      .from('condominios')
      .select('id, codigo, identidad, estado')
      .or(orCondo)
      .limit(10);

    if (cMatches && cMatches.some(c => {
      const est = String(c.estado || 'Activo').trim().toLowerCase();
      return est !== 'eliminado' && est !== 'inactivo';
    })) {
      return true;
    }

    // 2. Verificar si el usuario o documento pertenece a una unidad de condominio (condominio_unidades)
    const orUnidades = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `inmueble.eq.${rawUpper}`
    ].join(',');

    const { data: uMatches } = await sb
      .from('condominio_unidades')
      .select('id, inmueble, condominio_id, estado')
      .or(orUnidades)
      .neq('estado', 'Eliminada')
      .limit(5);

    if (uMatches && uMatches.length > 0) {
      return true;
    }

    // 3. Verificar en la tabla de inmuebles si el contribuyente es un condominio o posee algún inmueble perteneciente a un condominio
    const orInm = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `inmueble.eq.${rawUpper}`
    ].join(',');

    const { data: inms } = await sb
      .from('inmuebles')
      .select('inmueble, tipo, clasificacion, actividad_principal, es_condominio, condominio_padre_id, padre_id, contribuyente, estado')
      .or(orInm)
      .limit(50);

    if (inms && inms.length > 0) {
      const activos = inms.filter(i => {
        const est = String(i.estado || 'Activo').trim().toLowerCase();
        return est !== 'eliminado' && est !== 'inactivo' && est !== 'desactivado';
      });
      const listaRevisar = activos.length > 0 ? activos : inms;

      const isC = listaRevisar.some(i => {
        const clasif = String(i.clasificacion || '').toLowerCase();
        const act = String(i.actividad_principal || '').toLowerCase();
        const contrib = String(i.contribuyente || '').toLowerCase();
        const condoPadre = String(i.condominio_padre_id || '').trim();

        return (
          i.es_condominio === true ||
          Boolean(condoPadre) ||
          clasif.includes('condominio') ||
          act.includes('condominio') ||
          act.includes('padre en sigyr: urb') ||
          contrib.includes('condominio') ||
          contrib.includes('junta de cond')
        );
      });

      if (isC) return true;

      // Verificar si alguno de los códigos de inmueble del usuario figura en condominio_unidades o condominios
      const inmCodes = Array.from(
        new Set(
          listaRevisar
            .flatMap(i => [String(i.inmueble || '').trim().toUpperCase(), String(i.padre_id || '').trim().toUpperCase()])
            .filter(Boolean)
        )
      );

      if (inmCodes.length > 0) {
        const [{ data: unitByInm }, { data: condoByCode }] = await Promise.all([
          sb.from('condominio_unidades').select('id').in('inmueble', inmCodes).neq('estado', 'Eliminada').limit(1),
          sb.from('condominios').select('id, estado').in('codigo', inmCodes).limit(5),
        ]);

        if (unitByInm && unitByInm.length > 0) {
          return true;
        }
        if (condoByCode && condoByCode.some(c => {
          const est = String(c.estado || 'Activo').trim().toLowerCase();
          return est !== 'eliminado' && est !== 'inactivo';
        })) {
          return true;
        }
      }
    }
  } catch (err) {
    console.error('Error en esCondominioDoc:', err);
  }

  return false;
}

