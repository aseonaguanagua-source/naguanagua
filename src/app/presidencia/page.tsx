'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function parseMonto(val: any): number {
  if (!val) return 0;
  let s = String(val).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function fmtBs(n: number) {
  return 'Bs. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtEur(n: number) {
  return '€ ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_pasado';

function getRange(p: Periodo) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = toD(now);
  switch(p) {
    case 'hoy': return { desde: today, hasta: today };
    case 'semana': {
      const day = now.getDay() || 7;
      const lun = new Date(now); lun.setDate(now.getDate() - day + 1);
      return { desde: toD(lun), hasta: today };
    }
    case 'mes': return { desde: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, hasta: today };
    case 'mes_pasado': {
      const f = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const l = new Date(now.getFullYear(), now.getMonth(), 0);
      return { desde: toD(f), hasta: toD(l) };
    }
  }
}

export default function PresidenciaDashboard() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [pagos, setPagos] = useState<any[]>([]);
  const [inmuebles, setInmuebles] = useState<any[]>([]);
  const [tcmmv, setTcmmv] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const [showEur, setShowEur] = useState(false);

  // Auth guard desactivado — acceso directo sin login
  useEffect(() => {
    const auth = sessionStorage.getItem('presidencia_auth');
    if (!auth) {
      // Auto-autenticar sin requerir login
      sessionStorage.setItem('presidencia_auth', JSON.stringify({ nombre: 'Administrador', ts: Date.now() }));
      setNombre('Administrador');
    } else {
      try {
        const d = JSON.parse(auth);
        setNombre(d.nombre || 'Administrador');
      } catch { setNombre('Administrador'); }
    }
  }, []);


  // Load inmuebles and UCD once
  useEffect(() => {
    // Inmuebles for sector mapping
    supabase.from('inmuebles').select('identidad,actividad_principal').limit(1000)
      .then(({ data }) => setInmuebles(data || []));

    // UCD rate from sistema_config
    const fetchTcmmv = async () => {
      try {
        const { data: cfg } = await supabase.from('sistema_config').select('*');
        let rate = 0;
        if (cfg) {
          const manual = cfg.find((c: any) => c.id === 'tasa_bcv_manual');
          const semanal = cfg.find((c: any) => c.id === 'tasa_bcv_semanal');
          if (manual?.valor) rate = parseFloat(manual.valor);
          else if (semanal?.valor) rate = parseFloat(semanal.valor);
          // Also try old format
          if (!rate && cfg[0]?.tcmmv) rate = parseFloat(cfg[0].tcmmv);
        }
        // Fallback: try /api/bcv
        if (!rate) {
          const res = await fetch(`/api/bcv?t=${Date.now()}`).then(r => r.json()).catch(() => null);
          if (res?.tcmmv) rate = res.tcmmv;
        }
        if (rate > 0) setTcmmv(rate);
      } catch {}
    };
    fetchTcmmv();
  }, []);

  const fetchPagos = async () => {
    setLoading(true);
    const { desde, hasta } = getRange(periodo);
    const { data } = await supabase
      .from('pagos_reportados')
      .select('tipo,monto,identidad,banco,created_at,referencia,estado')
      .eq('estado', 'Aprobado')
      .gte('created_at', desde + 'T00:00:00')
      .lte('created_at', hasta + 'T23:59:59')
      .order('created_at', { ascending: false });
    setPagos(data || []);
    setLastUpdate(new Date().toLocaleTimeString('es-VE', { hour12: false }));
    setLoading(false);
  };

  useEffect(() => { fetchPagos(); }, [periodo]);
  useEffect(() => {
    const interval = setInterval(fetchPagos, 60000);
    return () => clearInterval(interval);
  }, [periodo]);

  // Sector map
  const sectorMap = useMemo(() => {
    const m = new Map<string, string>();
    inmuebles.forEach((inm: any) => {
      const id = (inm.identidad || '').replace(/-/g, '').toUpperCase();
      if (!id || m.has(id)) return;
      const a = (inm.actividad_principal || '').toLowerCase();
      if (a.includes('fabrica') || a.includes('taller') || a.includes('embotelladora') || a.includes('concretera')) m.set(id, 'Industrial');
      else if (a.includes('residencial') || a.includes('condominio') || a.includes('apartamento')) m.set(id, 'Residencial');
      else if (a.length > 3) m.set(id, 'Comercial');
      else m.set(id, 'Residencial');
    });
    return m;
  }, [inmuebles]);

  const pagosEnr = useMemo(() => pagos.map(p => ({
    ...p,
    sector: sectorMap.get((p.identidad || '').replace(/-/g, '').toUpperCase()) || 'Residencial'
  })), [pagos, sectorMap]);

  const total = pagosEnr.reduce((s, p) => s + parseMonto(p.monto), 0);
  const res   = pagosEnr.filter(p => p.sector === 'Residencial').reduce((s, p) => s + parseMonto(p.monto), 0);
  const com   = pagosEnr.filter(p => p.sector === 'Comercial').reduce((s, p) => s + parseMonto(p.monto), 0);
  const ind   = pagosEnr.filter(p => p.sector === 'Industrial').reduce((s, p) => s + parseMonto(p.monto), 0);
  const tra   = pagosEnr.filter(p => p.tipo === 'Transferencia').reduce((s, p) => s + parseMonto(p.monto), 0);
  const deb   = pagosEnr.filter(p => p.tipo === 'Debito' || p.tipo === 'Punto de Venta').reduce((s, p) => s + parseMonto(p.monto), 0);

  // EUR conversions (Bs / tcmmv)
  const toEur = (bs: number) => tcmmv > 0 ? bs / tcmmv : 0;

  const lbl: Record<Periodo, string> = { hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', mes_pasado: 'Mes pasado' };

  const BtnPeriodo = ({ p }: { p: Periodo }) => (
    <button onClick={() => setPeriodo(p)} style={{
      padding: '8px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', transition: 'all .2s',
      background: periodo === p ? '#B8CD29' : 'rgba(255,255,255,0.08)',
      color: periodo === p ? '#06120e' : 'rgba(200,230,200,.8)',
    }}>{lbl[p]}</button>
  );

  const Card = ({ label, bs, color, bg }: { label: string, bs: number, color: string, bg: string }) => (
    <div style={{ background: bg, borderRadius: 16, padding: '14px 12px', textAlign: 'center', border: `1px solid ${color}30` }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</p>
      <p style={{ margin: '5px 0 2px', fontSize: 15, fontWeight: 800, color, lineHeight: 1.2 }}>
        {showEur && tcmmv > 0 ? fmtEur(toEur(bs)) : fmtBs(bs)}
      </p>
      {showEur && tcmmv > 0 ? (
        <p style={{ margin: 0, fontSize: 10, color: 'rgba(200,230,200,.4)' }}>{fmtBs(bs)}</p>
      ) : tcmmv > 0 ? (
        <p style={{ margin: 0, fontSize: 10, color: 'rgba(200,230,200,.4)' }}>{fmtEur(toEur(bs))}</p>
      ) : null}
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', fontFamily: 'Poppins, sans-serif',
      background: 'linear-gradient(160deg, #06120e 0%, #0d2a1e 50%, #081810 100%)',
      color: '#fff', maxWidth: 480, margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(184,205,41,.08)', borderBottom: '1px solid rgba(184,205,41,.2)',
        padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(10px)'
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, color: '#B8CD29', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Presidencia</p>
          <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800 }}>Hola, {nombre}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={fetchPagos} style={{
            background: 'rgba(184,205,41,.15)', border: '1px solid rgba(184,205,41,.3)',
            borderRadius: 10, padding: '7px 11px', color: '#B8CD29', cursor: 'pointer', fontSize: 11, fontWeight: 600
          }}>{loading ? '...' : '↻'}</button>
          <button onClick={() => { sessionStorage.removeItem('presidencia_auth'); router.replace('/'); }}
            style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.3)', borderRadius: 10, padding: '7px 11px', color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 14px' }}>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['hoy','semana','mes','mes_pasado'] as Periodo[]).map(p => <BtnPeriodo key={p} p={p} />)}
        </div>

        {/* Total + toggle EUR/Bs */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(184,205,41,.15), rgba(93,177,48,.1))',
          border: '1px solid rgba(184,205,41,.3)', borderRadius: 20, padding: '20px 18px',
          textAlign: 'center', marginBottom: 14
        }}>
          <p style={{ margin: 0, fontSize: 11, color: '#B8CD29', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            Total Recaudado — {lbl[periodo]}
          </p>

          {/* Main amount — large */}
          <p style={{ margin: '8px 0 2px', fontSize: 34, fontWeight: 900, color: '#B8CD29', lineHeight: 1 }}>
            {loading ? '...' : (showEur && tcmmv > 0 ? fmtEur(toEur(total)) : fmtBs(total))}
          </p>

          {/* Secondary amount */}
          {tcmmv > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600, color: 'rgba(184,205,41,.6)' }}>
              {showEur ? fmtBs(total) : fmtEur(toEur(total))}
            </p>
          )}

          <p style={{ margin: '6px 0 10px', fontSize: 12, color: 'rgba(200,230,200,.5)' }}>
            {pagosEnr.length} transacciones · UCD: {tcmmv > 0 ? tcmmv.toLocaleString('es-VE', {minimumFractionDigits:2}) + ' Bs/€' : 'N/D'}
          </p>

          {/* Toggle button */}
          {tcmmv > 0 && (
            <button onClick={() => setShowEur(!showEur)} style={{
              background: showEur ? 'rgba(99,102,241,.3)' : 'rgba(184,205,41,.15)',
              border: showEur ? '1px solid rgba(99,102,241,.5)' : '1px solid rgba(184,205,41,.3)',
              borderRadius: 20, padding: '7px 18px', color: showEur ? '#a5b4fc' : '#B8CD29',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all .2s'
            }}>
              {showEur ? '€ EUR → Bs.' : 'Bs. → € EUR'}
            </button>
          )}

          {lastUpdate && (
            <p style={{ margin: '8px 0 0', fontSize: 10, color: 'rgba(200,230,200,.35)' }}>
              Actualizado: {lastUpdate} · Auto-actualiza cada 60s
            </p>
          )}
        </div>

        {/* Método pago */}
        <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'rgba(200,230,200,.45)', textTransform: 'uppercase', letterSpacing: 1 }}>Por Metodo</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <Card label="Transferencias" bs={tra} color="#a855f7" bg="rgba(168,85,247,.08)" />
          <Card label="Debito / POS"   bs={deb} color="#f97316" bg="rgba(249,115,22,.08)" />
        </div>

        {/* Sector */}
        <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'rgba(200,230,200,.45)', textTransform: 'uppercase', letterSpacing: 1 }}>Por Sector</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24 }}>
          <Card label="Residencial" bs={res} color="#3b82f6" bg="rgba(59,130,246,.08)" />
          <Card label="Comercial"   bs={com} color="#f59e0b" bg="rgba(245,158,11,.08)" />
          <Card label="Industrial"  bs={ind} color="#6366f1" bg="rgba(99,102,241,.08)" />
        </div>

        {/* Ultimas transacciones */}
        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'rgba(200,230,200,.45)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Ultimas {Math.min(pagosEnr.length, 15)} Transacciones
        </p>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(200,230,200,.4)', padding: 40 }}>Cargando...</div>
        ) : pagosEnr.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(200,230,200,.4)', padding: 40 }}>Sin transacciones en este periodo.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {pagosEnr.slice(0, 15).map((p, i) => {
              const montoBs = parseMonto(p.monto);
              return (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 14, padding: '12px 14px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#fff' }}>{p.tipo} · {p.banco || 'N/A'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(200,230,200,.5)' }}>Ref: {p.referencia || '—'} · {p.sector}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(200,230,200,.3)' }}>
                      {new Date(p.created_at).toLocaleString('es-VE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#B8CD29' }}>
                      {showEur && tcmmv > 0 ? fmtEur(toEur(montoBs)) : fmtBs(montoBs)}
                    </p>
                    {tcmmv > 0 && (
                      <p style={{ margin: 0, fontSize: 10, color: 'rgba(200,230,200,.35)' }}>
                        {showEur ? fmtBs(montoBs) : fmtEur(toEur(montoBs))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
