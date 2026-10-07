import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
Object.assign(process.env, env);
const S = '/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/scratch';
(async()=>{
  const { supabaseAdmin: sb } = await import('@/lib/supabaseAdmin');
  const SV = await import('@/lib/condominios/servicio');
  const sig = JSON.parse(fs.readFileSync(S+'/snap/sigyr_objetivo.json','utf8'));
  const tasa = await SV.tasaVigente();
  for (const cod of process.argv.slice(2)) {
    const d:any = await SV.cargarCondominio(cod);
    const e = SV.calcularEstado(d.condo, d.unidades, tasa);
    console.log(cod, d.condo.nombre, 'tipo', d.condo.tipo, 'mod', d.condo.modalidad, 'tarifa', d.condo.tarifa_mmv, 'act', d.condo.actividad);
    const codes = d.unidades.map((u:any)=>u.inmueble);
    const { data: inms } = await sb.from('inmuebles').select('inmueble,mmv_mes,tipo,actividad_principal,meses_deuda,deuda_mmv,estado').in('inmueble', codes.slice(0,300));
    const im = new Map((inms||[]).map((i:any)=>[i.inmueble,i]));
    const hist = new Map<string,number>();
    e.renglones.forEach((r:any)=>{ const u = d.unidades.find((x:any)=>x.id===r.clave); const k = `tarifa_u=${u?.tarifa_mmv} act=${u?.actividad} mensual=${r.mensualBs} sigmmv=${sig[u?.inmueble]?.mmv} sigm=${sig[u?.inmueble]?.m} inm.mmv=${(im.get(u?.inmueble) as any)?.mmv_mes} inm.tipo=${(im.get(u?.inmueble) as any)?.tipo}`; hist.set(k,(hist.get(k)||0)+1); });
    [...hist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,n])=>console.log('  ',n,'×',k));
  }
  process.exit(0);
})();
