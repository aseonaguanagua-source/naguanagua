require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, KEY);
(async () => {
  const spec = await (await fetch(URL + '/rest/v1/', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })).json();
  const defs = spec.definitions || {};
  const dir = path.join('..', 'respaldos', 'saneamiento_' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const identCols = {};
  for (const [t, d] of Object.entries(defs)) {
    const cols = Object.keys(d.properties || {});
    const ic = cols.filter(c => /identidad|cedula|rif|documento/i.test(c));
    if (ic.length) identCols[t] = ic;
    let out = [], from = 0;
    while (true) {
      const { data, error } = await sb.from(t).select('*').range(from, from + 999);
      if (error) { console.log('ERR', t, error.message); break; }
      out = out.concat(data); if (data.length < 1000) break; from += 1000;
    }
    fs.writeFileSync(path.join(dir, t + '.json'), JSON.stringify(out));
    console.log(t, out.length, ic.length ? 'identidad cols: ' + ic.join(',') : '');
  }
  fs.writeFileSync(path.join(dir, '_ident_cols.json'), JSON.stringify(identCols, null, 2));
  console.log('RESPALDO EN', dir);
})();
