// Sube los respaldos JSON del saneamiento y los SQL/PDF a Supabase Storage (bucket privado "respaldos").
// npx tsx scripts/saneamiento/subir_respaldos.ts
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
config({ path: '.env.local' });
const RESP = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/global/respaldo_20261012';
const SQLD = '/Users/davidzara/Documents/naguanagua_zero/SQL_GLOBAL';
const EXTRA = ['/Users/davidzara/Documents/naguanagua_zero/Plan_Saneamiento_Global.pdf', '/Users/davidzara/Documents/naguanagua_zero/SQL_Sambil_URB016119.sql', '/Users/davidzara/Documents/naguanagua_zero/Comparativo_Sambil_URB016119.pdf'];

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: bs } = await sb.storage.listBuckets();
  if (!bs?.some(b => b.name === 'respaldos')) { const { error } = await sb.storage.createBucket('respaldos', { public: false, fileSizeLimit: '50MB' }); if (error) console.log('bucket', error.message); }
  const files = [
    ...(fs.existsSync(RESP) ? fs.readdirSync(RESP).map(f => [`${RESP}/${f}`, `saneamiento_20261012/respaldo/${f}`]) : []),
    ...fs.readdirSync(SQLD).map(f => [`${SQLD}/${f}`, `saneamiento_20261012/sql/${f}`]),
    ...EXTRA.filter(fs.existsSync).map(f => [f, `saneamiento_20261012/${path.basename(f)}`]),
  ];
  for (const [src, dst] of files) {
    const ct = src.endsWith('.pdf') ? 'application/pdf' : src.endsWith('.json') ? 'application/json' : 'text/plain';
    const { error } = await sb.storage.from('respaldos').upload(dst, fs.readFileSync(src), { upsert: true, contentType: ct });
    console.log(error ? `ERR ${dst}: ${error.message}` : `OK ${dst} (${(fs.statSync(src).size / 1e6).toFixed(1)} MB)`);
  }
})();
