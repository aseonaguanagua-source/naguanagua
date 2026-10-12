// Aplica en Supabase los SQL de SQL_GLOBAL (01,02,03,05,06) usando la API (service role), sentencia por sentencia.
// Antes guarda un respaldo JSON completo. Solo entiende las formas de UPDATE/INSERT que genera global_sql.ts.
// npx tsx scripts/saneamiento/aplicar_sql_global.ts [--dry]
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
const DIR = '/Users/davidzara/Documents/naguanagua_zero/SQL_GLOBAL';
const BK = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/global/respaldo_20261012';
const DRY = process.argv.includes('--dry');

// divide s por sep fuera de comillas y paréntesis
function splitTop(s: string, sep: string): string[] {
  const out: string[] = []; let d = 0, q = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else q = false; } continue; }
    if (ch === "'") { q = true; cur += ch; continue; }
    if (ch === '(') d++; if (ch === ')') d--;
    if (d === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += ch;
  }
  out.push(cur); return out.map(x => x.trim());
}
const val = (v: string): any => {
  v = v.trim();
  if (/^NULL$/i.test(v)) return null; if (v === 'true') return true; if (v === 'false') return false;
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return { raw: v };
};

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const all = async (t: string, cols: string) => { const out: any[] = []; let o = 0; for (;;) { const { data, error } = await sb.from(t).select(cols).range(o, o + 999); if (error) throw new Error(error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; o += 1000; } return out; };
  const conds = (qb: any, where: string) => {
    for (const c of splitTop(where, ' AND ')) {
      let m = c.match(/^coalesce\((\w+),''\)=''$/i);
      if (m) { qb = qb.or(`${m[1]}.is.null,${m[1]}.eq.`); continue; }
      m = c.match(/^(\w+)=(.+)$/); if (!m) throw new Error('cond? ' + c);
      const v = val(m[2]); qb = v === null ? qb.is(m[1], null) : qb.eq(m[1], v);
    }
    return qb;
  };
  const subId = async (expr: string) => {
    const m = expr.match(/^\(SELECT id FROM (\w+) WHERE (.+) LIMIT 1\)$/); if (!m) throw new Error('sub? ' + expr);
    const { data } = await conds(sb.from(m[1]).select('id'), m[2]).limit(1); return data?.[0]?.id ?? null;
  };

  if (!DRY) {
    fs.mkdirSync(BK, { recursive: true });
    for (const [t, c] of [['inmuebles', 'id, inmueble, mmv_mes, numero_local, padre_id, meses_deuda, deuda_mmv, estado'], ['condominio_unidades', '*'], ['condominios', '*']]) {
      const f = `${BK}/${t}.json`; if (!fs.existsSync(f)) { const rows = await all(t, c); fs.writeFileSync(f, JSON.stringify(rows)); console.log('respaldo', t, rows.length); }
    }
  }
  const SOLO = process.argv.find(a => a.startsWith('--solo='))?.slice(7);
  const files = fs.readdirSync(DIR).filter(f => /^0[1-6]_.*\.sql$/.test(f) && (!SOLO || f.startsWith(SOLO))).sort();
  const stats: Record<string, { ok: number; sinCambio: number; err: number }> = {};
  for (const f of files) {
    const st = stats[f] = { ok: 0, sinCambio: 0, err: 0 };
    const lines = fs.readFileSync(f.startsWith('/') ? f : `${DIR}/${f}`, 'utf8').split(/\r?\n/).filter(l => /^(UPDATE|INSERT)/.test(l));
    const run = async (line: string) => {
      try {
        const stmt = splitTop(line, ';')[0];
        if (stmt.startsWith('UPDATE')) {
          const m = stmt.match(/^UPDATE (\w+) SET ([\s\S]+)$/)!; const [set, where] = splitTop(m[2], ' WHERE ');
          const data: any = {}; for (const a of splitTop(set, ',')) { const i = a.indexOf('='); data[a.slice(0, i).trim()] = val(a.slice(i + 1)); }
          if (DRY) { const { data: r } = await conds(sb.from(m[1]).select('id'), where).limit(1); r?.length ? st.ok++ : st.sinCambio++; return; }
          const { data: r, error } = await conds(sb.from(m[1]).update(data), where).select('id');
          if (error) throw error; r?.length ? st.ok++ : st.sinCambio++;
        } else {
          const m = stmt.match(/^INSERT INTO (\w+) \(([^)]+)\) SELECT ([\s\S]+)$/)!;
          const cols = m[2].split(',').map(s => s.trim());
          const [vals, ne] = splitTop(m[3], ' WHERE NOT EXISTS ');
          const nm = ne.match(/^\(SELECT 1 FROM (\w+) WHERE (.+)\)$/)!;
          const { data: ex } = await conds(sb.from(nm[1]).select('id'), nm[2]).limit(1);
          if (ex?.length) { st.sinCambio++; return; }
          const row: any = {}; const vs = splitTop(vals, ',');
          for (let i = 0; i < cols.length; i++) { const v = val(vs[i]); row[cols[i]] = v && typeof v === 'object' ? await subId(vs[i]) : v; }
          if (DRY) { st.ok++; return; }
          const { error } = await sb.from(m[1]).insert(row); if (error) throw error; st.ok++;
        }
      } catch (e: any) { st.err++; if (st.err <= 3) console.log('ERR', f, e.message, line.slice(0, 160)); }
    };
    const B = f.startsWith('06_') ? 1 : Number(process.env.B || 25);
    for (let i = 0; i < lines.length; i += B) await Promise.all(lines.slice(i, i + B).map(run));
    console.log(f, st);
  }
  fs.writeFileSync(`${DIR}/aplicado${DRY ? '_prueba' : ''}.json`, JSON.stringify(stats, null, 1));
})();
