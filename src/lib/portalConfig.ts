import { createClient } from '@supabase/supabase-js';

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
        .single();
        
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
  'Error de conexión (ERR-CONN-R). Por favor revise su conexión a internet. Si el problema persiste o requiere asistencia, contáctenos a los números del IAMEC:\n• Aseo Residencial: 0424-4282364\n• Aseo Comercial: 0424-4282365\n• Atención Mixta: 0424-4526080 / 0414-5952927';

export async function esCondominioDoc(doc: string): Promise<boolean> {
  if (!doc) return false;
  const raw = String(doc).trim();
  const rawNaked = raw.replace(/^[VJGEP]-?/i, '');
  const variantes = Array.from(new Set([
    raw,
    raw.toUpperCase(),
    rawNaked,
    `V-${rawNaked}`,
    `J-${rawNaked}`,
    `G-${rawNaked}`,
    `E-${rawNaked}`
  ]));
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) return false;
  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    const orCondo = [
      ...variantes.map(v => `identidad.eq.${v}`),
      `codigo.eq.${raw}`,
      `codigo.eq.${raw.toUpperCase()}`
    ].join(',');

    const { data: cMatches } = await sb
      .from('condominios')
      .select('id, codigo, identidad')
      .or(orCondo)
      .limit(1);

    if (cMatches && cMatches.length > 0) return true;

    const orInm = variantes.map(v => `identidad.eq.${v}`).join(',');
    const { data: inms } = await sb
      .from('inmuebles')
      .select('inmueble, tipo, clasificacion, es_condominio')
      .or(orInm)
      .limit(5);

    if (inms && inms.length > 0) {
      const isC = inms.some(i => 
        i.es_condominio === true ||
        String(i.tipo || '').toLowerCase().includes('condominio') ||
        String(i.clasificacion || '').toLowerCase().includes('condominio')
      );
      if (isC) return true;
    }
  } catch (err) {
    console.error('Error en esCondominioDoc:', err);
  }

  return false;
}

