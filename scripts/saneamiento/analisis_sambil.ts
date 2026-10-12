// Análisis Sambil (URB016119): sistema viejo (Excel SIGYR) vs sistema nuevo (motor de condominios).
// npx tsx scripts/saneamiento/analisis_sambil.ts
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/sambil';
const CONDO = 'URB016119';

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { cargarCondominio, calcularEstado } = await import('../../src/lib/condominios/servicio');
  const { calcularMensualidad } = await import('../../src/lib/calculos');

  const j = JSON.parse(fs.readFileSync(`${SCR}/sambil.json`, 'utf8'));
  const viejo = j['Detalle por Unidad'].slice(7).filter((r: any[]) => /^(URB|AURI)/.test(String(r[0]))).map((r: any[]) => ({
    codigo: r[0], nombre: r[1], numero: r[2], rif: r[3], actividad: r[4], mensual: +r[5] || 0, meses: +r[6] || 0, base: +r[7] || 0, iva: +r[8] || 0, total: +r[11] || 0,
  }));
  // Tasa del Excel viejo: local desocupado = 1,98 × 57 × tasa × 0,128
  const desoc = viejo.find((v: any) => /DESOCUPADO/.test(v.actividad) && v.base > 0);
  const tasa = desoc.base / (1.98 * 57 * 0.128);

  const d: any = await cargarCondominio(CONDO);
  if (!d) throw new Error('condominio no encontrado');
  const e = calcularEstado(d.condo, d.unidades, tasa, new Date(), d.multas);

  // Inmuebles de todos los códigos + hijos (padre_id) de los N/A
  const cods = [...new Set([...viejo.map((v: any) => v.codigo), ...d.unidades.map((u: any) => u.inmueble).filter(Boolean)])];
  const inm = new Map<string, any>();
  for (let i = 0; i < cods.length; i += 150) {
    const { data } = await sb.from('inmuebles').select('id, inmueble, identidad, contribuyente, actividad_principal, clasificacion, tipo, mmv_mes, cant_inmuebles, padre_id, condominio_padre_id, estado, meses_deuda, deuda_mmv, numero_local, notas, agente_retencion').in('inmueble', cods.slice(i, i + 150));
    (data || []).forEach((r: any) => inm.set(r.inmueble, r));
  }
  const naCods = [...inm.values()].filter(r => /^N\/?A$/i.test(String(r.actividad_principal || '').trim())).map(r => r.inmueble);
  const hijos = new Map<string, any[]>();
  for (let i = 0; i < naCods.length; i += 100) {
    const { data } = await sb.from('inmuebles').select('inmueble, identidad, contribuyente, actividad_principal, clasificacion, tipo, mmv_mes, cant_inmuebles, padre_id, condominio_padre_id, estado, meses_deuda, deuda_mmv, notas').in('padre_id', naCods.slice(i, i + 100));
    (data || []).forEach((r: any) => { if (!hijos.has(r.padre_id)) hijos.set(r.padre_id, []); hijos.get(r.padre_id)!.push(r); });
  }
  fs.writeFileSync(`${SCR}/analisis.json`, JSON.stringify({
    tasa, viejo, unidades: d.unidades, condo: d.condo,
    estado: { totales: e.totales, mensual: e.mensual, renglones: e.renglones.map(r => ({ clave: r.clave, inmueble: r.inmueble, numero: r.numero, propietario: r.propietario, identidad: r.identidad, actividad: r.actividad, estado: r.estado, esGrupo: r.esGrupo, padreId: r.padreId, residencial: r.residencial, mensualBs: r.mensualBs, meses: r.deuda.meses, baseBs: r.deuda.baseBs, ivaBs: r.deuda.ivaBs, multaBs: r.deuda.multaBs, totalBs: r.totalBs })) },
    inmuebles: Object.fromEntries(inm), hijosNA: Object.fromEntries(hijos),
    mensualInm: Object.fromEntries([...inm.values()].map(r => [r.inmueble, calcularMensualidad(r, tasa)])),
    mensualHijos: Object.fromEntries([...hijos.values()].flat().map(r => [r.inmueble, calcularMensualidad(r, tasa)])),
  }, null, 1));
  console.log({ tasa, viejoFilas: viejo.length, viejoTotal: viejo.reduce((s: number, v: any) => s + v.total, 0), unidadesNuevo: d.unidades.length, renglones: e.renglones.length, nuevoTotal: e.totales.totalBs, naEnDB: naCods.length, naConHijos: hijos.size, hijosTotal: [...hijos.values()].flat().length, modalidad: d.condo.modalidad });
})();
