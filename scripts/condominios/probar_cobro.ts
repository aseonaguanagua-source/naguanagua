import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
Object.assign(process.env, env);
/**
 * Prueba del cobro de condominios (SOLO CALCULA, no escribe):
 *  - modo CONDOMINIO → 1 factura al condominio
 *  - modo CONTRIBUYENTE por cédula → 1 factura al dueño
 *  - modo CONTRIBUYENTE con locales de 2 dueños → 2 facturas (pago repartido)
 */
(async () => {
  const { prepararCobro, cajaActiva } = await import('@/lib/condominios/cobro');
  const { supabaseAdmin: sb } = await import('@/lib/supabaseAdmin');
  console.log('caja activa:', await cajaActiva());
  const { data: com } = await sb.from('condominios').select('codigo').neq('tipo', 'RESIDENCIAL').limit(40);
  const cods = ['URB031929', 'URB033533', ...(com || []).map((c: any) => c.codigo)];
  let probadoRepartido = false;
  for (const cod of cods) {
    const t = Date.now();
    const c = await prepararCobro({ codigo: cod, modo: 'CONDOMINIO' });
    const dueños = [...new Set(c.lineas.map(l => l.identidad).filter(Boolean))];
    if (cods.indexOf(cod) < 2 || (!probadoRepartido && dueños.length >= 2)) {
      console.log(`\n${cod} ${c.condo.nombre.slice(0, 40)} [${c.condo.tipo}/${c.condo.modalidad}] porActividad=${c.estado.porActividad} | ${Date.now() - t} ms`);
      console.log(`  CONDOMINIO: ${c.lineas.length} renglones, Bs ${c.totales.totalBs} (multas ${c.totales.multaBs}) → facturas: ${c.facturas.map(f => `${f.identidad} Bs ${f.totalBs}`).join(' | ')}`);
      c.avisos.forEach(a => console.log('   aviso:', a));
      if (dueños[0]) {
        const c1 = await prepararCobro({ codigo: cod, modo: 'CONTRIBUYENTE', identidad: dueños[0] });
        console.log(`  CONTRIBUYENTE ${dueños[0]}: ${c1.lineas.length} renglones, Bs ${c1.totales.totalBs} (multas ${c1.totales.multaBs}) → facturas: ${c1.facturas.map(f => `${f.identidad} Bs ${f.totalBs}`).join(' | ')}`);
        const m = await prepararCobro({ codigo: cod, modo: 'CONTRIBUYENTE', identidad: dueños[0], soloMultas: true });
        console.log(`  SOLO MULTAS ${dueños[0]}: Bs ${m.totales.totalBs}`);
      }
      if (dueños.length >= 2) {
        const claves = [c.lineas.find(l => l.identidad === dueños[0])!.clave, c.lineas.find(l => l.identidad === dueños[1])!.clave];
        const c2 = await prepararCobro({ codigo: cod, modo: 'CONTRIBUYENTE', claves });
        console.log(`  REPARTIDO (2 dueños): Bs ${c2.totales.totalBs} → ${c2.facturas.length} facturas: ${c2.facturas.map(f => `${f.identidad} Bs ${f.totalBs}`).join(' | ')}`);
        const suma = Math.round(c2.facturas.reduce((a, f) => a + f.totalBs, 0) * 100) / 100;
        console.log(`  cuadre suma facturas = total: ${suma === c2.totales.totalBs ? 'OK' : `NO (${suma})`}`);
        probadoRepartido = true;
      }
    }
    if (probadoRepartido && cods.indexOf(cod) >= 2) break;
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
