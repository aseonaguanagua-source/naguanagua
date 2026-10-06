import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
Object.assign(process.env, env);
(async () => {
  const { prepararCobro, cajaActiva } = await import('@/lib/condominios/cobro');
  const { resumenGeneral } = await import('@/lib/condominios/servicio');
  console.log('caja activa:', await cajaActiva());
  for (const cod of ['URB031929', 'URB033533', 'URB009841', 'URB026666']) {
    const t = Date.now();
    const c = await prepararCobro({ codigo: cod });
    console.log(cod, c.condo.nombre.slice(0, 40), c.condo.modalidad, '| elegir:', c.puedeElegirUnidades, '| lineas', c.lineas.length, '| total Bs', c.totales.totalBs, '| meses', c.totales.meses, '|', Date.now() - t, 'ms');
    if (c.lineas[0]) {
      const c1 = await prepararCobro({ codigo: cod, claves: [c.lineas[0].clave], meses: 1 });
      console.log('   1 unidad, 1 mes →', c1.lineas.length, 'lineas, Bs', c1.totales.totalBs, c1.lineas[0]?.periodos);
    }
  }
  const t = Date.now();
  const r = await resumenGeneral();
  console.log('resumen:', r.panel.condominios, 'condos', r.panel.unidades, 'unidades, deuda Bs', r.panel.deudaBs, 'mensual', r.panel.mensualBs, '|', Date.now() - t, 'ms');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
