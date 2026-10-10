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
