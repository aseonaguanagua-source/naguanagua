// Solo lectura: N/A (contenedores) de SIGYR cuyas actividades NO están ligadas en el sistema nuevo.
import { createClient } from '@supabase/supabase-js'; import * as dotenv from 'dotenv'; import fs from 'fs';
dotenv.config({ path: '.env.local', quiet: true } as any);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/global';
(async () => {
  const sig: any[] = JSON.parse(fs.readFileSync(`${SCR}/sigyr_props.json`, 'utf8'));
  const db = new Map<string, any>();
  for (let from = 0; ; from += 1000) {
    let r: any; for (let t = 0; t < 5; t++) { r = await sb.from('inmuebles').select('inmueble,padre_id,condominio_padre_id,actividad_principal,identidad,contribuyente,estado,es_condominio').order('inmueble').range(from, from + 999); if (!r.error) break; await new Promise(s => setTimeout(s, 2000)); }
    if (r.error) throw r.error; r.data.forEach((d: any) => db.set(d.inmueble, d)); if (r.data.length < 1000) break;
  }
  const vivo = new Map(sig.filter(s => !s[2]).map(s => [s[0], s]));
  const hijos = new Map<string, string[]>();
  for (const s of vivo.values()) if (s[1] && vivo.has(s[1])) { const a = hijos.get(s[1]) || []; a.push(s[0]); hijos.set(s[1], a); }
  const casos: any[] = [];
  for (const [padre, hs] of hijos) {
    const p = db.get(padre); if (!p || p.es_condominio) continue;
    const esNA = String(p.actividad_principal || '').trim().toUpperCase() === 'N/A' || String(vivo.get(padre)?.[4] || '').toUpperCase().includes('N/A');
    if (!esNA) continue;
    const sueltos = hs.filter(h => { const d = db.get(h); return d && d.estado !== 'Eliminado' && d.padre_id !== padre && d.condominio_padre_id !== padre; });
    const faltan = hs.filter(h => !db.has(h));
    if (sueltos.length || faltan.length) casos.push({ padre, nombre: p.contribuyente, identidad: p.identidad, hijos: hs.length, sueltos, faltan, padreActual: sueltos.map(h => db.get(h).padre_id || db.get(h).condominio_padre_id || null) });
  }
  fs.writeFileSync(`${SCR}/na_sueltos.json`, JSON.stringify(casos, null, 1));
  console.log('N/A con actividades sueltas:', casos.length, 'actividades sueltas:', casos.reduce((a, c) => a + c.sueltos.length, 0), 'faltantes:', casos.reduce((a, c) => a + c.faltan.length, 0));
  console.log(casos.filter(c => /LUX/i.test(c.nombre)).map(c => JSON.stringify(c)).join('\n'));
  console.log(casos.slice(0, 8).map(c => `${c.padre} ${String(c.nombre).slice(0, 30)} hijos=${c.hijos} sueltos=${c.sueltos.length} actual=${[...new Set(c.padreActual)].join('/')}`).join('\n'));
})();
