import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Este cliente SOLO se usa en API routes del servidor (nunca en el frontend).
// Bypassa todas las políticas RLS de Supabase.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
