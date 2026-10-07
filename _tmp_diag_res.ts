import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
Object.assign(process.env, env);
const S = '/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/scratch';
(async()=>{
  const { supabaseAdmin: sb } = await import('@/lib/supabaseAdmin');
  const SV = await import('@/lib/condominios/servicio');
  const M = await import('@/lib/condominios/motor');
  const calc = await import('@/lib/calculos');
  const sig = JSON.parse(fs.readFileSync(S+'/snap/sigyr_objetivo.json','utf8'));
  const tasa = await (SV as any).tasaVigente();
  const all = async (t:string, sel:string, f?:(q:any)=>any) => { const out:any[]=[]; for(let a=0;;a+=1000){ let q=sb.from(t).select(sel).range(a,a+999); if(f) q=f(q); const {data,error}=await q; if(error) throw error; out.push(...data); if(data.length<1000) break;} return out; };
  const condos = await all('condominios','*', q=>q.eq('tipo','RESIDENCIAL'));
  const uns = await all('condominio_unidades','*');
  const by = new Map<string,any[]>(); uns.forEach(u=>{ if(!by.has(u.condominio_id)) by.set(u.condominio_id,[]); by.get(u.condominio_id)!.push(u); });
  const codes = condos.map(c=>c.codigo);
  const inms:any[] = []; for (let i=0;i<codes.length;i+=300){ const {data} = await sb.from('inmuebles').select('inmueble,mmv_mes,cant_inmuebles,meses_deuda,deuda_mmv,estado,tipo,actividad_principal').in('inmueble', codes.slice(i,i+300)); inms.push(...(data||[])); }
  const inm = new Map(inms.map(i=>[i.inmueble,i]));
  const rows:any[] = [];
  for (const c of condos) {
    const us = by.get(c.id) || [];
    const e = SV.calcularEstado(c, us, tasa);
    const vivas = us.filter(u=>u.estado!=='Eliminada');
    const grupos = vivas.filter(u=>u.es_grupo || vivas.some(h=>h.padre_unidad_id===u.id)).length;
    const legacy:any = inm.get(c.codigo);
    const legacyMensual = legacy ? calc.calcularMensualidad(legacy, tasa) : null;
    const s = sig[c.codigo];
    const sumSigUnits = vivas.reduce((a,u)=>a+((sig[u.inmueble]?.m)||0),0);
    rows.push({ codigo:c.codigo, nombre:c.nombre, modalidad:c.modalidad, porAct: M.porActividad(c), declarada:c.cant_declarada, vivas:vivas.length, grupos,
      tarifa_mmv:c.tarifa_mmv, condoMeses: M.mesesPendientes(c.aseo_pendiente_desde), sigMeses: s?.m, sigMmv: s?.mmv,
      mensualMotor: e.mensual.condominioBs, mensualLegacy: legacyMensual && Math.round(legacyMensual*100)/100, legacyCant: legacy?.cant_inmuebles, legacyMeses: legacy?.meses_deuda,
      unitMeses: [...new Set(e.renglones.map(r=>r.deuda.meses))].join(','), sumSigUnits,
      deudaMotor: e.totales.totalBs, multaMotor: e.totales.multaBs, renglones: e.renglones.length });
  }
  fs.writeFileSync(S+'/diag_residenciales.json', JSON.stringify(rows,null,1));
  const dif = rows.filter(r=>r.mensualLegacy!=null && Math.abs(r.mensualMotor-r.mensualLegacy) > 1);
  console.log('tasa', tasa, 'residenciales', rows.length, 'mensual motor != legacy', dif.length);
  console.log('con grupos/torres', rows.filter(r=>r.grupos>0).length, '| porActividad', rows.filter(r=>r.porAct).length, '| meses condo != SIGYR', rows.filter(r=>r.sigMeses!=null && r.condoMeses!==r.sigMeses).length);
  console.log('meses unidades distintos a condo', rows.filter(r=>!r.porAct && r.unitMeses.split(',').some((m:string)=>Number(m)!==r.condoMeses)).length);
  dif.slice(0,25).forEach(r=>console.log(JSON.stringify(r)));
  process.exit(0);
})();
