import { createClient } from '@supabase/supabase-js'; import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local', quiet: true } as any);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async()=>{ const r = await sb.from('inmuebles').select('*').eq('inmueble','AURI001425'); console.log(r.error?.message, JSON.stringify(r.data?.[0]));
})();
