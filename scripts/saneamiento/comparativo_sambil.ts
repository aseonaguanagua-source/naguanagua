// Comparativo Sambil: viejo (Excel SIGYR) vs tarifas del sistema nuevo, con N/A = suma de sus actividades (nietos).
// npx tsx scripts/saneamiento/comparativo_sambil.ts
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/sambil';

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { calcularMensualidad, getFO, cleanClasificacionActividad } = await import('../../src/lib/calculos');
  const a = JSON.parse(fs.readFileSync(`${SCR}/analisis.json`, 'utf8'));
  const tree: any[] = JSON.parse(fs.readFileSync(`${SCR}/sigyr_tree.json`, 'utf8'));
  const tasa: number = a.tasa;
  const K = 57 * tasa * 0.128;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const codes = [...new Set([...tree.map(t => t.code), ...a.viejo.map((v: any) => v.codigo)])].filter(Boolean);
  const inm = new Map<string, any>();
  for (let i = 0; i < codes.length; i += 150) {
    const { data } = await sb.from('inmuebles').select('inmueble, identidad, contribuyente, actividad_principal, clasificacion, tipo, mmv_mes, cant_inmuebles, padre_id, condominio_padre_id, estado, notas, numero_local').in('inmueble', codes.slice(i, i + 150));
    (data || []).forEach((r: any) => inm.set(r.inmueble, r));
  }
  const unidades = new Map<string, any>(a.unidades.map((u: any) => [u.inmueble, u]));
  const vivos = tree.filter(t => !t.deleted);
  const hijosSig = vivos.filter(t => t.parent === 'URB016119');
  const nietosDe = (code: string) => vivos.filter(t => t.parent === code);

  // Mensual (base sin IVA) según el sistema nuevo: misma fórmula de Caja (calcularMensualidad):
  // F.O. guardado si es válido (≥ 1,54), si no el F.O. de la ordenanza para la actividad.
  const foDe = (code: string, actividadSigyr?: string) => {
    const r = inm.get(code);
    const mmv = r ? parseFloat(r.mmv_mes || 0) : 0;
    const act = actividadSigyr || r?.actividad_principal || '';
    // F.O. oficial (ordenanza) para la actividad, sin tarifa guardada
    const base = calcularMensualidad({ tipo: 'COMERCIAL', clasificacion: 'COMERCIAL', actividad_principal: act, mmv_mes: undefined, cant_inmuebles: 1 }, tasa);
    const fo = base / K;
    return { fo, fuente: 'ordenanza', foGuardado: mmv };
  };
  void getFO; void cleanClasificacionActividad;

  const filas: any[] = [];
  for (const v of a.viejo) {
    const sig = tree.find(t => t.code === v.codigo);
    const esNA = /^N\/?A$/i.test(String(v.actividad).trim());
    const nietos = esNA ? nietosDe(v.codigo) : [];
    let foNuevo = 0;
    const det: any[] = [];
    if (esNA) {
      for (const n of nietos) {
        const f = foDe(n.code, n.activity);
        foNuevo += f.fo;
        det.push({ codigo: n.code, numero: n.house || '', actividad: n.activity, fo: f.fo, foGuardado: f.foGuardado, fuente: f.fuente, baseBs: r2(f.fo * K), enModulo: unidades.get(n.code)?.estado || 'NO', ligado: !!unidades.get(n.code)?.padre_unidad_id });
      }
    }
    let foGuardado: number | null = null;
    if (!esNA) {
      const f = foDe(v.codigo, sig?.activity || v.actividad);
      foNuevo = f.fo;
      foGuardado = f.foGuardado;
    }
    const baseNuevo = r2(foNuevo * K);
    filas.push({
      codigo: v.codigo, numero: v.numero, nombre: v.nombre, rif: v.rif, actividad: sig?.activity || v.actividad, esNA,
      viejoBase: v.base, viejoIva: v.iva, viejoTotal: v.total,
      nuevoFO: r2(foNuevo * 1000) / 1000, foGuardado, nuevoBase: baseNuevo, nuevoIva: r2(baseNuevo * 0.16), nuevoTotal: r2(baseNuevo * 1.16),
      dif: r2(baseNuevo * 1.16 - v.total), nietos: det, estadoModulo: unidades.get(v.codigo)?.estado || 'NO ESTÁ',
    });
  }
  // Hijos vivos de SIGYR que no salen en el Excel viejo
  const faltanEnViejo = hijosSig.filter(h => !a.viejo.some((v: any) => v.codigo === h.code)).map(h => ({ codigo: h.code, numero: h.house, actividad: h.activity }));
  const tot = (k: string) => r2(filas.reduce((s, f) => s + (f[k] || 0), 0));
  const res = {
    tasa, K, filas, faltanEnViejo,
    totales: { viejoBase: tot('viejoBase'), viejoIva: tot('viejoIva'), viejoTotal: tot('viejoTotal'), nuevoBase: tot('nuevoBase'), nuevoIva: tot('nuevoIva'), nuevoTotal: tot('nuevoTotal'), nuevoFO: r2(filas.reduce((s, f) => s + f.nuevoFO, 0) * 1000) / 1000 },
    moduloActual: { modalidad: a.condo.modalidad, tarifa_mmv: a.condo.tarifa_mmv, baseBs: a.estado.totales.baseBs, ivaBs: a.estado.totales.ivaBs, retencionBs: a.estado.totales.retencionBs, totalBs: a.estado.totales.totalBs },
    sigyr: { hijosVivos: hijosSig.length, nietosVivos: vivos.length - hijosSig.length },
  };
  fs.writeFileSync(`${SCR}/comparativo.json`, JSON.stringify(res, null, 1));
  console.log(res.totales, res.moduloActual, res.sigyr, 'faltanEnViejo', faltanEnViejo.length);
  console.log('Diferencias > 1 Bs:', filas.filter(f => Math.abs(f.dif) > 1).length);
  filas.filter(f => Math.abs(f.dif) > 1).forEach(f => console.log(f.codigo, f.numero, f.actividad, 'viejo', f.viejoTotal, 'nuevo', f.nuevoTotal, 'dif', f.dif, f.esNA ? `nietos ${f.nietos.length}` : ''));
})();
