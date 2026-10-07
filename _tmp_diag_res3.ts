import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
Object.assign(process.env, env);
const S = '/Users/davidzara/.gemini/antigravity-ide/brain/41ad0d8f-f50b-4e3c-9779-4790bdb59481/scratch';
// Compara la mensualidad del motor con SIGYR (solo registros con 1 mes en SIGYR: su mmv = 1 mensualidad, en unidades de 57×tasa)
(async()=>{
  const { supabaseAdmin: sb } = await import('@/lib/supabaseAdmin');
  const SV = await import('@/lib/condominios/servicio');
  const M = await import('@/lib/condominios/motor');
  const sig = JSON.parse(fs.readFileSync(S+'/snap/sigyr_objetivo.json','utf8'));
  const tasa = await SV.tasaVigente(); const K = 57*tasa;
  const all = async (t:string, sel:string, f?:(q:any)=>any) => { const out:any[]=[]; for(let a=0;;a+=1000){ let q=sb.from(t).select(sel).order('id').range(a,a+999); if(f) q=f(q); const {data,error}=await q; if(error) throw error; out.push(...data); if(data.length<1000) break;} return out; };
  const condos = await all('condominios','*', q=>q.eq('tipo','RESIDENCIAL'));
  const uns = await all('condominio_unidades','*');
  const by = new Map<string,any[]>(); uns.forEach(u=>{ if(!by.has(u.condominio_id)) by.set(u.condominio_id,[]); by.get(u.condominio_id)!.push(u); });
  const grupos = new Map<string,{n:number,ok:number,ej:any[]}>();
  const add = (k:string, ok:boolean, ej:any) => { const g = grupos.get(k) || {n:0,ok:0,ej:[]}; g.n++; if(ok) g.ok++; else if (g.ej.length<4) g.ej.push(ej); grupos.set(k,g); };
  const condoCmp:any[] = [];
  for (const c of condos) {
    const us = by.get(c.id) || [];
    const e = SV.calcularEstado(c, us, tasa);
    const pa = M.porActividad(c);
    for (const r of e.renglones) {
      const u = us.find(x=>x.id===r.clave); if (!u) continue;
      const s = sig[u.inmueble]; if (!s || s.m !== 1 || !s.vivo) continue;
      const esperado = s.mmv*K; const ok = Math.abs(r.mensualBs-esperado) < 1;
      add(`${pa?'INDIV':'CENTR'} | ${u.estado} | ${String(u.actividad||'').slice(0,28)} | tarifa_u=${u.tarifa_mmv}`, ok, { cod: u.inmueble, condo: c.codigo, motor: r.mensualBs, sigyr: Math.round(esperado*100)/100 });
    }
    const s = sig[c.codigo];
    if (s && s.m === 1) condoCmp.push({ cod: c.codigo, pa, motor: e.mensual.condominioBs, sigyrCondo: Math.round(s.mmv*K*100)/100, declarada: c.cant_declarada, tarifa: c.tarifa_mmv, act: c.actividad, vivas: us.filter(u=>u.estado!=='Eliminada').length });
  }
  for (const [k,g] of [...grupos.entries()].sort((a,b)=>b[1].n-a[1].n)) console.log(String(g.n).padStart(5), 'ok', String(g.ok).padStart(5), k, g.ej.length? JSON.stringify(g.ej.slice(0,2)) : '');
  const cOk = condoCmp.filter(x=>Math.abs(x.motor-x.sigyrCondo)<2);
  console.log('\nCondominios con 1 mes en SIGYR:', condoCmp.length, 'coinciden', cOk.length);
  condoCmp.filter(x=>Math.abs(x.motor-x.sigyrCondo)>=2).slice(0,30).forEach(x=>console.log(' ', JSON.stringify(x)));
  fs.writeFileSync(S+'/diag_res_cmp.json', JSON.stringify({ grupos:[...grupos.entries()], condoCmp }, null, 1));
  process.exit(0);
})();
