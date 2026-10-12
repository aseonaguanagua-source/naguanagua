// Analiza (SOLO LEE) qué condominios / locales / contribuyentes NO existen en SIGYR (sistema viejo).
// npx tsx scripts/saneamiento/analisis_eliminar.ts  → scratch/global/eliminar.json
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/global';
const CORTE = '2026-10-05T22:07:05Z'; // fecha del export de SIGYR: lo creado DESPUÉS es nuevo y legítimo

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const all = async (t: string, cols: string) => {
    const out: any[] = []; let o = 0;
    for (;;) { const { data, error } = await sb.from(t).select(cols).range(o, o + 999); if (error) throw new Error(t + ': ' + error.message); out.push(...(data || [])); if (!data || data.length < 1000) break; o += 1000; }
    return out;
  };
  const sig: any[] = JSON.parse(fs.readFileSync(`${SCR}/sigyr_props.json`, 'utf8'));
  const S = new Map<string, { padre: string | null; borrado: number }>();
  sig.forEach(([code, padre, borrado]) => S.set(String(code).toUpperCase(), { padre, borrado }));

  const condos = await all('condominios', 'id, codigo, nombre, estado, origen, created_at');
  const unis = await all('condominio_unidades', 'id, condominio_id, inmueble, propietario, estado, creada_en_modulo, created_at');
  const inm = await all('inmuebles', 'id, inmueble, contribuyente, estado, created_at, meses_deuda');
  const pagos = await all('pagos_reportados', 'id, estado, detalles');

  // códigos con algún pago (cualquier estado) → NO se eliminan, van a revisión
  const conPago = new Set<string>();
  for (const p of pagos) {
    if (p.inmueble) conPago.add(String(p.inmueble).toUpperCase());
    let d: any = {}; try { d = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {}); } catch { /* */ }
    (Array.isArray(d.recibos) ? d.recibos : []).forEach((r: string) => { const m = String(r).toUpperCase().match(/^(?:RECIB-HIST|CONDO)-(.+?)-(?:M)?\d+$/); if (m) conPago.add(m[1]); });
    (Array.isArray(d.deuda_previa) ? d.deuda_previa : []).forEach((x: any) => x?.inmueble && conPago.add(String(x.inmueble).toUpperCase()));
    if (d.condominio?.codigo) conPago.add(String(d.condominio.codigo).toUpperCase());
    (Array.isArray(d.condominio?.lineas) ? d.condominio.lineas : []).forEach((l: any) => l?.inmueble && conPago.add(String(l.inmueble).toUpperCase()));
  }
  const motivo = (code: string) => { const s = S.get(String(code || '').toUpperCase()); return !s ? 'NO EXISTE en SIGYR' : s.borrado ? 'ELIMINADO en SIGYR' : null; };
  const nuevo = (r: any) => String(r.created_at || '') > CORTE;

  const res: any = { condominios: { eliminar: [], revisar: [] }, unidades: { eliminar: [], revisar: [] }, inmuebles: { eliminar: [], revisar: [] } };
  const condoCod = new Map(condos.map(c => [c.id, c.codigo]));
  for (const c of condos) {
    if (c.estado !== 'Activo') continue;
    const m = motivo(c.codigo); if (!m) continue;
    const it = { id: c.id, codigo: c.codigo, nombre: c.nombre, motivo: m };
    (nuevo(c) || c.origen === 'MODULO' || conPago.has(String(c.codigo).toUpperCase()) ? res.condominios.revisar : res.condominios.eliminar)
      .push({ ...it, razonRevisar: nuevo(c) ? 'creado después del corte' : conPago.has(String(c.codigo).toUpperCase()) ? 'tiene pagos' : c.origen === 'MODULO' ? 'creado en el módulo' : undefined });
  }
  const condosEliminar = new Set(res.condominios.eliminar.map((c: any) => c.id));
  for (const u of unis) {
    if (u.estado === 'Eliminada') continue;
    const m = motivo(u.inmueble); if (!m && !condosEliminar.has(u.condominio_id)) continue;
    const it = { id: u.id, condominio: condoCod.get(u.condominio_id), inmueble: u.inmueble, propietario: u.propietario, motivo: m || 'su condominio se elimina' };
    const rz = nuevo(u) ? 'creado después del corte' : u.creada_en_modulo ? 'creado en el módulo' : conPago.has(String(u.inmueble).toUpperCase()) ? 'tiene pagos' : null;
    (rz ? res.unidades.revisar : res.unidades.eliminar).push(rz ? { ...it, razonRevisar: rz } : it);
  }
  for (const r of inm) {
    if (r.estado === 'Eliminado') continue;
    const m = motivo(r.inmueble); if (!m) continue;
    const it = { id: r.id, inmueble: r.inmueble, contribuyente: r.contribuyente, estado: r.estado, motivo: m };
    const rz = nuevo(r) ? 'creado después del corte' : conPago.has(String(r.inmueble).toUpperCase()) ? 'tiene pagos' : null;
    (rz ? res.inmuebles.revisar : res.inmuebles.eliminar).push(rz ? { ...it, razonRevisar: rz } : it);
  }
  fs.writeFileSync(`${SCR}/eliminar.json`, JSON.stringify(res, null, 1));
  const cnt = (o: any) => ({ eliminar: o.eliminar.length, revisar: o.revisar.length });
  console.log(JSON.stringify({ condominios: cnt(res.condominios), unidades: cnt(res.unidades), inmuebles: cnt(res.inmuebles), sigyr: S.size, totInm: inm.length }));
  const rz: any = {}; [...res.unidades.revisar, ...res.inmuebles.revisar, ...res.condominios.revisar].forEach((x: any) => rz[x.razonRevisar] = (rz[x.razonRevisar] || 0) + 1);
  const mt: any = {}; [...res.unidades.eliminar, ...res.inmuebles.eliminar, ...res.condominios.eliminar].forEach((x: any) => mt[x.motivo] = (mt[x.motivo] || 0) + 1);
  console.log(rz, mt);
})();
